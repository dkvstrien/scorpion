import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { LAKE_ELEV_M, ORIGIN_E, ORIGIN_N } from './build-bavaria-terrain.mjs';

const muensingData = JSON.parse(fs.readFileSync(path.resolve('src/data/muensingData.json'), 'utf8'));
const hmCols = muensingData.heightmap.cols;
const hmRows = muensingData.heightmap.rows;
const hmMin = muensingData.heightmap.minElev;
const hmMax = muensingData.heightmap.maxElev;
const hmBuf = fs.readFileSync(path.resolve('public/map/dgm1_heightmap.bin'));
const hmPacked = new Uint16Array(hmBuf.buffer, hmBuf.byteOffset, hmBuf.byteLength / 2);

const WORLD_MIN_X = muensingData.meta.minX;
const WORLD_MAX_X = muensingData.meta.maxX;
const WORLD_MIN_Z = muensingData.meta.minZ;
const WORLD_MAX_Z = muensingData.meta.maxZ;

function sampleDgm1TerrainY(wx, wz) {
  const u = Math.max(0, Math.min(hmCols - 1.0001, ((wx - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * (hmCols - 1)));
  const v = Math.max(0, Math.min(hmRows - 1.0001, ((wz - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * (hmRows - 1)));
  const ix = Math.floor(u);
  const iz = Math.floor(v);
  const fx = u - ix;
  const fz = v - iz;
  const getE = (c, r) => hmMin + (hmPacked[r * hmCols + c] / 65535) * (hmMax - hmMin);
  const elev =
    (getE(ix, iz) * (1 - fx) + getE(ix + 1, iz) * fx) * (1 - fz) +
    (getE(ix, iz + 1) * (1 - fx) + getE(ix + 1, iz + 1) * fx) * fz;
  return elev - LAKE_ELEV_M;
}

// Load our 4 RAW DOP20 aerial tiles into raw RGB buffers so we always sample every building's REAL roof color!
async function loadDopSamplers() {
  const names = ['dop_nw.jpg', 'dop_ne.jpg', 'dop_sw.jpg', 'dop_se.jpg'];
  const quads = {};
  for (const name of names) {
    const rawCandidate = path.resolve('data-cache/dop_raw', name);
    const tilePath = fs.existsSync(rawCandidate) ? rawCandidate : path.resolve('public/map', name);
    const img = sharp(tilePath);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    quads[name] = { data, w: info.width, h: info.height, ch: info.channels };
  }
  return (wx, wz) => {
    const isEast = wx >= 0;
    const isSouth = wz >= 0;
    const key = `dop_${isSouth ? 's' : 'n'}${isEast ? 'e' : 'w'}.jpg`;
    const q = quads[key];
    const u = isEast ? wx / WORLD_MAX_X : (wx - WORLD_MIN_X) / -WORLD_MIN_X;
    const v = isSouth ? wz / WORLD_MAX_Z : (wz - WORLD_MIN_Z) / -WORLD_MIN_Z;
    const px = Math.max(2, Math.min(q.w - 3, Math.floor(u * (q.w - 1))));
    const py = Math.max(2, Math.min(q.h - 3, Math.floor(v * (q.h - 1))));

    let r = 0, g = 0, b = 0, cnt = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const off = ((py + dy) * q.w + (px + dx)) * q.ch;
        r += q.data[off];
        g += q.data[off + 1];
        b += q.data[off + 2];
        cnt++;
      }
    }
    r /= cnt;
    g /= cnt;
    b /= cnt;

    const isFoliage = g > r * 1.06 && g > b * 1.1;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (isFoliage || lum < 45) {
      return [162, 66, 42]; // Classic Bavarian red-brown clay tiles
    }
    const avg = (r + g + b) / 3;
    const sat = 1.4;
    let rr = avg + (r - avg) * sat;
    let gg = avg + (g - avg) * sat;
    let bb = avg + (b - avg) * sat;
    if (Math.abs(rr - gg) < 14 && lum > 95 && lum < 175) {
      rr *= 1.15;
      gg *= 0.88;
      bb *= 0.78;
    }
    return [
      Math.max(42, Math.min(208, Math.round(rr))),
      Math.max(36, Math.min(182, Math.round(gg))),
      Math.max(32, Math.min(176, Math.round(bb)))
    ];
  };
}

function srgbToLinearByte(c) {
  const s = Math.max(0, Math.min(1, c / 255));
  const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  return Math.round(lin * 255);
}

function rgbToLinear(rgb) {
  return [srgbToLinearByte(rgb[0]), srgbToLinearByte(rgb[1]), srgbToLinearByte(rgb[2])];
}

function computeNewellNormal(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-6) return null;
  return [nx / len, ny / len, nz / len];
}

function pointInPoly2D(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function triangulate2D(poly2) {
  const n = poly2.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly2[i];
    const b = poly2[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(area >= 0 ? i : n - 1 - i);

  const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const ptInTri = (p, a, b, c) => {
    const d1 = cross2(p, a, b);
    const d2 = cross2(p, b, c);
    const d3 = cross2(p, c, a);
    return d1 >= -1e-6 && d2 >= -1e-6 && d3 >= -1e-6;
  };

  const tris = [];
  let guard = n * n * 2;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    const m = idx.length;
    for (let i = 0; i < m; i++) {
      const iPrev = idx[(i + m - 1) % m];
      const iCurr = idx[i];
      const iNext = idx[(i + 1) % m];
      const a = poly2[iPrev];
      const b = poly2[iCurr];
      const c = poly2[iNext];
      if (cross2(a, b, c) <= 1e-6) continue;
      let hasInside = false;
      for (let j = 0; j < m; j++) {
        const k = idx[j];
        if (k === iPrev || k === iCurr || k === iNext) continue;
        if (ptInTri(poly2[k], a, b, c)) {
          hasInside = true;
          break;
        }
      }
      if (!hasInside) {
        tris.push(area >= 0 ? [iPrev, iCurr, iNext] : [iPrev, iNext, iCurr]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) {
      for (let i = 1; i < idx.length - 1; i++) {
        tris.push(area >= 0 ? [idx[0], idx[i], idx[i + 1]] : [idx[0], idx[i + 1], idx[i]]);
      }
      break;
    }
  }
  if (idx.length === 3) {
    tris.push(area >= 0 ? [idx[0], idx[1], idx[2]] : [idx[0], idx[2], idx[1]]);
  }
  return tris;
}

function parsePosList(str) {
  const nums = str.trim().split(/\s+/).map(Number);
  const pts = [];
  for (let i = 0; i + 2 < nums.length; i += 3) {
    const E = nums[i];
    const N = nums[i + 1];
    const H = nums[i + 2];
    if (!Number.isFinite(E) || !Number.isFinite(N) || !Number.isFinite(H)) continue;
    const x = E - ORIGIN_E;
    const z = -(N - ORIGIN_N);
    const y = H - LAKE_ELEV_M;
    pts.push([x, y, z]);
  }
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.02) pts.pop();
  }
  const clean = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) > 0.05) clean.push(p);
  }
  return clean;
}

