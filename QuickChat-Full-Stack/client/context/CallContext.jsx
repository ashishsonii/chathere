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
        isScreenSharing,
        startLocalStream,
        initPeerConnection,
        createOffer,
        createAnswer,
        handleAnswer,
        handleIceCandidate,
        toggleMute,
        toggleCamera,
        toggleScreenShare,
        cleanup: cleanupWebRTC
    } = useWebRTC(socket, authUser?._id, axios);

    const timerRef = useRef(null);
    const timeoutRef = useRef(null); // 30s ring timeout

    // --- Refs for values that socket handlers need ---
    // These refs let event handlers access the latest values without
    // being listed in useEffect deps (which would cause re-subscriptions).
    const callStateRef = useRef(callState);
    const currentCallRef = useRef(currentCall);

    useEffect(() => {
        callStateRef.current = callState;
        currentCallRef.current = currentCall;
    }, [callState, currentCall]);

    // --- Core Actions ---

    const initiateCall = async (receiver, type) => {
        if (!socket || !authUser) return;
        try {
            // Acquire media FIRST — if this fails, we abort before ringing
            const stream = await startLocalStream(type);

            setCallState("calling");
            setCurrentCall({
                receiverId: receiver._id,
                callerId: authUser._id,
                type,
                user: receiver // the other person
            });
            playRingback();
            
            socket.emit("call:initiate", { receiverId: receiver._id, type });

            // 30s ring timeout
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
            // 1. Acquire local media — returns the stream synchronously
            const stream = await startLocalStream(currentCall.type);
            
            setCallState("connected");
            
            // 2. Tell signaling server we accepted
            socket.emit("call:accept", { callId: currentCall.callId });
            
            // 3. Initialize PeerConnection as RECEIVER, passing stream explicitly
            //    so it does NOT rely on React state (which hasn't re-rendered yet).
            await initPeerConnection(currentCall.callId, currentCall.callerId, false, stream);
            
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
    // All WebRTC functions from the hook are now useCallback-wrapped and stable,
    // so this effect won't re-run unnecessarily.

    useEffect(() => {
        if (!socket || !authUser) return;

        // 1. Incoming Call (receiver gets this first)
        const onIncoming = async (data) => {
            if (callStateRef.current !== "idle") {
                socket.emit("call:reject", { callId: data.callId, reason: "busy" });
                return;
            }

            // Immediately mark as ringing to prevent duplicate events
            callStateRef.current = "ringing";
            
            try {
                const res = await axios.get(`/api/auth/users/${data.callerId}`).catch(() => null);
                
                // If call was cancelled while fetching profile, abort
                if (callStateRef.current !== "ringing") return;

                const caller = res?.data?.user || { _id: data.callerId, fullName: "Unknown" };
                
                setCurrentCall({ ...data, user: caller });
                setCallState("ringing");
                playRingtone();
                
                timeoutRef.current = setTimeout(() => {
                    cleanupCall();
                }, 30000);
            } catch(e) { /* ignore */ }
        };

        // 2. Call Initiated ACK (caller gets callId back)
        const onInitiated = (data) => {
            setCurrentCall(prev => ({ ...prev, callId: data.callId }));
        };

        // 3. Call Accepted — caller now sets up WebRTC and sends offer
        const onAccepted = async ({ callId }) => {
            stopRingback();
            clearTimeout(timeoutRef.current);
            setCallState("connected");
            startDurationTimer();
            
            // The caller called startLocalStream in initiateCall, so the
            // localStreamRef inside useWebRTC already has the stream.
            // No explicit stream param needed here — the ref handles it.
            await initPeerConnection(callId, currentCallRef.current.receiverId, true);
            await createOffer(callId, currentCallRef.current.receiverId);
        };

        // 4. Call Rejected
        const onRejected = () => {
            stopRingback();
            clearTimeout(timeoutRef.current);
            toast("Call rejected", { icon: "❌" });
            cleanupCall();
        };

        // 5. Call Ended by remote peer
        const onEnded = () => {
            toast("Call ended", { icon: "📞" });
            cleanupCall();
        };

        // 6. SDP Offer received (receiver gets this after caller creates offer)
        const onSdpOffer = async ({ callId, offer }) => {
            await createAnswer(callId, currentCallRef.current.callerId, offer);
        };

        // 7. SDP Answer received (caller gets this after receiver answers)
        const onSdpAnswer = async ({ answer }) => {
            await handleAnswer(answer);
        };

        // 8. ICE Candidate received
        const onIceCandidate = async ({ candidate }) => {
            await handleIceCandidate(candidate);
        };

        // 9. Error from server
        const onError = ({ message }) => {
            toast.error(message);
            cleanupCall();
        };

        socket.on("call:incoming", onIncoming);
        socket.on("call:initiated", onInitiated);
        socket.on("call:accepted", onAccepted);
        socket.on("call:rejected", onRejected);
        socket.on("call:ended", onEnded);
        socket.on("call:sdp-offer", onSdpOffer);
        socket.on("call:sdp-answer", onSdpAnswer);
        socket.on("call:ice-candidate", onIceCandidate);
        socket.on("call:error", onError);

        return () => {
            socket.off("call:incoming", onIncoming);
            socket.off("call:initiated", onInitiated);
            socket.off("call:accepted", onAccepted);
            socket.off("call:rejected", onRejected);
            socket.off("call:ended", onEnded);
            socket.off("call:sdp-offer", onSdpOffer);
            socket.off("call:sdp-answer", onSdpAnswer);
            socket.off("call:ice-candidate", onIceCandidate);
            socket.off("call:error", onError);
        };
    }, [socket, authUser, initPeerConnection, createOffer, createAnswer, handleAnswer, handleIceCandidate, stopRingback, playRingtone, cleanupCall, axios]);


    const value = {
        callState,
        currentCall,
        callDuration,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        isScreenSharing,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleCamera,
        toggleScreenShare
    };

    return (
        <CallContext.Provider value={value}>
            {children}
        </CallContext.Provider>
    );
};
