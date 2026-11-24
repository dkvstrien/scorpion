import fs from 'node:fs';
import path from 'node:path';
import { fromFile } from 'geotiff';

// === TRUE 1:1 METRIC UTM ZONE 32N (EPSG:25832) PLAYABLE AREA ===
// Covers Starnberger See eastern shore (Schloss Ammerland & Fischerei Sebald) -> Wimpasing -> Ried ->
// Münsing (Pfarrkirche St. Mariä Himmelfahrt, Gasthaus Zum Altwirt, EDEKA) -> Weipertshausen!
export const MIN_E = 673600;
export const MAX_E = 677400; // 3,800 m East-West (exact 1:1 meters!)
export const MIN_N = 5307800;
export const MAX_N = 5310700; // 2,900 m North-South (exact 1:1 meters!)

export const ORIGIN_E = (MIN_E + MAX_E) * 0.5; // 675500
export const ORIGIN_N = (MIN_N + MAX_N) * 0.5; // 5309250

export const LAKE_ELEV_M = 584.2; // Real Starnberger See surface elevation (m ü.NN)

// Exact WGS84 -> UTM Zone 32N (EPSG:25832) transverse Mercator projection
export function wgs84ToUtm32(latDeg, lonDeg) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const lon0 = (9 * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const T = Math.tan(lat) ** 2;
  const C = ep2 * Math.cos(lat) ** 2;
  const A = Math.cos(lat) * (lon - lon0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));
  const E =
    500000 +
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const Nn =
    k0 *
    (M +
      N *
        Math.tan(lat) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [E, Nn];
}

export function utmToWorld(E, N) {
  return [Math.round((E - ORIGIN_E) * 10) / 10, Math.round(-(N - ORIGIN_N) * 10) / 10];
}

function projectLatLon(lat, lon) {
  const [E, N] = wgs84ToUtm32(lat, lon);
  return utmToWorld(E, N);
}

