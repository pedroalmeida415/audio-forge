import type { Readable } from "node:stream";
import archiver from "archiver";

export interface ZipFileEntry {
  name: string;
  data: Buffer | Readable;
}

export interface ZipStreamResult {
  /** Web-compatible ReadableStream for Next.js responses */
  stream: ReadableStream<Uint8Array>;
  /** Add a file to the archive */
  addFile: (entry: ZipFileEntry) => void;
  /** Add a metadata CSV file to the archive */
  addMetadataCSV: (filename: string, content: string) => void;
  /** Finalize the archive - must be called after all files are added */
  finalize: () => void;
}

/**
 * Creates a streaming ZIP archive that can be used with Next.js Response.
 *
 * The archiver library is used to create the ZIP, and the Node stream
 * is converted to a Web ReadableStream for compatibility with Next.js
 * edge and serverless functions.
 *
 * @example
 * ```typescript
 * const { stream, addFile, addMetadataCSV, finalize } = createZipStream();
 *
 * addFile({ name: "audio/001.wav", data: audioBuffer });
 * addFile({ name: "audio/002.wav", data: audioStream });
 * addMetadataCSV("metadata.csv", "file|text|normalized\n001.wav|Hello|hello");
 *
 * finalize();
 *
 * return new Response(stream, {
 *   headers: {
 *     "Content-Type": "application/zip",
 *     "Content-Disposition": 'attachment; filename="export.zip"',
 *   },
 * });
 * ```
 */
export function createZipStream(): ZipStreamResult {
  // Create archiver with 'store' mode (no compression) for audio files
  // This is faster and audio is already compressed
  const archive = archiver("zip", { store: true });

  // Create a TransformStream to bridge Node and Web streams
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  // Pipe archiver events to the Web stream
  archive.on("data", (chunk: Buffer) => {
    writer.write(new Uint8Array(chunk));
  });

  archive.on("end", () => {
    writer.close();
  });

  archive.on("error", (err) => {
    writer.abort(err);
  });

  const addFile = (entry: ZipFileEntry): void => {
    if (Buffer.isBuffer(entry.data)) {
      archive.append(entry.data, { name: entry.name });
    } else {
      archive.append(entry.data, { name: entry.name });
    }
  };

  const addMetadataCSV = (filename: string, content: string): void => {
    archive.append(content, { name: filename });
  };

  const finalize = (): void => {
    archive.finalize();
  };

  return {
    stream: readable,
    addFile,
    addMetadataCSV,
    finalize,
  };
}

/**
 * Generates metadata CSV content in LJSpeech format.
 *
 * LJSpeech uses pipe-delimited format:
 * `filename|transcription|normalized_transcription`
 *
 * For simplicity, we use the same text for both transcription fields
 * since normalization would require additional processing.
 *
 * @param entries - Array of filename and transcription pairs
 * @returns CSV content string
 */
export function generateMetadataCSV(
  entries: Array<{ filename: string; transcription: string }>,
): string {
  const lines = entries.map(
    ({ filename, transcription }) =>
      `${filename}|${transcription}|${transcription}`,
  );
  return lines.join("\n");
}
