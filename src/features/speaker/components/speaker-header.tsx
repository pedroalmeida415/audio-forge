"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

interface SpeakerHeaderProps {
  speakerName: string;
  projectId: string;
  onExportClick: () => void;
}

export function SpeakerHeader({
  speakerName,
  projectId,
  onExportClick,
}: SpeakerHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-3">
      {/* Left: Back button + Speaker name */}
      <div className="flex items-center gap-2">
        <Link href={`/app/project/${projectId}`}>
          <Button size="icon" variant="ghost" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-medium text-sm">{speakerName}</h1>
      </div>

      {/* Right: Export button */}
      <div className="flex items-center">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={onExportClick}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>
    </header>
  );
}
