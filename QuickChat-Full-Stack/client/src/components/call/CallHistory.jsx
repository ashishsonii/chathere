import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../../context/AuthContext';
import { CallContext } from '../../../context/CallContext';
import assets from '../../assets/assets';
import toast from 'react-hot-toast';

const formatDuration = (seconds) => {
    if (!seconds) return "0s";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatTime = (dateString) => {
    const date = new Date(dateString);
    const isToday = new Date().toDateString() === date.toDateString();
    return isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString();
};

const CallHistory = () => {
    const { axios, authUser } = useContext(AuthContext);
    const { initiateCall } = useContext(CallContext);
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const { data } = await axios.get('/api/calls/history');
                if (data.success) {
                    setCalls(data.calls);
                }
            } catch (error) {
                toast.error("Failed to load call history");
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [axios]);

    if (loading) {
        return <div className="text-center p-4 text-gray-500">Loading history...</div>;
    }

    if (calls.length === 0) {
        return <div className="text-center p-8 text-gray-500 text-sm">No recent calls</div>;
    }

    return (
        <div className="flex flex-col gap-2">
            {calls.map((call) => {
                // Determine the other participant
                let otherUser;
                if (call.caller?._id === authUser?._id) {
                    otherUser = call.receiver || (call.participants && call.participants[0]);
                } else {
                    otherUser = call.caller;
                }

                if (!otherUser) return null;

                const isOutgoing = call.caller?._id === authUser?._id;
                const isMissed = call.status === "missed" && !isOutgoing;
                const isRejected = call.status === "rejected";

                return (
                    <div key={call.callId} className="flex items-center justify-between p-3 rounded-xl hover:bg-[#282142]/40 transition-colors border-b border-gray-700/30">
                        <div className="flex items-center gap-3 cursor-pointer">
                            <img src={otherUser.profilePic || assets.avatar_icon} alt="" className="w-10 h-10 rounded-full" />
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${isMissed ? 'text-red-400' : 'text-gray-200'}`}>
                                    {otherUser.fullName}
                                </span>
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                    {isOutgoing ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${isMissed ? 'text-red-500' : 'text-blue-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                    )}
                                    <span>{formatTime(call.startedAt)}</span>
                                    {call.status === "ended" && <span>• {formatDuration(call.duration)}</span>}
                                    {isRejected && <span>• Rejected</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button 
                                onClick={() => initiateCall(otherUser, "voice")}
                                className="p-2 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                            </button>
                            <button 
                                onClick={() => initiateCall(otherUser, "video")}
                                className="p-2 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default CallHistory;
