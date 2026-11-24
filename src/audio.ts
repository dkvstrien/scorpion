import type { SurfaceType } from './terrain';

export interface AudioTelemetry {
  started: boolean;
  enabled: boolean;
  ctxState: string;
  samplesLoaded: number;
  loopSamplesLoaded: number;
  sfxSamplesLoaded: number;
  sampleRateHz: number;
  sampleNames: string[];
  surface: SurfaceType;
  rpmNorm: number;
  engineLoad: number;
  idleRate: number;
  loadRate: number;
  hydroRate: number;
  surfaceGains: { tarmac: number; gravel: number; grass: number };
}

type LoopSampleKey =
  | 'diesel_idle'
  | 'diesel_load'
  | 'hydraulic_pump'
  | 'surface_tarmac'
  | 'surface_gravel'
  | 'surface_grass';

type SfxSampleKey =
  | 'impact_wood'
  | 'impact_metal'
  | 'impact_hay'
  | 'crush_wood'
  | 'crush_metal'
  | 'grab_clamp'
  | 'hitch_lock'
  | 'horn'
  | 'church_bell';

const LOOP_SAMPLE_FILES: Record<LoopSampleKey, string> = {
  diesel_idle: './audio/diesel_idle.wav',
  diesel_load: './audio/diesel_load.wav',
  hydraulic_pump: './audio/hydraulic_pump.wav',
  surface_tarmac: './audio/surface_tarmac.wav',
  surface_gravel: './audio/surface_gravel.wav',
  surface_grass: './audio/surface_grass.wav'
};

const SFX_SAMPLE_FILES: Record<SfxSampleKey, string> = {
  impact_wood: './audio/impact_wood.mp3',
  impact_metal: './audio/impact_metal.mp3',
  impact_hay: './audio/impact_hay.mp3',
  crush_wood: './audio/crush_wood.mp3',
  crush_metal: './audio/crush_metal.mp3',
  grab_clamp: './audio/grab_clamp.mp3',
  hitch_lock: './audio/hitch_lock.mp3',
  horn: './audio/horn.mp3',
  church_bell: './audio/church_bell.mp3'
};

