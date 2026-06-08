import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { getMessages, getUsersForSidebar, markMessageAsSeen, sendMessage, searchUsers, getFriends, addFriend, clearConversation } from "../controllers/messageController.js";

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUsersForSidebar);
messageRouter.get("/friends", protectRoute, getFriends);
messageRouter.post("/add-friend", protectRoute, addFriend);
messageRouter.get("/search", protectRoute, searchUsers);
messageRouter.get("/:id", protectRoute, getMessages);
messageRouter.put("/mark/:id", protectRoute, markMessageAsSeen);
messageRouter.post("/send/:id", protectRoute, sendMessage);
messageRouter.delete("/clear/:id", protectRoute, clearConversation);

export default messageRouter;