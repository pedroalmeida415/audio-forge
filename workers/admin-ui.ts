import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { Queue } from "bullmq";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = process.env.BULL_BOARD_PORT ?? 3001;

// Redis connection
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Queue instance (read-only for admin UI)
const audioProcessingQueue = new Queue("audio-processing", { connection });

// Set up Bull Board
const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/");

createBullBoard({
  queues: [new BullMQAdapter(audioProcessingQueue)],
  serverAdapter,
});

// Create Hono app
const app = new Hono();

// Mount Bull Board routes
app.route("/", serverAdapter.registerPlugin());

console.log(`[Bull Board] Admin UI running at http://localhost:${PORT}`);

export default {
  port: Number(PORT),
  fetch: app.fetch,
};
