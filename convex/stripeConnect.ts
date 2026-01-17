"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api"; // Import internal
import Stripe from "stripe";
import { getAuthUserId } from "@convex-dev/auth/server";

const stripe = new Stripe(process.env.STRIPE_KEY!, { // Unified env var name
  apiVersion: "2025-07-30.basil",
});

export const createAccount = action({
  args: {}, // No args needed, we get user from Auth
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // 1. Create the account
    const account = await stripe.accounts.create({
      type: "express", 
      country: 'US', // Defaulting to US, or pass as arg
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // 2. SAVE IT TO DB: Call the internal mutation we made in Step 2
    await ctx.runMutation(internal.users.setStripeConnectId, {
      userId,
      stripeConnectId: account.id,
    });

    return account.id;
  },
});

export const createAccountLink = action({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const accountLink = await stripe.accountLinks.create({
      account: args.accountId,
      refresh_url: "https://tickets.welovestage.com/dashboard/seller",
      return_url: "https://tickets.welovestage.com/dashboard/seller",
      type: "account_onboarding",
    });

    return accountLink.url;
  },
});