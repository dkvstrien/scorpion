export class FarmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  private hydroOsc: OscillatorNode | null = null;
  private hydroGain: GainNode | null = null;

  private ambGain: GainNode | null = null;
  private ambFilter: BiquadFilterNode | null = null;
  private ambPhase = 0;
  private birdTimer = 2.4;
  private cowbellTimer = 6.5;

  public enabled = true;
  public ambienceEnabled = true;
  public masterVolume = 0.85;
  private started = false;
  private lastImpactTime = 0;
  private lastAlarmTime = 0;
  private lastCarHornTime = 0;

  public init(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.38 * this.masterVolume : 0;
    master.connect(ctx.destination);
    this.master = master;

    // Warm chunky CLAAS Deutz diesel engine synth
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

    // Subtle Varipower turbocharger whistle under heavy throttle!
    const tGain = ctx.createGain();
    tGain.gain.value = 0;
    const tOsc = ctx.createOscillator();
    tOsc.type = 'sine';
    tOsc.frequency.value = 920;
    tOsc.connect(tGain);
    tGain.connect(master);
    tOsc.start();
    this.turboOsc = tOsc;
    this.turboGain = tGain;

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

    // Gentle filtered broadband breeze / lake-water ambience bed
    const ambBufLen = ctx.sampleRate * 2;
    const ambBuf = ctx.createBuffer(1, ambBufLen, ctx.sampleRate);
    const ambData = ambBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < ambBufLen; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      ambData[i] = lastOut * 3.2;
    }
    const ambSrc = ctx.createBufferSource();
    ambSrc.buffer = ambBuf;
    ambSrc.loop = true;
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'bandpass';
    ambFilter.frequency.value = 340;
    ambFilter.Q.value = 0.7;
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.0;
    ambSrc.connect(ambFilter);
    ambFilter.connect(ambGain);
    ambGain.connect(master);
    ambSrc.start();
    this.ambFilter = ambFilter;
    this.ambGain = ambGain;

    this.started = true;
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.38 * this.masterVolume : 0, this.ctx.currentTime, 0.05);
    }
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.master && this.ctx && this.enabled) {
      this.master.gain.setTargetAtTime(0.38 * this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setAmbienceEnabled(on: boolean): void {
    this.ambienceEnabled = on;
    if (!on && this.ambGain && this.ctx) {
      this.ambGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  public updateAmbience(dt: number, area: 'forest' | 'farm' | 'lake' | 'village'): void {
    if (!this.ctx || !this.master || !this.ambGain || !this.ambFilter || !this.enabled || !this.ambienceEnabled) {
      return;
    }
    this.ambPhase += dt;
    const t = this.ctx.currentTime;

    if (area === 'lake') {
      // Slow rhythmic lapping water waves along Starnberger See shore
      const swell = 0.5 + 0.5 * Math.sin(this.ambPhase * 1.35);
      this.ambFilter.frequency.setTargetAtTime(240 + swell * 260, t, 0.18);
      this.ambGain.gain.setTargetAtTime(0.055 + swell * 0.055, t, 0.18);
    } else if (area === 'forest') {
      // Soft rustling pine canopy breeze + periodic woodland birdsong chirps
      const rustle = 0.5 + 0.5 * Math.sin(this.ambPhase * 0.7);
      this.ambFilter.frequency.setTargetAtTime(520 + rustle * 260, t, 0.25);
      this.ambGain.gain.setTargetAtTime(0.035 + rustle * 0.018, t, 0.25);
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 2.6 + Math.random() * 3.8;
        this.playBirdChirp();
      }
    } else if (area === 'farm') {
      // Quiet meadow breeze + occasional distant Alpine cowbell & faint meadow bird
      this.ambFilter.frequency.setTargetAtTime(380, t, 0.25);
      this.ambGain.gain.setTargetAtTime(0.025, t, 0.25);
      this.cowbellTimer -= dt;
      if (this.cowbellTimer <= 0) {
        this.cowbellTimer = 6.5 + Math.random() * 7.0;
        this.playCowbell();
      }
      this.birdTimer -= dt * 0.45;
      if (this.birdTimer <= 0) {
        this.birdTimer = 4.5 + Math.random() * 5.0;
        this.playBirdChirp(0.6);
      }
    } else {
      // Village: soft warm air bed (church bell rings periodically from main loop)
      this.ambFilter.frequency.setTargetAtTime(320, t, 0.3);
      this.ambGain.gain.setTargetAtTime(0.022, t, 0.3);
    }
  }

  private playBirdChirp(volScale = 1): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const base = 2400 + Math.random() * 1100;
    const notes = Math.random() > 0.4 ? [0, 0.11, 0.21] : [0, 0.12];
    for (const off of notes) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t + off);
      osc.frequency.exponentialRampToValueAtTime(base * (1.18 + Math.random() * 0.22), t + off + 0.055);
      osc.frequency.exponentialRampToValueAtTime(base * 0.92, t + off + 0.095);
      g.gain.setValueAtTime(0.0005, t + off);
      g.gain.linearRampToValueAtTime(0.024 * volScale, t + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + off + 0.095);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + off);
      osc.stop(t + off + 0.105);
    }
  }

  private playCowbell(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const hits = Math.random() > 0.5 ? [0, 0.28] : [0];
    for (const off of hits) {
      for (const freq of [540, 810]) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const bp = this.ctx.createBiquadFilter();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq + Math.random() * 14, t + off);
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = 5.5;
        g.gain.setValueAtTime(0.0008, t + off);
        g.gain.linearRampToValueAtTime(0.032, t + off + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0005, t + off + 0.38);
        osc.connect(bp);
        bp.connect(g);
        g.connect(this.master);
        osc.start(t + off);
        osc.stop(t + off + 0.42);
      }
    }
  }

  public updateContinuous(
    speedNorm: number,
    throttle: number,
    hydroLoad: number,
    squeezeLoad: number
  ): void {
    if (
      !this.ctx ||
      !this.engineOsc ||
      !this.engineSub ||
      !this.engineFilter ||
      !this.engineGain ||
      !this.hydroOsc ||
      !this.hydroGain ||
      !this.turboOsc ||
      !this.turboGain
    ) {
      return;
    }
    const t = this.ctx.currentTime;
    const rpm = Math.min(1, Math.abs(speedNorm) * 0.65 + Math.abs(throttle) * 0.45 + hydroLoad * 0.22);

    this.engineOsc.frequency.setTargetAtTime(42 + rpm * 48, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(21 + rpm * 24, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(155 + rpm * 255, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.13 + rpm * 0.09, t, 0.08);

    // Subtle turbo spool when pushing throttle
    const turboAmt = Math.max(0, Math.abs(throttle) * 0.8 + Math.abs(speedNorm) * 0.4 - 0.35);
    this.turboOsc.frequency.setTargetAtTime(860 + rpm * 850, t, 0.14);
    this.turboGain.gain.setTargetAtTime(turboAmt * 0.018, t, 0.12);

    const hAmt = Math.min(1, hydroLoad + squeezeLoad * 0.9);
    this.hydroOsc.frequency.setTargetAtTime(185 + hydroLoad * 95 + squeezeLoad * 180, t, 0.05);
    this.hydroGain.gain.setTargetAtTime(hAmt * 0.085, t, 0.05);
  }

  public playOverloadBeep(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = performance.now();
    if (now - this.lastAlarmTime < 340) return;
    this.lastAlarmTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1480, t);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  public playChurchBell(distanceFactor = 1): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const vol = Math.min(0.22, 0.22 * Math.max(0.15, distanceFactor));
    const t = this.ctx.currentTime;
    // Warm Bavarian bronze bell partials
    const freqs = [293.66, 587.33, 880, 1174.66];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.master) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const amp = vol / (idx + 1);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.8 - idx * 0.45);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 3.0);
    });
  }

  public playCarHorn(alarm = false): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = performance.now();
    if (now - this.lastCarHornTime < 1100) return;
    this.lastCarHornTime = now;

    const t = this.ctx.currentTime;
    const pulses = alarm ? [0, 0.24] : [0];
    for (const off of pulses) {
      for (const f of [420, 525]) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const flt = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t + off);
        flt.type = 'lowpass';
        flt.frequency.value = 1400;
        g.gain.setValueAtTime(0.001, t + off);
        g.gain.linearRampToValueAtTime(0.11, t + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.19);
        osc.connect(flt);
        flt.connect(g);
        g.connect(this.master);
        osc.start(t + off);
        osc.stop(t + off + 0.21);
      }
    }
  }

  public playHorn(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    for (const f of [310, 392]) {
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
    osc.frequency.exponentialRampToValueAtTime(540, t + 0.15);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.23);
  }

  public playPlasticPop(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;

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