// 1. Download & cache Bavaria DGM1 (1 m LiDAR GeoTIFFs) into git-ignored data-cache/dgm1/
async function ensureDgm1Tiles() {
  const dir = path.resolve('data-cache/dgm1');
  fs.mkdirSync(dir, { recursive: true });
  const loaded = new Map();

  const eTiles = [673, 674, 675, 676, 677];
  const nTiles = [5307, 5308, 5309, 5310];

  for (const eKm of eTiles) {
    for (const nKm of nTiles) {
      const key = `${eKm}_${nKm}`;
      const fpath = path.join(dir, `${key}.tif`);
      if (!fs.existsSync(fpath)) {
        const url = `https://download1.bayernwolke.de/a/dgm/dgm1/${key}.tif`;
        process.stdout.write(`Fetching Bavaria DGM1 ${key}.tif... `);
        const res = await fetch(url, { headers: { 'User-Agent': 'OpenWorldScorpionSim/2.0' } });
        if (!res.ok) {
          console.log(`status ${res.status} (skipped/lake)`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(fpath, buf);
        console.log(`${Math.round(buf.length / 1024)} KB`);
      }
      if (fs.existsSync(fpath) && fs.statSync(fpath).size > 10000) {
        const tiff = await fromFile(fpath);
        const img = await tiff.getImage();
        const ras = await img.readRasters();
        loaded.set(key, {
          data: ras[0],
          width: img.getWidth(),
          height: img.getHeight(),
          bbox: img.getBoundingBox() // [minE, minN, maxE, maxN]
        });
      }
    }
  }
  console.log(`Loaded ${loaded.size} Bavaria 1m LiDAR DGM1 tiles.`);
  return loaded;
}

function sampleRawDgm1(tiles, E, N) {
  const eKm = Math.floor(E / 1000);
  const nKm = Math.floor(N / 1000);
  const tile = tiles.get(`${eKm}_${nKm}`);
  if (!tile) return LAKE_ELEV_M;
  const [minE, minN, maxE, maxN] = tile.bbox;
  const col = Math.max(0, Math.min(tile.width - 1, Math.floor(((E - minE) / (maxE - minE)) * tile.width)));
  const row = Math.max(0, Math.min(tile.height - 1, Math.floor(((maxN - N) / (maxN - minN)) * tile.height)));
  const v = tile.data[row * tile.width + col];
  if (!Number.isFinite(v) || v < 400 || v > 2500) return LAKE_ELEV_M;
  return v;
}

// 2. Download crisp SRS=EPSG:25832 Bavaria DOP20 aerial tiles aligned 1:1 to [MIN_E..MAX_E, MIN_N..MAX_N]
async function fetchDop20Utm32Tiles() {
  const outDir = path.resolve('public/map');
  fs.mkdirSync(outDir, { recursive: true });
  const midE = ORIGIN_E;
  const midN = ORIGIN_N;

  const tiles = [
    { name: 'dop_nw.jpg', bbox: [MIN_E, midN, midE, MAX_N], w: 2048, h: 1564 },
    { name: 'dop_ne.jpg', bbox: [midE, midN, MAX_E, MAX_N], w: 2048, h: 1564 },
    { name: 'dop_sw.jpg', bbox: [MIN_E, MIN_N, midE, midN], w: 2048, h: 1564 },
    { name: 'dop_se.jpg', bbox: [midE, MIN_N, MAX_E, midN], w: 2048, h: 1564 },
    { name: 'minimap_dop.jpg', bbox: [MIN_E, MIN_N, MAX_E, MAX_N], w: 1024, h: 782 }
  ];

  for (const t of tiles) {
    const outPath = path.join(outDir, t.name);
    const url =
      `https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
      `&LAYERS=by_dop20c&STYLES=&SRS=EPSG:25832&BBOX=${t.bbox.join(',')}&WIDTH=${t.w}&HEIGHT=${t.h}&FORMAT=image/jpeg`;
    console.log(`Downloading EPSG:25832 DOP20 tile ${t.name} (${t.w}x${t.h})...`);
    const res = await fetch(url, { headers: { 'User-Agent': 'OpenWorldScorpionSim/2.0' } });
    if (!res.ok) throw new Error(`DOP20 ${t.name} failed: ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('image')) throw new Error(`DOP20 ${t.name} non-image: ${ct}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log(`  -> ${t.name}: ${Math.round(buf.length / 1024)} KB`);
  }
}

// 3. Fetch & cache OpenStreetMap roads, landuse, waterways, POIs & fallback buildings in data-cache/
async function fetchOverpass() {
  const cachePath = path.resolve('data-cache/osm_1to1.json');
  if (fs.existsSync(cachePath)) {
    console.log('Loaded cached Overpass OSM from', cachePath);
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }

  const bbox = '47.8995,11.3210,47.9260,11.3775';
  const query = `[out:json][timeout:60];
(
  way["highway"~"secondary|tertiary|unclassified|residential|living_street|service|track"](${bbox});
  way["building"](${bbox});
  way["waterway"~"stream|river"](${bbox});
  way["landuse"~"forest|meadow|farmland|residential"](${bbox});
  way["natural"~"wood|water"](${bbox});
  node["name"](${bbox});
);
out body;
>;
out skel qt;`;

  const endpoints = [
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const url of endpoints) {
    try {
      console.log('Fetching OSM data from', url);
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OpenWorldScorpionSim/2.0' }
      });
      if (res.ok) {
        const json = await res.json();
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(json));
        return json;
      }
      console.warn(`Mirror ${url} returned ${res.status}`);
    } catch (e) {
      console.warn(`Mirror ${url} error:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('All Overpass mirrors failed');
}

function simplifyPolyline(pts, minDist = 6.0) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= minDist) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function buildingBoxFromNodes(coords) {
  if (coords.length < 3) return null;
  const n =
    coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords.length - 1
      : coords.length;
  if (n < 3) return null;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += coords[i][0];
    cz += coords[i][1];
  }
  cx /= n;
  cz /= n;
  let bestLen = 0;
  let angle = 0;
  for (let i = 0; i < n; i++) {
    const a = coords[i];
    const b = coords[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = coords[i][0] - cx;
    const dz = coords[i][1] - cz;
    const u = dx * cos - dz * sin;
    const v = dx * sin + dz * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const rawW = maxU - minU;
  const rawD = maxV - minV;
  if (rawW < 3.0 || rawD < 3.0) return null;
  return {
    x: Math.round(cx * 10) / 10,
    z: Math.round(cz * 10) / 10,
    w: Math.round(rawW * 10) / 10,
    d: Math.round(rawD * 10) / 10,
    rot: Math.round(-angle * 100) / 100
  };
}

function pointToSegT(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return { t: 0, dist: Math.hypot(px - ax, pz - az) };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return { t, dist: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)) };
}

async function main() {
  const dgmTiles = await ensureDgm1Tiles();
  await fetchDop20Utm32Tiles();
  const osm = await fetchOverpass();

  const minX = MIN_E - ORIGIN_E; // -1900
  const maxX = MAX_E - ORIGIN_E; // +1900
  const minZ = -(MAX_N - ORIGIN_N); // -1450
  const maxZ = -(MIN_N - ORIGIN_N); // +1450

  const nodeMap = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
  }

  const roads = [];
  const buildings = [];
  const forests = [];
  const farmlands = [];
  const streams = [];
  const landmarks = [];

  for (const el of osm.elements) {
    if (el.type === 'node' && el.tags?.name) {
      const [x, z] = projectLatLon(el.lat, el.lon);
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      if (
        el.tags.amenity ||
        el.tags.shop ||
        el.tags.tourism ||
        el.tags.place ||
        el.tags.historic ||
        /Altwirt|Sebald|Schloss|Kirch|Münsing|Wimpasing|Ammerland|Weipertshausen|Ried|Pinocchio|EDEKA|Bäckerei/i.test(
          el.tags.name
        )
      ) {
        landmarks.push({
          name: el.tags.name,
          kind: el.tags.place || el.tags.amenity || el.tags.shop || el.tags.tourism || el.tags.historic || 'poi',
          x,
          z
        });
      }
    }

    if (el.type !== 'way' || !el.nodes || !el.tags) continue;
    const pts = [];
    for (const nid of el.nodes) {
      const n = nodeMap.get(nid);
      if (n) pts.push(projectLatLon(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    if (el.tags.highway) {
      const hw = el.tags.highway;
      const simple = simplifyPolyline(pts, hw === 'track' || hw === 'service' ? 11 : 7);
      if (simple.length >= 2) {
        // Keep roads that touch our 1:1 play area
        if (simple.some(([x, z]) => x >= minX - 40 && x <= maxX + 40 && z >= minZ - 40 && z <= maxZ + 40)) {
          roads.push({ hw, name: el.tags.name || '', pts: simple });
        }
      }
    } else if (el.tags.building) {
      const box = buildingBoxFromNodes(pts);
      if (box && box.x >= minX + 15 && box.x <= maxX - 15 && box.z >= minZ + 15 && box.z <= maxZ - 15) {
        const bTag = el.tags.building;
        const name = el.tags.name || '';
        const isChurch = bTag === 'church' || /Kirche|Mariä/i.test(name);
        const isCastle = /Schloss/i.test(name) || el.tags.historic === 'castle';
        const isBarn =
          bTag === 'barn' ||
          bTag === 'farm_auxiliary' ||
          bTag === 'shed' ||
          bTag === 'garage' ||
          bTag === 'agricultural' ||
          bTag === 'greenhouse';
        buildings.push({
          ...box,
          type: isChurch ? 'church' : isCastle ? 'castle' : isBarn ? 'barn' : 'house',
          name
        });
      }
    } else if (el.tags.landuse === 'forest' || el.tags.natural === 'wood') {
      const box = buildingBoxFromNodes(pts);
      if (box && box.w * box.d > 1600) forests.push({ x: box.x, z: box.z, w: box.w, d: box.d });
    } else if (el.tags.landuse === 'farmland' || el.tags.landuse === 'meadow') {
      const box = buildingBoxFromNodes(pts);
      if (box && box.w * box.d > 4000) farmlands.push({ x: box.x, z: box.z, w: box.w, d: box.d, kind: el.tags.landuse });
    } else if (el.tags.waterway === 'stream' || el.tags.waterway === 'river') {
      const simple = simplifyPolyline(pts, 12);
      if (simple.length >= 2) streams.push({ name: el.tags.name || 'Lübbach', pts: simple });
    }
  }

  // Build crisp 10m-spacing heightmap (381 x 291) directly from real Bavaria 1m LiDAR DGM1!
  const hmCols = 381; // (3800m / 10m) + 1
  const hmRows = 291; // (2900m / 10m) + 1
  const rawGrid = new Float32Array(hmCols * hmRows);

  console.log(`Sampling ${hmCols}x${hmRows} real Bavaria 1m LiDAR DGM1 heightmap...`);
  for (let iz = 0; iz < hmRows; iz++) {
    const z = minZ + (iz / (hmRows - 1)) * (maxZ - minZ);
    const N = ORIGIN_N - z;
    for (let ix = 0; ix < hmCols; ix++) {
      const x = minX + (ix / (hmCols - 1)) * (maxX - minX);
      const E = ORIGIN_E + x;
      // 3x3 micro-average from 1m LiDAR removes sharp single-pixel LiDAR spikes while preserving every real slope & ridge!
      let sum = 0;
      for (const de of [-2, 0, 2]) {
        for (const dn of [-2, 0, 2]) {
          sum += sampleRawDgm1(dgmTiles, E + de, N + dn);
        }
      }
      rawGrid[iz * hmCols + ix] = sum / 9;
    }
  }

  // Smoothly flatten & grade a corridor under EVERY paved OSM road so roads sit flush on the LiDAR terrain!
  console.log('Carving smooth road corridors into DGM1 heightmap...');
  const graded = new Float32Array(rawGrid);
  const weightSum = new Float32Array(hmCols * hmRows);
  const targetSum = new Float32Array(hmCols * hmRows);

  for (const r of roads) {
    if (r.hw === 'track' || r.hw === 'service') continue;
    const isMain = r.hw === 'secondary' || r.hw === 'tertiary';
    const flatHalf = isMain ? 7.5 : 5.5;
    const blendHalf = isMain ? 16.0 : 12.0;

    // Sample & mildly smooth centerline elevations along the road polyline
    const ptElevs = r.pts.map(([rx, rz]) => sampleRawDgm1(dgmTiles, ORIGIN_E + rx, ORIGIN_N - rz));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < ptElevs.length - 1; i++) {
        ptElevs[i] = ptElevs[i - 1] * 0.25 + ptElevs[i] * 0.5 + ptElevs[i + 1] * 0.25;
      }
    }

    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const ea = ptElevs[i];
      const eb = ptElevs[i + 1];

      const ix0 = Math.max(0, Math.floor(((Math.min(ax, bx) - blendHalf - minX) / (maxX - minX)) * (hmCols - 1)));
      const ix1 = Math.min(hmCols - 1, Math.ceil(((Math.max(ax, bx) + blendHalf - minX) / (maxX - minX)) * (hmCols - 1)));
      const iz0 = Math.max(0, Math.floor(((Math.min(az, bz) - blendHalf - minZ) / (maxZ - minZ)) * (hmRows - 1)));
      const iz1 = Math.min(hmRows - 1, Math.ceil(((Math.max(az, bz) + blendHalf - minZ) / (maxZ - minZ)) * (hmRows - 1)));

      for (let iz = iz0; iz <= iz1; iz++) {
        const gz = minZ + (iz / (hmRows - 1)) * (maxZ - minZ);
        for (let ix = ix0; ix <= ix1; ix++) {
          const gx = minX + (ix / (hmCols - 1)) * (maxX - minX);
          const { t, dist } = pointToSegT(gx, gz, ax, az, bx, bz);
          if (dist >= blendHalf) continue;
          const w =
            dist <= flatHalf
              ? 1.0
              : 1.0 - Math.pow((dist - flatHalf) / (blendHalf - flatHalf), 2) * (3 - 2 * ((dist - flatHalf) / (blendHalf - flatHalf)));
          const idx = iz * hmCols + ix;
          const roadE = ea + (eb - ea) * t;
          targetSum[idx] += roadE * w;
          weightSum[idx] += w;
        }
      }
    }
  }

  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let i = 0; i < graded.length; i++) {
    if (weightSum[i] > 0) {
      const blend = Math.min(1, weightSum[i]);
      const avgRoad = targetSum[i] / weightSum[i];
      graded[i] = rawGrid[i] * (1 - blend) + avgRoad * blend;
    }
    if (graded[i] < minElev) minElev = graded[i];
    if (graded[i] > maxElev) maxElev = graded[i];
  }

  // Pack 381x291 heightmap into compact 16-bit Uint16 binary (public/map/dgm1_heightmap.bin — only 221 KB!)
  const elevSpan = Math.max(1, maxElev - minElev);
  const packed = new Uint16Array(hmCols * hmRows);
  for (let i = 0; i < graded.length; i++) {
    packed[i] = Math.round(((graded[i] - minElev) / elevSpan) * 65535);
  }
  const hmPath = path.resolve('public/map/dgm1_heightmap.bin');
  fs.writeFileSync(hmPath, Buffer.from(packed.buffer));
  console.log(
    `Saved road-graded Bavaria DGM1 heightmap to ${hmPath} (${Math.round(fs.statSync(hmPath).size / 1024)} KB, range ${minElev.toFixed(1)}m..${maxElev.toFixed(1)}m ü.NN)`
  );

  // Also keep a compact 36x28 preview grid inside JSON for instant synchronous bootstrap before binary loads!
  const prevCols = 36;
  const prevRows = 28;
  const prevVals = [];
  for (let iz = 0; iz < prevRows; iz++) {
    const rIdx = Math.round((iz / (prevRows - 1)) * (hmRows - 1));
    for (let ix = 0; ix < prevCols; ix++) {
      const cIdx = Math.round((ix / (prevCols - 1)) * (hmCols - 1));
      prevVals.push(Math.round(graded[rIdx * hmCols + cIdx] * 10) / 10);
    }
  }

  // Exact verified real 1:1 GPS spots projected directly into UTM32 meters!
  const spots = {
    farm: utmToWorld(675420, 5308480), // Open Bavarian meadow between Wimpasing & Münsinger Straße!
    wimpasing: projectLatLon(47.9043, 11.3439),
    sebaldPier: projectLatLon(47.9065, 11.3352),
    schlossAmmerland: projectLatLon(47.9052, 11.3344),
    ried: projectLatLon(47.9089, 11.3448),
    muensingChurch: projectLatLon(47.9033, 11.3669),
    muensingAltwirt: projectLatLon(47.90275, 11.36775),
    edeka: projectLatLon(47.9036, 11.3698),
    weipertshausen: projectLatLon(47.9233, 11.3553)
  };

  const out = {
    meta: {
      minX,
      maxX,
      minZ,
      maxZ,
      originE: ORIGIN_E,
      originN: ORIGIN_N,
      scale: 1.0,
      lakeElevationM: LAKE_ELEV_M,
      elevScale: 1.0
    },
    heightmap: {
      file: './map/dgm1_heightmap.bin',
      cols: hmCols,
      rows: hmRows,
      minElev: Math.round(minElev * 100) / 100,
      maxElev: Math.round(maxElev * 100) / 100
    },
    spots,
    elevation: { cols: prevCols, rows: prevRows, minX, maxX, minZ, maxZ, values: prevVals },
    roads,
    buildings,
    forests,
    farmlands,
    streams,
    landmarks
  };

  const outPath = path.resolve('src/data/muensingData.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('Built TRUE 1:1 Bavaria DGM1 + DOP20 + OSM dataset!', {
    bounds: { minX, maxX, minZ, maxZ },
    spots,
    roads: roads.length,
    buildings: buildings.length,
    forests: forests.length,
    farmlands: farmlands.length,
    jsonKB: Math.round(fs.statSync(outPath).size / 1024)
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
