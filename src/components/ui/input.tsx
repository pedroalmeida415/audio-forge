import type * as React from "react";

import { cn } from "~/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-border/50 bg-secondary/30 px-4 py-2 text-base shadow-sm outline-none transition-all duration-200",
        "placeholder:text-muted-foreground/60",
        "selection:bg-primary/20 selection:text-foreground",
        "file:mr-4 file:inline-flex file:h-7 file:cursor-pointer file:rounded file:border-0 file:bg-primary/10 file:px-3 file:font-medium file:text-primary file:text-sm file:transition-colors file:hover:bg-primary/20",
        "focus-visible:border-primary/50 focus-visible:bg-secondary/50 focus-visible:shadow-[0_0_0_3px_rgba(245,166,35,0.1),0_0_20px_rgba(245,166,35,0.05)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive/50 aria-invalid:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]",
        "md:text-sm",
        className
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
