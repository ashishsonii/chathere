import React, { useContext } from 'react';
import { CallContext } from '../../../context/CallContext';
import assets from '../../assets/assets';

const OutgoingCallOverlay = () => {
    const { callState, currentCall, endCall } = useContext(CallContext);

    if (callState !== "calling" || !currentCall) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="flex flex-col items-center gap-6">
                
                <div className="text-center text-white">
                    <h2 className="text-3xl font-bold mb-2">{currentCall.user?.fullName}</h2>
                    <p className="text-gray-300 text-lg">Calling...</p>
                </div>

                <div className="relative my-8">
                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-ping opacity-30"></div>
                    <div className="absolute inset-0 bg-violet-400 rounded-full animate-pulse opacity-20 scale-150"></div>
                    <img 
                        src={currentCall.user?.profilePic || assets.avatar_icon} 
                        alt="callee" 
                        className="w-32 h-32 rounded-full border-4 border-violet-500 relative z-10 object-cover"
                    />
                </div>

                <button 
                    onClick={endCall}
                    className="mt-8 w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white transform rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default OutgoingCallOverlay;
