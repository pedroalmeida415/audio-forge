import { clipRouter } from "~/server/api/routers/clip";
import { collectionRouter } from "~/server/api/routers/collection";
import { diarizationRouter } from "~/server/api/routers/diarization";
import { processingRouter } from "~/server/api/routers/processing";
import { projectRouter } from "~/server/api/routers/project";
import { transcriptionRouter } from "~/server/api/routers/transcription";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  project: projectRouter,
  collection: collectionRouter,
  diarization: diarizationRouter,
  clip: clipRouter,
  processing: processingRouter,
  transcription: transcriptionRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
