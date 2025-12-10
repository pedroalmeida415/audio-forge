"use client";

import { formatTimestamp } from "~/lib/time-utils";

interface TimestampMark {
  time: number;
  major: boolean;
}

interface TimelineTimestampsProps {
  marks: TimestampMark[];
  timeToPixels: (time: number) => number;
}

export function TimelineTimestamps({
  marks,
  timeToPixels,
}: TimelineTimestampsProps) {
  return (
    <div className="relative h-6 shrink-0 overflow-hidden border-b bg-muted/30">
      {marks.map((mark) => (
        <div
          className="absolute top-0 flex h-full flex-col items-center"
          key={mark.time}
          style={{ left: timeToPixels(mark.time) }}
        >
          {mark.major ? (
            <>
              <div className="h-2 w-px bg-muted-foreground/50" />
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {formatTimestamp(mark.time)}
              </span>
            </>
          ) : (
            <div className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/30" />
          )}
        </div>
      ))}
    </div>
  );
}
