"use server";

import { stripe } from "@/lib/stripe";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function refundEventTickets(eventId: Id<"events">) {
  const convex = getConvexClient();

  // 1. Get event details
  const event = await convex.query(api.events.getById, { eventId });
  if (!event) throw new Error("Event not found");

  // 2. Get all valid tickets
  const tickets = await convex.query(api.tickets.getValidTicketsForEvent, {
    eventId,
  });

  // 3. Process refunds
  const results = await Promise.allSettled(
    tickets.map(async (ticket) => {
      try {
        if (!ticket.paymentId) throw new Error("Payment info missing");

        const payment = await convex.query(api.payments.get, {
          paymentId: ticket.paymentId,
        });

        if (!payment?.stripeId) throw new Error("Stripe ID missing");

        // Retrieve session to get the Payment Intent ID
        const session = await stripe.checkout.sessions.retrieve(payment.stripeId);
        const paymentIntentId = session.payment_intent as string;

        if (!paymentIntentId) throw new Error("Payment intent missing");

        // --- CRITICAL FIX HERE ---
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
          // This pulls the money back from the Seller's Connect account
          // instead of taking it from your Platform balance.
          reverse_transfer: true, 
        });

        // Update Convex status
        await convex.mutation(api.tickets.updateTicketStatus, {
          ticketId: ticket._id,
          status: "refunded",
        });

        return { success: true, ticketId: ticket._id };
      } catch (error) {
        console.error(`Failed to refund ticket ${ticket._id}:`, error);
        return { success: false, ticketId: ticket._id, error };
      }
    })
  );

  // 4. Verification
  const allSuccessful = results.every(
    (result) => result.status === "fulfilled" && result.value.success
  );

  if (!allSuccessful) {
    throw new Error("Some refunds failed. Check logs.");
  }

  // 5. Cancel Event in DB
  await convex.mutation(api.events.cancelEvent, { eventId });

  return { success: true };
}