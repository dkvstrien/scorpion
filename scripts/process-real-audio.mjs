/**
 * Processes real downloaded CC0 / Public Domain / CC BY 4.0 field recordings into
 * 44.1 kHz crossfaded seamless WAV loops and 44.1 kHz MP3 one-shots in public/audio/.
 *
 * Sources (all credited in index.html Credits & Data tab):
 * - WWS_JohnDeereTractor.ogg — Work With Sounds / Werstas (Wikimedia Commons, CC BY 4.0)
 * - WWS_TractorUrsusC342engine.ogg — Work With Sounds / Museum of Municipal Engineering (Wikimedia Commons, CC BY 4.0)
 * - Hydraulic_lift_down.ogg — stephan (Wikimedia Commons, Public Domain)
 * - Lift_truck_1.ogg — ezwa (Wikimedia Commons, Public Domain)
 * - Walkingongravel.ogg — Secretlondon (Wikimedia Commons, CC BY-SA 3.0)
 * - 100 CC0 metal and wood SFX — rubberduck (OpenGameArt, CC0 1.0)
 * - Different steps (gravel/leaves/mud) — TinyWorlds (OpenGameArt, CC0 1.0)
 * - Car Horn.wav — 15HPanska_Ruttner_Jan (Wikimedia Commons, CC0)
 * - Samariter Church Bell III (b).ogg — Pete w. View (Wikimedia Commons, CC BY-SA 4.0)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('.scratch/loop/24/raw');
const OUT = path.resolve('public/audio');
const FFMPEG = '/Users/danielvanstrien/bin/ffmpeg';
const SR = 44100;

fs.mkdirSync(OUT, { recursive: true });

function decodeMono44k(inputPath, startSec = 0, durSec = null, af = null) {
  const args = ['-v', 'error'];
  if (startSec > 0) args.push('-ss', String(startSec));
  args.push('-i', inputPath);
  if (durSec !== null) args.push('-t', String(durSec));
  if (af) args.push('-af', af);
  args.push('-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1');
  const buf = execFileSync(FFMPEG, args, { maxBuffer: 64 * 1024 * 1024 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function makeSeamlessLoop(raw, fadeSec = 0.45) {
  const fade = Math.min(Math.floor(fadeSec * SR), Math.floor(raw.length / 4));
  const len = raw.length - fade;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = raw[i];
  // Equal-power circular crossfade at the loop seam for click-free continuous looping
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const wIn = Math.sin(t * Math.PI * 0.5);
    const wOut = Math.cos(t * Math.PI * 0.5);
    out[i] = out[i] * wIn + raw[len + i] * wOut;
  }
  return out;
}

function writeWav44k(filename, samples, targetPeak = 0.85) {
  // Remove DC offset
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i];
  mean /= Math.max(1, samples.length);

  let peak = 1e-4;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i] - mean);
    if (v > peak) peak = v;
  }
  const scale = targetPeak / peak;

  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, (samples[i] - mean) * scale));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  const outPath = path.join(OUT, filename);
  fs.writeFileSync(outPath, buf);
  console.log(`LOOP ${filename}: ${(buf.length / 1024).toFixed(1)} KB (${(samples.length / SR).toFixed(2)}s @ ${SR}Hz)`);
}

function encodeOneShotMp3(inputPath, outName, { startSec = 0, durSec = null, af = 'loudnorm=I=-14:TP=-1.5' } = {}) {
  const outPath = path.join(OUT, outName);
  const args = ['-y', '-v', 'error'];
  if (startSec > 0) args.push('-ss', String(startSec));
  args.push('-i', inputPath);
  if (durSec !== null) args.push('-t', String(durSec));
  if (af) args.push('-af', af);
  args.push('-ac', '1', '-ar', String(SR), '-b:a', '128k', outPath);
  execFileSync(FFMPEG, args);
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`SFX  ${outName}: ${kb} KB @ ${SR}Hz`);
}

// 1. Real 44.1 kHz Diesel Tractor Idle Loop (5.0s seamless crossfade from WWS_TractorUrsusC342engine.ogg)
const idleRaw = decodeMono44k(path.join(RAW, 'WWS_TractorUrsusC342engine.ogg'), 2.5, 5.55, 'highpass=f=32,lowpass=f=6500');
writeWav44k('diesel_idle.wav', makeSeamlessLoop(idleRaw, 0.55));

// 2. Real 44.1 kHz Turbocharged 4-Cyl Diesel Tractor Under Load Loop (5.0s from WWS_JohnDeereTractor.ogg)
const loadRaw = decodeMono44k(path.join(RAW, 'WWS_JohnDeereTractor.ogg'), 16.0, 5.55, 'highpass=f=38,lowpass=f=7200');
writeWav44k('diesel_load.wav', makeSeamlessLoop(loadRaw, 0.55));

// 3. Real 44.1 kHz Hydraulic Lift Pump Loop (4.6s from Public Domain Hydraulic_lift_down.ogg)
const hydroRaw = decodeMono44k(path.join(RAW, 'Hydraulic_lift_down.ogg'), 4.2, 5.15, 'highpass=f=85,lowpass=f=6800');
writeWav44k('hydraulic_pump.wav', makeSeamlessLoop(hydroRaw, 0.50));

// 4. Real 44.1 kHz Heavy Rubber Tire Tarmac Roll Loop (4.6s from Public Domain Lift_truck_1.ogg)
const tarmacRaw = decodeMono44k(path.join(RAW, 'Lift_truck_1.ogg'), 17.0, 5.15, 'highpass=f=55,lowpass=f=3800');
writeWav44k('surface_tarmac.wav', makeSeamlessLoop(tarmacRaw, 0.50));

// 5. Real 44.1 kHz Gravel Crunch Rolling Bed (4.6s continuous dual-offset overlap of real Walkingongravel.ogg so tires sound continuous!)
const gravA = decodeMono44k(path.join(RAW, 'Walkingongravel.ogg'), 0.4, 5.15, 'highpass=f=110,lowpass=f=6200');
const gravB = decodeMono44k(path.join(RAW, 'Walkingongravel.ogg'), 5.8, 5.15, 'highpass=f=110,lowpass=f=6200');
const gravMix = new Float32Array(Math.min(gravA.length, gravB.length));
for (let i = 0; i < gravMix.length; i++) gravMix[i] = gravA[i] * 0.68 + gravB[i] * 0.68;
writeWav44k('surface_gravel.wav', makeSeamlessLoop(gravMix, 0.50));

// 6. Real 44.1 kHz Meadow Grass / Foliage Rolling Bed (4.4s dense continuous overlap of TinyWorlds CC0 leaves01/02 + mud02 recordings!)
const leaf1 = decodeMono44k(path.join(RAW, 'steps/leaves01.ogg'), 0, null, 'highpass=f=90,lowpass=f=4500');
const leaf2 = decodeMono44k(path.join(RAW, 'steps/leaves02.ogg'), 0, null, 'highpass=f=90,lowpass=f=4500');
const mud2 = decodeMono44k(path.join(RAW, 'steps/mud02.ogg'), 0, null, 'lowpass=f=1200');
const grassLen = Math.floor(4.85 * SR);
const grassRaw = new Float32Array(grassLen);
const srcs = [leaf1, leaf2, mud2];
// Stagger real recorded foliage/turf grains densely across 4.85s with smooth Hann envelopes -> continuous real grass tire swish!
for (let k = 0; k < 54; k++) {
  const src = srcs[k % srcs.length];
  const off = Math.floor((k / 54) * (grassLen - Math.min(src.length, Math.floor(0.55 * SR))));
  const clipLen = Math.min(src.length, grassLen - off);
  const amp = k % 3 === 2 ? 0.42 : 0.65;
  for (let i = 0; i < clipLen; i++) {
    const win = Math.sin((i / clipLen) * Math.PI);
    grassRaw[off + i] += src[i] * win * amp;
  }
}
writeWav44k('surface_grass.wav', makeSeamlessLoop(grassRaw, 0.45));

// 7. Real 44.1 kHz One-Shot Samples (CC0 / CC BY-SA) — impacts, crush, grab, hitch, horn, church bell!
encodeOneShotMp3(path.join(RAW, 'wood_metal/wood_hit_03.ogg'), 'impact_wood.mp3', { durSec: 0.55 });
encodeOneShotMp3(path.join(RAW, 'wood_metal/metal_hit_02.ogg'), 'impact_metal.mp3', { durSec: 0.7 });
encodeOneShotMp3(path.join(RAW, 'wood_metal/wood_slam_02.ogg'), 'impact_hay.mp3', { durSec: 0.45, af: 'lowpass=f=520,loudnorm=I=-15:TP=-1.5' });
encodeOneShotMp3(path.join(RAW, 'wood_metal/wood_breaking_01.ogg'), 'crush_wood.mp3', { durSec: 0.85 });
encodeOneShotMp3(path.join(RAW, 'wood_metal/metal_slam_01.ogg'), 'crush_metal.mp3', { durSec: 0.9 });
encodeOneShotMp3(path.join(RAW, 'wood_metal/metal_close_01.ogg'), 'grab_clamp.mp3', { durSec: 0.45 });
encodeOneShotMp3(path.join(RAW, 'wood_metal/lock_open_01.ogg'), 'hitch_lock.mp3', { durSec: 0.5 });
encodeOneShotMp3(path.join(RAW, 'Car_Horn.wav'), 'horn.mp3', { startSec: 0.05, durSec: 0.85, af: 'afade=t=out:st=0.65:d=0.2,loudnorm=I=-14:TP=-1.5' });
encodeOneShotMp3(path.join(RAW, 'Samariter_Church_Bell_III_b_.ogg'), 'church_bell.mp3', { startSec: 2.8, durSec: 5.5, af: 'afade=t=in:st=0:d=0.05,afade=t=out:st=4.4:d=1.1,loudnorm=I=-15:TP=-1.5' });

let totalBytes = 0;
for (const f of fs.readdirSync(OUT)) totalBytes += fs.statSync(path.join(OUT, f)).size;
console.log(`TOTAL public/audio/: ${(totalBytes / 1024 / 1024).toFixed(2)} MB (${fs.readdirSync(OUT).length} files)`);
