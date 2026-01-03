/**
 * MSW handlers for tRPC API mocking.
 *
 * These handlers intercept tRPC requests and return type-safe fixtures.
 * The handlers parse the tRPC batch request format and route to appropriate fixtures.
 *
 * Uses tRPC's internal jsonlStreamProducer to ensure response format matches
 * what httpBatchStreamLink expects.
 */
import { http, delay } from "msw";
import SuperJSON from "superjson";
import { jsonlStreamProducer } from "@trpc/server/unstable-core-do-not-import";
import {
	defaultClippingSession,
	sessionList,
	TEST_IDS,
	type ClippingSessionGetById,
} from "./fixtures";

// ============================================================================
// Types
// ============================================================================

interface TRPCSuccessResult {
	result: {
		type: "data";
		data: unknown;
	};
}

interface TRPCErrorResult {
	error: {
		message: string;
		code: number;
		data: {
			code: string;
			httpStatus: number;
			path: string;
		};
	};
}

type TRPCResult = TRPCSuccessResult | TRPCErrorResult;

// ============================================================================
// Handler State (for mutation tracking)
// ============================================================================

// This allows stories to track and override state
let currentSession: ClippingSessionGetById = { ...defaultClippingSession };

export function resetHandlerState() {
	currentSession = { ...defaultClippingSession };
}

export function setSessionFixture(session: ClippingSessionGetById) {
	currentSession = session;
}

// ============================================================================
// tRPC Response Helpers
// ============================================================================

function createSuccessResult(data: unknown): TRPCSuccessResult {
	return {
		result: {
			type: "data",
			data,
		},
	};
}

function createErrorResult(
	message: string,
	code: string,
	httpStatus: number,
	path: string,
): TRPCErrorResult {
	return {
		error: {
			message,
			code: httpStatus,
			data: {
				code,
				httpStatus,
				path,
			},
		},
	};
}

// ============================================================================
// Procedure Handlers
// ============================================================================

type ProcedureHandler = (input: unknown) => TRPCResult | Promise<TRPCResult>;

