"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface TranscriptionCellProps {
  transcription: string | null;
}

export function TranscriptionCell({ transcription }: TranscriptionCellProps) {
  if (!transcription) {
    return (
      <span className="text-muted-foreground text-sm italic">
        No transcription
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="line-clamp-1 cursor-default text-sm">
          {transcription}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md">
        <p className="whitespace-pre-wrap">{transcription}</p>
      </TooltipContent>
    </Tooltip>
  );
}
