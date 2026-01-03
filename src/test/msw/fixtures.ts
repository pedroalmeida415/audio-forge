/**
 * Type-safe fixtures for MSW handlers.
 *
 * These fixtures are typed against RouterOutputs from the actual tRPC router.
 * If the router types change, TypeScript will error here, forcing fixture updates.
 */
import type { RouterOutputs } from "~/trpc/react";

// ============================================================================
// Type Aliases (for convenience)
// ============================================================================

export type ClippingSessionGetById = RouterOutputs["clippingSession"]["getById"];
export type ClippingSessionListByProject =
	RouterOutputs["clippingSession"]["listByProject"];
export type Speaker = RouterOutputs["clippingSession"]["createSpeaker"]["speaker"];
export type Segment = RouterOutputs["clippingSession"]["createSegment"]["segment"];

// ============================================================================
// Base Fixture Data
// ============================================================================

// Fixed IDs for deterministic testing
export const TEST_IDS = {
	project: "11111111-1111-1111-1111-111111111111",
	session: "22222222-2222-2222-2222-222222222222",
	file: "33333333-3333-3333-3333-333333333333",
	user: "44444444-4444-4444-4444-444444444444",
	speakers: {
		speaker00: "55555555-5555-5555-5555-555555555550",
		speaker01: "55555555-5555-5555-5555-555555555551",
		speaker02: "55555555-5555-5555-5555-555555555552",
	},
	segments: {
		seg01: "66666666-6666-6666-6666-666666666661",
		seg02: "66666666-6666-6666-6666-666666666662",
		seg03: "66666666-6666-6666-6666-666666666663",
		seg04: "66666666-6666-6666-6666-666666666664",
		seg05: "66666666-6666-6666-6666-666666666665",
	},
} as const;

// ============================================================================
// Clipping Session Fixtures
// ============================================================================

const baseTimestamp = new Date("2024-01-15T10:00:00Z");

/**
 * Default clipping session with speakers and segments.
 * This is the main fixture for the clipping workspace page.
 */
export const defaultClippingSession: ClippingSessionGetById = {
	id: TEST_IDS.session,
	fileId: TEST_IDS.file,
	projectId: TEST_IDS.project,
	userId: TEST_IDS.user,
	name: "Test Recording Session",
	diarization: null,
	createdAt: baseTimestamp,
	updatedAt: baseTimestamp,

	// Related file
	file: {
		id: TEST_IDS.file,
		userId: TEST_IDS.user,
		projectId: TEST_IDS.project,
		storageKey: "audio/test-recording.mp3",
		duration: 120.5, // 2 minutes
		name: "test-recording.mp3",
		waveformStatus: "completed",
		waveformStorageKey: "waveforms/test-recording.json",
		waveformError: null,
		createdAt: baseTimestamp,
		updatedAt: baseTimestamp,
	},

	// Related project
	project: {
		id: TEST_IDS.project,
		name: "Test Project",
		description: "A project for testing",
		userId: TEST_IDS.user,
		createdAt: baseTimestamp,
		updatedAt: baseTimestamp,
	},

	// Segments with speaker relations
	segments: [
		{
			id: TEST_IDS.segments.seg01,
			sessionId: TEST_IDS.session,
			speakerId: TEST_IDS.speakers.speaker00,
			startTime: 0,
			endTime: 15.5,
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
			speaker: {
				id: TEST_IDS.speakers.speaker00,
				projectId: TEST_IDS.project,
				userId: TEST_IDS.user,
				name: "SPEAKER_00",
				color: "hsl(200, 70%, 50%)",
				createdAt: baseTimestamp,
				updatedAt: baseTimestamp,
			},
		},
		{
			id: TEST_IDS.segments.seg02,
			sessionId: TEST_IDS.session,
			speakerId: TEST_IDS.speakers.speaker01,
			startTime: 15.5,
			endTime: 35.2,
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
			speaker: {
				id: TEST_IDS.speakers.speaker01,
				projectId: TEST_IDS.project,
				userId: TEST_IDS.user,
				name: "SPEAKER_01",
				color: "hsl(120, 70%, 50%)",
				createdAt: baseTimestamp,
				updatedAt: baseTimestamp,
			},
		},
		{
			id: TEST_IDS.segments.seg03,
			sessionId: TEST_IDS.session,
			speakerId: TEST_IDS.speakers.speaker00,
			startTime: 35.2,
			endTime: 60.0,
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
			speaker: {
				id: TEST_IDS.speakers.speaker00,
				projectId: TEST_IDS.project,
				userId: TEST_IDS.user,
				name: "SPEAKER_00",
				color: "hsl(200, 70%, 50%)",
				createdAt: baseTimestamp,
				updatedAt: baseTimestamp,
			},
		},
		{
			id: TEST_IDS.segments.seg04,
			sessionId: TEST_IDS.session,
			speakerId: TEST_IDS.speakers.speaker01,
			startTime: 60.0,
			endTime: 90.5,
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
			speaker: {
				id: TEST_IDS.speakers.speaker01,
				projectId: TEST_IDS.project,
				userId: TEST_IDS.user,
				name: "SPEAKER_01",
				color: "hsl(120, 70%, 50%)",
				createdAt: baseTimestamp,
				updatedAt: baseTimestamp,
			},
		},
		{
			id: TEST_IDS.segments.seg05,
			sessionId: TEST_IDS.session,
			speakerId: TEST_IDS.speakers.speaker00,
			startTime: 90.5,
			endTime: 120.5,
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
			speaker: {
				id: TEST_IDS.speakers.speaker00,
				projectId: TEST_IDS.project,
				userId: TEST_IDS.user,
				name: "SPEAKER_00",
				color: "hsl(200, 70%, 50%)",
				createdAt: baseTimestamp,
				updatedAt: baseTimestamp,
			},
		},
	],

	// All speakers in the session
	speakers: [
		{
			id: TEST_IDS.speakers.speaker00,
			projectId: TEST_IDS.project,
			userId: TEST_IDS.user,
			name: "SPEAKER_00",
			color: "hsl(200, 70%, 50%)",
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
		},
		{
			id: TEST_IDS.speakers.speaker01,
			projectId: TEST_IDS.project,
			userId: TEST_IDS.user,
			name: "SPEAKER_01",
			color: "hsl(120, 70%, 50%)",
			createdAt: baseTimestamp,
			updatedAt: baseTimestamp,
		},
	],
};

