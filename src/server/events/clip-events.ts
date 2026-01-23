import { EventEmitter } from "node:events";

/** Clip data included in completion events */
export interface ClipEventData {
  id: string;
  segmentId: string;
  fileId: string;
  createdAt: string;
  file: {
    id: string;
    storageKey: string;
    duration: number;
  };
}

export interface ClipEvent {
  segmentId: string;
  speakerId: string;
  clip?: ClipEventData;
  status: "completed" | "failed";
  error?: string;
  timestamp: string;
}

/**
 * Singleton EventEmitter for clip processing completion events.
 *
 * Used to notify SSE connections when a clip job completes.
 * Works within a single Node.js process - for multi-instance deployments,
 * swap this for Redis pub/sub.
 */
class ClipEventEmitter extends EventEmitter {
  private static instance: ClipEventEmitter;

  private constructor() {
    super();
    // Increase max listeners since we may have many concurrent SSE connections
    this.setMaxListeners(100);
  }

  static getInstance(): ClipEventEmitter {
    if (!ClipEventEmitter.instance) {
      ClipEventEmitter.instance = new ClipEventEmitter();
    }
    return ClipEventEmitter.instance;
  }

  /**
   * Emit a clip completion event for a specific speaker.
   * Clients subscribe by speakerId to receive relevant updates.
   */
  emitCompletion(params: {
    segmentId: string;
    speakerId: string;
    clip?: ClipEventData;
    status: "completed" | "failed";
    error?: string;
  }) {
    const event: ClipEvent = {
      ...params,
      timestamp: new Date().toISOString(),
    };
    this.emit(`clip:speaker:${params.speakerId}`, event);
  }
}

export const clipEvents = ClipEventEmitter.getInstance();
