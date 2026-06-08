import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";

export const ChatContext = createContext();

export const ChatProvider = ({ children })=>{

    const [messages, setMessages] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [friends, setFriends] = useState([]);
    const [selectedUser, setSelectedUser] = useState(() => {
        const stored = localStorage.getItem("selectedUser");
        try {
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    });
    const [typingStatus, setTypingStatus] = useState({}); // { userId: true/false }
    
    // Pagination states
    const [nextCursor, setNextCursor] = useState(null);
    const [hasMore, setHasMore] = useState(false);

    const {socket, axios, authUser} = useContext(AuthContext);

    // Sync selectedUser with localStorage and reset when user logs out
    useEffect(() => {
        if (selectedUser) {
            localStorage.setItem("selectedUser", JSON.stringify(selectedUser));
        } else {
            localStorage.removeItem("selectedUser");
        }
    }, [selectedUser]);

    useEffect(() => {
        if (!authUser) {
            setSelectedUser(null);
            localStorage.removeItem("selectedUser");
        }
    }, [authUser]);

    // function to get all active conversations and friend list for sidebar
    const getUsers = async () => {
        try {
            const { data } = await axios.get("/api/messages/users");
            if (data.success) {
                setConversations(data.conversations)
            }

            const friendsRes = await axios.get("/api/messages/friends");
            if (friendsRes.data.success) {
                setFriends(friendsRes.data.friends);
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // function to add a friend
    const addFriend = async (friendId) => {
        try {
            const { data } = await axios.post("/api/messages/add-friend", { friendId });
            if (data.success) {
                toast.success(data.message);
                // Refresh both the friends list and sidebar conversations
                getUsers();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    // function to search registered users to start new chat
    const searchUsers = async (query) => {
        try {
            const { data } = await axios.get(`/api/messages/search?query=${query}`);
            if (data.success) {
                return data.users;
            }
            return [];
        } catch (error) {
            toast.error(error.message);
            return [];
        }
    };

    // function to get first page of messages for selected user
    const getMessages = async (userId) => {
        try {
            const { data } = await axios.get(`/api/messages/${userId}`);
            if (data.success) {
                setMessages(data.messages);
                setNextCursor(data.nextCursor);
                setHasMore(data.hasMore);
                // Refresh conversations list to clear the unread counter in real-time
                getUsers();
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // function to load more older messages (for scroll-up pagination)
    const loadMoreMessages = async () => {
        if (!hasMore || !selectedUser || !nextCursor) return;
        
        try {
            const { data } = await axios.get(`/api/messages/${selectedUser._id}?cursor=${nextCursor}`);
            if (data.success) {
                setMessages((prevMessages) => [...data.messages, ...prevMessages]);
                setNextCursor(data.nextCursor);
                setHasMore(data.hasMore);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    // function to send message to selected user
    const sendMessage = async (messageData)=>{
        try {
            const {data} = await axios.post(`/api/messages/send/${selectedUser._id}`, messageData);
            if(data.success){
                setMessages((prevMessages)=>[...prevMessages, data.newMessage])
            }else{
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    }

    // function to clear conversation
    const clearConversation = async () => {
        if (!selectedUser) return;
        try {
            const { data } = await axios.delete(`/api/messages/clear/${selectedUser._id}`);
            if (data.success) {
                toast.success("Chat cleared!");
                setMessages([]);
                getUsers(); // Refresh sidebar
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    // function to subscribe to new messages for selected user
    const subscribeToMessages = async () =>{
        if(!socket) return;

        socket.on("newMessage", (newMessage)=>{
            if(selectedUser && String(newMessage.senderId) === String(selectedUser._id)){
                newMessage.seen = true;
                setMessages((prevMessages)=> [...prevMessages, newMessage]);
                axios.put(`/api/messages/mark/${newMessage._id}`).catch(e => console.log(e));
            }
        })
    }

    // function to unsubscribe from messages
    const unsubscribeFromMessages = ()=>{
        if(socket) socket.off("newMessage");
    }

    // function to subscribe to real-time conversation updates (sidebar updates)
    const subscribeToConversationUpdates = () => {
        if (!socket) return;

        socket.on("conversationUpdate", (updatedConv) => {
            setConversations((prevConvs) => {
                const filtered = prevConvs.filter(c => String(c._id) !== String(updatedConv._id));
                return [updatedConv, ...filtered];
            });
        });

        socket.on("conversationCleared", ({ conversationId }) => {
            setMessages([]);
            getUsers();
        });
    };

    // function to unsubscribe from conversation updates
    const unsubscribeFromConversationUpdates = () => {
        if (socket) {
            socket.off("conversationUpdate");
            socket.off("conversationCleared");
        }
    };

    // subscribe/unsubscribe on component lifecycle
    useEffect(()=>{
        subscribeToMessages();
        subscribeToConversationUpdates();
        
        return () => {
            unsubscribeFromMessages();
            unsubscribeFromConversationUpdates();
        };
    },[socket, selectedUser])

    const subscribeToTyping = () => {
        if (!socket) return;

        socket.on("typing", ({ fromUserId, typing }) => {
            if (fromUserId) {
                setTypingStatus((prev) => ({ ...prev, [String(fromUserId)]: typing }));
            }
        });
    };

    const unsubscribeFromTyping = () => {
        if (socket) socket.off("typing");
    };

    useEffect(() => {
        subscribeToTyping();
        return () => unsubscribeFromTyping();
    }, [socket]);

    const subscribeToAiResponses = () => {
        if (!socket) return;

        socket.on("aiResponse", (response) => {
            // Turn off Orry AI typing indicator
            if (response.senderId) {
                setTypingStatus((prev) => ({ ...prev, [response.senderId]: false }));
            } else if (selectedUser) {
                setTypingStatus((prev) => ({ ...prev, [selectedUser._id]: false }));
            }

            if (response.success) {
                const newMessage = response.dbMessage || {
                    _id: Date.now(),
                    senderId: selectedUser?._id,
                    text: response.type === "text" ? response.data : "",
                    image: response.type === "image" ? response.data : null,
                    createdAt: new Date()
                };
                setMessages((prev) => [...prev, newMessage]);
            } else {
                toast.error(response.error || "Failed to get AI response");
                const errorMessage = {
                    _id: Date.now(),
                    senderId: selectedUser?._id,
                    text: response.data || "Sorry, I couldn't process that request.",
                    createdAt: new Date()
                };
                setMessages((prev) => [...prev, errorMessage]);
            }
        });
    };

    const unsubscribeFromAiResponses = () => {
        if (socket) socket.off("aiResponse");
    };

    useEffect(() => {
        subscribeToAiResponses();
        return () => unsubscribeFromAiResponses();
    }, [socket]);

    const value = {
        messages, 
        setMessages,
        conversations, 
        selectedUser, 
        getUsers, 
        getMessages, 
        sendMessage, 
        setSelectedUser, 
        typingStatus,
        setTypingStatus,
        searchUsers,
        hasMore,
        loadMoreMessages,
        friends,
        clearConversation
    }

    return (
        <ChatContext.Provider value={value}>
            { children }
        </ChatContext.Provider>
    )
}