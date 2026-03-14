import { exportRouter } from "~/server/api/routers/export";
import { fileRouter } from "~/server/api/routers/file";
import { projectRouter } from "~/server/api/routers/project";
import { segmentRouter } from "~/server/api/routers/segment";
import { sourceRouter } from "~/server/api/routers/source";
import { speakerRouter } from "~/server/api/routers/speaker";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  projects: projectRouter,
  source: sourceRouter,
  segment: segmentRouter,
  speaker: speakerRouter,
  export: exportRouter,
  file: fileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.projects.list();
 *       ^? Project[]
 */
export const createCaller = createCallerFactory(appRouter);
