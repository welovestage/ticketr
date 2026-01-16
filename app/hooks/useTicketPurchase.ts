import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

// not important note: removed prop taking: payAndBuyTicket: createStripeCheckoutSession,


type QueuePosition = {
  status: "waiting" | "offered" | "expired";
};

interface UseTicketPurchaseParams {
  user: Doc<"users"> | null | undefined;
  eventId: Id<"events">;
  queuePosition: QueuePosition | null;
 }

export function useTicketPurchase({
  user,
  eventId,
  queuePosition,
}: UseTicketPurchaseParams) {
  const router = useRouter();
  const [isPurchaseLoading, setIsPurchaseLoading] = useState(false);

  const isEligible =
    Boolean(user) &&
    Boolean(queuePosition) &&
    queuePosition?.status === "offered";

  const handlePurchase = useCallback(async () => {
    if (!user || !isEligible) return;

    try {
      setIsPurchaseLoading(true);

      const payAndBuyTicket = useAction(api.stripe.pay);
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
  }, [user, eventId, isEligible, router]);

  return {
    handlePurchase,
    isPurchaseLoading,
    isEligible,
  };
}
