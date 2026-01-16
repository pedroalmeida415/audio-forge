import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[0_0_10px_rgba(245,166,35,0.2)] [a&]:hover:bg-primary/90 [a&]:hover:shadow-[0_0_15px_rgba(245,166,35,0.3)]",
        secondary:
          "border-border/50 bg-secondary text-secondary-foreground [a&]:hover:border-primary/30 [a&]:hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive/80 text-white shadow-[0_0_10px_rgba(239,68,68,0.2)] [a&]:hover:bg-destructive/90",
        outline:
          "border-border/50 text-foreground [a&]:hover:border-primary/50 [a&]:hover:text-primary",
        success:
          "border-transparent bg-success/20 text-success shadow-[0_0_10px_rgba(34,197,94,0.15)]",
        accent:
          "border-transparent bg-accent/20 text-accent shadow-[0_0_10px_rgba(6,182,212,0.15)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      {...props}
    />
  );
}

export { Badge, badgeVariants };
