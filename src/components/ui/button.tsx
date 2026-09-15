import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,color,filter,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger aria-invalid:ring-danger/20 active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-gold-light to-gold text-on-gold hover:brightness-105",
        destructive:
          "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/30",
        outline:
          "border border-line-strong bg-transparent text-cream hover:bg-surface-alt",
        secondary:
          "border border-line bg-surface-hi text-cream hover:bg-surface-alt",
        ghost:
          "text-muted-foreground hover:bg-surface-alt hover:text-cream",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-8 rounded-lg gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
        lg: "h-12 rounded-xl px-6 text-[15px] has-[>svg]:px-5",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