/**
 * Empty clipping session (no segments yet).
 * Useful for testing empty state UI.
 */
export const emptyClippingSession: ClippingSessionGetById = {
	...defaultClippingSession,
	segments: [],
	speakers: [],
};

/**
 * Session with diarization in progress.
 */
export const diarizingClippingSession: ClippingSessionGetById = {
	...defaultClippingSession,
	segments: [],
	speakers: [],
	diarization: {
		jobId: "job-123456",
		status: "running",
		startedAt: new Date().toISOString(),
		completedAt: null,
		error: null,
	},
};

/**
 * Session with diarization failed.
 */
export const failedDiarizationSession: ClippingSessionGetById = {
	...defaultClippingSession,
	segments: [],
	speakers: [],
	diarization: {
		jobId: "job-123456",
		status: "failed",
		startedAt: new Date(Date.now() - 60000).toISOString(),
		completedAt: new Date().toISOString(),
		error: "Audio file too short for diarization",
	},
};

// ============================================================================
// Session List Fixtures
// ============================================================================

export const sessionList: ClippingSessionListByProject = [
	{
		id: TEST_IDS.session,
		name: "Test Recording Session",
		createdAt: baseTimestamp,
		file: {
			id: TEST_IDS.file,
			name: "test-recording.mp3",
			storageKey: "audio/test-recording.mp3",
		},
	},
	{
		id: "77777777-7777-7777-7777-777777777777",
		name: "Another Session",
		createdAt: new Date("2024-01-14T10:00:00Z"),
		file: {
			id: "88888888-8888-8888-8888-888888888888",
			name: "another-recording.mp3",
			storageKey: "audio/another-recording.mp3",
		},
	},
];

// ============================================================================
// Fixture Factory Helpers
// ============================================================================

/**
 * Create a session fixture with custom overrides.
 */
export function createSessionFixture(
	overrides: Partial<ClippingSessionGetById>,
): ClippingSessionGetById {
	return {
		...defaultClippingSession,
		...overrides,
	};
}

/**
 * Create a speaker fixture.
 */
export function createSpeakerFixture(
	id: string,
	name: string,
	color: string,
): Speaker {
	return {
		id,
		projectId: TEST_IDS.project,
		userId: TEST_IDS.user,
		name,
		color,
		createdAt: baseTimestamp,
		updatedAt: baseTimestamp,
	};
}
