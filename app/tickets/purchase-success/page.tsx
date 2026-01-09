"use client"

import { api } from "@/convex/_generated/api";
import { redirect } from "next/navigation";
import Ticket from "@/components/ticket";
import { useQuery } from "convex/react";
import { Spinner } from "@/components/spinner";
import { useMemo, useEffect, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";

function TicketSuccess() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [waitTime, setWaitTime] = useState(0);
    const maxWaitTime = 60000; // 60 seconds max wait (webhooks can be slow)
    const [previousTicketCount, setPreviousTicketCount] = useState<number | null>(null);

    // Always call useQuery for user
    const user = useQuery(api.users.getUser);

    // Create a safe userId that's never undefined
    const userId = useMemo(() => user?._id, [user]);

    // Always call useQuery - use empty string as fallback
    // This ensures the hook is always called
    const tickets = useQuery(api.events.getUserTickets, {
        userId: userId as Id<"users"> || "" as Id<"users">
    });

    // Track previous ticket count to detect new tickets
    useEffect(() => {
        if (tickets !== undefined) {
            if (previousTicketCount === null) {
                setPreviousTicketCount(tickets.length);
            } else if (tickets.length > previousTicketCount) {
                // New ticket detected, reset wait time
                setWaitTime(0);
            }
        }
    }, [tickets, previousTicketCount]);

    // Increment wait time when we have session_id but no new tickets
    useEffect(() => {
        if (sessionId && tickets !== undefined && (!tickets || tickets.length === previousTicketCount || previousTicketCount === null) && waitTime < maxWaitTime) {
            const timer = setTimeout(() => {
                setWaitTime(prev => prev + 1000); // Check every second
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [sessionId, tickets, waitTime, previousTicketCount, maxWaitTime]);

    // Handle loading state
    if (user === undefined || tickets === undefined) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Spinner />
            </div>
        );
    }

    // Handle no user state
    if (!user) {
        redirect("/auth/signin");
        return null;
    }

    // Handle no tickets state - only redirect if we've waited long enough or no session_id
    if ((!tickets || tickets.length === 0)) {
        if (sessionId && waitTime < maxWaitTime) {
            // Still waiting for webhook to process
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <Spinner />
                        <p className="mt-4 text-foreground/60">
                            Processing your payment...
                        </p>
                        <p className="mt-2 text-sm text-foreground/40">
                            This may take a few moments. Please wait...
                        </p>
                    </div>
                </div>
            );
        }
        // No session_id or waited too long - redirect
        redirect("/");
        return null;
    }

    // Check if we got a new ticket (for session_id case)
    if (sessionId && previousTicketCount !== null && tickets.length <= previousTicketCount && waitTime < maxWaitTime) {
        // Still waiting for new ticket
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <Spinner />
                    <p className="mt-4 text-foreground/60">
                        Processing your payment...
                    </p>
                    <p className="mt-2 text-sm text-foreground/40">
                        This may take a few moments. Please wait...
                    </p>
                </div>
            </div>
        );
    }

    const latestTicket = tickets[tickets.length - 1];

    return (
        <div className="min-h-content py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-foreground/90">
                        Ticket Purchase Successful!
                    </h1>
                    <p className="mt-2 text-foreground/60">
                        Your ticket has been confirmed and is ready to use
                    </p>
                </div>

                <Ticket ticketId={latestTicket._id} />
            </div>
        </div>
    );
}

export default TicketSuccess;