import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { WAITING_LIST_STATUS } from "./constant";
import { processQueueHelper } from "./waitingList";

// It creates a document in our “payments” table so that we can track the progress of the checkout flow.

/**
 * GET TICKET ID
 * Used by the success page to redirect the user to their ticket.
 * We look this up in the 'tickets' table using the payment reference.
 */
export const getTicketId = query({
  args: { paymentId: v.optional(v.id("payments")) },
  handler: async (ctx, { paymentId }) => {
    if (!paymentId) return null;

    // Look up the ticket associated with this payment
    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
      .first();

    return ticket?._id;
  },
});

export const create = internalMutation({
  args: {
    eventId: v.id("events"),
    userId: v.id("users"),
  },
  handler: async (ctx, { eventId, userId }) => {
    return await ctx.db.insert("payments", {
      eventId,
      userId,
      status: "pending",
    });
  },
});

export const markPending = internalMutation({
  args: { paymentId: v.id("payments"), stripeId: v.string() },
  handler: async (ctx, { paymentId, stripeId }) => {
    await ctx.db.patch(paymentId, { stripeId });
  },
});

//  1. Marks payment as fulfilled.
//  2. Generates the actual Ticket.
//  3. Updates Waiting List if applicable.
export const fulfill = internalMutation({
  args: {
    stripeId: v.string(),
  },
  handler: async (ctx, { stripeId }) => {
    // Find the payment by Stripe Session ID
    const payment = await ctx.db
      .query("payments")
      .withIndex("stripeId", (q) => q.eq("stripeId", stripeId))
      .first();
    if (!payment || payment.status === "fulfilled") return;

    // Mark Payment as Fulfilled
    await ctx.db.patch(payment._id, { status: "fulfilled" });
    // Create the ticket
    // 3. CREATE THE TICKET (The most important part)
    await ctx.db.insert("tickets", {
      eventId: payment.eventId,
      userId: payment.userId,
      paymentId: payment._id,
      status: "valid",
      purchasedAt: Date.now(),
    });

    // Mark payment as fulfilled with the ticketId | Commented because we don't crry ticketId with payment anymore.
    // await ctx.db.patch(payment._id, {
    //   ticketId,
    //   status: "fulfilled",
    // }); 

    // If there's a waiting list entry for this user/event, update it. Consider removing for lean testing
    const waitingListEntry = await ctx.db
      .query("waitingList")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", payment.userId).eq("eventId", payment.eventId),
      )
      .filter((q) => q.eq(q.field("status"), WAITING_LIST_STATUS.OFFERED))
      .first();

    if (waitingListEntry) {
      await ctx.db.patch(waitingListEntry._id, {
        status: WAITING_LIST_STATUS.PURCHASED,
      });

      // Process queue for next person
      await processQueueHelper(ctx, { eventId: payment.eventId });
    }

    // return ticketId;
  },
});

// refundEventTickets wants this
export const get = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    return await ctx.db.get(paymentId);
  },
});
