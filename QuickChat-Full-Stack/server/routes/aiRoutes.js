import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { processAiTask } from "../workers/aiWorker.js";
import { io } from "../server.js";

const router = express.Router();

router.post("/generate", protectRoute, async (req, res) => {
  try {
    const { prompt, type, image } = req.body;
    const userId = req.user._id;

    if (!prompt && !image) {
      return res.status(400).json({ error: "Prompt or image is required" });
    }

    // Process inline asynchronously (Hotfix)
    processAiTask({ prompt, userId, type: type || "text", image: image || null }, io).catch(console.error);

    // Return immediately
    return res.status(202).json({ 
      success: true, 
      message: "AI task is being processed." 
    });

  } catch (error) {
    console.error("AI Route Error:", error);
    res.status(500).json({ error: "Failed to handle AI request" });
  }
});

export default router;
