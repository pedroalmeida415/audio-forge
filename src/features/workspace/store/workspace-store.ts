import { proxyMap, proxySet } from "valtio/utils";
import type { SegmentEntry, SegmentWithClip } from "./types";

export class WorkspaceStore {
  segments: Map<string, SegmentEntry> = proxyMap();
  selectedSegmentIds: Set<string> = proxySet();

  // Lifecycle

  initializeSegments(ids: string[]) {
    this.selectedSegmentIds.clear();
    this.segments.clear();
    for (const id of ids) {
      this.segments.set(id, { id, status: "pending" as const, data: null });
    }
  }

  clearSegments() {
    this.segments.clear();
    this.selectedSegmentIds.clear();
  }

  // Fetching lifecycle

  markSegmentsLoading(ids: string[]) {
    for (const id of ids) {
      const entry = this.segments.get(id);
      if (entry?.status === "pending") {
        entry.status = "loading";
      }
    }
  }

  setSegmentData(segments: SegmentWithClip[]) {
    for (const seg of segments) {
      this.segments.set(seg.id, { id: seg.id, status: "loaded", data: seg });
    }
  }

  markSegmentsError(ids: string[]) {
    for (const id of ids) {
      const entry = this.segments.get(id);
      if (entry) {
        entry.status = "error";
      }
    }
  }

  // Selection

  toggleSelection(id: string) {
    if (this.selectedSegmentIds.has(id)) {
      this.selectedSegmentIds.delete(id);
    } else {
      this.selectedSegmentIds.add(id);
    }
  }

  selectAll() {
    for (const id of this.segments.keys()) {
      this.selectedSegmentIds.add(id);
    }
  }

  clearSelection() {
    this.selectedSegmentIds.clear();
  }

  // Data updates (for optimistic mutations)

  updateTranscription(id: string, text: string | null) {
    const entry = this.segments.get(id);
    if (entry?.data) {
      entry.data.transcription = text;
    }
  }

  updateSegmentTags(id: string, tags: string[]) {
    const entry = this.segments.get(id);
    if (entry?.data) {
      entry.data.tags = tags;
    }
  }

  // Removal

  removeSegments(ids: string[]) {
    for (const id of ids) {
      this.segments.delete(id);
      this.selectedSegmentIds.delete(id);
    }
  }
}
