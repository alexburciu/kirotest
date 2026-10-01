import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ErrorBannerProps {
  message?: string
  onDismiss?: () => void
  className?: string
}

export function ErrorBanner({
  message = "Something went wrong. Try again or contact support.",
  onDismiss,
  className,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex w-full items-center justify-between gap-4 bg-red-50 px-4 py-3 text-sm text-red-800 border-b border-red-200",
        className
      )}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 rounded p-1 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
