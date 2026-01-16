import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { WAITING_LIST_STATUS } from "./constant";
import { processQueueHelper } from "./waitingList";

// It creates a document in our “payments” table so that we can track the progress of the checkout flow.

// Get the ticket ID from a payment (for highlighting purchased ticket on success page)
export const getTicketId = query({
  args: { paymentId: v.optional(v.id("payments")) },
  handler: async (ctx, { paymentId }) => {
    if (paymentId === undefined) {
      return null;
    }
    return (await ctx.db.get(paymentId))?.ticketId;
  },
});

export const create = internalMutation({
  // change this to event. is user buying the ticket or event? are we selling ticket or event?
  // arg it should take is eventId and we get the event.
  // Get event details
  // const event = await convex.query(api.events.getById, { eventId });
  // if (!event) throw new Error("Event not found");

  args: {
    eventId: v.id("events"),
    userId: v.string(),
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
    // Find the payment by stripeId
    const payment = (await ctx.db
      .query("payments")
      .withIndex("stripeId", (q) => q.eq("stripeId", stripeId))
      .unique())!;

    // Create the ticket
    const ticketId = await ctx.db.insert("tickets", {
      eventId: payment.eventId,
      userId: payment.userId,
      purchasedAt: Date.now(),
      status: "valid",
    //   paymentIntentId,
    });

    // Mark payment as fulfilled with the ticketId
    await ctx.db.patch(payment._id, {
      ticketId,
      status: "fulfilled",
    });

    // If there's a waiting list entry for this user/event, update it. Consider removing for lean testing
    const waitingListEntry = await ctx.db
      .query("waitingList")
      .withIndex("by_user_event", (q) => 
        q.eq("userId", payment.userId).eq("eventId", payment.eventId)
      )
      .filter((q) => q.eq(q.field("status"), WAITING_LIST_STATUS.OFFERED))
      .first();

    if (waitingListEntry) {
      await ctx.db.patch(waitingListEntry._id, {
        status: WAITING_LIST_STATUS.PURCHASED,
      });
      
      // Process queue for next person - you'll need to import this
      await processQueueHelper(ctx, { eventId: payment.eventId });
    }

    return ticketId;
  },
});
