import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { LAKE_ELEV_M, MAX_E, MAX_N, MIN_E, MIN_N, ORIGIN_E, ORIGIN_N } from './build-bavaria-terrain.mjs';

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

// Load our 4 DOP20 aerial tiles into raw RGB buffers so we can sample every building's REAL roof color!
async function loadDopSamplers() {
  const names = ['dop_nw.jpg', 'dop_ne.jpg', 'dop_sw.jpg', 'dop_se.jpg'];
  const quads = {};
  for (const name of names) {
    const img = sharp(path.resolve('public/map', name));
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

    // Average 5x5 roof pixel patch for natural non-noisy color!
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

    // Guard against overhanging tree foliage or deep cast shadow on the aerial photo:
    const isFoliage = g > r * 1.06 && g > b * 1.1;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (isFoliage || lum < 45) {
      return [158, 62, 40]; // Classic Bavarian red-brown clay tiles
    }
    // Gently enrich roof color saturation (aerial photos are slightly hazy/desaturated) while keeping real per-roof variety!
    const avg = (r + g + b) / 3;
    const sat = 1.38;
    let rr = avg + (r - avg) * sat;
    let gg = avg + (g - avg) * sat;
    let bb = avg + (b - avg) * sat;
    // Slight warm red-brown clay bias for neutral-ish roofs so Bavaria reads warm & red-roofed, not washed-out grey
    if (Math.abs(rr - gg) < 14 && lum > 95 && lum < 175) {
      rr *= 1.14;
      gg *= 0.88;
      bb *= 0.78;
    }
    return [
      Math.max(38, Math.min(210, Math.round(rr))),
      Math.max(32, Math.min(185, Math.round(gg))),
      Math.max(28, Math.min(180, Math.round(bb)))
    ];
  };
}

// Convert sRGB [0..255] -> Linear [0..255] because Three.js vertex color BufferAttributes are linear!
function srgbToLinearByte(c) {
  const s = Math.max(0, Math.min(1, c / 255));
  const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  return Math.round(lin * 255);
}

function rgbToLinear(rgb) {
  return [srgbToLinearByte(rgb[0]), srgbToLinearByte(rgb[1]), srgbToLinearByte(rgb[2])];
}

// Compute polygon Newell normal in Three.js world space (x, y, z)
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

// Ear-clipping triangulation of a simple 2D polygon (handles convex & concave L/T Bavarian walls/roofs!)
function triangulate2D(poly2) {
  const n = poly2.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  // Ensure CCW winding in 2D
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
      // Fallback fan for nearly-collinear degenerate polygons
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
  // Drop closing duplicate vertex
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.02) pts.pop();
  }
  // Remove consecutive near-duplicate vertices
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

