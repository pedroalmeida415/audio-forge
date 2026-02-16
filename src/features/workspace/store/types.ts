import type { Clip, Segment } from "~/server/db/schema";

export type SegmentWithClip = Segment & {
  clip: Clip | null;
  source: { id: string; name: string | null; storageKey: string | null };
};
