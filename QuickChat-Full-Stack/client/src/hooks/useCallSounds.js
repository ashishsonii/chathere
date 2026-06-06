import { useRef, useEffect, useCallback } from 'react';

export const useCallSounds = () => {
    const ringtoneRef = useRef(null);
    const ringbackRef = useRef(null);

    useEffect(() => {
        // Initialize audio objects
        // We will generate empty/simple base64 tones if these files don't exist yet, 
        // or you can add real mp3s to public/sounds/ later.
        ringtoneRef.current = new Audio('/sounds/ringtone.mp3');
        ringtoneRef.current.loop = true;

        ringbackRef.current = new Audio('/sounds/ringback.mp3');
        ringbackRef.current.loop = true;

        return () => {
            stopRingtone();
            stopRingback();
        };
    }, []);

    const playRingtone = useCallback(() => {
        if (ringtoneRef.current) {
            ringtoneRef.current.currentTime = 0;
            ringtoneRef.current.play().catch(e => console.log("Audio play prevented:", e));
        }
    }, []);

    const stopRingtone = useCallback(() => {
        if (ringtoneRef.current) {
            ringtoneRef.current.pause();
            ringtoneRef.current.currentTime = 0;
        }
    }, []);

    const playRingback = useCallback(() => {
        if (ringbackRef.current) {
            ringbackRef.current.currentTime = 0;
            ringbackRef.current.play().catch(e => console.log("Audio play prevented:", e));
        }
    }, []);

    const stopRingback = useCallback(() => {
        if (ringbackRef.current) {
            ringbackRef.current.pause();
            ringbackRef.current.currentTime = 0;
        }
    }, []);

    return {
        playRingtone,
        stopRingtone,
        playRingback,
        stopRingback
    };
};
