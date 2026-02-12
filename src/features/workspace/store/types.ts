import type { Clip, Segment } from "~/server/db/schema";

export type SegmentWithClip = Segment & {
  clip: Clip | null;
  source: { id: string; name: string | null; storageKey: string | null };
};

export type SegmentEntryStatus = "pending" | "loading" | "loaded" | "error";

export type SegmentEntry = {
  id: string;
  status: SegmentEntryStatus;
  data: SegmentWithClip | null;
  error?: string;
};
