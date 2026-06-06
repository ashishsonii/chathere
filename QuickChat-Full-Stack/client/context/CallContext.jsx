import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { useWebRTC } from "../src/hooks/useWebRTC";
import { useCallSounds } from "../src/hooks/useCallSounds";
import toast from "react-hot-toast";

export const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const { socket, authUser, axios } = useContext(AuthContext);
    
    // Call State
    const [callState, setCallState] = useState("idle"); // idle | ringing | calling | connected
    const [currentCall, setCurrentCall] = useState(null); // { callId, callerId, receiverId, type, ...user }
    const [callDuration, setCallDuration] = useState(0);

    const { playRingtone, stopRingtone, playRingback, stopRingback } = useCallSounds();
    const {
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        startLocalStream,
        initPeerConnection,
        createOffer,
        createAnswer,
        handleAnswer,
        handleIceCandidate,
        toggleMute,
        toggleCamera,
        cleanup: cleanupWebRTC
    } = useWebRTC(socket, authUser?._id, axios);

    const timerRef = useRef(null);
    const timeoutRef = useRef(null); // 30s ring timeout

    // --- Core Actions ---

    const initiateCall = async (receiver, type) => {
        if (!socket || !authUser) return;
        try {
            await startLocalStream(type);
            setCallState("calling");
            setCurrentCall({
                receiverId: receiver._id,
                callerId: authUser._id,
                type,
                user: receiver // the other person
            });
            playRingback();
            
            socket.emit("call:initiate", { receiverId: receiver._id, type });

            // Set 30s timeout
            timeoutRef.current = setTimeout(() => {
                if (callStateRef.current === "calling") {
                    endCall();
                    toast("Call timeout", { icon: "⏰" });
                }
            }, 30000);
        } catch (error) {
            toast.error("Failed to access camera/microphone");
            cleanupCall();
        }
    };

    const acceptCall = async () => {
        if (!socket || !currentCall) return;
        stopRingtone();
        clearTimeout(timeoutRef.current);
        
        try {
            await startLocalStream(currentCall.type);
            setCallState("connected");
            
            // 1. Tell signaling server we accepted
            socket.emit("call:accept", { callId: currentCall.callId });
            
            // 2. Initialize PeerConnection as receiver (not initiator)
            await initPeerConnection(currentCall.callId, currentCall.callerId, false);
            
            startDurationTimer();
        } catch (error) {
            toast.error("Failed to access camera/microphone");
            rejectCall();
        }
    };

    const rejectCall = () => {
        if (!socket || !currentCall) return;
        stopRingtone();
        clearTimeout(timeoutRef.current);
        socket.emit("call:reject", { callId: currentCall.callId });
        cleanupCall();
    };

    const endCall = () => {
        if (!socket || !currentCall) return;
        socket.emit("call:end", { 
            callId: currentCall.callId,
            duration: callDuration
        });
        cleanupCall();
    };

    // --- Helpers ---

    const cleanupCall = useCallback(() => {
        stopRingtone();
        stopRingback();
        clearTimeout(timeoutRef.current);
        clearInterval(timerRef.current);
        cleanupWebRTC();
        setCallState("idle");
        setCurrentCall(null);
        setCallDuration(0);
    }, [cleanupWebRTC, stopRingtone, stopRingback]);

    const startDurationTimer = () => {
        setCallDuration(0);
        timerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
        }, 1000);
    };

    // --- Socket Listeners ---

    const callStateRef = useRef(callState);
    const currentCallRef = useRef(currentCall);

    useEffect(() => {
        callStateRef.current = callState;
        currentCallRef.current = currentCall;
    }, [callState, currentCall]);

    useEffect(() => {
        if (!socket || !authUser) return;

        // 1. Incoming Call
        socket.on("call:incoming", async (data) => {
            if (callStateRef.current !== "idle") {
                // Busy handling
                socket.emit("call:reject", { callId: data.callId, reason: "busy" });
                return;
            }

            // Immediately mark as ringing to prevent duplicate incoming events
            callStateRef.current = "ringing";
            
            // Fetch caller profile briefly (or use cached if available)
            try {
                const res = await axios.get(`/api/auth/users/${data.callerId}`).catch(()=>null);
                
                // If the call was rejected/ended while we were fetching the profile, ABORT!
                if (callStateRef.current !== "ringing") return;

                const caller = res?.data?.user || { _id: data.callerId, fullName: "Unknown" };
                
                setCurrentCall({
                    ...data,
                    user: caller
                });
                setCallState("ringing");
                playRingtone();
                
                // 30s timeout
                timeoutRef.current = setTimeout(() => {
                    cleanupCall();
                }, 30000);
            } catch(e) {}
        });

        // 2. Call Initiated (ACK from server)
        socket.on("call:initiated", (data) => {
            setCurrentCall(prev => ({ ...prev, callId: data.callId }));
        });

        // 3. Call Accepted (by receiver)
        socket.on("call:accepted", async ({ callId }) => {
            stopRingback();
            clearTimeout(timeoutRef.current);
            setCallState("connected");
            startDurationTimer();
            
            // Initialize PeerConnection as Caller and send Offer
            await initPeerConnection(callId, currentCallRef.current.receiverId, true);
            await createOffer(callId, currentCallRef.current.receiverId);
        });

        // 4. Call Rejected
        socket.on("call:rejected", () => {
            stopRingback();
            clearTimeout(timeoutRef.current);
            toast("Call rejected", { icon: "❌" });
            cleanupCall();
        });

        // 5. Call Ended
        socket.on("call:ended", () => {
            toast("Call ended", { icon: "📞" });
            cleanupCall();
        });

        // 6. WebRTC: SDP Offer received (Receiver gets this)
        socket.on("call:sdp-offer", async ({ callId, offer }) => {
            await createAnswer(callId, currentCallRef.current.callerId, offer);
        });

        // 7. WebRTC: SDP Answer received (Caller gets this)
        socket.on("call:sdp-answer", async ({ answer }) => {
            await handleAnswer(answer);
        });

        // 8. WebRTC: ICE Candidate received
        socket.on("call:ice-candidate", async ({ candidate }) => {
            await handleIceCandidate(candidate);
        });

        // 9. Error
        socket.on("call:error", ({ message }) => {
            toast.error(message);
            cleanupCall();
        });

        return () => {
            socket.off("call:incoming");
            socket.off("call:initiated");
            socket.off("call:accepted");
            socket.off("call:rejected");
            socket.off("call:ended");
            socket.off("call:sdp-offer");
            socket.off("call:sdp-answer");
            socket.off("call:ice-candidate");
            socket.off("call:error");
        };
    }, [socket, authUser, initPeerConnection, createOffer, createAnswer, handleAnswer, handleIceCandidate, stopRingback, playRingtone, cleanupCall]);


    const value = {
        callState,
        currentCall,
        callDuration,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleCamera
    };

    return (
        <CallContext.Provider value={value}>
            {children}
        </CallContext.Provider>
    );
};
