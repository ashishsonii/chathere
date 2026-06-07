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
        // Raw high-frequency sawtooth heavily modulated by a rapid square wave LFO
        // This simulates the snapping and popping of high voltage arcs.
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 400;

        const lfo = this.ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 40; // 40 snaps per second

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 1000;

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000; // Keep it sounding sharp

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.05; // Keep it quiet, high frequency is piercing

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        lfo.start();

        this.activeNodes.push(osc, lfo, filter, gainNode);
    }
}

export const vfxAudioEngine = new VFXAudioEngine();
