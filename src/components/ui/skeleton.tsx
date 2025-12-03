import { cn } from "~/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-secondary/50",
        "before:-translate-x-full before:absolute before:inset-0 before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-primary/5 before:to-transparent",
        className
      )}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
