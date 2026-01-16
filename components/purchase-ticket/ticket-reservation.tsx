"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"

interface TicketReservationProps {
  expiresAt: Date
  onPurchase: () => void
  onRelease: () => void
  isPurchaseLoading?: boolean
}

export function TicketReservation({
  expiresAt,
  onPurchase,
  onRelease,
  isPurchaseLoading = false,
}: TicketReservationProps) {
  const [timeRemaining, setTimeRemaining] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date()
      const diff = expiresAt.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeRemaining("0:00")
        return
      }

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`)
      setIsUrgent(minutes < 2)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return (
    <div className="bg-emerald-950 p-5 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-emerald-400 text-sm font-medium tracking-wide uppercase">Ticket Reserved</span>
      </div>
      <p className="text-white/70 text-sm mb-4">Complete your purchase before the timer expires to secure your spot.</p>
      <div className="flex items-center justify-between gap-4">
        <Button
          onClick={onPurchase}
          disabled={isPurchaseLoading}
          className="flex-1 bg-white text-emerald-950 hover:bg-white/90 font-semibold h-11"
        >
          {isPurchaseLoading ? "Redirecting..." : "Purchase Now"}
        </Button>
        <div className="text-right">
          <span className={`font-mono text-2xl font-bold tabular-nums ${isUrgent ? "text-red-400" : "text-white"}`}> {/* Fixed template literal syntax */}
            {timeRemaining}
          </span>
          <p className="text-white/50 text-xs">remaining</p>
        </div>
      </div>
      <button
        onClick={onRelease}
        className="mt-3 text-white/40 text-xs hover:text-white/60 transition-colors w-full text-center"
      >
        Release ticket and leave queue
      </button>
    </div>
  )
}