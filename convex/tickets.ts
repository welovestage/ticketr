import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";

export const getUserTicketForEvent = query({
    args: {
        eventId: v.id("events"),
        userId: v.id("users"),
    },
    handler: async (ctx, { eventId, userId }) => {
        const ticket = await ctx.db.query("tickets").withIndex("by_user_event", (q) => q.eq("userId", userId).eq("eventId", eventId)).first()

        return ticket;
    }
})

export const getTicketWithDetails = query({
    args: { ticketId: v.id("tickets") },
    handler: async (ctx, { ticketId }) => {
        const ticket = await ctx.db.get(ticketId);
        if (!ticket) return null;

        const event = await ctx.db.get(ticket.eventId);

        return {
            ...ticket,
            event,
        };
    },
});

// CHANGED: Use internalMutation for security.
// Only the Stripe refund action should be able to mark tickets as refunded.
export const updateTicketStatus = internalMutation({
    args: {
        ticketId: v.id("tickets"),
        status: v.union(
            v.literal("valid"),
            v.literal("used"),
            v.literal("refunded"),
            v.literal("cancelled")
        ),
    },
    handler: async (ctx, { ticketId, status }) => {
        await ctx.db.patch(ticketId, { status });
    },
});

// CHANGED: Use internalQuery.
// This is used by the backend to find which tickets to refund.
export const getValidTicketsForEvent = internalQuery({
    args: { eventId: v.id("events") },
    handler: async (ctx, { eventId }) => {
        return await ctx.db
            .query("tickets")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .filter((q) =>
                q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
            )
            .collect();
    },
});