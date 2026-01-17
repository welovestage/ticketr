"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { TicketReservation } from "./ticket-reservation";
import ReleaseTicket from "../release-ticket";
import { useTicketPurchase } from "@/app/hooks/useTicketPurchase";
// FIX: Corrected import name from "useOfferTime" to "useOfferTimer"
import { useOfferTimer } from "@/app/hooks/useOfferTimer";

const PurchaseTicket = ({ eventId }: { eventId: Id<"events"> }) => {
  const user = useQuery(api.users.getUser);
  
  // Encapsulates all timer and queue position logic
  const { isExpired, isLoading, queuePosition, offerExpiresAt } = useOfferTimer({
    eventId,
    // This safely passes Id<"users"> | undefined, which satisfies our updated strict type
    userId: user?._id,
  });

  const { handlePurchase, isPurchaseLoading, isEligible } = useTicketPurchase({
    user,
    eventId,
    queuePosition,
  });

  if (!isEligible) return null;

  return (
    <div className="space-y-2">
      <TicketReservation
        expiresAt={new Date(offerExpiresAt)}
        onPurchase={handlePurchase}
        onRelease={() => {}} // Handled by ReleaseTicket component below
        isPurchaseLoading={isPurchaseLoading || isLoading || isExpired}
      />
      {queuePosition?._id && (
        <ReleaseTicket 
          eventId={eventId} 
          waitingListId={queuePosition._id} 
        />
      )}
    </div>
  );
};

export default PurchaseTicket;