function makeGroupAcc(styleId) {
  return { styleId, pos: [], norm: [], uv: [], col: [] };
}

function pushTri(acc, p0, p1, p2, n, uv0, uv1, uv2, rgb) {
  acc.pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  acc.norm.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  acc.uv.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1]);
  acc.col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
}

function pushQuad(acc, p0, p1, p2, p3, n, rgb, uv0 = [0, 0], uv1 = [1, 0], uv2 = [1, 1], uv3 = [0, 1]) {
  pushTri(acc, p0, p1, p2, n, uv0, uv1, uv2, rgb);
  pushTri(acc, p0, p2, p3, n, uv0, uv2, uv3, rgb);
}

/**
 * Emits an oriented 3D box in an arbitrary local basis (origin, U, V, N) directly into a merged accumulator!
 * Used for 3D Bavarian balconies, geranium flower boxes, chimneys, timber barn doors, and roof fascia!
 */
function pushOrientedBox(acc, origin, uAxis, vAxis, nAxis, halfU, halfV, halfN, rgb) {
  const pt = (su, sv, sn) => [
    origin[0] + uAxis[0] * (su * halfU) + vAxis[0] * (sv * halfV) + nAxis[0] * (sn * halfN),
    origin[1] + uAxis[1] * (su * halfU) + vAxis[1] * (sv * halfV) + nAxis[1] * (sn * halfN),
    origin[2] + uAxis[2] * (su * halfU) + vAxis[2] * (sv * halfV) + nAxis[2] * (sn * halfN)
  ];
  const neg = (v) => [-v[0], -v[1], -v[2]];
  // +N front
  pushQuad(acc, pt(-1, -1, 1), pt(1, -1, 1), pt(1, 1, 1), pt(-1, 1, 1), nAxis, rgb);
  // -N back
  pushQuad(acc, pt(1, -1, -1), pt(-1, -1, -1), pt(-1, 1, -1), pt(1, 1, -1), neg(nAxis), rgb);
  // +U right
  pushQuad(acc, pt(1, -1, 1), pt(1, -1, -1), pt(1, 1, -1), pt(1, 1, 1), uAxis, rgb);
  // -U left
  pushQuad(acc, pt(-1, -1, -1), pt(-1, -1, 1), pt(-1, 1, 1), pt(-1, 1, -1), neg(uAxis), rgb);
  // +V top
  pushQuad(acc, pt(-1, 1, 1), pt(1, 1, 1), pt(1, 1, -1), pt(-1, 1, -1), vAxis, rgb);
  // -V bottom
  pushQuad(acc, pt(-1, -1, -1), pt(1, -1, -1), pt(1, -1, 1), pt(-1, -1, 1), neg(vAxis), rgb);
}

// Precomputed linear architectural trim palette
const COL_DARK_TIMBER = rgbToLinear([82, 51, 28]);
const COL_MED_TIMBER = rgbToLinear([118, 76, 42]);
const COL_BARN_DOOR = rgbToLinear([74, 46, 25]);
const COL_FASCIA = rgbToLinear([68, 43, 24]);
const COL_FOLIAGE = rgbToLinear([44, 102, 46]);
const COL_GERANIUM_RED = rgbToLinear([218, 46, 42]);
const COL_GERANIUM_PINK = rgbToLinear([224, 72, 98]);
const COL_CHIMNEY_BRICK = rgbToLinear([156, 76, 56]);
const COL_CHIMNEY_PLASTER = rgbToLinear([232, 224, 206]);
const COL_SLATE_CAP = rgbToLinear([62, 67, 72]);
const COL_PV_FRAME = rgbToLinear([166, 174, 182]);
const COL_PV_SURFACE = rgbToLinear([255, 255, 255]);

