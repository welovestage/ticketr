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
    const domain = process.env.HOSTING_URL ?? "http://localhost:5173";
    
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

    // Use 'api' because getById is a public query
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
        application_fee_amount: 0, // Example: 100, platform keeps $1.00
        transfer_data: {
          destination: organizer.stripeConnectId,
        },
      },
      success_url: `${domain}/success?paymentId=${paymentId}`,
      cancel_url: `${domain}/events/${eventId}`,
      automatic_tax: { enabled: true },
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
    // MOVED INSIDE
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