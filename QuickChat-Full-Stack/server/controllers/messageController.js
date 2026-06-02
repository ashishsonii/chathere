import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { io, userSocketMap } from "../server.js";
import { uploadToS3 } from "../lib/s3.js";

// Helper to find or create a conversation between two users
const getOrCreateConversation = async (user1, user2) => {
    let conv = await Conversation.findOne({
        participants: { $all: [user1, user2] }
    });

    if (!conv) {
        conv = await Conversation.create({
            participants: [user1, user2],
            unreadMessages: {
                [user1.toString()]: 0,
                [user2.toString()]: 0
            }
        });
    }
    return conv;
};

// Get all active conversations for the sidebar
export const getUsersForSidebar = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch conversations where the logged-in user is a participant
        const conversations = await Conversation.find({
            participants: userId
        })
        .populate("participants", "-password")
        .populate({
            path: "lastMessage",
            model: "Message"
        })
        .sort({ updatedAt: -1 });

        res.json({ success: true, conversations });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Search all users by name or email (to start a new conversation)
export const searchUsers = async (req, res) => {
    try {
        const myId = req.user._id;
        const { query } = req.query;

        if (!query) {
            return res.json({ success: true, users: [] });
        }

        const users = await User.find({
            _id: { $ne: myId },
            $or: [
                { fullName: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } }
            ]
        }).select("-password");

        res.json({ success: true, users });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Get all messages for a selected user (resolving their conversation)
export const getMessages = async (req, res) => {
    try {
        const { id: otherUserId } = req.params;
        const myId = req.user._id;
        const { cursor } = req.query;

        const conv = await getOrCreateConversation(myId, otherUserId);

        const query = { conversationId: conv._id };
        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        // Fetch 20 messages, newest first
        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(20);

        // Reverse to chronological order (oldest to newest)
        messages.reverse();

        const hasMore = messages.length === 20;
        const nextCursor = hasMore ? messages[0].createdAt : null;

        // Mark all messages from the other user as seen in this conversation
        await Message.updateMany(
            { conversationId: conv._id, senderId: otherUserId, seen: false },
            { seen: true }
        );

        // Reset current user's unread count
        if (conv.unreadMessages && conv.unreadMessages.has(myId.toString())) {
            conv.unreadMessages.set(myId.toString(), 0);
            await conv.save();
        }

        res.json({ 
            success: true, 
            messages, 
            conversationId: conv._id,
            nextCursor,
            hasMore
        });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Send message to selected user
export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body;
        const receiverId = req.params.id;
        const senderId = req.user._id;

        const conv = await getOrCreateConversation(senderId, receiverId);

        let imageUrl;
        if (image) {
            imageUrl = await uploadToS3(image);
        }

        const newMessage = await Message.create({
            conversationId: conv._id,
            senderId,
            receiverId,
            text,
            image: imageUrl
        });

        // Update last message in the conversation
        conv.lastMessage = newMessage._id;

        // Increment receiver's unread messages count
        const currentUnread = conv.unreadMessages.get(receiverId.toString()) || 0;
        conv.unreadMessages.set(receiverId.toString(), currentUnread + 1);
        await conv.save();

        // Emit the new message to the receiver's socket
        const receiverSocketId = userSocketMap[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        // Emit general conversation update to both participants so sidebars update instantly
        const updatedConv = await Conversation.findById(conv._id)
            .populate("participants", "-password")
            .populate("lastMessage");

        [senderId, receiverId].forEach(pId => {
            const socketId = userSocketMap[pId.toString()];
            if (socketId) {
                io.to(socketId).emit("conversationUpdate", updatedConv);
            }
        });

        res.json({ success: true, newMessage });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// API to mark message as seen (kept for compatibility)
export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        const msg = await Message.findByIdAndUpdate(id, { seen: true }, { new: true });
        if (msg) {
            const conv = await Conversation.findById(msg.conversationId);
            if (conv) {
                const count = await Message.countDocuments({
                    conversationId: conv._id,
                    receiverId: msg.receiverId,
                    seen: false
                });
                conv.unreadMessages.set(msg.receiverId.toString(), count);
                await conv.save();
            }
        }
        res.json({ success: true });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};