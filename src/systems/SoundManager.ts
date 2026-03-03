/** Procedural sound effects + BGM using Web Audio API - no assets needed */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private initialized = false;

  // BGM state
  private bgmPlaying = false;
  private bgmNodes: (OscillatorNode | GainNode)[] = [];
  private bgmIntervalId: ReturnType<typeof setInterval> | null = null;
  private bgmGain: GainNode | null = null;

  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch {
      // Web Audio not available
    }
  }

  setVolume(v: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = v;
    }
  }

  private ensureContext(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ─── BGM ─────────────────────────
  playBGM(): void {
    if (!this.ctx || this.bgmPlaying) return;
    this.ensureContext();
    this.bgmPlaying = true;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.08;
    this.bgmGain.connect(this.masterGain);

    // Bass drone
    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 55; // A1
    bassGain.gain.value = 0.3;
    bassOsc.connect(bassGain).connect(this.bgmGain);
    bassOsc.start();
    this.bgmNodes.push(bassOsc, bassGain);

    // Pad chord
    const padNotes = [110, 138.59, 164.81]; // A2, C#3, E3
    for (const freq of padNotes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(this.bgmGain);
      osc.start();
      this.bgmNodes.push(osc, gain);
    }

    // Arpeggio pattern
    const arpNotes = [220, 277.18, 329.63, 440, 329.63, 277.18]; // A3 C#4 E4 A4 E4 C#4
    let noteIdx = 0;
    const bpm = 120;
    const interval = (60 / bpm) * 1000 / 2; // 8th notes

    this.bgmIntervalId = setInterval(() => {
      if (!this.ctx || !this.bgmGain) return;
      const freq = arpNotes[noteIdx % arpNotes.length];
      noteIdx++;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain).connect(this.bgmGain);
      osc.start(t);
      osc.stop(t + 0.15);
    }, interval);
  }

  stopBGM(): void {
    this.bgmPlaying = false;
    for (const node of this.bgmNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        node.disconnect();
      } catch { /* already stopped */ }
    }
    this.bgmNodes = [];
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  }

  get isBGMPlaying(): boolean { return this.bgmPlaying; }

  // ─── Existing Sounds ─────────────
  playHit(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playKill(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playLevelUp(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [523, 659, 784]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.15, this.ctx!.currentTime + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + i * 0.08 + 0.25);
      osc.connect(gain).connect(this.masterGain);
      osc.start(this.ctx!.currentTime + i * 0.08);
      osc.stop(this.ctx!.currentTime + i * 0.08 + 0.25);
    });
  }

  playBossWarning(): void {
    if (!this.ctx) return;
    this.ensureContext();
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 100;
      const t = this.ctx.currentTime + i * 0.4;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  playPlayerHit(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playXP(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 + Math.random() * 200, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  playPickup(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [880, 1100]; // A5 C#6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.06;
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  playCrit(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playWave(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playGameOver(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [392, 330, 262]; // G4 E4 C4
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.2;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  // ─── NEW Sounds ─────────────────

  playButtonClick(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  playCardSelect(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [660, 880];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.05;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  }

  playShopPurchase(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [1047, 1319, 1568]; // C6 E6 G6 (coin jingle)
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.06;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  playShopDeny(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [300, 200];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  playEvolve(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  playAchievement(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [784, 988, 1175, 1568]; // G5 B5 D6 G6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  playMiniBoss(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const notes = [150, 100];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const t = this.ctx!.currentTime + i * 0.25;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  playEventWave(): void {
    if (!this.ctx) return;
    this.ensureContext();
    // Drum roll + cymbal
    for (let i = 0; i < 6; i++) {
      const noise = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      noise.type = 'square';
      noise.frequency.value = 80 + i * 30;
      const t = this.ctx.currentTime + i * 0.05;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      noise.connect(gain).connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.06);
    }
    // Cymbal-like noise burst
    const cymOsc = this.ctx.createOscillator();
    const cymGain = this.ctx.createGain();
    cymOsc.type = 'sawtooth';
    cymOsc.frequency.value = 3000;
    const ct = this.ctx.currentTime + 0.3;
    cymGain.gain.setValueAtTime(0.06, ct);
    cymGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.3);
    cymOsc.connect(cymGain).connect(this.masterGain);
    cymOsc.start(ct);
    cymOsc.stop(ct + 0.3);
  }

  playBoomerang(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playMissile(): void {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playExplosion(): void {
    if (!this.ctx) return;
    this.ensureContext();
    // Noise burst
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
