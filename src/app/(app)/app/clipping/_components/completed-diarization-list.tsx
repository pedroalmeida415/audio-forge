"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowRight, AudioWaveform, Clock, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { createSpeakerColorMap, withAlpha } from "~/lib/speaker-colors";
import { api } from "~/trpc/react";

export function CompletedDiarizationList() {
  const [diarizationsList] = api.diarization.list.useSuspenseQuery();

  // Filter to only show completed diarizations with segments
  const completedDiarizations = diarizationsList.filter(
    (d) => d.completedAt && (d.output?.segments?.length ?? 0) > 0,
  );

  if (!completedDiarizations.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
        <AudioWaveform className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="font-medium text-lg">No completed diarizations</p>
        <p className="text-muted-foreground text-sm">
          Complete a diarization first to start clipping
        </p>
        <Link
          className="mt-4 text-primary text-sm underline-offset-4 hover:underline"
          href="/app/diarization"
        >
          Go to Diarization
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display font-semibold text-xl">Ready for Clipping</h2>
      <div className="grid gap-4">
        {completedDiarizations.map((diarization, index) => {
          const segments = diarization.output?.segments ?? [];
          const uniqueSpeakers = getUniqueSpeakers(segments);
          const speakerColors = createSpeakerColorMap(uniqueSpeakers);
          const fileName =
            diarization.file?.storageKey?.split("/").pop() ?? "Audio File";

          return (
            <Link href={`/app/clipping/${diarization.id}`} key={diarization.id}>
              <Card
                className="group animate-fade-up cursor-pointer opacity-0 transition-colors hover:border-primary/50"
                style={{ animationDelay: `${0.05 * index}s` }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {fileName}
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </CardTitle>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(diarization.createdAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="gap-1" variant="secondary">
                        <Users className="h-3 w-3" />
                        {uniqueSpeakers.length} speakers
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {uniqueSpeakers.map((speaker) => {
                      const color = speakerColors[speaker];
                      return (
                        <Badge
                          className="border"
                          key={speaker}
                          variant="outline"
                          style={{
                            backgroundColor: color && withAlpha(color, 0.4),
                            borderColor: color,
                          }}
                        >
                          {speaker}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {segments.length} segments detected
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function getUniqueSpeakers(segments: { speaker: string }[]): string[] {
  return [...new Set(segments.map((s) => s.speaker))].sort();
}