async function main() {
  const sampleDopColor = await loadDopSamplers();

  const farmSpot = muensingData.spots.farm;
  const churchSpot = muensingData.spots.muensingChurch;
  const altwirtSpot = muensingData.spots.muensingAltwirt;
  const schlossSpot = muensingData.spots.schlossAmmerland;
  const sebaldSpot = muensingData.spots.sebaldPier;

  // 6 merged mesh groups:
  // 0 = Einfirsthof walls, 1 = Village house walls, 2 = Timber barn/Stadl walls,
  // 3 = Modern machine hall / cattle shed walls, 4 = Newer detached home walls,
  // 5 = ALL Roofs (vertex-colored directly from real Bavaria DOP20 aerial orthophotos!)
  const groups = [0, 1, 2, 3, 4, 5].map((id) => makeGroupAcc(id));
  const colliders = [];

  // Subtle per-building wall color variation so NO two neighbors look identical!
  const wallTints = {
    0: [[255, 255, 255], [248, 240, 226], [245, 234, 214], [252, 248, 238]],
    1: [[252, 245, 232], [246, 229, 198], [242, 220, 192], [238, 232, 218]],
    2: [[255, 255, 255], [234, 214, 194], [218, 196, 174], [242, 226, 210]],
    3: [[235, 240, 242], [220, 232, 224], [228, 228, 224]],
    4: [[246, 244, 238], [236, 234, 228], [244, 238, 226], [232, 236, 238]]
  };

  const gmlDir = path.resolve('data-cache/lod2');
  const gmlFiles = fs.readdirSync(gmlDir).filter((f) => f.endsWith('.gml')).sort();
  console.log('Compiling official Bavaria LoD2 CityGML files:', gmlFiles);

  let totalParsed = 0;
  let totalKept = 0;
  const styleCounts = [0, 0, 0, 0, 0];

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

      // Bounding box & centroid in 1:1 world meters
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

      // Keep only buildings inside our 3.8 km x 2.9 km playable world
      if (cx < WORLD_MIN_X + 20 || cx > WORLD_MAX_X - 20 || cz < WORLD_MIN_Z + 20 || cz > WORLD_MAX_Z - 20) continue;
      // Keep ALL real Home Farm LoD2 buildings intact! Skip only our 4 custom hero landmark footprints (zero z-fighting/doubles)
      if (Math.hypot(cx - churchSpot[0], cz - churchSpot[1]) < 24) continue;
      if (Math.hypot(cx - altwirtSpot[0], cz - altwirtSpot[1]) < 18) continue;
      if (Math.hypot(cx - schlossSpot[0], cz - schlossSpot[1]) < 46) continue;
      if (Math.hypot(cx - sebaldSpot[0], cz - sebaldSpot[1]) < 18) continue;

      totalKept++;
      const areaApprox = bw * bd;
      const aspect = Math.max(bw, bd) / Math.max(1, Math.min(bw, bd));

      // Classify building into our 5 Upper Bavarian architectural styles using official ALKIS function + roofType + size!
      let style = 1; // Default: Village House
      const isAgriOrBarn = /272|270|274|276|246|252|2000/.test(fnCode);
      const isFlatOrShed = roofType === '1000' || roofType === '2100';
      const isRes = /1000|1010|1020|1100|1120|1130/.test(fnCode);

      if (isAgriOrBarn && (isFlatOrShed || areaApprox > 340)) {
        style = 3; // Modern machine hall / cattle shed (steel cladding + translucent strip!)
      } else if (isAgriOrBarn || (measuredH < 4.4 && areaApprox < 70 && !isRes)) {
        style = 2; // Traditional dark weathered vertical timber barn / Stadl
      } else if ((aspect >= 1.45 && areaApprox >= 135) || (areaApprox >= 220 && !isFlatOrShed)) {
        style = 0; // Classic Upper Bavarian Einfirsthof (white plaster lower + dark brown timber upper & balcony!)
      } else if (isFlatOrShed || (areaApprox < 120 && totalKept % 3 === 0)) {
        style = 4; // Newer detached home
      } else {
        style = totalKept % 5 < 2 ? 0 : 1; // Rich mix of brown-timber Einfirsthöfe & Bavarian village homes!
      }
      styleCounts[style]++;

      // Snap cleanly onto our road-graded DGM1 terrain (prevents any floating or buried foundation!)
      const terrainY = sampleDgm1TerrainY(cx, cz);
      const yShift = terrainY - minY;
      const baseH = Math.max(3.2, maxY - minY);

      const wallAcc = groups[style];
      const roofAcc = groups[5];
      const tints = wallTints[style];
      const wallRgb = rgbToLinear(tints[totalKept % tints.length]);

      // Sample REAL roof color directly from the 20cm Bavaria DOP20 aerial photo & convert sRGB -> Linear for Three.js!
      let roofRgbRaw = sampleDopColor(cx, cz);
      if (style === 3) {
        roofRgbRaw = [
          Math.round(roofRgbRaw[0] * 0.4 + 108 * 0.6),
          Math.round(roofRgbRaw[1] * 0.4 + 115 * 0.6),
          Math.round(roofRgbRaw[2] * 0.4 + 118 * 0.6)
        ];
      }
      const roofRgb = rgbToLinear(roofRgbRaw);

      // 1. Emit triangulated LoD2 WallSurfaces with foundation skirt (-1.4m) & height-aligned UVs!
      const emittedWallPts = [];
      for (const ring of walls) {
        const shifted = ring.map(([x, y, z]) => {
          const sy = y + yShift;
          // Push bottom wall vertices down 1.4m into terrain so sloped lots never show gaps!
          const isBottom = Math.abs(y - minY) < 0.45;
          return [x, isBottom ? sy - 1.4 : sy, z];
        });
        const n = computeNewellNormal(shifted);
        if (!n) continue;

        // Ensure outward normal (pointing away from building centroid)
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

        // Horizontal tangent along wall face for crisp 1:1 window & timber plank UV tiling
        const tx = -outN[2];
        const tz = outN[0];
        const tLen = Math.hypot(tx, tz) || 1;
        const ux = tx / tLen;
        const uz = tz / tLen;

        const poly2 = oriented.map((p) => [(p[0] - rcx) * ux + (p[2] - rcz) * uz, p[1]]);
        const tris = triangulate2D(poly2);
        const uvBaseY = terrainY - 0.1;

        for (const [i0, i1, i2] of tris) {
          const p0 = oriented[i0];
          const p1 = oriented[i1];
          const p2 = oriented[i2];
          const uv0 = [poly2[i0][0] / 9.5, Math.max(0, Math.min(1, (p0[1] - uvBaseY) / Math.max(4.8, baseH * 0.88)))];
          const uv1 = [poly2[i1][0] / 9.5, Math.max(0, Math.min(1, (p1[1] - uvBaseY) / Math.max(4.8, baseH * 0.88)))];
          const uv2 = [poly2[i2][0] / 9.5, Math.max(0, Math.min(1, (p2[1] - uvBaseY) / Math.max(4.8, baseH * 0.88)))];
          pushTri(wallAcc, p0, p1, p2, outN, uv0, uv1, uv2, wallRgb);
          emittedWallPts.push(p0, p1, p2);
        }
      }

      // 2. Emit triangulated LoD2 RoofSurfaces ONLY when grounded on actual emitted wall vertices (zero floating turret caps!)
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
        // Roofs always face upward (n.y >= 0)
        const oriented = n[1] < 0 ? [...shifted].reverse() : shifted;
        const outN = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;

        // Project onto plane perpendicular to outN (or XZ directly since roofs are non-vertical!)
        const poly2 = oriented.map((p) => [p[0], -p[2]]);
        const tris = triangulate2D(poly2);
        for (const [i0, i1, i2] of tris) {
          const p0 = oriented[i0];
          const p1 = oriented[i1];
          const p2 = oriented[i2];
          const uv0 = [p0[0] / 4.2, p0[2] / 4.2];
          const uv1 = [p1[0] / 4.2, p1[2] / 4.2];
          const uv2 = [p2[0] / 4.2, p2[2] / 4.2];
          pushTri(roofAcc, p0, p1, p2, outN, uv0, uv1, uv2, roofRgb);
        }
      }

      // Compact AABB physics collider for village hubs & major roads (keeps physics snappy at 60 FPS!)
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

  // Pack all 6 merged groups into ONE compact binary file: public/map/lod2_buildings.bin
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

  const binPath = path.resolve('public/map/lod2_buildings.bin');
  const fullBuf = Buffer.concat(chunks);
  fs.writeFileSync(binPath, fullBuf);

  const colPath = path.resolve('public/map/lod2_colliders.json');
  fs.writeFileSync(colPath, JSON.stringify(colliders));

  console.log('Compiled Bavaria official LoD2 CityGML 3D buildings!', {
    totalParsed,
    totalKept,
    styleCounts: {
      einfirsthof: styleCounts[0],
      village: styleCounts[1],
      timber_barn: styleCounts[2],
      machine_hall: styleCounts[3],
      detached_home: styleCounts[4]
    },
    totalTriangles: Math.round(totalTris),
    colliders: colliders.length,
    binKB: Math.round(fullBuf.length / 1024),
    collidersKB: Math.round(fs.statSync(colPath).size / 1024)
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
