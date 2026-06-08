import React, { useContext, useMemo } from 'react';
import { ChatContext } from '../../context/ChatContext';
import assets from '../assets/assets';
import { formatMessageTime } from '../lib/utils';

const ProfileDrawer = ({ isOpen, onClose }) => {
    const { selectedUser, messages } = useContext(ChatContext);

    // Get all images shared in this conversation
    const sharedMedia = useMemo(() => {
        return messages.filter(msg => msg.image).reverse();
    }, [messages]);

    if (!selectedUser) return null;

    return (
        <div className={`fixed inset-y-0 right-0 w-80 bg-[#1e1930] shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className="text-white font-semibold text-lg">Contact Info</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700/50 text-gray-400 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            {/* Profile Info */}
            <div className="flex flex-col items-center p-6 border-b border-gray-700 text-center">
                <img 
                    src={selectedUser.profilePic || assets.avatar_icon} 
                    alt={selectedUser.fullName} 
                    className="w-28 h-28 rounded-full object-cover border-4 border-indigo-500 shadow-lg mb-4"
                />
                <h3 className="text-xl font-bold text-white mb-1">{selectedUser.fullName}</h3>
                <p className="text-sm text-gray-400 mb-3">{selectedUser.email}</p>
                {selectedUser.bio && (
                    <p className="text-sm text-gray-300 italic px-4">"{selectedUser.bio}"</p>
                )}
            </div>

            {/* Shared Media */}
            <div className="flex-1 overflow-y-auto p-4">
                <h4 className="text-white text-sm font-semibold mb-3 uppercase tracking-wider text-gray-400">Shared Media</h4>
                {sharedMedia.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                        {sharedMedia.map((msg, idx) => (
                            <div key={idx} className="relative aspect-square cursor-pointer group rounded-md overflow-hidden bg-gray-800">
                                <img src={msg.image} alt="Shared media" className="w-full h-full object-cover transition duration-300 group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-[10px] text-white p-1 text-center font-medium">
                                        {formatMessageTime(msg.createdAt)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-gray-500 text-xs py-8 bg-gray-800/20 rounded-lg border border-gray-700/50">
                        No media shared yet
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileDrawer;
