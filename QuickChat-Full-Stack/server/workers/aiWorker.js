import { Worker } from "bullmq";
import Redis from "ioredis";
import Groq from "groq-sdk";

export const initWorker = (io) => {
  const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // Initialize Groq API Client
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const aiWorker = new Worker(
    "ai-tasks-queue",
    async (job) => {
      const { prompt, userId, type } = job.data;
      console.log(`Processing AI Task for User ${userId}`);

      try {
        if (type === "image") {
           // Extract prompt after /image if present
           const promptCleaned = prompt.replace(/^\/image/i, "").trim() || "A highly detailed, ultra-realistic masterpiece, 8k resolution";
           const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptCleaned)}?width=1024&height=1024&nologo=true`;

           // Simulate slight processing delay for realism
           await new Promise(r => setTimeout(r, 2000));

           io.to(userId.toString()).emit("aiResponse", {
              success: true,
              type: "image",
              data: imageUrl
           });
           return { success: true };
        }

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are Orry AI, a helpful AI Assistant integrated into QuickChat. Keep responses concise and engaging." },
            { role: "user", content: prompt }
          ],
          model: "llama3-8b-8192",
        });

        const responseText = chatCompletion.choices[0]?.message?.content || "No response generated.";

        // Emit back to the user via Socket.io
        io.to(userId.toString()).emit("aiResponse", {
          success: true,
          type: "text",
          data: responseText
        });

        return { success: true };
      } catch (error) {
        console.error("AI Worker Error:", error);
        io.to(userId.toString()).emit("aiResponse", {
          success: false,
          error: "Failed to generate AI response",
          type: "text",
          data: "An error occurred while trying to process your request."
        });
        throw error;
      }
    },
    { connection }
  );

  aiWorker.on("completed", (job) => {
    console.log(`AI Job ${job.id} has completed!`);
  });

  aiWorker.on("failed", (job, err) => {
    console.error(`AI Job ${job.id} has failed with ${err.message}`);
  });

  return aiWorker;
};
