"use client";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import React from "react";
import { TicketReservation } from "./ticket-reservation";
import ReleaseTicket from "../release-ticket";
import { useTicketPurchase } from "@/app/hooks/useTicketPurchase";
import { useOfferTimer } from "@/app/hooks/useOfferTime";

const PurchaseTicket = ({ eventId }: { eventId: Id<"events"> }) => {
  const user = useQuery(api.users.getUser);
  
  // Encapsulates all timer and queue position logic
  const { isExpired, isLoading, queuePosition, offerExpiresAt } = useOfferTimer({
    eventId,
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
      {queuePosition?._id && ( // Only render if waitingListId exists
        <ReleaseTicket 
          eventId={eventId} 
          waitingListId={queuePosition._id} 
        />
      )}
    </div>
  );
};

export default PurchaseTicket;