export class FarmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private hydroOsc: OscillatorNode | null = null;
  private hydroGain: GainNode | null = null;

  public enabled = true;
  private started = false;
  private lastImpactTime = 0;

  public init(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.35 : 0;
    master.connect(ctx.destination);
    this.master = master;

    // Warm chunky diesel engine synth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 175;
    filter.Q.value = 2.4;

    const eGain = ctx.createGain();
    eGain.gain.value = 0.16;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 46;

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 23;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(eGain);
    eGain.connect(master);

    osc.start();
    sub.start();

    this.engineOsc = osc;
    this.engineSub = sub;
    this.engineFilter = filter;
    this.engineGain = eGain;

    // Hydraulic pump hum
    const hGain = ctx.createGain();
    hGain.gain.value = 0;
    const hFilter = ctx.createBiquadFilter();
    hFilter.type = 'bandpass';
    hFilter.frequency.value = 440;
    hFilter.Q.value = 3;

    const hOsc = ctx.createOscillator();
    hOsc.type = 'sawtooth';
    hOsc.frequency.value = 195;

    hOsc.connect(hFilter);
    hFilter.connect(hGain);
    hGain.connect(master);
    hOsc.start();

    this.hydroOsc = hOsc;
    this.hydroGain = hGain;

    this.started = true;
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.05);
    }
  }

  public updateContinuous(speedNorm: number, throttle: number, hydroLoad: number, squeezeLoad: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineSub || !this.engineFilter || !this.engineGain || !this.hydroOsc || !this.hydroGain) {
      return;
    }
    const t = this.ctx.currentTime;
    const rpm = Math.min(1, Math.abs(speedNorm) * 0.65 + Math.abs(throttle) * 0.45 + hydroLoad * 0.2);

    this.engineOsc.frequency.setTargetAtTime(42 + rpm * 46, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(21 + rpm * 23, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(155 + rpm * 240, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.13 + rpm * 0.09, t, 0.08);

    const hAmt = Math.min(1, hydroLoad + squeezeLoad * 0.9);
    this.hydroOsc.frequency.setTargetAtTime(185 + hydroLoad * 95 + squeezeLoad * 180, t, 0.05);
    this.hydroGain.gain.setTargetAtTime(hAmt * 0.085, t, 0.05);
  }

  public playHorn(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const freqs = [310, 392];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const flt = this.ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      flt.type = 'lowpass';
      flt.frequency.value = 1100;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.03);
      g.gain.setValueAtTime(0.16, t + 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.44);
    }
  }

  public playHitch(attach = true): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(attach ? 140 : 210, t);
    osc.frequency.exponentialRampToValueAtTime(attach ? 320 : 95, t + 0.11);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playFling(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(580, t + 0.16);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  public playPlasticPop(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;

    // Sharp snap-pop
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();
    popOsc.type = 'triangle';
    popOsc.frequency.setValueAtTime(520, t);
    popOsc.frequency.exponentialRampToValueAtTime(65, t + 0.08);
    popGain.gain.setValueAtTime(0.55, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    popOsc.connect(popGain);
    popGain.connect(this.master);
    popOsc.start(t);
    popOsc.stop(t + 0.11);

    // Escaping air hiss ("pffffsssssh!")
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.55);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.42));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2800, t + 0.02);
    hp.frequency.exponentialRampToValueAtTime(1100, t + 0.55);
    hp.Q.value = 1.4;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.38, t + 0.02);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    noise.connect(hp);
    hp.connect(nGain);
    nGain.connect(this.master);
    noise.start(t + 0.02);
  }

  public playCrush(isMetallic = false): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.28);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = isMetallic ? 950 : 480;
    flt.Q.value = isMetallic ? 3.5 : 1.1;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    noise.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    noise.start(t);

    // Low crunch thump
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = isMetallic ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isMetallic ? 240 : 130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.2);
    og.gain.setValueAtTime(0.35, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(og);
    og.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  public playImpact(strength: number, material: 'wood' | 'hay' | 'metal' | 'water' = 'wood'): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = performance.now();
    if (now - this.lastImpactTime < 55) return;
    this.lastImpactTime = now;

    const vol = Math.min(0.38, Math.max(0.04, strength * 0.055));
    const t = this.ctx.currentTime;

    if (material === 'water') {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.35);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.38));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(750, t);
      bp.frequency.exponentialRampToValueAtTime(280, t + 0.32);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * 1.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      src.start(t);
      return;
    }

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (material === 'metal') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(280 + Math.random() * 90, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.14);
    } else if (material === 'hay') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95 + Math.random() * 25, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.11);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165 + Math.random() * 45, t);
      osc.frequency.exponentialRampToValueAtTime(62, t + 0.1);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  public playScoreChime(big = false): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.master) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const start = t + idx * 0.065;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.22, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.34);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }
}