export class FarmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // Fallback low-level synth while real recorded samples decode (~20-60ms)
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  private hydroOsc: OscillatorNode | null = null;
  private hydroGain: GainNode | null = null;

  // Layered real-recorded engine, hydraulic pump, surface tire-roll loops & one-shot SFX
  private loadedLoops = new Set<LoopSampleKey>();
  private sfxBuffers = new Map<SfxSampleKey, AudioBuffer>();
  private sampleRateHz = 44100;
  private dieselIdleSrc: AudioBufferSourceNode | null = null;
  private dieselIdleGain: GainNode | null = null;
  private dieselIdleFilter: BiquadFilterNode | null = null;

  private dieselLoadSrc: AudioBufferSourceNode | null = null;
  private dieselLoadGain: GainNode | null = null;
  private dieselLoadFilter: BiquadFilterNode | null = null;

  private hydroSampleSrc: AudioBufferSourceNode | null = null;
  private hydroSampleGain: GainNode | null = null;
  private hydroSampleFilter: BiquadFilterNode | null = null;

  private surfaceFilter: BiquadFilterNode | null = null;
  private tarmacSrc: AudioBufferSourceNode | null = null;
  private tarmacGain: GainNode | null = null;
  private gravelSrc: AudioBufferSourceNode | null = null;
  private gravelGain: GainNode | null = null;
  private grassSrc: AudioBufferSourceNode | null = null;
  private grassGain: GainNode | null = null;

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

  private telemetry: AudioTelemetry = {
    started: false,
    enabled: true,
    ctxState: 'uninitialized',
    samplesLoaded: 0,
    loopSamplesLoaded: 0,
    sfxSamplesLoaded: 0,
    sampleRateHz: 44100,
    sampleNames: [],
    surface: 'gravel',
    rpmNorm: 0,
    engineLoad: 0,
    idleRate: 1,
    loadRate: 1,
    hydroRate: 1,
    surfaceGains: { tarmac: 0, gravel: 0, grass: 0 }
  };

  public getAudioState(): AudioTelemetry {
    const names = [...Array.from(this.loadedLoops), ...Array.from(this.sfxBuffers.keys())].sort();
    return {
      ...this.telemetry,
      started: this.started,
      enabled: this.enabled,
      ctxState: this.ctx ? this.ctx.state : 'uninitialized',
      samplesLoaded: this.loadedLoops.size + this.sfxBuffers.size,
      loopSamplesLoaded: this.loadedLoops.size,
      sfxSamplesLoaded: this.sfxBuffers.size,
      sampleRateHz: this.sampleRateHz,
      sampleNames: names,
      surfaceGains: { ...this.telemetry.surfaceGains }
    };
  }

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
    master.gain.value = this.enabled ? 0.42 * this.masterVolume : 0;
    master.connect(ctx.destination);
    this.master = master;

    // Gentle warm fallback engine synth (faded to 0 once diesel_idle & diesel_load WAVs finish decoding)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 175;
    filter.Q.value = 2.0;

    const eGain = ctx.createGain();
    eGain.gain.value = 0.12;

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

    // Subtle Varipower turbocharger spool under heavy throttle / heavy load
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

    // Fallback hydraulic hum (faded out once hydraulic_pump.wav finishes decoding)
    const hGain = ctx.createGain();
    hGain.gain.value = 0;
    const hFilter = ctx.createBiquadFilter();
    hFilter.type = 'bandpass';
    hFilter.frequency.value = 440;
    hFilter.Q.value = 2.6;

    const hOsc = ctx.createOscillator();
    hOsc.type = 'sawtooth';
    hOsc.frequency.value = 195;
    hOsc.connect(hFilter);
    hFilter.connect(hGain);
    hGain.connect(master);
    hOsc.start();

    this.hydroOsc = hOsc;
    this.hydroGain = hGain;

    // Shared surface tone filter for tarmac / gravel / grass loops
    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 900;
    surfFilter.Q.value = 0.7;
    surfFilter.connect(master);
    this.surfaceFilter = surfFilter;

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
    void this.loadAudioSamples(ctx, master, surfFilter);
  }

  private async loadAudioSamples(
    ctx: AudioContext,
    master: GainNode,
    surfFilter: BiquadFilterNode
  ): Promise<void> {
    const loopEntries = Object.entries(LOOP_SAMPLE_FILES) as [LoopSampleKey, string][];
    const sfxEntries = Object.entries(SFX_SAMPLE_FILES) as [SfxSampleKey, string][];

    await Promise.all([
      ...loopEntries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arrayBuf = await res.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
          this.sampleRateHz = audioBuf.sampleRate;
          this.attachLoopSample(ctx, master, surfFilter, key, audioBuf);
          this.loadedLoops.add(key);
        } catch {
          // Keep graceful fallback if a sample fails to fetch/decode
        }
      }),
      ...sfxEntries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arrayBuf = await res.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
          this.sfxBuffers.set(key, audioBuf);
        } catch {
          // Keep graceful fallback if an SFX sample fails to fetch/decode
        }
      })
    ]);
  }

  private playSfxBuffer(
    key: SfxSampleKey,
    gainVal: number,
    rate = 1,
    delaySec = 0,
    maxDur?: number
  ): boolean {
    if (!this.ctx || !this.master || !this.enabled) return false;
    const buf = this.sfxBuffers.get(key);
    if (!buf) return false;
    const t = this.ctx.currentTime + delaySec;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.001, gainVal), t);
    src.connect(g);
    g.connect(this.master);
    src.start(t);
    if (maxDur !== undefined) {
      g.gain.setValueAtTime(Math.max(0.001, gainVal), t + Math.max(0.02, maxDur - 0.05));
      g.gain.exponentialRampToValueAtTime(0.001, t + maxDur);
      src.stop(t + maxDur + 0.01);
    }
    return true;
  }

  private attachLoopSample(
    ctx: AudioContext,
    master: GainNode,
    surfFilter: BiquadFilterNode,
    key: LoopSampleKey,
    buffer: AudioBuffer
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    if (key === 'diesel_idle') {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 680;
      flt.Q.value = 0.85;
      src.connect(flt);
      flt.connect(gain);
      gain.connect(master);
      gain.gain.setTargetAtTime(0.28, ctx.currentTime, 0.14);
      src.start();
      this.dieselIdleSrc = src;
      this.dieselIdleFilter = flt;
      this.dieselIdleGain = gain;
    } else if (key === 'diesel_load') {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 920;
      flt.Q.value = 0.9;
      src.connect(flt);
      flt.connect(gain);
      gain.connect(master);
      src.start();
      this.dieselLoadSrc = src;
      this.dieselLoadFilter = flt;
      this.dieselLoadGain = gain;
    } else if (key === 'hydraulic_pump') {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 2200;
      flt.Q.value = 0.8;
      src.connect(flt);
      flt.connect(gain);
      gain.connect(master);
      src.start();
      this.hydroSampleSrc = src;
      this.hydroSampleFilter = flt;
      this.hydroSampleGain = gain;
    } else if (key === 'surface_tarmac') {
      src.connect(gain);
      gain.connect(surfFilter);
      src.start();
      this.tarmacSrc = src;
      this.tarmacGain = gain;
    } else if (key === 'surface_gravel') {
      src.connect(gain);
      gain.connect(surfFilter);
      src.start();
      this.gravelSrc = src;
      this.gravelGain = gain;
    } else if (key === 'surface_grass') {
      src.connect(gain);
      gain.connect(surfFilter);
      src.start();
      this.grassSrc = src;
      this.grassGain = gain;
    }
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.42 * this.masterVolume : 0, this.ctx.currentTime, 0.05);
    }
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.master && this.ctx && this.enabled) {
      this.master.gain.setTargetAtTime(0.42 * this.masterVolume, this.ctx.currentTime, 0.05);
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
    squeezeLoad: number,
    surface: SurfaceType = 'grass',
    carriedLoadNorm = 0,
    wheelsOnGround = 4
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
    const absSpeed = Math.abs(speedNorm);
    const absThrottle = Math.abs(throttle);
    const loadNorm = Math.max(0, Math.min(1, carriedLoadNorm));
    const engineLoad = Math.min(
      1,
      absThrottle * 0.62 + hydroLoad * 0.44 + loadNorm * 0.34 + squeezeLoad * 0.28
    );
    const rpm = Math.min(
      1,
      absSpeed * 0.58 + absThrottle * 0.36 + hydroLoad * 0.24 + loadNorm * 0.14
    );

    const idleRate = 0.88 + rpm * 0.68;
    const loadRate = 0.72 + rpm * 0.66 + engineLoad * 0.16;
    const hasEngineSamples = this.dieselIdleSrc && this.dieselIdleGain && this.dieselLoadSrc && this.dieselLoadGain;

    if (hasEngineSamples && this.dieselIdleFilter && this.dieselLoadFilter) {
      // Smoothly silence legacy oscillator fallback once sampled loops are live
      this.engineGain.gain.setTargetAtTime(0, t, 0.12);

      this.dieselIdleSrc!.playbackRate.setTargetAtTime(idleRate, t, 0.07);
      this.dieselLoadSrc!.playbackRate.setTargetAtTime(loadRate, t, 0.07);

      const idleVol = 0.28 * (1 - engineLoad * 0.58);
      const loadVol = 0.05 + engineLoad * 0.34 + rpm * 0.10;
      this.dieselIdleGain!.gain.setTargetAtTime(idleVol, t, 0.08);
      this.dieselLoadGain!.gain.setTargetAtTime(loadVol, t, 0.08);

      this.dieselIdleFilter.frequency.setTargetAtTime(620 + rpm * 1200, t, 0.08);
      this.dieselLoadFilter.frequency.setTargetAtTime(780 + rpm * 1650 + engineLoad * 900, t, 0.08);
    } else {
      this.engineOsc.frequency.setTargetAtTime(42 + rpm * 48, t, 0.08);
      this.engineSub.frequency.setTargetAtTime(21 + rpm * 24, t, 0.08);
      this.engineFilter.frequency.setTargetAtTime(155 + rpm * 255, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.11 + rpm * 0.07, t, 0.08);
    }

    // Subtle Varipower turbocharger spool under heavy throttle / heavy load
    const turboAmt = Math.max(0, engineLoad * 0.85 + absSpeed * 0.35 - 0.42);
    this.turboOsc.frequency.setTargetAtTime(860 + rpm * 900 + loadNorm * 220, t, 0.14);
    this.turboGain.gain.setTargetAtTime(turboAmt * 0.016, t, 0.12);

    // Sampled load-dependent hydrostatic hydraulic pump
    const hAmt = Math.min(1, hydroLoad + squeezeLoad * 0.92);
    const hydroRate = 0.85 + hydroLoad * 0.36 + loadNorm * 0.26 + squeezeLoad * 0.32;
    if (this.hydroSampleSrc && this.hydroSampleGain && this.hydroSampleFilter) {
      this.hydroGain.gain.setTargetAtTime(0, t, 0.08);
      this.hydroSampleSrc.playbackRate.setTargetAtTime(hydroRate, t, 0.05);
      this.hydroSampleFilter.frequency.setTargetAtTime(
        1600 + hydroLoad * 1800 + loadNorm * 650 + squeezeLoad * 900,
        t,
        0.06
      );
      this.hydroSampleGain.gain.setTargetAtTime(hAmt * (0.24 + loadNorm * 0.14), t, 0.05);
    } else {
      this.hydroOsc.frequency.setTargetAtTime(185 + hydroLoad * 95 + squeezeLoad * 180 + loadNorm * 65, t, 0.05);
      this.hydroGain.gain.setTargetAtTime(hAmt * 0.075, t, 0.05);
    }

    // Distinct surface rolling audio (tarmac / gravel / grass) driven by ground contact & wheel speed
    const grounded = wheelsOnGround >= 1 ? 1 : 0;
    const speedKmh = absSpeed * 12 * 3.6;
    const rollNorm = grounded * Math.max(0, Math.min(1, (speedKmh - 0.8) / 28));
    let tarmacTarget = 0;
    let gravelTarget = 0;
    let grassTarget = 0;
    if (rollNorm > 0.005) {
      if (surface === 'asphalt') {
        tarmacTarget = rollNorm * 0.28;
      } else if (surface === 'gravel') {
        gravelTarget = rollNorm * 0.34;
      } else if (surface === 'grass') {
        grassTarget = rollNorm * 0.26;
      } else if (surface === 'mud') {
        grassTarget = rollNorm * 0.18;
        gravelTarget = rollNorm * 0.14;
      }
    }

    if (this.surfaceFilter) {
      this.surfaceFilter.frequency.setTargetAtTime(340 + rollNorm * 2850, t, 0.08);
    }
    if (this.tarmacSrc && this.tarmacGain) {
      this.tarmacSrc.playbackRate.setTargetAtTime(0.68 + rollNorm * 0.72, t, 0.07);
      this.tarmacGain.gain.setTargetAtTime(tarmacTarget, t, 0.08);
    }
    if (this.gravelSrc && this.gravelGain) {
      this.gravelSrc.playbackRate.setTargetAtTime(0.78 + rollNorm * 0.62, t, 0.07);
      this.gravelGain.gain.setTargetAtTime(gravelTarget, t, 0.08);
    }
    if (this.grassSrc && this.grassGain) {
      this.grassSrc.playbackRate.setTargetAtTime(0.74 + rollNorm * 0.56, t, 0.07);
      this.grassGain.gain.setTargetAtTime(grassTarget, t, 0.08);
    }

    this.telemetry.surface = surface;
    this.telemetry.rpmNorm = +rpm.toFixed(3);
    this.telemetry.engineLoad = +engineLoad.toFixed(3);
    this.telemetry.idleRate = +idleRate.toFixed(3);
    this.telemetry.loadRate = +loadRate.toFixed(3);
    this.telemetry.hydroRate = +hydroRate.toFixed(3);
    this.telemetry.surfaceGains.tarmac = +tarmacTarget.toFixed(3);
    this.telemetry.surfaceGains.gravel = +gravelTarget.toFixed(3);
    this.telemetry.surfaceGains.grass = +grassTarget.toFixed(3);
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
    const vol = Math.min(0.45, 0.45 * Math.max(0.18, distanceFactor));
    if (this.playSfxBuffer('church_bell', vol, 0.98 + Math.random() * 0.04)) return;
    const t = this.ctx.currentTime;
    // Fallback bell partials while sample decodes
    const freqs = [293.66, 587.33, 880, 1174.66];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.master) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const amp = (vol * 0.5) / (idx + 1);
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

    if (this.sfxBuffers.has('horn')) {
      this.playSfxBuffer('horn', 0.25, 1.18, 0, 0.22);
      if (alarm) this.playSfxBuffer('horn', 0.24, 1.22, 0.26, 0.22);
      return;
    }

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
    if (this.playSfxBuffer('horn', 0.42, 0.88, 0, 0.48)) return;
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

  public playGrab(grabbing = true): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const rate = grabbing ? 1.0 + Math.random() * 0.08 : 0.78 + Math.random() * 0.06;
    const gain = grabbing ? 0.46 : 0.32;
    if (this.playSfxBuffer('grab_clamp', gain, rate)) return;
    this.playHitch(grabbing);
  }

  public playHitch(attach = true): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const rate = attach ? 1.0 : 0.84;
    if (this.playSfxBuffer('hitch_lock', 0.48, rate)) return;
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
    const key: SfxSampleKey = isMetallic ? 'crush_metal' : 'crush_wood';
    if (this.playSfxBuffer(key, 0.56, 0.92 + Math.random() * 0.16)) return;
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

    if (material !== 'water') {
      const sfxKey: SfxSampleKey =
        material === 'metal' ? 'impact_metal' : material === 'hay' ? 'impact_hay' : 'impact_wood';
      const sfxGain = Math.min(0.62, Math.max(0.09, strength * 0.09));
      const rate = 0.88 + Math.random() * 0.24;
      if (this.playSfxBuffer(sfxKey, sfxGain, rate)) return;
    }

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
