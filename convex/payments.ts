import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { WAITING_LIST_STATUS } from "./constant";
import { processQueueHelper } from "./waitingList";

/**
 * GET TICKET ID
 * Used by the frontend success page to redirect the user to their ticket.
 */
export const getTicketId = query({
  args: { paymentId: v.optional(v.id("payments")) },
  handler: async (ctx, { paymentId }) => {
    if (!paymentId) return null;

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

export const fulfill = internalMutation({
  args: {
    stripeId: v.string(),
  },
  handler: async (ctx, { stripeId }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("stripeId", (q) => q.eq("stripeId", stripeId))
      .first();

    if (!payment || payment.status === "fulfilled") return;

    await ctx.db.patch(payment._id, { status: "fulfilled" });

    await ctx.db.insert("tickets", {
      eventId: payment.eventId,
      userId: payment.userId,
      paymentId: payment._id,
      status: "valid",
      purchasedAt: Date.now(),
    });

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

      await processQueueHelper(ctx, { eventId: payment.eventId });
    }
  },
});

// REQUIRED: This is used by `convex/stripe.ts` in the `refundEventTickets` action.
// We made it 'internalQuery' to be safe.
export const get = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    return await ctx.db.get(paymentId);
  },
});