import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('public/audio');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SR = 22050;

// Deterministic PRNG for repeatable, clean audio textures
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  let peak = 0.001;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const scale = 0.88 / peak;
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] * scale));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, buf);
  console.log(`Built ${filename}: ${(buf.length / 1024).toFixed(1)} KB (${(numSamples / SR).toFixed(2)}s @ ${SR}Hz)`);
}

// Seamless circular crossfade of last `fadeLen` samples into first `fadeLen` samples
function makeSeamless(raw, fadeSec = 0.12) {
  const n = raw.length;
  const fade = Math.min(Math.floor(fadeSec * SR), Math.floor(n / 4));
  const out = new Float32Array(n - fade);
  for (let i = 0; i < out.length; i++) out[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    // Equal-power crossfade
    const wIn = Math.sin(t * Math.PI * 0.5);
    const wOut = Math.cos(t * Math.PI * 0.5);
    out[i] = out[i] * wIn + raw[out.length + i] * wOut;
  }
  return out;
}

// Simple 1-pole lowpass / highpass helpers
function lowpass(arr, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  const out = new Float32Array(arr.length);
  let y = 0;
  for (let i = 0; i < arr.length; i++) {
    y += a * (arr[i] - y);
    out[i] = y;
  }
  return out;
}

function highpass(arr, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SR;
  const a = rc / (rc + dt);
  const out = new Float32Array(arr.length);
  let y = 0;
  let prevX = 0;
  for (let i = 0; i < arr.length; i++) {
    y = a * (y + arr[i] - prevX);
    prevX = arr[i];
    out[i] = y;
  }
  return out;
}

// 1. 4-Cylinder Deutz TCD 3.6 Diesel Idle (~850 RPM -> 28.33 Hz firing frequency, warm chug + mechanical clatter)
function buildDieselSample({ filename, firingHz, knockAmt, barkAmt, airAmt, seed }) {
  const dur = 2.15;
  const n = Math.floor(dur * SR);
  const rng = makeRng(seed);
  const raw = new Float32Array(n);
  const period = SR / firingHz;
  let lpNoise = 0;
  let cylIdx = 0;
  let nextFire = 0;

  // Individual cylinder firing impulse trains (slight per-cylinder variation makes it sound organically mechanical!)
  const cylWeights = [1.04, 0.94, 1.02, 0.96];
  const knockRing = new Float32Array(n);
  while (nextFire < n) {
    const w = cylWeights[cylIdx % 4];
    const start = Math.floor(nextFire);
    // Warm low-frequency exhaust pressure thump (30 ms exponential pulse) + crisp diesel injection clatter (7 ms)
    for (let k = 0; k < Math.floor(period * 1.4) && start + k < n; k++) {
      const t = k / SR;
      const thump = Math.sin(2 * Math.PI * firingHz * 1.0 * t) * Math.exp(-t * 28) * 0.72;
      const subThump = Math.sin(2 * Math.PI * firingHz * 0.5 * t) * Math.exp(-t * 18) * 0.45;
      const bark = Math.sin(2 * Math.PI * firingHz * 2.02 * t + 0.4) * Math.exp(-t * 42) * barkAmt;
      const knock =
        (Math.sin(2 * Math.PI * (640 + (cylIdx % 4) * 35) * t) + 0.5 * Math.sin(2 * Math.PI * 1180 * t)) *
        Math.exp(-t * 175) *
        knockAmt;
      raw[start + k] += (thump + subThump + bark) * w;
      knockRing[start + k] += knock * w;
    }
    cylIdx++;
    // Tiny organic timing jitter (< 1.2%) prevents sterile robotic drone
    nextFire += period * (1 + rng() * 0.012);
  }

  // Blend crankcase/fan broadband air & exhaust rumble
  const rumble = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const white = rng();
    lpNoise = lpNoise * 0.88 + white * 0.12;
    rumble[i] = lpNoise;
  }
  const exhaustAir = highpass(lowpass(rumble, 420), 65);
  const warmBody = lowpass(raw, 280);
  const clatter = lowpass(highpass(knockRing, 280), 1900);

  const mixed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mixed[i] = warmBody[i] * 0.78 + clatter[i] * 0.34 + exhaustAir[i] * airAmt;
  }
  writeWav(filename, makeSeamless(mixed, 0.18));
}

