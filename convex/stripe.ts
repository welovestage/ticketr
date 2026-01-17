import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { convexToJson, v } from "convex/values";
import Stripe from "stripe";
import { getAuthUserId } from "@convex-dev/auth/server";

export const pay = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<string | null> => {
    const domain = process.env.HOSTING_URL ?? "http://localhost:5173";
    const stripe = new Stripe(process.env.STRIPE_KEY!, {
      apiVersion: "2025-07-30.basil",
    });

    // 1. Get the ID directly (replaces getUserIdentity)
    const userId = await getAuthUserId(ctx);

    // 2. REQUIRED: Null check to satisfy TypeScript
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const event = await ctx.runQuery(internal.events.getByIdInternal, {
      eventId,
    });
    if (!event) throw new Error("Event not found");

    // 3. Now 'userId' is strictly Id<"users">, so no error!
    const paymentId = await ctx.runMutation(internal.payments.create, {
      eventId,
      userId,
    });

    // 1. Fetch the Organizer (User)
    const organizer = await ctx.runQuery(api.users.getById, {
      userId: event.userId,
    });
    if (!organizer || !organizer.stripeConnectId) {
      throw new Error("This seller is not setup to accept payments yet.");
    }
    const platformFee = 0;     // The amount of the application fee (if any) that will be requested to be applied to the payment and transferred to the application owner's Stripe account
    
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "USD",
            unit_amount: Math.round(event.price * 100), // to cents
            tax_behavior: "exclusive",
            product_data: {
              name: `Ticket to ${event.name}`,
              description: `${event.location} - ${new Date(
                event.eventDate,
              ).toLocaleDateString()}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_intent_data: {
        application_fee_amount: platformFee, // You keep this
        transfer_data: {
          destination: organizer.stripeConnectId, // Seller gets the rest
        },
      },
      // It includes the ID of our “payments” document in the success_url that Stripe will redirect to after the user has finished paying.
      success_url: `${domain}/success?paymentId=${paymentId}`,
      cancel_url: `${domain}/events/${eventId}`,
      automatic_tax: { enabled: true },
    });

    // Keep track of the checkout session ID for fulfillment
    await ctx.runMutation(internal.payments.markPending, {
      paymentId,
      stripeId: session.id,
    });
    // Let the client know the Stripe URL to redirect to
    return session.url;
  },
});

// fulfill action confirms the webhook request really came from Stripe via its SDK, gets the checkout session ID, and finally "fulfill"s the order by calling a database mutation:
export const fulfill = internalAction({
  args: { signature: v.string(), payload: v.string() },
  handler: async ({ runMutation }, { signature, payload }) => {
    const stripe = new Stripe(process.env.STRIPE_KEY!, {
      apiVersion: "2025-07-30.basil",
    });

    const webhookSecret = process.env.STRIPE_WEBHOOKS_SECRET as string;
    try {
      // This call verifies the request
      const event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        webhookSecret,
      );
      if (event.type === "checkout.session.completed") {
        // Finally, it writes the Stripe checkout session ID into the “payments” document to ensure we only fulfill the "order" once.
        const stripeId = (event.data.object as { id: string }).id;

        // Buy the ticket and mark the payment as fulfilled
        await runMutation(internal.payments.fulfill, { stripeId });
      }
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: (err as { message: string }).message };
    }
  },
});
