import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    stripeConnectId: v.optional(v.string()), // getUsersStripeConnectId checks this
    
    // RECOMMENDATION: Add this to cache status so you don't hit Stripe API constantly
    isSellerVerified: v.optional(v.boolean()), 
    stripeChargesEnabled: v.optional(v.boolean()),
    // tokenIdentifier: v.optional(v.string()), // If uncommenting, make it optional so DB don't crash. Look at this later because this sounds suspicious but looks fine.
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_stripe_connect_id", ["stripeConnectId"]),
    // .index("by_token", ["tokenIdentifier"]),

  events: defineTable({
    name: v.string(),
    description: v.string(),
    location: v.string(),
    eventDate: v.number(),
    price: v.number(),
    totalTickets: v.number(),
    userId: v.id("users"), // Changed from v.string()
    imageStorageId: v.optional(v.id("_storage")),
    is_cancelled: v.optional(v.boolean()),
  })
  .index("by_organizer", ["userId"]), 

  // todo: adjust this for new Stripe integration.
  payments: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"), // The Buyer
    status: v.union(
      v.literal("pending"),
      v.literal("fulfilled"),
      v.literal("refunded"), // Added "refunded"
      v.literal("cancelled"),
    ),

    // If present the payment has been initiated
    stripeId: v.optional(v.string()), // The Checkout Session ID (cs_test_...)
  })
    .index("stripeId", ["stripeId"])
    .index("by_user", ["userId"]),
  //   Instead of this, we have tickets/events
  //   messages: defineTable({
  //     text: v.string(),
  //   }),

  // What we need. Stripe and Convex should be likeminded
  tickets: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"), // The owner (Buyer) of this ticket
    purchasedAt: v.number(),
    status: v.union(
      v.literal("valid"),
      v.literal("used"),
      v.literal("refunded"),
      v.literal("cancelled"),
    ),
    amount: v.optional(v.number()),
    paymentId: v.id("payments"), // Link back to the transaction // should be optional to avoid dependency loop because payment object has ticketId as well.
    // we might add stripeId or successful session here but I don't think so because we already have "payment"
  })
    .index("by_event", ["eventId"])
    .index("by_user", ["userId"])
    .index("by_user_event", ["userId", "eventId"])
    .index("by_payment", ["paymentId"]),

  waitingList: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    status: v.union(
      v.literal("waiting"),
      v.literal("offered"),
      v.literal("purchased"),
      v.literal("expired"),
    ),
    offerExpiresAt: v.optional(v.number()),
  })
    .index("by_event_status", ["eventId", "status"])
    .index("by_user_event", ["userId", "eventId"])
    .index("by_user", ["userId"]),
});

export default schema;
