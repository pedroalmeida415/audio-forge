import { EventEmitter } from "node:events";

export interface DiarizationEvent {
  sourceId: string;
  status: "completed" | "failed";
  timestamp: string;
}

/**
 * Singleton EventEmitter for diarization completion events.
 *
 * Used to notify SSE connections when a diarization job completes.
 * Works within a single Node.js process - for multi-instance deployments,
 * swap this for Redis pub/sub.
 */
class DiarizationEventEmitter extends EventEmitter {
  private static instance: DiarizationEventEmitter;

  private constructor() {
    super();
    // Increase max listeners since we may have many concurrent SSE connections
    this.setMaxListeners(100);
  }

  static getInstance(): DiarizationEventEmitter {
    if (!DiarizationEventEmitter.instance) {
      DiarizationEventEmitter.instance = new DiarizationEventEmitter();
    }
    return DiarizationEventEmitter.instance;
  }

  /**
   * Emit a diarization completion event for a specific source.
   */
  emitCompletion(sourceId: string, status: "completed" | "failed") {
    const event: DiarizationEvent = {
      sourceId,
      status,
      timestamp: new Date().toISOString(),
    };
    this.emit(`diarization:${sourceId}`, event);
  }
}

export const diarizationEvents = DiarizationEventEmitter.getInstance();
