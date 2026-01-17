"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import Ticket from "@/components/ticket"; // Assuming this is your component
import { Spinner } from "@/components/spinner";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect } from "react";

export default function TicketSuccess() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const paymentId = searchParams.get("paymentId");

    // 1. Get the ticket ID associated with this specific payment
    // I created this query in convex/payments.ts specifically for this page
    const ticketId = useQuery(api.payments.getTicketId, {
        paymentId: (paymentId as Id<"payments">) || undefined // Pass undefined to skip if null
    });

    // 2. Redirect logic inside useEffect (safer for Client Components)
    useEffect(() => {
        // If paymentId is missing, go home
        if (!paymentId) {
            router.push("/");
        }
    }, [paymentId, router]);

    // 3. Loading State
    if (ticketId === undefined) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Spinner />
            </div>
        );
    }

    // 4. If query finished but no ticket found (yet), or payment invalid
    if (ticketId === null) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <Spinner />
                <p className="text-gray-500">Finalizing your ticket...</p>
            </div>
        );
    }

    // 5. Success. Render the specific ticket
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

                <Ticket ticketId={ticketId} />
            </div>
        </div>
    );
}