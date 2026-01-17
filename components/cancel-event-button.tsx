"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react"; // Changed from useMutation to useAction
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "./ui/button";

export default function CancelEventButton({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const [isCancelling, setIsCancelling] = useState(false);
  const router = useRouter();
  
  // Use the Convex Action we created in convex/stripe.ts
  const refundAndCancel = useAction(api.stripe.refundEventTickets);

  const handleCancel = async () => {
    if (
      !confirm(
        "Are you sure you want to cancel this event? All tickets will be refunded and the event will be cancelled permanently."
      )
    ) {
      return;
    }

    setIsCancelling(true);
    try {
      // This single action now handles:
      // 1. Refunding all tickets via Stripe (with clawback)
      // 2. Marking tickets as refunded in DB
      // 3. Cancelling the event in DB
      await refundAndCancel({ eventId });
      
      toast("Event cancelled", {
        description: "All tickets have been refunded successfully.",
      });
      router.push("/seller/events");
    } catch (error) {
      console.error("Failed to cancel event:", error);
      toast.error("Error", {
        description: "Failed to cancel event. Please try again later.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Button
      onClick={handleCancel}
      disabled={isCancelling}
      variant={"noShadow"}
      className="flex bg-red-100 hover:bg-red-200 items-center gap-2 px-4 py-2 border-2 border-red-600 text-red-600 hover:text-red-700 rounded-lg transition-colors cursor-pointer"
    >
      <Ban className="w-4 h-4" />
      <span>{isCancelling ? "Processing..." : "Cancel Event"}</span>
    </Button>
  );
}