async function main() {
  const sampleDopColor = await loadDopSamplers();

  const churchSpot = muensingData.spots.muensingChurch;
  const altwirtSpot = muensingData.spots.muensingAltwirt;
  const schlossSpot = muensingData.spots.schlossAmmerland;
  const sebaldSpot = muensingData.spots.sebaldPier;

  // 11 merged mesh groups (all 1,690 buildings + 3D balconies, chimneys, barn doors, overhangs & solar panels in 11 draw calls!):
  // 0 = Einfirsthof A (cream render + horizontal larch upper)
  // 1 = Einfirsthof B (warm sand render + vertical dark timber upper)
  // 2 = Lüftlmalerei Bavarian Village House (ornamental painted window frames & frieze)
  // 3 = Full Timber Chalet / Bauernhaus (warm horizontal wood cladding)
  // 4 = Traditional Pastel Bavarian Village House (varied cream/yellow/peach/sage render + varied shutters)
  // 5 = Dark Weathered Vertical Timber Barn / Stadl
  // 6 = Modern Agricultural Machine Hall / Cattle Shed (ribbed steel cladding + skylight band)
  // 7 = Newer Contemporary Detached Home (clean render + modern anthracite windows + wood accent)
  // 8 = ALL Overhanging LoD2 Roofs (neutral clay tile texture x real DOP20 roof colors!)
  // 9 = 3D Architectural Trim (projecting balconies, geranium boxes, chimneys, barn doors, overhanging roof fascia!)
  // 10 = 3D Rooftop Solar Panel Arrays (glossy PV grid!)
  const groups = Array.from({ length: 11 }, (_, id) => makeGroupAcc(id));
  const colliders = [];

  // Rich per-building color variation so NO two neighbors look alike!
  const wallTints = {
    0: [[255, 252, 245], [248, 240, 224], [245, 232, 208], [250, 246, 236]],
    1: [[252, 246, 234], [244, 230, 204], [238, 224, 200], [248, 242, 228]],
    2: [[255, 248, 232], [252, 236, 202], [248, 230, 208], [244, 240, 222]],
    3: [[255, 248, 238], [236, 214, 190], [220, 198, 174], [244, 228, 206]],
    4: [[252, 244, 222], [246, 224, 186], [244, 218, 198], [228, 238, 224], [250, 248, 240], [238, 226, 208]],
    5: [[255, 250, 244], [232, 212, 192], [216, 194, 172], [242, 226, 210]],
    6: [[236, 242, 240], [214, 230, 218], [228, 226, 220], [222, 232, 238]],
    7: [[248, 246, 242], [236, 234, 228], [244, 236, 222], [228, 234, 238], [238, 230, 224]]
  };

  const gmlDir = path.resolve('data-cache/lod2');
  const gmlFiles = fs.readdirSync(gmlDir).filter((f) => f.endsWith('.gml')).sort();
  console.log('Compiling official Bavaria LoD2 CityGML files with 3D details:', gmlFiles);

  let totalParsed = 0;
  let totalKept = 0;
  let countBalconies = 0;
  let countChimneys = 0;
  let countSolar = 0;
  let countBarnDoors = 0;
  const styleCounts = Array(8).fill(0);

  const bldgRegex = /<bldg:Building\b[^>]*>([\s\S]*?)<\/bldg:Building>/g;
  const wallRegex = /<bldg:WallSurface\b[^>]*>([\s\S]*?)<\/bldg:WallSurface>/g;
  const roofRegex = /<bldg:RoofSurface\b[^>]*>([\s\S]*?)<\/bldg:RoofSurface>/g;
  const posListRegex = /<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g;

  for (const file of gmlFiles) {
    const xml = fs.readFileSync(path.join(gmlDir, file), 'utf8');
    let m;
    while ((m = bldgRegex.exec(xml)) !== null) {
      totalParsed++;
      const block = m[1];

      const fnMatch = block.match(/<bldg:function>([^<]+)<\/bldg:function>/);
      const rtMatch = block.match(/<bldg:roofType>([^<]+)<\/bldg:roofType>/);
      const hMatch = block.match(/<bldg:measuredHeight[^>]*>([^<]+)<\/bldg:measuredHeight>/);
      const fnCode = fnMatch ? fnMatch[1].trim() : '';
      const roofType = rtMatch ? rtMatch[1].trim() : '3100';
      const measuredH = hMatch ? parseFloat(hMatch[1]) : 6.0;

      const walls = [];
      let wm;
      wallRegex.lastIndex = 0;
      while ((wm = wallRegex.exec(block)) !== null) {
        posListRegex.lastIndex = 0;
        let pm;
        while ((pm = posListRegex.exec(wm[1])) !== null) {
          const ring = parsePosList(pm[1]);
          if (ring.length >= 3) walls.push(ring);
        }
      }

      const roofs = [];
      let rm;
      roofRegex.lastIndex = 0;
      while ((rm = roofRegex.exec(block)) !== null) {
        posListRegex.lastIndex = 0;
        let pm;
        while ((pm = posListRegex.exec(rm[1])) !== null) {
          const ring = parsePosList(pm[1]);
          if (ring.length >= 3) roofs.push(ring);
        }
      }

      if (walls.length === 0 || roofs.length === 0) continue;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const poly of [...walls, ...roofs]) {
        for (const [x, y, z] of poly) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      }

      const cx = (minX + maxX) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const bw = maxX - minX;
      const bd = maxZ - minZ;

      if (cx < WORLD_MIN_X + 20 || cx > WORLD_MAX_X - 20 || cz < WORLD_MIN_Z + 20 || cz > WORLD_MAX_Z - 20) continue;
      if (Math.hypot(cx - churchSpot[0], cz - churchSpot[1]) < 24) continue;
      if (Math.hypot(cx - altwirtSpot[0], cz - altwirtSpot[1]) < 18) continue;
      if (Math.hypot(cx - schlossSpot[0], cz - schlossSpot[1]) < 46) continue;
      if (Math.hypot(cx - sebaldSpot[0], cz - sebaldSpot[1]) < 18) continue;

      totalKept++;
      const hash = Math.abs(Math.round(cx * 31 + cz * 17) + totalKept * 13);
      const areaApprox = bw * bd;
      const aspect = Math.max(bw, bd) / Math.max(1, Math.min(bw, bd));

      // Rich classification across 8 distinct Bavarian architectural archetypes!
      let style = 4;
      const isAgriOrBarn = /272|270|274|276|246|252|2000/.test(fnCode);
      const isFlatOrShed = roofType === '1000' || roofType === '2100';
      const isRes = /1000|1010|1020|1100|1120|1130/.test(fnCode);

      if (isAgriOrBarn && (isFlatOrShed || areaApprox > 340)) {
        style = 6; // Modern machine hall / cattle shed
      } else if (isAgriOrBarn || (measuredH < 4.5 && areaApprox < 75 && !isRes)) {
        style = 5; // Traditional dark weathered vertical timber barn / Stadl
      } else if ((aspect >= 1.45 && areaApprox >= 135) || (areaApprox >= 220 && !isFlatOrShed)) {
        style = hash % 2 === 0 ? 0 : 1; // Classic Einfirsthof A or B
      } else if (isFlatOrShed || (areaApprox < 115 && hash % 4 === 0)) {
        style = 7; // Newer detached home
      } else {
        const pick = hash % 10;
        if (pick < 2) style = 0; // Einfirsthof A
        else if (pick < 3) style = 1; // Einfirsthof B
        else if (pick < 5) style = 2; // Lüftlmalerei house
        else if (pick < 7) style = 3; // Full timber chalet / Bauernhaus
        else if (pick < 9) style = 4; // Pastel Bavarian village house
        else style = 7; // Newer detached home
      }
      styleCounts[style]++;

      const terrainY = sampleDgm1TerrainY(cx, cz);
      const yShift = terrainY - minY;
      const baseH = Math.max(3.2, maxY - minY);

      const wallAcc = groups[style];
      const roofAcc = groups[8];
      const trimAcc = groups[9];
      const pvAcc = groups[10];

      const tints = wallTints[style];
      const wallRgb = rgbToLinear(tints[hash % tints.length]);
      const uShift = ((hash % 7) * 0.143); // Per-building horizontal UV phase offset so adjacent windows never align!

      let roofRgbRaw = sampleDopColor(cx, cz);
      if (style === 6) {
        roofRgbRaw = [
          Math.round(roofRgbRaw[0] * 0.35 + 102 * 0.65),
          Math.round(roofRgbRaw[1] * 0.35 + 110 * 0.65),
          Math.round(roofRgbRaw[2] * 0.35 + 112 * 0.65)
        ];
      }
      const roofRgb = rgbToLinear(roofRgbRaw);

      // 1. Emit triangulated LoD2 WallSurfaces & track candidate walls for 3D balconies & 3D barn doors!
      const emittedWallPts = [];
      const wallInfos = [];
      for (const ring of walls) {
        const shifted = ring.map(([x, y, z]) => {
          const sy = y + yShift;
          const isBottom = Math.abs(y - minY) < 0.45;
          return [x, isBottom ? sy - 1.4 : sy, z];
        });
        const n = computeNewellNormal(shifted);
        if (!n) continue;

        let rcx = 0, rcz = 0;
        for (const p of shifted) {
          rcx += p[0];
          rcz += p[2];
        }
        rcx /= shifted.length;
        rcz /= shifted.length;
        const dotOut = n[0] * (rcx - cx) + n[2] * (rcz - cz);
        const oriented = dotOut < 0 ? [...shifted].reverse() : shifted;
        const outN = dotOut < 0 ? [-n[0], -n[1], -n[2]] : n;

        const tx = -outN[2];
        const tz = outN[0];
        const tLen = Math.hypot(tx, tz) || 1;
        const ux = tx / tLen;
        const uz = tz / tLen;

        const poly2 = oriented.map((p) => [(p[0] - rcx) * ux + (p[2] - rcz) * uz, p[1]]);
        let wMinU = Infinity, wMaxU = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
        for (const [pu, py] of poly2) {
          if (pu < wMinU) wMinU = pu;
          if (pu > wMaxU) wMaxU = pu;
          if (py < wMinY) wMinY = py;
          if (py > wMaxY) wMaxY = py;
        }
        const wallLen = wMaxU - wMinU;
        const wallH = wMaxY - terrainY;
        const wallMidU = (wMinU + wMaxU) * 0.5;
        const wallTouchesGround = wMinY <= terrainY + 0.35;
        wallInfos.push({
          cx: rcx + ux * wallMidU,
          cz: rcz + uz * wallMidU,
          ux,
          uz,
          nx: outN[0],
          nz: outN[2],
          len: wallLen,
          h: wallH,
          grounded: wallTouchesGround
        });

        const tris = triangulate2D(poly2);
        const uvBaseY = terrainY - 0.1;
        const uvHorizDiv = style === 5 ? 8.2 : style === 6 ? 10.5 : 9.2 + (hash % 3) * 0.7;

        for (const [i0, i1, i2] of tris) {
          const p0 = oriented[i0];
          const p1 = oriented[i1];
          const p2 = oriented[i2];
          const uv0 = [poly2[i0][0] / uvHorizDiv + uShift, Math.max(0, Math.min(1, (p0[1] - uvBaseY) / Math.max(4.8, baseH * 0.88)))];
          const uv1 = [poly2[i1][0] / uvHorizDiv + uShift, Math.max(0, Math.min(1, (p1[1] - uvBaseY) / Math.max(4.8, baseH * 0.88)))];
          const uv2 = [poly2[i2][0] / uvHorizDiv + uShift, Math.max(0, Math.min(1, (p2[1] - uvBaseY) / Math.max(4.8, baseH * 0.88)))];
          pushTri(wallAcc, p0, p1, p2, outN, uv0, uv1, uv2, wallRgb);
          emittedWallPts.push(p0, p1, p2);
        }
      }

      // 2. Grounded LoD2 RoofSurfaces WITH real 3D Bavarian roof overhangs (+0.52m eaves/gables) & dark timber fascia!
      const validRoofs = [];
      const vertexRoofCount = new Map();
      const vKey = (p) => `${Math.round(p[0] * 2)}_${Math.round(p[1] * 2)}_${Math.round(p[2] * 2)}`;

      for (const ring of roofs) {
        const shifted = ring.map(([x, y, z]) => [x, y + yShift + 0.03, z]);
        let touching = 0;
        for (const rp of shifted) {
          for (let wi = 0; wi < emittedWallPts.length; wi++) {
            const wp = emittedWallPts[wi];
            const dx = rp[0] - wp[0];
            const dy = rp[1] - wp[1];
            const dz = rp[2] - wp[2];
            if (dx * dx + dy * dy + dz * dz < 1.2) {
              touching++;
              break;
            }
          }
          if (touching >= 2) break;
        }
        if (touching < 2) continue;
        const n = computeNewellNormal(shifted);
        if (!n) continue;
        const oriented = n[1] < 0 ? [...shifted].reverse() : shifted;
        const outN = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
        validRoofs.push({ pts: oriented, outN });
        for (const p of oriented) {
          const k = vKey(p);
          vertexRoofCount.set(k, (vertexRoofCount.get(k) || 0) + 1);
        }
      }

      const roofMaxY = maxY + yShift;
      const overhangAmt = isFlatOrShed ? 0.28 : style <= 3 ? 0.62 : 0.45;
      let bestSolarCandidate = null;
      let highestRoofPt = null;

      for (const rf of validRoofs) {
        const { pts, outN } = rf;
        const isSloped = outN[1] < 0.985 && outN[1] > 0.35;

        // Expand outer eave/gable vertices smoothly along the exact roof plane (watertight ridges!)
        const expanded = pts.map((p) => {
          if (!highestRoofPt || p[1] > highestRoofPt[1]) highestRoofPt = p;
          const shared = (vertexRoofCount.get(vKey(p)) || 1) >= 2;
          const vx = p[0] - cx;
          const vz = p[2] - cz;
          const vLen = Math.hypot(vx, vz);
          if (vLen < 0.5) return p;

          let ox = 0;
          let oz = 0;
          if (!shared) {
            // Outer eave vertex: push outward radially from building center
            ox = (vx / vLen) * overhangAmt;
            oz = (vz / vLen) * overhangAmt;
          } else if (isSloped) {
            // Shared ridge vertex at a gable end: push ONLY along the horizontal ridge axis (perp to outN.xz) so both slopes stay joined!
            const hLen = Math.hypot(outN[0], outN[2]);
            if (hLen > 0.05) {
              const rx = -outN[2] / hLen;
              const rz = outN[0] / hLen;
              const proj = vx * rx + vz * rz;
              if (Math.abs(proj) > 1.2) {
                const sgn = proj >= 0 ? 1 : -1;
                ox = rx * sgn * (overhangAmt * 0.78);
                oz = rz * sgn * (overhangAmt * 0.78);
              }
            }
          }
          // Slide smoothly along the exact roof plane so slope angle is 100% preserved!
          const dy = outN[1] > 0.35 ? -(outN[0] * ox + outN[2] * oz) / outN[1] : 0;
          return [p[0] + ox, p[1] + dy, p[2] + oz];
        });

        const poly2 = expanded.map((p) => [p[0], -p[2]]);
        const tris = triangulate2D(poly2);
        for (const [i0, i1, i2] of tris) {
          const p0 = expanded[i0];
          const p1 = expanded[i1];
          const p2 = expanded[i2];
          const uv0 = [p0[0] / 3.8, p0[2] / 3.8];
          const uv1 = [p1[0] / 3.8, p1[2] / 3.8];
          const uv2 = [p2[0] / 3.8, p2[2] / 3.8];
          pushTri(roofAcc, p0, p1, p2, outN, uv0, uv1, uv2, roofRgb);
        }

        // Emit crisp dark-timber roof overhang fascia / bargeboard rim along outer roof edges!
        const fasciaH = isFlatOrShed ? 0.22 : 0.24;
        for (let i = 0; i < expanded.length; i++) {
          const aOrig = pts[i];
          const bOrig = pts[(i + 1) % pts.length];
          const aShared = (vertexRoofCount.get(vKey(aOrig)) || 1) >= 2;
          const bShared = (vertexRoofCount.get(vKey(bOrig)) || 1) >= 2;
          if (aShared && bShared) continue; // Skip interior ridge line!
          const a = expanded[i];
          const b = expanded[(i + 1) % expanded.length];
          const ex = b[0] - a[0];
          const ez = b[2] - a[2];
          const elen = Math.hypot(ex, ez);
          if (elen < 1.0) continue;
          let fnx = -ez / elen;
          let fnz = ex / elen;
          const midx = (a[0] + b[0]) * 0.5;
          const midz = (a[2] + b[2]) * 0.5;
          if (fnx * (midx - cx) + fnz * (midz - cz) < 0) {
            fnx = -fnx;
            fnz = -fnz;
          }
          const aBot = [a[0], a[1] - fasciaH, a[2]];
          const bBot = [b[0], b[1] - fasciaH, b[2]];
          pushQuad(trimAcc, aBot, bBot, b, a, [fnx, 0, fnz], COL_FASCIA);
        }

        // Track best sunny sloped roof face for optional 3D PV solar panels!
        if (outN[1] > 0.65 && outN[1] < 0.96 && outN[2] >= -0.25 && pts.length >= 4) {
          let rcx = 0, rcy = 0, rcz = 0;
          for (const p of pts) {
            rcx += p[0];
            rcy += p[1];
            rcz += p[2];
          }
          rcx /= pts.length;
          rcy /= pts.length;
          rcz /= pts.length;
          // Local roof slope axes: u = horizontal along eave, v = up the slope
          const hLen = Math.hypot(outN[0], outN[2]);
          if (hLen > 0.08) {
            const uAxis = [-outN[2] / hLen, 0, outN[0] / hLen];
            // vAxis = cross(outN, uAxis) pointing upslope
            let vAxis = [
              outN[1] * uAxis[2] - outN[2] * uAxis[1],
              outN[2] * uAxis[0] - outN[0] * uAxis[2],
              outN[0] * uAxis[1] - outN[1] * uAxis[0]
            ];
            if (vAxis[1] < 0) vAxis = [-vAxis[0], -vAxis[1], -vAxis[2]];
            const vLen = Math.hypot(vAxis[0], vAxis[1], vAxis[2]) || 1;
            vAxis = [vAxis[0] / vLen, vAxis[1] / vLen, vAxis[2] / vLen];

            const roofLocal2D = pts.map((p) => {
              const dx = p[0] - rcx, dy = p[1] - rcy, dz = p[2] - rcz;
              return [dx * uAxis[0] + dy * uAxis[1] + dz * uAxis[2], dx * vAxis[0] + dy * vAxis[1] + dz * vAxis[2]];
            });
            let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
            for (const [lu, lv] of roofLocal2D) {
              if (lu < minU) minU = lu;
              if (lu > maxU) maxU = lu;
              if (lv < minV) minV = lv;
              if (lv > maxV) maxV = lv;
            }
            const spanU = maxU - minU;
            const spanV = maxV - minV;
            const area = spanU * spanV;
            if (spanU >= 5.2 && spanV >= 3.2 && (!bestSolarCandidate || area > bestSolarCandidate.area)) {
              bestSolarCandidate = { area, center: [rcx, rcy, rcz], uAxis, vAxis, outN, spanU, spanV, poly2D: roofLocal2D };
            }
          }
        }
      }

      // 3. REAL 3D PROJECTING BAVARIAN WOODEN BALCONIES + RED/PINK GERANIUM FLOWER BOXES!
      let balconyWallIdx = -1;
      const wantsBalcony =
        (style === 0 && hash % 10 < 8) ||
        (style === 1 && hash % 10 < 7) ||
        (style === 2 && hash % 10 < 5) ||
        (style === 3 && hash % 10 < 6) ||
        (style === 4 && hash % 10 < 3);

      if (wantsBalcony && baseH >= 5.6 && wallInfos.length > 0) {
        let bestIdx = -1;
        let bestScore = 0;
        wallInfos.forEach((wi, idx) => {
          // Only mount balconies on full-height grounded main walls (never floating off dormers or low carports!)
          if (wi.grounded && wi.len >= 6.4 && wi.h >= 5.4) {
            const sunnyBonus = wi.nz > -0.3 ? 1.25 : 0.85;
            const score = wi.len * sunnyBonus;
            if (score > bestScore) {
              bestScore = score;
              bestIdx = idx;
            }
          }
        });
        if (bestIdx >= 0) {
          balconyWallIdx = bestIdx;
          const w = wallInfos[bestIdx];
          const bLen = Math.min(w.len * 0.56, 7.6);
          const bDepth = 1.05;
          const bY = terrainY + Math.min(3.55, Math.max(2.9, w.h * 0.42));
          const uA = [w.ux, 0, w.uz];
          const vA = [0, 1, 0];
          const nA = [w.nx, 0, w.nz];
          // Floor slab + front railing + continuous geranium planter strip (crisp silhouette, lean triangle budget!)
          const deckOrigin = [w.cx + w.nx * (bDepth * 0.5 + 0.04), bY, w.cz + w.nz * (bDepth * 0.5 + 0.04)];
          pushOrientedBox(trimAcc, deckOrigin, uA, vA, nA, bLen * 0.5, 0.1, bDepth * 0.5, COL_DARK_TIMBER);
          const frontRailOrigin = [w.cx + w.nx * (bDepth - 0.02), bY + 0.52, w.cz + w.nz * (bDepth - 0.02)];
          pushOrientedBox(trimAcc, frontRailOrigin, uA, vA, nA, bLen * 0.5, 0.38, 0.06, COL_MED_TIMBER);
          const topCapOrigin = [w.cx + w.nx * (bDepth - 0.02), bY + 0.94, w.cz + w.nz * (bDepth - 0.02)];
          pushOrientedBox(trimAcc, topCapOrigin, uA, vA, nA, bLen * 0.52, 0.06, 0.09, COL_DARK_TIMBER);
          for (const side of [-1, 1]) {
            const sideOrigin = [
              w.cx + w.ux * (side * (bLen * 0.5 - 0.05)) + w.nx * (bDepth * 0.5 + 0.02),
              bY + 0.52,
              w.cz + w.uz * (side * (bLen * 0.5 - 0.05)) + w.nz * (bDepth * 0.5 + 0.02)
            ];
            pushOrientedBox(trimAcc, sideOrigin, uA, vA, nA, 0.05, 0.38, bDepth * 0.46, COL_MED_TIMBER);
          }
          // Lush Bavarian geranium flower boxes mounted cleanly outside the front rail
          const boxCount = bLen > 5.2 ? 3 : 2;
          const flowerCol = hash % 3 === 0 ? COL_GERANIUM_PINK : COL_GERANIUM_RED;
          for (let fi = 0; fi < boxCount; fi++) {
            const uOff = ((fi + 0.5) / boxCount - 0.5) * (bLen * 0.78);
            const fOrigin = [
              w.cx + w.ux * uOff + w.nx * (bDepth + 0.14),
              bY + 0.96,
              w.cz + w.uz * uOff + w.nz * (bDepth + 0.14)
            ];
            pushOrientedBox(trimAcc, fOrigin, uA, vA, nA, 0.56, 0.11, 0.12, COL_FOLIAGE);
            pushOrientedBox(trimAcc, [fOrigin[0], fOrigin[1] + 0.14, fOrigin[2]], uA, vA, nA, 0.48, 0.09, 0.11, flowerCol);
          }
          countBalconies++;
        }
      }

      // 4. REAL 3D FRAMED DOUBLE WOODEN BARN DOORS on Timber Barns & large Einfirsthof agricultural ends!
      if ((style === 5 || ((style === 0 || style === 1) && areaApprox >= 180)) && wallInfos.length > 0 && hash % 10 < 7) {
        let doorIdx = -1;
        let bestLen = 0;
        wallInfos.forEach((wi, idx) => {
          if (idx === balconyWallIdx) return;
          if (wi.grounded && wi.len >= 5.6 && wi.h >= 3.8 && wi.len > bestLen) {
            bestLen = wi.len;
            doorIdx = idx;
          }
        });
        if (doorIdx >= 0) {
          const w = wallInfos[doorIdx];
          const uA = [w.ux, 0, w.uz];
          const vA = [0, 1, 0];
          const nA = [w.nx, 0, w.nz];
          const dW = Math.min(3.4, w.len * 0.42);
          const dH = Math.min(3.15, w.h * 0.64);
          // Offset cleanly proud of wall (+0.11m center, 0.06m half-depth -> front +0.17m, back +0.05m: zero z-fighting!)
          const dOrigin = [w.cx + w.nx * 0.11, terrainY + dH * 0.5, w.cz + w.nz * 0.11];
          pushOrientedBox(trimAcc, dOrigin, uA, vA, nA, dW * 0.5, dH * 0.5, 0.06, COL_BARN_DOOR);
          pushOrientedBox(trimAcc, [w.cx + w.nx * 0.16, terrainY + dH + 0.12, w.cz + w.nz * 0.16], uA, vA, nA, dW * 0.58, 0.13, 0.12, COL_DARK_TIMBER);
          countBarnDoors++;
        }
      }

      // 5. REAL 3D CHIMNEYS (Kamin) on residential houses & farmhouses!
      if (style !== 5 && style !== 6 && highestRoofPt && baseH >= 4.6 && hash % 10 < 7) {
        // Pull chimney slightly inward from the highest roof vertex toward building centroid so it never hangs off a gable edge
        const chX = highestRoofPt[0] * 0.72 + cx * 0.28;
        const chZ = highestRoofPt[2] * 0.72 + cz * 0.28;
        const chTopY = roofMaxY + 1.05;
        const chH = 2.4;
        const chCol = hash % 3 === 0 ? COL_CHIMNEY_BRICK : COL_CHIMNEY_PLASTER;
        pushOrientedBox(trimAcc, [chX, chTopY - chH * 0.5, chZ], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.36, chH * 0.5, 0.36, chCol);
        pushOrientedBox(trimAcc, [chX, chTopY + 0.07, chZ], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.45, 0.08, 0.45, COL_SLATE_CAP);
        countChimneys++;
      }

      // 6. REAL 3D ROOFTOP SOLAR PANEL ARRAYS (Photovoltaik) on ~30% of sunny sloped Bavarian roofs!
      const wantsSolar = bestSolarCandidate && ((style === 6 && hash % 10 < 5) || (style <= 4 && hash % 10 < 3) || (style === 7 && hash % 10 < 4));
      if (wantsSolar && bestSolarCandidate) {
        const sc = bestSolarCandidate;
        const pW = Math.min(sc.spanU * 0.58, 9.2);
        const pH = Math.min(sc.spanV * 0.52, 3.4);
        const halfU = pW * 0.5;
        const halfV = pH * 0.5;
        // Verify all 4 corners lie cleanly inside the roof polygon (zero overhang into thin air!)
        const cornersOk =
          pointInPoly2D(-halfU, -halfV, sc.poly2D) &&
          pointInPoly2D(halfU, -halfV, sc.poly2D) &&
          pointInPoly2D(halfU, halfV, sc.poly2D) &&
          pointInPoly2D(-halfU, halfV, sc.poly2D);
        if (cornersOk && pW >= 2.8 && pH >= 1.5) {
          const lift = 0.14;
          const cPos = [
            sc.center[0] + sc.outN[0] * lift,
            sc.center[1] + sc.outN[1] * lift,
            sc.center[2] + sc.outN[2] * lift
          ];
          // Aluminum racking frame backing
          pushOrientedBox(trimAcc, cPos, sc.uAxis, sc.vAxis, sc.outN, halfU + 0.06, halfV + 0.06, 0.05, COL_PV_FRAME);
          // Crisp glossy blue PV panel face slightly above frame
          const pvLift = 0.21;
          const pt = (su, sv) => [
            sc.center[0] + sc.uAxis[0] * (su * halfU) + sc.vAxis[0] * (sv * halfV) + sc.outN[0] * pvLift,
            sc.center[1] + sc.uAxis[1] * (su * halfU) + sc.vAxis[1] * (sv * halfV) + sc.outN[1] * pvLift,
            sc.center[2] + sc.uAxis[2] * (su * halfU) + sc.vAxis[2] * (sv * halfV) + sc.outN[2] * pvLift
          ];
          const uTile = Math.max(1, Math.round(pW / 1.4));
          const vTile = Math.max(1, Math.round(pH / 1.2));
          pushQuad(
            pvAcc,
            pt(-1, -1),
            pt(1, -1),
            pt(1, 1),
            pt(-1, 1),
            sc.outN,
            COL_PV_SURFACE,
            [0, 0],
            [uTile, 0],
            [uTile, vTile],
            [0, vTile]
          );
          countSolar++;
        }
      }

      // Compact AABB physics collider for village hubs & major roads
      const nearHub =
        Math.hypot(cx - altwirtSpot[0], cz - altwirtSpot[1]) < 260 ||
        Math.hypot(cx - muensingData.spots.wimpasing[0], cz - muensingData.spots.wimpasing[1]) < 220 ||
        Math.hypot(cx - sebaldSpot[0], cz - sebaldSpot[1]) < 240 ||
        Math.hypot(cx - muensingData.spots.weipertshausen[0], cz - muensingData.spots.weipertshausen[1]) < 180 ||
        Math.hypot(cx - muensingData.spots.ried[0], cz - muensingData.spots.ried[1]) < 160;
      if (nearHub && bw > 3.5 && bd > 3.5 && bw < 65 && bd < 65) {
        colliders.push([
          Math.round(cx * 10) / 10,
          Math.round((terrainY + baseH * 0.45) * 10) / 10,
          Math.round(cz * 10) / 10,
          Math.round(bw * 0.86 * 10) / 10,
          Math.round(baseH * 10) / 10,
          Math.round(bd * 0.86 * 10) / 10
        ]);
      }
    }
  }

  // Pack all 11 merged groups into ONE compact binary file: public/map/lod2_buildings.bin
  const chunks = [];
  const header = Buffer.alloc(8);
  header.write('LOD2', 0, 4, 'ascii');
  header.writeUInt32LE(groups.length, 4);
  chunks.push(header);

  let totalTris = 0;
  for (const g of groups) {
    const vCount = g.pos.length / 3;
    totalTris += vCount / 3;
    const gHead = Buffer.alloc(8);
    gHead.writeUInt32LE(g.styleId, 0);
    gHead.writeUInt32LE(vCount, 4);
    const posBuf = Buffer.from(new Float32Array(g.pos).buffer);
    const normBuf = Buffer.from(new Float32Array(g.norm).buffer);
    const uvBuf = Buffer.from(new Float32Array(g.uv).buffer);
    const colRaw = new Uint8Array(g.col);
    const padLen = (4 - (colRaw.length % 4)) % 4;
    const colBuf = Buffer.concat([Buffer.from(colRaw.buffer), Buffer.alloc(padLen)]);
    chunks.push(gHead, posBuf, normBuf, uvBuf, colBuf);
  }

  const zbinPath = path.resolve('public/map/lod2_buildings.zbin');
  const fullBuf = Buffer.concat(chunks);
  const gzBuf = zlib.gzipSync(fullBuf, { level: 9 });
  fs.writeFileSync(zbinPath, gzBuf);
  const oldBin = path.resolve('public/map/lod2_buildings.bin');
  if (fs.existsSync(oldBin)) fs.unlinkSync(oldBin);

  const colPath = path.resolve('public/map/lod2_colliders.json');
  fs.writeFileSync(colPath, JSON.stringify(colliders));

  console.log('Compiled enriched Bavaria LoD2 3D buildings!', {
    totalParsed,
    totalKept,
    styles: {
      einfirsthof_a: styleCounts[0],
      einfirsthof_b: styleCounts[1],
      lueftlmalerei: styleCounts[2],
      timber_chalet: styleCounts[3],
      village_house: styleCounts[4],
      timber_barn: styleCounts[5],
      machine_hall: styleCounts[6],
      detached_modern: styleCounts[7]
    },
    details3D: {
      balconies: countBalconies,
      chimneys: countChimneys,
      solarArrays: countSolar,
      barnDoors: countBarnDoors
    },
    totalTriangles: Math.round(totalTris),
    colliders: colliders.length,
    rawKB: Math.round(fullBuf.length / 1024),
    zbinKB: Math.round(gzBuf.length / 1024),
    collidersKB: Math.round(fs.statSync(colPath).size / 1024)
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
