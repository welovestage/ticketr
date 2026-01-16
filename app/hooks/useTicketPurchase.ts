"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

type QueuePosition = {
  _id: Id<"waitingList">;
  _creationTime: number;
  eventId: Id<"events">;
  userId: string; // not v.Id("users") because waitingList schema and mutations, userId is defined as v.string()
  status: "waiting" | "offered" | "purchased" | "expired";
  offerExpiresAt?: number;
  position: number;
} | null | undefined; // Convex likes undefined

interface UseTicketPurchaseParams {
  user: Doc<"users"> | null | undefined;
  eventId: Id<"events">;
  queuePosition: QueuePosition | null | undefined;
}

export function useTicketPurchase({
  user,
  eventId,
  queuePosition,
}: UseTicketPurchaseParams) {
  const router = useRouter();
  const [isPurchaseLoading, setIsPurchaseLoading] = useState(false);
  
  // Move useAction to the top level of the hook
  const payAndBuyTicket = useAction(api.stripe.pay);
  
  const isEligible =
    Boolean(user) &&
    Boolean(queuePosition) &&
    queuePosition?.status === "offered";

  const handlePurchase = useCallback(async () => {
    if (!user || !isEligible) return;

    try {
      setIsPurchaseLoading(true);
      const paymentUrl = await payAndBuyTicket({
        eventId,
      });

      if (paymentUrl) {
        router.push(paymentUrl);
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
    } finally {
      setIsPurchaseLoading(false);
    }
  }, [user, eventId, isEligible, router, payAndBuyTicket]);

  return {
    handlePurchase,
    isPurchaseLoading,
    isEligible,
  };
}