//  If the original payment was made to platform account
// (not the Connect account),
// retrieving the session with stripeAccount: stripeConnectId will fail.

// we're NOT using Stripe Connect(convex/stripe.ts/pay fn). we're currently using a standard Stripe account (single platform account).
"use server";
import { stripe } from "@/lib/stripe";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function refundEventTickets(eventId: Id<"events">) {
  const convex = getConvexClient();

  // Get event details
  const event = await convex.query(api.events.getById, { eventId });
  if (!event) throw new Error("Event not found");

  // Get all valid tickets for this event
  const tickets = await convex.query(api.tickets.getValidTicketsForEvent, {
    eventId,
  });

  // Process refunds for each ticket
  const results = await Promise.allSettled(
    tickets.map(async (ticket) => {
      try {
        if (!ticket.paymentId) {
          throw new Error("Payment information not found");
        }

        // Get the payment record
        const payment = await convex.query(api.payments.get, {
          paymentId: ticket.paymentId,
        });

        if (!payment?.stripeId) {
          throw new Error("Stripe session ID not found");
        }

        // Retrieve the checkout session to get payment_intent
        // NO stripeAccount parameter - using platform account
        const session = await stripe.checkout.sessions.retrieve(
          payment.stripeId
        );

        const paymentIntentId = session.payment_intent as string;
        if (!paymentIntentId) {
          throw new Error("Payment intent not found");
        }

        // Issue refund through Stripe
        // NO stripeAccount parameter - using platform account
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
        });

        // Update ticket status to refunded
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

  // Check if all refunds were successful
  const allSuccessful = results.every(
    (result) => result.status === "fulfilled" && result.value.success
  );

  if (!allSuccessful) {
    throw new Error(
      "Some refunds failed. Please check the logs and try again."
    );
  }

  // Cancel the event
  await convex.mutation(api.events.cancelEvent, { eventId });

  return { success: true };
}