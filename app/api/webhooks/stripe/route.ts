import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import Stripe from "stripe";
import { StripeCheckoutMetaData } from "@/actions/createStripeCheckoutSession";

export async function POST(req: Request) {
    console.log("Webhook received");

    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature") as string;

    console.log("Webhook signature:", signature ? "Present" : "Missing");

    let event: Stripe.Event;

    try {
        console.log("Attempting to construct webhook event");
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
        console.log("Webhook event constructed successfully:", event.type);
    } catch (err) {
        console.error("Webhook construction failed:", err);
        return new Response(`Webhook Error: ${(err as Error).message}`, {
            status: 400,
        });
    }

    const convex = getConvexClient();

    if (event.type === "checkout.session.completed") {
        console.log("Processing checkout.session.completed");
        let session = event.data.object as Stripe.Checkout.Session;
        let metadata = session.metadata as StripeCheckoutMetaData;
        
        console.log("Initial session data:", {
            sessionId: session.id,
            hasMetadata: !!metadata,
            metadataKeys: metadata ? Object.keys(metadata) : [],
            paymentIntent: session.payment_intent,
            amountTotal: session.amount_total,
        });
        
        // Check if this is a connected account session (account field exists in webhook events)
        const connectedAccountId = (session as any).account as string | undefined;
        console.log("Connected account ID:", connectedAccountId);
        
        // If metadata is missing, try to retrieve the session
        if (!metadata || !metadata.eventId || !metadata.userId || !metadata.waitingListId) {
            console.log("Metadata missing or incomplete, attempting to retrieve session");
            
            try {
                // First try with connected account if available
                if (connectedAccountId) {
                    console.log("Retrieving session with connected account context");
                    session = await stripe.checkout.sessions.retrieve(
                        session.id,
                        {
                            expand: ['payment_intent'],
                        },
                        {
                            stripeAccount: connectedAccountId,
                        }
                    );
                    metadata = session.metadata as StripeCheckoutMetaData;
                    console.log("Retrieved session with account context, metadata:", metadata);
                }
                
                // If still no metadata, try without account context (platform account)
                if (!metadata || !metadata.eventId || !metadata.userId || !metadata.waitingListId) {
                    console.log("Still missing metadata, trying platform account retrieval");
                    session = await stripe.checkout.sessions.retrieve(
                        session.id,
                        {
                            expand: ['payment_intent'],
                        }
                    );
                    metadata = session.metadata as StripeCheckoutMetaData;
                    console.log("Retrieved session from platform, metadata:", metadata);
                }
            } catch (retrieveError) {
                console.error("Error retrieving session:", retrieveError);
            }
        }

        console.log("Final session metadata:", JSON.stringify(metadata, null, 2));
        console.log("Convex client:", convex);

        // Validate metadata exists and has required fields
        if (!metadata || !metadata.eventId || !metadata.userId || !metadata.waitingListId) {
            console.error("Missing required metadata in session after all retrieval attempts", {
                hasMetadata: !!metadata,
                eventId: metadata?.eventId,
                userId: metadata?.userId,
                waitingListId: metadata?.waitingListId,
                sessionId: session.id,
                account: connectedAccountId,
                allMetadata: metadata,
            });
            return new Response(JSON.stringify({
                error: "Missing required metadata",
                details: {
                    hasMetadata: !!metadata,
                    eventId: metadata?.eventId,
                    userId: metadata?.userId,
                    waitingListId: metadata?.waitingListId,
                    sessionId: session.id,
                }
            }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validate payment intent exists
        if (!session.payment_intent) {
            console.error("Missing payment_intent in session");
            return new Response("Missing payment_intent", { status: 400 });
        }

        const paymentIntentId = typeof session.payment_intent === 'string' 
            ? session.payment_intent 
            : session.payment_intent.id;

        console.log("Calling purchaseTicket mutation with:", {
            eventId: metadata.eventId,
            userId: metadata.userId,
            waitingListId: metadata.waitingListId,
            paymentIntentId,
            amount: session.amount_total ?? 0,
        });

        try {
            const result = await convex.mutation(api.events.purchaseTicket, {
                eventId: metadata.eventId,
                userId: metadata.userId,
                waitingListId: metadata.waitingListId,
                paymentInfo: {
                    paymentIntentId,
                    amount: session.amount_total ?? 0,
                },
            });
            console.log("Purchase ticket mutation completed successfully:", result);
            return new Response(JSON.stringify({ success: true, result }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error("Error processing webhook - mutation failed:", error);
            console.error("Error stack:", (error as Error).stack);
            return new Response(JSON.stringify({
                error: "Error processing webhook",
                message: (error as Error).message,
                details: error
            }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response(null, { status: 200 });
}