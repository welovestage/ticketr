import { v } from "convex/values";
import { internalMutation, mutation, MutationCtx, query } from "./_generated/server";
import { DURATIONS, TICKET_STATUS, WAITING_LIST_STATUS } from "./constant";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * Calculates a user's current position in the waiting list.
 */
export const getQueuePosition = query({
  args: {
    eventId: v.id("events"),
    userId: v.id("users"),
  },
  handler: async (ctx, { eventId, userId }) => {
    // 1. Get entry for this specific user and event combination
    const entry = await ctx.db
      .query("waitingList")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", userId).eq("eventId", eventId)
      )
      .filter((q) => q.neq(q.field("status"), WAITING_LIST_STATUS.EXPIRED))
      .first();

    if (!entry) return null;

    // 2. Get total number of people ahead in line
    const peopleAhead = await ctx.db
      .query("waitingList")
      .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.and(
          // Get all entries created before this one
          q.lt(q.field("_creationTime"), entry._creationTime),
          // Only get entries that are currently valid (Waiting or Offered)
          q.or(
            q.eq(q.field("status"), WAITING_LIST_STATUS.WAITING),
            q.eq(q.field("status"), WAITING_LIST_STATUS.OFFERED)
          )
        )
      )
      .collect()
      .then((entries) => entries.length);

    return {
      ...entry,
      position: peopleAhead + 1,
    };
  },
});

/**
 * Helper: Internal logic to check availability and offer tickets to the next users in line.
 * Note: We cannot import checkAvailability from events.ts here because events.ts imports this file.
 * (Circular dependency avoidance).
 */
export async function processQueueHelper(
  ctx: MutationCtx,
  { eventId }: { eventId: Id<"events"> }
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");

  // 1. Calculate available spots manually to avoid circular dependencies
  const purchasedCount = await ctx.db
    .query("tickets")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect()
    .then(
      (tickets) =>
        tickets.filter(
          (t) =>
            t.status === TICKET_STATUS.VALID || t.status === TICKET_STATUS.USED
        ).length
    );

  const now = Date.now();
  const activeOffers = await ctx.db
    .query("waitingList")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", WAITING_LIST_STATUS.OFFERED)
    )
    .collect()
    .then(
      (entries) => entries.filter((e) => (e.offerExpiresAt ?? 0) > now).length
    );

  const availableSpots = event.totalTickets - (purchasedCount + activeOffers);

  if (availableSpots <= 0) return;

  // 2. Get next users in line
  const waitingUsers = await ctx.db
    .query("waitingList")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", WAITING_LIST_STATUS.WAITING)
    )
    .order("asc") // Oldest first
    .take(availableSpots);

  // 3. Create time-limited offers for selected users
  for (const user of waitingUsers) {
    // Update the waiting list entry to OFFERED status
    await ctx.db.patch(user._id, {
      status: WAITING_LIST_STATUS.OFFERED,
      offerExpiresAt: now + DURATIONS.TICKET_OFFER,
    });

    // Schedule expiration job for this offer
    await ctx.scheduler.runAfter(
      DURATIONS.TICKET_OFFER,
      internal.waitingList.expireOffer,
      {
        waitingListId: user._id,
        eventId,
      }
    );
  }
}

/**
 * Public Mutation: Manually trigger queue processing.
 */
export const processQueue = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, { eventId }) => {
    return await processQueueHelper(ctx, { eventId });
  },
});

/**
 * Public Mutation: Allows a user (or system) to give up a ticket offer early.
 */
export const releaseTicket = mutation({
  args: {
    eventId: v.id("events"),
    waitingListId: v.id("waitingList"),
  },
  handler: async (ctx, { eventId, waitingListId }) => {
    const entry = await ctx.db.get(waitingListId);
    if (!entry || entry.status !== WAITING_LIST_STATUS.OFFERED) {
      throw new Error("No valid ticket offer found");
    }

    // Mark the entry as expired
    await ctx.db.patch(waitingListId, {
      status: WAITING_LIST_STATUS.EXPIRED,
    });

    // Process queue to offer ticket to next person
    await processQueueHelper(ctx, { eventId });
  },
});

/**
 * Internal Mutation: Called by the Scheduler when an offer timer expires.
 */
export const expireOffer = internalMutation({
  args: {
    waitingListId: v.id("waitingList"),
    eventId: v.id("events"),
  },
  handler: async (ctx, { waitingListId, eventId }) => {
    const offer = await ctx.db.get(waitingListId);
    // If the user already purchased it, or it was already expired/released, do nothing.
    if (!offer || offer.status !== WAITING_LIST_STATUS.OFFERED) return;

    await ctx.db.patch(waitingListId, {
      status: WAITING_LIST_STATUS.EXPIRED,
    });

    // Offer the spot to the next person
    await processQueueHelper(ctx, { eventId });
  },
});