"use client";

import { ScrollArea } from "~/components/ui/scroll-area";
import { ProcessingActions } from "./processing-actions";
import { QueueStatus } from "./queue-status";
import { StatisticsSection } from "./statistics-section";

// ============================================================================
// Speaker Sidebar Container
// ============================================================================

/**
 * Sidebar container for the speaker page.
 *
 * Composes three main sections:
 * - StatisticsSection (top): Displays speaker statistics and histograms
 * - ProcessingActions (middle): Batch processing action buttons
 * - QueueStatus (bottom): Live queue status polling
 *
 * Uses a scrollable container to handle overflow when content exceeds viewport.
 */
export function SpeakerSidebar() {
  return (
    <aside className="flex w-[320px] flex-col border-l bg-muted/20">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-4">
          {/* Statistics section at the top */}
          <StatisticsSection />

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Processing actions in the middle */}
          <ProcessingActions />

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Queue status at the bottom */}
          <QueueStatus />
        </div>
      </ScrollArea>
    </aside>
  );
}
