import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(245,166,35,0.2)] hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(245,166,35,0.35)] active:scale-[0.98]",
        destructive:
          "bg-destructive text-white shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:bg-destructive/90 hover:shadow-[0_0_25px_rgba(239,68,68,0.3)] focus-visible:ring-destructive active:scale-[0.98]",
        outline:
          "border border-border bg-transparent shadow-sm hover:border-primary/50 hover:bg-primary/5 hover:text-primary hover:shadow-[0_0_15px_rgba(245,166,35,0.1)] active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:scale-[0.98]",
        ghost: "hover:bg-accent/10 hover:text-accent active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:text-primary/80 hover:underline",
        accent:
          "bg-accent text-accent-foreground shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:bg-accent/90 hover:shadow-[0_0_30px_rgba(6,182,212,0.35)] active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 rounded-md px-3.5 text-xs has-[>svg]:px-2.5",
        lg: "h-12 rounded-md px-8 text-base has-[>svg]:px-5",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      {...props}
    />
  );
}

export { Button, buttonVariants };
