class VFXAudioEngine {
    constructor() {
        this.ctx = null;
        this.activeNodes = [];
        this.activeEffect = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    stopEffect() {
        this.activeNodes.forEach(node => {
            try {
                if (node.stop) node.stop();
                if (node.disconnect) node.disconnect();
            } catch (e) {}
        });
        this.activeNodes = [];
        this.activeEffect = null;
    }

    playEffect(gesture) {
        if (gesture === "none") {
            this.stopEffect();
            return;
        }

        if (this.activeEffect === gesture) return; // Already playing
        this.stopEffect();
        this.init();

        this.activeEffect = gesture;

        switch (gesture) {
            case "closed_fist":
            case "fire_throw":
                this.playFire();
                break;
            case "two_finger":
                this.playLightning();
                break;
            case "hand_raise":
            case "open_palm":
                this.playMagic();
                break;
            case "thumbs_up":
                this.playBurst();
                break;
            case "connect_webs":
                this.playCracklingElectricity();
                break;
        }
    }

    // --- Procedural Synthesizers ---

    playFire() {
        // White noise through a low-pass filter to simulate rumble/wind/fire
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400; // Deep rumble

        const filterLFO = this.ctx.createOscillator();
        filterLFO.type = 'sine';
        filterLFO.frequency.value = 8; // 8Hz crackle rate
        
        const filterLFOGain = this.ctx.createGain();
        filterLFOGain.gain.value = 300;

        filterLFO.connect(filterLFOGain);
        filterLFOGain.connect(filter.frequency);

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.5;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        noise.start();
        filterLFO.start();

        this.activeNodes.push(noise, filterLFO, filter, gainNode);
    }

    playLightning() {
        // High-pitch sawtooth with rapid frequency modulation
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 150;

        const mod = this.ctx.createOscillator();
        mod.type = 'square';
        mod.frequency.value = 50; // Zap rate

        const modGain = this.ctx.createGain();
        modGain.gain.value = 500;

        mod.connect(modGain);
        modGain.connect(osc.frequency);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.1;

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        mod.start();

        this.activeNodes.push(osc, mod, filter, gainNode);
    }

    playMagic() {
        // Deep, chorused sine waves
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 200;

        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 204; // Slight detune

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.3;

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc1.start();
        osc2.start();

        this.activeNodes.push(osc1, osc2, gainNode);
    }

    playBurst() {
        // Quick sweeping sine wave (pew/chime)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.5);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);

        this.activeNodes.push(osc, gainNode);
        
        // Auto cleanup for one-shot burst
        setTimeout(() => {
            if (this.activeEffect === "thumbs_up") this.stopEffect();
        }, 500);
    }

    playCracklingElectricity() {
        // ASMR Electric Tingles (Soft static, fizz, and pop rocks)
        
        // 1. Soft ASMR Noise (Fizz)
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // Bandpass filter to make it sound like crisp but soft static
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 4000;
        noiseFilter.Q.value = 1.0;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = 0.05; // Very quiet for ASMR

        // Panner to sweep the noise slightly left and right (tingles)
        const panner = this.ctx.createStereoPanner();
        const pannerLfo = this.ctx.createOscillator();
        pannerLfo.type = 'sine';
        pannerLfo.frequency.value = 0.5; // Slow sweep
        pannerLfo.connect(panner.pan);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(panner);
        panner.connect(this.ctx.destination);

        noise.start();
        pannerLfo.start();

        this.activeNodes.push(noise, pannerLfo, noiseFilter, noiseGain, panner);

        // 2. Random Pop Rocks (ASMR Crackles)
        // We use an interval to spawn tiny clicks while the effect is active
        const popInterval = setInterval(() => {
            if (this.activeEffect !== "connect_webs" || this.ctx.state === 'suspended') {
                clearInterval(popInterval);
                return;
            }

            const popOsc = this.ctx.createOscillator();
            popOsc.type = 'sine';
            popOsc.frequency.setValueAtTime(8000 + Math.random() * 2000, this.ctx.currentTime); // High pitch click
            popOsc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);

            const popGain = this.ctx.createGain();
            popGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
            popGain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.01);
            popGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

            // Pan each pop randomly
            const popPanner = this.ctx.createStereoPanner();
            popPanner.pan.value = Math.random() * 2 - 1;

            popOsc.connect(popGain);
            popGain.connect(popPanner);
            popPanner.connect(this.ctx.destination);

            popOsc.start();
            popOsc.stop(this.ctx.currentTime + 0.05);
            
            // Clean up pop nodes
            setTimeout(() => {
                popOsc.disconnect();
                popGain.disconnect();
                popPanner.disconnect();
            }, 100);

        }, 50); // A pop every 50ms

        this.activeNodes.push({ stop: () => clearInterval(popInterval), disconnect: () => {} });
    }
}

export const vfxAudioEngine = new VFXAudioEngine();
