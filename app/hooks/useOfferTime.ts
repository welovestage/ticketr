// hooks/useOfferTimer.ts
import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface UseOfferTimerProps {
  eventId: Id<"events">;
  userId?: Id<"users">;
}

interface UseOfferTimerReturn {
  timeRemaining: string;
  isExpired: boolean;
  isLoading: boolean;
  offerExpiresAt: number;
  queuePosition: any;
}

export function useOfferTimer({ eventId, userId }: UseOfferTimerProps): UseOfferTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState("");
  
  const queuePosition = useQuery(
    api.waitingList.getQueuePosition,
    userId ? { eventId, userId } : "skip"
  );
  
  const offerExpiresAt = queuePosition?.offerExpiresAt ?? 0;
  const isExpired = Date.now() > offerExpiresAt;
  const isLoading = queuePosition === undefined;

  useEffect(() => {
    const calculateTimeRemaining = () => {
      if (isExpired) {
        setTimeRemaining("Expired");
        return;
      }

      const diff = offerExpiresAt - Date.now();
      const minutes = Math.floor(diff / 1000 / 60);
      const seconds = Math.floor((diff / 1000) % 60);

      if (minutes > 0) {
        setTimeRemaining(
          `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`
        );
      } else {
        setTimeRemaining(`${seconds} second${seconds === 1 ? "" : "s"}`);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [offerExpiresAt, isExpired]);

  return {
    timeRemaining,
    isExpired,
    isLoading,
    offerExpiresAt,
    queuePosition,
  };
}