const procedureHandlers: Record<string, ProcedureHandler> = {
	// Clipping Session
	"clippingSession.getById": () => {
		return createSuccessResult(currentSession);
	},

	"clippingSession.listByProject": () => {
		return createSuccessResult(sessionList);
	},

	"clippingSession.rename": (input) => {
		const { name } = input as { id: string; name: string };
		currentSession = { ...currentSession, name };
		return createSuccessResult({ success: true });
	},

	"clippingSession.startDiarization": () => {
		currentSession = {
			...currentSession,
			diarization: {
				jobId: "mock-job-id",
				status: "pending",
				startedAt: new Date().toISOString(),
				completedAt: null,
				error: null,
			},
		};
		return createSuccessResult({
			sessionId: currentSession.id,
			jobId: "mock-job-id",
			status: "pending",
			warning: null,
		});
	},

	"clippingSession.getDiarizationStatus": () => {
		return createSuccessResult(currentSession.diarization ?? { status: null });
	},

	"clippingSession.updateSegments": (input) => {
		const { segmentIds, updates } = input as {
			sessionId: string;
			segmentIds: string | string[];
			updates: { startTime?: number; endTime?: number; speakerId?: string };
		};
		const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];

		currentSession = {
			...currentSession,
			segments: currentSession.segments.map((seg) =>
				ids.includes(seg.id)
					? {
							...seg,
							...(updates.startTime !== undefined && {
								startTime: updates.startTime,
							}),
							...(updates.endTime !== undefined && { endTime: updates.endTime }),
							...(updates.speakerId !== undefined && {
								speakerId: updates.speakerId,
							}),
						}
					: seg,
			),
		};

		return createSuccessResult({ success: true, updatedCount: ids.length });
	},

	"clippingSession.createSegment": (input) => {
		const { segment } = input as {
			sessionId: string;
			segment: { speakerId: string; startTime: number; endTime: number };
		};

		const speaker = currentSession.speakers.find(
			(s) => s.id === segment.speakerId,
		);
		if (!speaker) {
			return createErrorResult(
				"Speaker not found",
				"BAD_REQUEST",
				400,
				"clippingSession.createSegment",
			);
		}

		const newSegment = {
			id: crypto.randomUUID(),
			sessionId: currentSession.id,
			speakerId: segment.speakerId,
			startTime: segment.startTime,
			endTime: segment.endTime,
			createdAt: new Date(),
			updatedAt: new Date(),
			speaker,
		};

		currentSession = {
			...currentSession,
			segments: [...currentSession.segments, newSegment].sort(
				(a, b) => a.startTime - b.startTime,
			),
		};

		return createSuccessResult({ success: true, segment: newSegment });
	},

	"clippingSession.splitSegment": (input) => {
		const { segmentId, splitTime } = input as {
			sessionId: string;
			segmentId: string;
			splitTime: number;
		};

		const segmentIndex = currentSession.segments.findIndex(
			(s) => s.id === segmentId,
		);
		if (segmentIndex === -1) {
			return createErrorResult(
				"Segment not found",
				"NOT_FOUND",
				404,
				"clippingSession.splitSegment",
			);
		}

		const originalSegment = currentSession.segments[segmentIndex];
		const secondSegmentId = crypto.randomUUID();

		// Create two segments
		const firstSegment = {
			...originalSegment,
			endTime: splitTime,
		};

		const secondSegment = {
			...originalSegment,
			id: secondSegmentId,
			startTime: splitTime,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Replace in array
		const newSegments = [...currentSession.segments];
		newSegments[segmentIndex] = firstSegment;
		newSegments.splice(segmentIndex + 1, 0, secondSegment);

		currentSession = {
			...currentSession,
			segments: newSegments,
		};

		return createSuccessResult({
			success: true,
			firstSegmentId: segmentId,
			secondSegmentId,
		});
	},

	"clippingSession.deleteSegments": (input) => {
		const { segmentIds } = input as { sessionId: string; segmentIds: string[] };

		currentSession = {
			...currentSession,
			segments: currentSession.segments.filter(
				(s) => !segmentIds.includes(s.id),
			),
		};

		return createSuccessResult({
			success: true,
			deletedCount: segmentIds.length,
		});
	},

	"clippingSession.createSpeaker": (input) => {
		const { name, color } = input as {
			projectId: string;
			name: string;
			color?: string;
		};

		const newSpeaker = {
			id: crypto.randomUUID(),
			projectId: TEST_IDS.project,
			userId: TEST_IDS.user,
			name,
			color: color ?? null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		currentSession = {
			...currentSession,
			speakers: [...currentSession.speakers, newSpeaker],
		};

		return createSuccessResult({ success: true, speaker: newSpeaker });
	},

	"clippingSession.updateSpeaker": (input) => {
		const { speakerId, name, color } = input as {
			speakerId: string;
			name?: string;
			color?: string;
		};

		const speaker = currentSession.speakers.find((s) => s.id === speakerId);
		if (!speaker) {
			return createErrorResult(
				"Speaker not found",
				"NOT_FOUND",
				404,
				"clippingSession.updateSpeaker",
			);
		}

		// Block renaming SPEAKER_* speakers (match real behavior)
		if (name !== undefined && speaker.name.startsWith("SPEAKER_")) {
			return createErrorResult(
				"Diarization speakers cannot be renamed",
				"BAD_REQUEST",
				400,
				"clippingSession.updateSpeaker",
			);
		}

		currentSession = {
			...currentSession,
			speakers: currentSession.speakers.map((s) =>
				s.id === speakerId
					? {
							...s,
							...(name !== undefined && { name }),
							...(color !== undefined && { color }),
						}
					: s,
			),
		};

		return createSuccessResult({ success: true });
	},

	"clippingSession.deleteSpeakerFromSession": (input) => {
		const { speakerId } = input as { sessionId: string; speakerId: string };

		currentSession = {
			...currentSession,
			segments: currentSession.segments.filter((s) => s.speakerId !== speakerId),
		};

		return createSuccessResult({ success: true });
	},

	"clippingSession.getProjectSpeakers": () => {
		return createSuccessResult(currentSession.speakers);
	},

	// File router
	"file.getWaveformUrl": () => {
		return createSuccessResult({
			status: "completed",
			url: "https://example.com/waveform.json",
		});
	},
};

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Parse tRPC batch request and route to handlers.
 * Uses tRPC's jsonlStreamProducer to ensure correct response format.
 */
async function handleTRPCRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const pathname = url.pathname;

	console.log("[MSW] Intercepted tRPC request:", {
		method: request.method,
		pathname,
		search: url.search,
	});

	// Extract procedure names from URL path
	// Format: /api/trpc/procedure1,procedure2
	const proceduresPath = pathname.replace("/api/trpc/", "");
	const procedureNames = proceduresPath.split(",");

	console.log("[MSW] Procedures:", procedureNames);

	let inputs: unknown[] = [];

	if (request.method === "GET") {
		// Query parameters for GET requests
		const inputParam = url.searchParams.get("input");
		if (inputParam) {
			try {
				const parsed = JSON.parse(inputParam);
				// Input is indexed by batch position: { "0": {...}, "1": {...} }
				inputs = Object.keys(parsed)
					.sort((a, b) => Number(a) - Number(b))
					.map((key) => parsed[key]);
			} catch (e) {
				console.error("[MSW] Failed to parse input:", e);
				inputs = procedureNames.map(() => ({}));
			}
		} else {
			inputs = procedureNames.map(() => ({}));
		}
	} else {
		// Body for POST requests
		try {
			const body = await request.json();
			console.log("[MSW] Request body:", body);
			// tRPC batch format: { 0: { json: input1 }, 1: { json: input2 } }
			if (typeof body === "object" && body !== null) {
				inputs = Object.keys(body)
					.sort((a, b) => Number(a) - Number(b))
					.map((key) => {
						const item = (body as Record<string, unknown>)[key];
						if (typeof item === "object" && item !== null && "json" in item) {
							return (item as { json: unknown }).json;
						}
						return item;
					});
			}
		} catch {
			inputs = procedureNames.map(() => ({}));
		}
	}

	console.log("[MSW] Parsed inputs:", inputs);

	// Process each procedure
	const results: Record<string, TRPCResult> = {};
	await Promise.all(
		procedureNames.map(async (proc, index) => {
			const handler = procedureHandlers[proc];
			if (handler) {
				const result = await handler(inputs[index]);
				console.log(`[MSW] Handler result for ${proc}:`, result);
				results[String(index)] = result;
			} else {
				// Unknown procedure - return null (tRPC will handle this gracefully)
				console.warn(`[MSW] Unknown tRPC procedure: ${proc}`);
				results[String(index)] = createSuccessResult(null);
			}
		}),
	);

	// Use tRPC's jsonlStreamProducer to create the response stream
	// This ensures the format matches exactly what httpBatchStreamLink expects
	const stream = jsonlStreamProducer({
		data: results,
		serialize: (v) => SuperJSON.serialize(v),
		onError: (opts) => {
			console.error("[MSW] Stream error:", opts.error, "at path:", opts.path);
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"Content-Type": "application/jsonl",
			"Transfer-Encoding": "chunked",
		},
	});
}

