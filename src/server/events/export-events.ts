import { EventEmitter } from "node:events";

/** Progress event data for export jobs */
export interface ExportProgressEvent {
  jobId: string;
  processed: number;
  total: number;
  status: "processing" | "completed" | "failed";
  downloadUrl?: string;
  fileCount?: number;
  totalDuration?: number;
  skippedCount?: number;
  error?: string;
  timestamp: string;
}

/**
 * Singleton EventEmitter for LJSpeech export progress events.
 *
 * Used to notify SSE connections when export jobs make progress or complete.
 * Works within a single Node.js process - for multi-instance deployments,
 * swap this for Redis pub/sub.
 */
class ExportEventEmitter extends EventEmitter {
  private static instance: ExportEventEmitter;

  private constructor() {
    super();
    // Increase max listeners since we may have many concurrent SSE connections
    this.setMaxListeners(100);
  }

  static getInstance(): ExportEventEmitter {
    if (!ExportEventEmitter.instance) {
      ExportEventEmitter.instance = new ExportEventEmitter();
    }
    return ExportEventEmitter.instance;
  }

  /**
   * Emit an export progress event for a specific job.
   * Clients subscribe by jobId to receive updates.
   */
  emitProgress(params: {
    jobId: string;
    processed: number;
    total: number;
    status: "processing" | "completed" | "failed";
    downloadUrl?: string;
    fileCount?: number;
    totalDuration?: number;
    skippedCount?: number;
    error?: string;
  }) {
    const event: ExportProgressEvent = {
      ...params,
      timestamp: new Date().toISOString(),
    };
    this.emit(`export:job:${params.jobId}`, event);
  }
}

export const exportEvents = ExportEventEmitter.getInstance();
