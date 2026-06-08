import { Worker } from "bullmq";
import Redis from "ioredis";
import Groq from "groq-sdk";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import mongoose from "mongoose";

export const initWorker = (io) => {
  const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // Initialize Groq API Client safely
  let groq = null;
  if (process.env.GROQ_API_KEY) {
    try {
      groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    } catch (e) {
      console.error("Failed to initialize Groq API:", e.message);
    }
  } else {
    console.warn("WARNING: GROQ_API_KEY is not set. Text AI features will fail gracefully.");
  }

  const aiWorker = new Worker(
    "ai-tasks-queue",
    async (job) => {
      const { prompt, userId, type, image } = job.data;
      console.log(`Processing AI Task for User ${userId}`);

      try {
        const orry = await User.findOne({ email: "orry@quickchat.ai" });
        if (!orry) throw new Error("Orry AI user not found in DB");

        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Find or create Conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [userObjectId, orry._id] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [userObjectId, orry._id]
            });
        }

        // Save User's Prompt to DB
        const userMsg = await Message.create({
            conversationId: conversation._id,
            senderId: userObjectId,
            receiverId: orry._id,
            text: type === "vision" ? "Uploaded an image" : prompt,
            image: image || null
        });
        if (type === "image") {
           // 1. Send instant text response
           const instantMsg = await Message.create({
               conversationId: conversation._id,
               senderId: orry._id,
               receiverId: userObjectId,
               text: "I'm generating your image now... 🎨"
           });
           
           io.to(userId.toString()).emit("aiResponse", {
               success: true,
               type: "text",
               data: "I'm generating your image now... 🎨",
               dbMessage: instantMsg
           });

           // 2. Generate and send image after a slight delay
           const promptCleaned = prompt.replace(/^\/image/i, "").trim() || "A masterpiece painting";
           const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptCleaned)}?width=512&height=512&nologo=true`;

           await new Promise(r => setTimeout(r, 1500)); // Short delay so text is read first

           const aiImgMsg = await Message.create({
               conversationId: conversation._id,
               senderId: orry._id,
               receiverId: userObjectId,
               image: imageUrl,
               text: "Here is your generated image!"
           });

           io.to(userId.toString()).emit("aiResponse", {
              success: true,
              type: "image",
              data: imageUrl,
              dbMessage: aiImgMsg
           });
           return { success: true };
        }

        if (!groq) {
           io.to(userId.toString()).emit("aiResponse", {
              success: false,
              error: "AI is currently disabled due to missing configuration on the server.",
              type: "text",
              data: "Sorry, my text brain is currently disconnected!"
           });
           return { success: false, error: "Missing GROQ_API_KEY" };
        }

        if (type === "vision") {
          const chatCompletion = await groq.chat.completions.create({
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Briefly describe this image in a fun and concise way." },
                  { type: "image_url", image_url: { url: image } }
                ]
              }
            ],
            model: "llama-3.2-90b-vision-preview",
            temperature: 0.7,
            max_tokens: 100
          });

          const aiText = chatCompletion.choices[0]?.message?.content || "Wow! Nice picture!";
          
          const aiMsg = await Message.create({
              conversationId: conversation._id,
              senderId: orry._id,
              receiverId: userObjectId,
              text: aiText
          });

          io.to(userId.toString()).emit("aiResponse", {
            success: true,
            type: "text",
            data: aiText,
            dbMessage: aiMsg
          });
          return { success: true };
        }

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are Orry AI. Keep your answers extremely short, clean, and concise. Do not use markdown unless necessary." },
            { role: "user", content: prompt }
          ],
          model: "llama-3.1-8b-instant",
          temperature: 0.7,
          max_tokens: 150
        });

        const responseText = chatCompletion.choices[0]?.message?.content || "No response generated.";

        const aiMsgText = await Message.create({
            conversationId: conversation._id,
            senderId: orry._id,
            receiverId: userObjectId,
            text: responseText
        });

        // Emit back to the user via Socket.io
        io.to(userId.toString()).emit("aiResponse", {
          success: true,
          type: "text",
          data: responseText,
          dbMessage: aiMsgText
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
