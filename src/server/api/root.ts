import { clippingSessionRouter } from "~/server/api/routers/clipping-session";
import { clipsRouter } from "~/server/api/routers/clips";
import { fileRouter } from "~/server/api/routers/file";
import { projectRouter } from "~/server/api/routers/project";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  projects: projectRouter,
  clips: clipsRouter,
  clippingSession: clippingSessionRouter,
  file: fileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.project.list();
 *       ^? Project[]
 */
export const createCaller = createCallerFactory(appRouter);
