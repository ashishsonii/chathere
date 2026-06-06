import { useRef, useEffect, useCallback } from 'react';

export const useCallSounds = () => {
    const ringtoneRef = useRef(null);
    const ringbackRef = useRef(null);
    const isRingingRef = useRef(false);
    const isRingbackRef = useRef(false);

    useEffect(() => {
        // Initialize audio objects
        ringtoneRef.current = new Audio('/alarm_sound_effect.mp3');
        ringtoneRef.current.loop = true;

        ringbackRef.current = new Audio('/sounds/ringback.mp3');
        ringbackRef.current.loop = true;

        return () => {
            stopRingtone();
            stopRingback();
        };
    }, []);

    const playRingtone = useCallback(() => {
        isRingingRef.current = true;
        if (ringtoneRef.current) {
            ringtoneRef.current.currentTime = 0;
            const promise = ringtoneRef.current.play();
            if (promise !== undefined) {
                promise.then(() => {
                    // If call was rejected while audio was loading, force pause
                    if (!isRingingRef.current) {
                        ringtoneRef.current.pause();
                        ringtoneRef.current.currentTime = 0;
                    }
                }).catch(e => { /* suppressed */ });
            }
        }
    }, []);

    const stopRingtone = useCallback(() => {
        isRingingRef.current = false;
        if (ringtoneRef.current) {
            ringtoneRef.current.pause();
            ringtoneRef.current.currentTime = 0;
        }
    }, []);

    const playRingback = useCallback(() => {
        isRingbackRef.current = true;
        if (ringbackRef.current) {
            ringbackRef.current.currentTime = 0;
            const promise = ringbackRef.current.play();
            if (promise !== undefined) {
                promise.then(() => {
                    if (!isRingbackRef.current) {
                        ringbackRef.current.pause();
                        ringbackRef.current.currentTime = 0;
                    }
                }).catch(e => { /* suppressed */ });
            }
        }
    }, []);

    const stopRingback = useCallback(() => {
        isRingbackRef.current = false;
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