// ============================================================================
// Exported Handlers
// ============================================================================

export const handlers = [
	// Handle all tRPC requests (GET and POST)
	// Use regex to match any URL with /api/trpc/ in the path
	http.all(/\/api\/trpc\/.*/, async ({ request }) => {
		return handleTRPCRequest(request);
	}),
];

/**
 * Create handlers with custom delay (for loading state testing).
 */
export function createDelayedHandlers(delayMs: number) {
	return [
		http.all(/\/api\/trpc\/.*/, async ({ request }) => {
			await delay(delayMs);
			return handleTRPCRequest(request);
		}),
	];
}

/**
 * Create handlers that return errors.
 */
export function createErrorHandlers(
	errorMessage: string,
	errorCode = "INTERNAL_SERVER_ERROR",
) {
	return [
		http.all(/\/api\/trpc\/.*/, async ({ request }) => {
			const url = new URL(request.url);
			const proceduresPath = url.pathname.replace("/api/trpc/", "");
			const procedureNames = proceduresPath.split(",");

			const results: Record<string, TRPCResult> = {};
			procedureNames.forEach((proc, index) => {
				results[String(index)] = createErrorResult(
					errorMessage,
					errorCode,
					500,
					proc,
				);
			});

			const stream = jsonlStreamProducer({
				data: results,
				serialize: (v) => SuperJSON.serialize(v),
			});

			return new Response(stream, {
				status: 200,
				headers: {
					"Content-Type": "application/jsonl",
					"Transfer-Encoding": "chunked",
				},
			});
		}),
	];
}
