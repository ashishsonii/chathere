import { Worker } from "bullmq";
import Redis from "ioredis";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { cleanupQueue } from "../lib/queue.js";

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Remove any existing repeatable jobs to avoid duplicates on restart
const initializeJob = async () => {
    const repeatableJobs = await cleanupQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await cleanupQueue.removeRepeatableByKey(job.key);
    }
    // Add job to run every 15 minutes
    await cleanupQueue.add("cleanup-messages", {}, {
        repeat: {
            every: 15 * 60 * 1000 // 15 minutes in milliseconds
        }
    });
    console.log("Cleanup job scheduled to run every 15 minutes.");
};

// Start initialization without blocking
initializeJob().catch(console.error);

export const cleanupWorker = new Worker(
  "cleanup-tasks-queue",
  async (job) => {
    console.log("Starting message cleanup job...");
    try {
        const orry = await User.findOne({ email: "orry@quickchat.ai" });
        if (!orry) {
            console.log("Orry AI user not found. Cleanup skipping AI specific logic.");
        }

        const now = Date.now();
        const aiThreshold = new Date(now - 60 * 60 * 1000); // 1 hour ago
        const normalThreshold = new Date(now - 24 * 60 * 60 * 1000); // 24 hours ago

        const conversations = await Conversation.find({});
        let totalDeleted = 0;

        for (const conv of conversations) {
            // Determine if this is an AI conversation
            const isAiChat = orry && conv.participants.some(p => p.toString() === orry._id.toString());
            const thresholdDate = isAiChat ? aiThreshold : normalThreshold;

            // Find all messages for this conversation, sorted by newest first
            const messages = await Message.find({ conversationId: conv._id })
                .sort({ createdAt: -1 })
                .select("_id createdAt");

            // We KEEP the first 4 messages (the 4 most recent ones)
            if (messages.length <= 4) {
                continue; // Not enough messages to delete, skip
            }

            // Messages after index 3 are candidates for deletion
            const candidates = messages.slice(4);

            // Filter candidates that are older than the threshold
            const idsToDelete = candidates
                .filter(m => new Date(m.createdAt) < thresholdDate)
                .map(m => m._id);

            if (idsToDelete.length > 0) {
                const result = await Message.deleteMany({ _id: { $in: idsToDelete } });
                totalDeleted += result.deletedCount || 0;
            }
        }

        console.log(`Cleanup job finished successfully. Deleted ${totalDeleted} old messages.`);
        return { success: true, deletedCount: totalDeleted };
    } catch (error) {
        console.error("Cleanup Worker Error:", error);
        throw error;
    }
  },
  { connection }
);

cleanupWorker.on("failed", (job, err) => {
  console.error(`Cleanup job ${job.id} failed with error: ${err.message}`);
});
