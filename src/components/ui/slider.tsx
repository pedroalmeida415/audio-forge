"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import type * as React from "react";

import { cn } from "~/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = value ?? defaultValue ?? [min];

  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      max={max}
      min={min}
      value={value}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary shadow-[0_0_8px_rgba(245,166,35,0.4)]" />
      </SliderPrimitive.Track>
      {_values.map((_, index) => (
        <SliderPrimitive.Thumb
          className={cn(
            "block size-4 rounded-full border border-primary/50 bg-background shadow-md transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none disabled:opacity-50",
            "hover:border-primary hover:shadow-[0_0_12px_rgba(245,166,35,0.4)]",
            "focus:shadow-[0_0_12px_rgba(245,166,35,0.5)]",
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: Slider thumbs are stable by index
          key={index}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
