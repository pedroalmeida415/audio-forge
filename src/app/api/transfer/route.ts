import { type NextRequest, NextResponse } from "next/server";
import { getObjectStream } from "~/server/services/minio";
import {
  createMediaUploadUrl,
  uploadToPyannoteStorage,
} from "~/server/services/pyannote";

type TransferRequest = {
  storageKey: string;
  contentType: string;
};

/**
 * POST /api/transfer
 *
 * Transfers an audio file from MinIO to Pyannote's temporary storage.
 * This is done server-side because Pyannote doesn't allow browser uploads.
 *
 * Request body:
 * - storageKey: The MinIO object key of the file to transfer
 * - contentType: The MIME type of the file
 *
 * Response:
 * - mediaUrl: The Pyannote media URL to use for diarization
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TransferRequest;
    const { storageKey, contentType } = body;

    if (!(storageKey && contentType)) {
      return NextResponse.json(
        { error: "Missing storageKey or contentType" },
        { status: 400 }
      );
    }

    // Get the file from MinIO as a stream
    const stream = await getObjectStream(storageKey);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      return NextResponse.json(
        { error: "File is empty or not found in storage" },
        { status: 404 }
      );
    }

    // Get a presigned upload URL from Pyannote
    const { url: uploadUrl } = await createMediaUploadUrl();

    // Upload the file to Pyannote's temp storage
    await uploadToPyannoteStorage(uploadUrl, fileBuffer, contentType);

    // The media URL is the upload URL without query params
    // Pyannote returns a presigned URL like: https://storage.com/media/abc123?signature=...
    // We need just the base URL: https://storage.com/media/abc123
    const urlObj = new URL(uploadUrl);
    const mediaUrl = `${urlObj.origin}${urlObj.pathname}`;

    return NextResponse.json({ mediaUrl });
  } catch (error) {
    console.error("Transfer error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Transfer failed",
      },
      { status: 500 }
    );
  }
}
