import { clipRouter } from "~/server/api/routers/clip";
import { collectionRouter } from "~/server/api/routers/collection";
import { diarizationRouter } from "~/server/api/routers/diarization";
import { projectRouter } from "~/server/api/routers/project";
import { segmentRouter } from "~/server/api/routers/segment";
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
  segment: segmentRouter,
  clip: clipRouter,
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
