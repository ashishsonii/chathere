import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";

export const runMigration = async () => {
    try {
        console.log("Checking if database migration is needed...");
        // Find messages that don't have conversationId
        const legacyMessages = await Message.find({ conversationId: { $exists: false } });
        if (legacyMessages.length === 0) {
            console.log("No legacy messages found. Database is up to date.");
            return;
        }

        console.log(`Found ${legacyMessages.length} legacy messages. Migrating...`);

        for (const msg of legacyMessages) {
            // Find or create conversation for this pair of participants
            const p1 = msg.senderId.toString();
            const p2 = msg.receiverId.toString();
            
            let conv = await Conversation.findOne({
                participants: { $all: [msg.senderId, msg.receiverId] }
            });

            if (!conv) {
                conv = await Conversation.create({
                    participants: [msg.senderId, msg.receiverId]
                });
            }

            // Update the message with the conversationId
            msg.conversationId = conv._id;
            await msg.save();
        }

        // Now, update lastMessage and unread counts for all conversations
        const conversations = await Conversation.find({});
        for (const conv of conversations) {
            const lastMsg = await Message.findOne({ conversationId: conv._id })
                .sort({ createdAt: -1 });
            
            if (lastMsg) {
                conv.lastMessage = lastMsg._id;
                
                // Calculate unread counts
                const unreadCounts = {};
                for (const pId of conv.participants) {
                    const count = await Message.countDocuments({
                        conversationId: conv._id,
                        receiverId: pId,
                        seen: false
                    });
                    unreadCounts[pId.toString()] = count;
                }
                conv.unreadMessages = unreadCounts;
                await conv.save();
            }
        }

        console.log("Migration completed successfully!");
    } catch (error) {
        console.error("Migration failed:", error);
    }
};
