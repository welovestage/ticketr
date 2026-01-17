"use node";

import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import Stripe from "stripe";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

export const pay = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<string> => {
    const domain = process.env.NEXT_PUBLIC_APP_URL ?? "https://tickets.welovestage.com";
    
    const stripe = new Stripe(process.env.STRIPE_KEY!, {
      apiVersion: "2025-07-30.basil",
    });

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const event = await ctx.runQuery(internal.events.getByIdInternal, {
      eventId,
    });
    if (!event) throw new Error("Event not found");

    const paymentId = await ctx.runMutation(internal.payments.create, {
      eventId,
      userId,
    });

    const organizer = await ctx.runQuery(api.users.getById, {
      userId: event.userId as Id<"users">,
    });
    
    if (!organizer || !organizer.stripeConnectId) {
      throw new Error("This seller is not setup to accept payments yet.");
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "USD",
            unit_amount: Math.round(event.price * 100),
            product_data: {
              name: `Ticket to ${event.name}`,
              description: `${event.location} - ${new Date(event.eventDate).toLocaleDateString()}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_intent_data: {
        application_fee_amount: 0,
        transfer_data: {
          destination: organizer.stripeConnectId,
        },
      },
      success_url: `${domain}/success?paymentId=${paymentId}`,
      cancel_url: `${domain}/events/${eventId}`,
      automatic_tax: { enabled: false },
    });

    await ctx.runMutation(internal.payments.markPending, {
      paymentId,
      stripeId: session.id,
    });

    if (!session.url) throw new Error("Could not create Stripe session");
    return session.url;
  },
});

export const fulfill = internalAction({
  args: { signature: v.string(), payload: v.string() },
  handler: async (ctx, { signature, payload }): Promise<{ success: boolean; error?: string }> => {
    const stripe = new Stripe(process.env.STRIPE_KEY!, {
      apiVersion: "2025-07-30.basil",
    });

    const webhookSecret = process.env.STRIPE_WEBHOOKS_SECRET!;
    try {
      const event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        webhookSecret,
      );

      switch (event.type) {
        case "checkout.session.completed":
          const session = event.data.object as Stripe.Checkout.Session;
          await ctx.runMutation(internal.payments.fulfill, { 
            stripeId: session.id 
          });
          break;

        case "account.updated":
          const account = event.data.object as Stripe.Account;
          await ctx.runMutation(internal.users.updateStripeConnectStatus, {
            stripeConnectId: account.id,
            chargesEnabled: account.charges_enabled,
          });
          break;
      }

      return { success: true };
    } catch (err) {
      console.error("Webhook Error:", (err as Error).message);
      return { success: false, error: (err as Error).message };
    }
  },
});

// --- NEW ACTION FOR CANCELLATIONS ---
export const refundEventTickets = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const stripe = new Stripe(process.env.STRIPE_KEY!, {
      apiVersion: "2025-07-30.basil",
    });

    // 1. Get all valid tickets for this event
    const tickets = await ctx.runQuery(internal.tickets.getValidTicketsForEvent, {
      eventId,
    });

    // 2. Process Refunds
    const results = await Promise.allSettled(
      tickets.map(async (ticket) => {
        // Skip tickets without payment info (e.g. free tickets or admin created)
        if (!ticket.paymentId) return;

        try {
          // Get the Stripe Session ID from the Payment record
          const payment = await ctx.runQuery(internal.payments.get, {
            paymentId: ticket.paymentId,
          });
          
          if (!payment?.stripeId) return;

          const session = await stripe.checkout.sessions.retrieve(payment.stripeId);
          if (!session.payment_intent) return;

          // Refund the payment
          await stripe.refunds.create({
            payment_intent: session.payment_intent as string,
            reason: "requested_by_customer",
            // IMPORTANT: reverse_transfer: true allows us to pull funds back 
            // from the connected seller account to refund the customer.
            reverse_transfer: true, 
          });

          // Mark ticket as refunded in DB
          await ctx.runMutation(internal.tickets.updateTicketStatus, {
            ticketId: ticket._id,
            status: "refunded",
          });
        } catch (error) {
          console.error(`Failed to refund ticket ${ticket._id}`, error);
          throw error;
        }
      })
    );

    // 3. Check for failures
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      throw new Error(`${failed.length} tickets failed to refund. Event not cancelled.`);
    }

    // 4. Cancel the event
    await ctx.runMutation(api.events.cancelEvent, { eventId });

    return { success: true };
  },
});