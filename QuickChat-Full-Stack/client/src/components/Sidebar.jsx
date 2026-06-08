import React, { useContext, useEffect, useState } from 'react'
import assets from '../assets/assets'
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { ChatContext } from '../../context/ChatContext';
import CallHistory from './call/CallHistory';
import { Bot } from "lucide-react";

const Sidebar = () => {

    const {
        getUsers, 
        conversations, 
        friends,
        selectedUser, 
        setSelectedUser,
        searchUsers
    } = useContext(ChatContext);

    const { logout, onlineUsers, authUser } = useContext(AuthContext)

    const [input, setInput] = useState("")
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [activeTab, setActiveTab] = useState("chats"); // "chats" or "calls"
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const navigate = useNavigate();

    // Fetch conversations on mount or whenever active onlineUsers updates
    useEffect(() => {
        if (authUser) {
            getUsers();
        }
    }, [onlineUsers, authUser]);

    // Handle user search when typing
    useEffect(() => {
        const handleSearch = async () => {
            if (input.trim() === "") {
                setSearchResults([]);
                setIsSearching(false);
                return;
            }
            setIsSearching(true);
            const results = await searchUsers(input);
            setSearchResults(results);
        };

        const debounceTimer = setTimeout(handleSearch, 300);
        return () => clearTimeout(debounceTimer);
    }, [input]);

    return (
        <div
            style={{ backgroundColor: 'rgba(129, 133, 178, 0.17)' }}
            className={`h-full p-1 rounded-r-xl overflow-y-scroll text-white ${selectedUser ? "max-md:hidden" : ''}`}
        >
            <div className='pb-2'>
                <div className='flex justify-between items-center px-2 py-1'>
                    <div className="flex flex-col select-none">
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                            Orry
                        </h1>
                        <span className="text-[9px] text-gray-400 font-medium tracking-wider uppercase">
                            Chatby Ashish
                        </span>
                    </div>

                    <div className="relative">
                        <img 
                            onClick={() => setIsMenuOpen(!isMenuOpen)} 
                            src={assets.menu_icon} 
                            alt="Menu" 
                            className='max-h-5 cursor-pointer' 
                        />
                        {isMenuOpen && (
                            <div className='absolute top-full right-0 z-20 w-32 p-5 rounded-md bg-[#282142] border border-gray-600 text-gray-100'>
                                <p onClick={() => { navigate('/profile'); setIsMenuOpen(false); }} className='cursor-pointer text-sm'>Edit Profile</p>
                                <hr className="my-2 border-t border-gray-500" />
                                <p onClick={() => logout()} className='cursor-pointer text-sm'>Logout</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className='bg-[#282142] rounded-full flex items-center gap-2 py-3 px-4 mt-0'>
                    <img src={assets.search_icon} alt="Search" className='w-3' />
                    <input 
                        value={input}
                        onChange={(e) => setInput(e.target.value)} 
                        type="text" 
                        className='bg-transparent border-none outline-none text-white text-xs placeholder-[#c8c8c8] flex-1' 
                        placeholder='Search User...' 
                    />
                </div>
            </div>

            <div className='flex flex-col gap-1'>
                {input.trim() !== "" ? (
                    // Search Mode: Show results from dynamic global search
                    <>
                        <p className='text-xs text-gray-400 px-3 py-1 font-semibold uppercase tracking-wider'>Global Users</p>
                        {searchResults.length > 0 ? (
                            searchResults.map((user, index) => (
                                <div 
                                    onClick={() => {
                                        setSelectedUser(user);
                                        setInput(""); // Clear search to return to conversation list
                                    }}
                                    key={user._id} 
                                    className={`relative flex items-center gap-2 p-2 pl-4 rounded cursor-pointer max-sm:text-sm hover:bg-[#282142]/30 transition-all`}
                                >
                                    <img src={user?.profilePic || assets.avatar_icon} alt="" className='w-[35px] aspect-[1/1] rounded-full' />
                                    <div className='flex flex-col leading-5'>
                                        <p>{user.fullName}</p>
                                        <span className='text-neutral-400 text-xs truncate max-w-[150px]'>{user.bio || "No bio"}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className='text-xs text-gray-500 text-center py-4'>No users found matching "{input}"</p>
                        )}
                    </>
                ) : (
                    // Conversation Mode: Show active conversations or Friends list
                    <>
                        <div className='flex gap-2 px-2 py-1 mb-2 border-b border-gray-700/20 shrink-0 select-none'>
                            <button
                                onClick={() => setActiveTab("chats")}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    activeTab === "chats"
                                        ? "bg-violet-600 text-white shadow-sm"
                                        : "bg-transparent text-gray-400 hover:text-white"
                                }`}
                            >
                                Chats
                            </button>
                            <button
                                onClick={() => setActiveTab("calls")}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    activeTab === "calls"
                                        ? "bg-violet-600 text-white shadow-sm"
                                        : "bg-transparent text-gray-400 hover:text-white"
                                }`}
                            >
                                Calls
                            </button>
                        </div>

                        {activeTab === "chats" ? (
                            <>
                                <p className='text-xs text-gray-400 px-3 py-1 font-semibold uppercase tracking-wider'>Recent Chats</p>
                                
                                {/* Orry AI Permanent Contact */}
                                <div 
                                    onClick={() => setSelectedUser({ _id: "orry_ai", fullName: "Orry AI", isAi: true })}
                                    className={`relative flex items-center gap-2 p-2 pl-4 rounded cursor-pointer max-sm:text-sm transition-all hover:bg-[#282142]/20 mb-1 border border-indigo-500/30 bg-gradient-to-r from-blue-500/10 to-indigo-600/10 shadow-sm`}
                                >
                                    <div className="w-[35px] h-[35px] rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
                                        <Bot size={20} className="text-white animate-pulse" />
                                    </div>
                                    <div className='flex flex-col leading-5 flex-1 min-w-0'>
                                        <div className='flex justify-between items-center gap-2'>
                                            <p className='truncate font-medium text-white'>Orry AI</p>
                                            <span className='w-2 h-2 rounded-full bg-green-400 shrink-0 shadow-[0_0_8px_rgba(74,222,128,0.6)]'></span>
                                        </div>
                                        <p className='text-xs truncate text-indigo-300 font-medium'>
                                            Tap to ask me anything!
                                        </p>
                                    </div>
                                </div>

                                {conversations.length > 0 ? (
                                    conversations.map((conv, index) => {
                                        const otherParticipant = conv.participants.find(p => p._id !== authUser?._id) || authUser;
                                        if (!otherParticipant) return null;
                                        
                                        const isSelected = selectedUser?._id === otherParticipant._id;
                                        const unreadCount = conv.unreadMessages?.[authUser?._id] || 0;
                                        const lastMsg = conv.lastMessage;
                                        
                                        let lastMsgText = "";
                                        if (lastMsg) {
                                            if (lastMsg.image) {
                                                lastMsgText = "📷 Image";
                                            } else {
                                                lastMsgText = lastMsg.text;
                                            }
                                        }

                                        return (
                                            <div 
                                                onClick={() => setSelectedUser(otherParticipant)}
                                                key={conv._id} 
                                                className={`relative flex items-center gap-2 p-2 pl-4 rounded cursor-pointer max-sm:text-sm transition-all ${isSelected ? 'bg-[#282142]/50 border-l-4 border-violet-500' : 'hover:bg-[#282142]/20'}`}
                                            >
                                                <img src={otherParticipant?.profilePic || assets.avatar_icon} alt="" className='w-[35px] aspect-[1/1] rounded-full' />
                                                <div className='flex flex-col leading-5 flex-1 min-w-0'>
                                                    <div className='flex justify-between items-center gap-2'>
                                                        <p className='truncate font-medium'>{otherParticipant.fullName}</p>
                                                        {onlineUsers.includes(otherParticipant._id) ? (
                                                            <span className='w-2 h-2 rounded-full bg-green-400 shrink-0'></span>
                                                        ) : (
                                                            <span className='w-2 h-2 rounded-full bg-neutral-500 shrink-0'></span>
                                                        )}
                                                    </div>
                                                    <p className={`text-xs truncate ${unreadCount > 0 ? 'text-violet-300 font-medium' : 'text-neutral-400'}`}>
                                                        {lastMsgText || otherParticipant.bio || "No recent messages"}
                                                    </p>
                                                </div>
                                                {unreadCount > 0 && (
                                                    <p className='absolute top-1/2 right-4 -translate-y-1/2 text-[10px] h-5 w-5 flex justify-center items-center rounded-full bg-violet-600 font-bold shadow-md'>
                                                        {unreadCount}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className='text-xs text-gray-500 text-center py-6 px-4'>
                                        No recent chats. Use search to start a conversation!
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <p className='text-xs text-gray-400 px-3 py-1 font-semibold uppercase tracking-wider'>Call History</p>
                                <CallHistory />
                            </>
                        )}
                    </>
                )}
            </div>
            <footer className="absolute bottom-4 text-gray-400 text-[10px] text-center w-full md:hidden">
                © {new Date().getFullYear()} Ashish Soni — All rights reserved.
            </footer>
        </div>
    )
}

export default Sidebar
