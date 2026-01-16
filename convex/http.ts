import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe will notify our server about the confirmed payment via a webhook request.
// All we need to do is expose an HTTP endpoint that Stripe's servers can hit whenever a user finishes a payment.
// That’s a perfect fit for a Convex HTTP action.

// The HTTP action will handle the Stripe webhook request, parsing it, and passing its contents to another Convex action that will confirm the request is valid using the Stripe SDK in the Node.js runtime:
http.route({
  path: "/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Getting the stripe-signature header
    const signature: string = request.headers.get("stripe-signature") as string;
    // Calling the action that will perform our fulfillment
    const result = await ctx.runAction(internal.stripe.fulfill, {
      signature,
      payload: await request.text(),
    });
    // We make sure to confirm the successful processing
    // so that Stripe can stop sending us the confirmation
    // of this payment.
    if (result.success) {
      return new Response(null, {
        status: 200,
      });
    } else {
      // If something goes wrong Stripe will continue repeating
      // the same webhook request until we confirm it.
      return new Response("Webhook Error", {
        status: 400,
      });
    }
  }),
});

export default http;
