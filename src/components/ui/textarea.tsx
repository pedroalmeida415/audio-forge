import type * as React from "react";

import { cn } from "~/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all duration-200",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "focus:border-primary/50 focus:shadow-[0_0_15px_rgba(245,166,35,0.1)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-none",
        className
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
