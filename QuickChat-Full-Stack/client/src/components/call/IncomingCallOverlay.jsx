import React, { useContext } from 'react';
import { CallContext } from '../../../context/CallContext';
import assets from '../../assets/assets';

const IncomingCallOverlay = () => {
    const { callState, currentCall, acceptCall, rejectCall } = useContext(CallContext);

    if (callState !== "ringing" || !currentCall) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-[#282142] p-8 rounded-3xl flex flex-col items-center gap-6 shadow-2xl border border-gray-600/50 min-w-[300px]">
                
                <h2 className="text-xl font-semibold text-white">Incoming {currentCall.type} call</h2>
                
                <div className="relative">
                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-ping opacity-20"></div>
                    <img 
                        src={currentCall.user?.profilePic || assets.avatar_icon} 
                        alt="caller" 
                        className="w-24 h-24 rounded-full border-4 border-violet-500 relative z-10 object-cover"
                    />
                </div>
                
                <div className="text-center">
                    <h3 className="text-2xl font-bold text-white">{currentCall.user?.fullName}</h3>
                    <p className="text-gray-400 mt-1">Orry Video & Voice</p>
                </div>

                <div className="flex w-full justify-around mt-4">
                    <button 
                        onClick={rejectCall}
                        className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    >
                        {/* Decline Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-8 8m0-8l8 8" />
                        </svg>
                    </button>

                    <button 
                        onClick={acceptCall}
                        className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110 animate-bounce"
                    >
                        {/* Accept Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallOverlay;
