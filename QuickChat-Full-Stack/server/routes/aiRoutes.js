import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { aiQueue } from "../lib/queue.js";

const router = express.Router();

router.post("/generate", protectRoute, async (req, res) => {
  try {
    const { prompt, type, image } = req.body;
    const userId = req.user._id;

    if (!prompt && !image) {
      return res.status(400).json({ error: "Prompt or image is required" });
    }

    // Add job to BullMQ queue
    await aiQueue.add("generate-ai-response", {
      prompt,
      userId,
      type: type || "text",
      image: image || null
    }, {
      removeOnComplete: true, // Keep Redis clean
      removeOnFail: 10,       // Keep last 10 failed jobs for debugging
    });

    // Return immediately
    return res.status(202).json({ 
      success: true, 
      message: "AI task has been queued and will be delivered via WebSocket." 
    });

  } catch (error) {
    console.error("AI Queueing Error:", error);
    res.status(500).json({ error: "Failed to queue AI request" });
  }
});

export default router;
