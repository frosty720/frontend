import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const baseClasses = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50"

  const variantClasses = {
    default: "border-transparent bg-gold-soft text-gold-light",
    secondary: "border-transparent bg-surface-hi text-cream",
    destructive: "border-transparent bg-danger/15 text-danger",
    outline: "border-line-strong text-muted-foreground",
  }

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      {...props}
    />
  )
}

export { Badge }
