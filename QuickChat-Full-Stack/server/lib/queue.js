import { Queue } from "bullmq";
import Redis from "ioredis";

// Create a dedicated Redis connection for BullMQ
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (err) => {
  console.error("BullMQ Redis Connection Error:", err.message);
});

export const aiQueue = new Queue("ai-tasks-queue", { connection });
export const cleanupQueue = new Queue("cleanup-tasks-queue", { connection });