// 2. Layered Hydrostatic Axial-Piston Hydraulic Pump (smooth fluid pressure hiss + gear-tooth harmonics)
function buildHydraulicSample() {
  const dur = 1.75;
  const n = Math.floor(dur * SR);
  const rng = makeRng(4411);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rng();
  const fluidHiss = highpass(lowpass(noise, 2600), 620);

  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // 9-piston axial pump whine (220 Hz fundamental + 440/660/880 soft harmonics) + pressurized oil flow
    const pump =
      Math.sin(2 * Math.PI * 220 * t) * 0.36 +
      Math.sin(2 * Math.PI * 440 * t + 0.8) * 0.24 +
      Math.sin(2 * Math.PI * 660 * t + 1.5) * 0.12 +
      Math.sin(2 * Math.PI * 880 * t) * 0.06;
    raw[i] = pump * 0.55 + fluidHiss[i] * 0.65;
  }
  writeWav('hydraulic_pump.wav', makeSeamless(raw, 0.15));
}

// 3. Tarmac / Asphalt Tire Roll (460/70 R24 V-chevron agricultural tread hum + smooth asphalt road hiss)
function buildTarmacSample() {
  const dur = 2.15;
  const n = Math.floor(dur * SR);
  const rng = makeRng(7123);
  const white = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = rng();
  const roadBody = lowpass(highpass(white, 70), 520);
  const roadSizzle = lowpass(highpass(white, 900), 2600);

  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Subtle chevron lug beat around 68 Hz + 136 Hz
    const lug = (Math.sin(2 * Math.PI * 68 * t) * 0.5 + Math.sin(2 * Math.PI * 136 * t) * 0.22) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 4.5 * t));
    raw[i] = roadBody[i] * 0.72 + roadSizzle[i] * 0.18 + lug * 0.19;
  }
  writeWav('surface_tarmac.wav', makeSeamless(raw, 0.16));
}

// 4. Crushed Limestone Gravel Crunch (randomized crisp pebble clicks, stone pops & loose grit roll)
function buildGravelSample() {
  const dur = 2.15;
  const n = Math.floor(dur * SR);
  const rng = makeRng(9081);
  const white = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = rng();
  const gritBed = lowpass(highpass(white, 320), 2800);

  // Discrete pebble crunch micro-impacts under 4 heavy tires!
  const pebbles = new Float32Array(n);
  for (let p = 0; p < 240; p++) {
    const idx = Math.floor(((rng() * 0.5 + 0.5) * (n - 400)));
    const amp = 0.25 + (rng() * 0.5 + 0.5) * 0.75;
    const freq = 950 + (rng() * 0.5 + 0.5) * 2400;
    const decay = 180 + (rng() * 0.5 + 0.5) * 260;
    for (let k = 0; k < 280 && idx + k < n; k++) {
      const t = k / SR;
      pebbles[idx + k] += (Math.sin(2 * Math.PI * freq * t) * 0.5 + rng() * 0.65) * Math.exp(-t * decay) * amp;
    }
  }
  const crispPebbles = highpass(lowpass(pebbles, 4200), 480);
  const lowRoll = lowpass(white, 190);

  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = crispPebbles[i] * 0.78 + gritBed[i] * 0.36 + lowRoll[i] * 0.42;
  }
  writeWav('surface_gravel.wav', makeSeamless(raw, 0.18));
}

// 5. Meadow Grass / Soil Tire Brush (soft swishing turf + muffled earth roll)
function buildGrassSample() {
  const dur = 2.15;
  const n = Math.floor(dur * SR);
  const rng = makeRng(3317);
  const white = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = rng();
  const earth = lowpass(white, 150);
  const brush = highpass(lowpass(white, 1850), 580);

  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Soft periodic tire-lug swish through meadow blades
    const swish = 0.62 + 0.38 * Math.sin(2 * Math.PI * 6.5 * t + Math.sin(2 * Math.PI * 1.4 * t));
    raw[i] = earth[i] * 0.85 + brush[i] * 0.38 * swish;
  }
  writeWav('surface_grass.wav', makeSeamless(raw, 0.18));
}

buildDieselSample({ filename: 'diesel_idle.wav', firingHz: 28.5, knockAmt: 0.24, barkAmt: 0.22, airAmt: 0.32, seed: 101 });
buildDieselSample({ filename: 'diesel_load.wav', firingHz: 52.0, knockAmt: 0.16, barkAmt: 0.48, airAmt: 0.58, seed: 202 });
buildHydraulicSample();
buildTarmacSample();
buildGravelSample();
buildGrassSample();
