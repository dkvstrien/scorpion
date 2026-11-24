import fs from 'node:fs';
import path from 'node:path';

// Exact geographic bounding box covering Starnberger See shore -> Schloss Ammerland -> Fischerei Sebald ->
// Wimpasing -> Ried -> Münsing (St. Mariä Himmelfahrt, Gasthaus Zum Altwirt) -> Weipertshausen!
const MIN_LAT = 47.9004;
const MAX_LAT = 47.9244;
const MIN_LON = 11.3250;
const MAX_LON = 11.3745;

// Exact geometric center of the bbox so 2x2 Bavaria DOP20 aerial tiles align with ZERO millimeter offset!
const ORIGIN_LAT = (MIN_LAT + MAX_LAT) * 0.5; // 47.9124
const ORIGIN_LON = (MIN_LON + MAX_LON) * 0.5; // 11.34975

// Real-world meters per degree at 47.9124°N
const M_PER_DEG_LAT = 111195;
const M_PER_DEG_LON = 111195 * Math.cos((ORIGIN_LAT * Math.PI) / 180);

// Near-1:1 spacious scale (0.65x real world -> ~2.40 km x 1.73 km playground!)
// Streets, driveways, intersections & courtyards now have authentic real-world breathing room for the 5m Scorpion 741!
const SCALE = 0.65;

function project(lat, lon) {
  const x = (lon - ORIGIN_LON) * M_PER_DEG_LON * SCALE;
  const z = -(lat - ORIGIN_LAT) * M_PER_DEG_LAT * SCALE;
  return [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
}

function unproject(x, z) {
  const lon = ORIGIN_LON + x / (M_PER_DEG_LON * SCALE);
  const lat = ORIGIN_LAT - z / (M_PER_DEG_LAT * SCALE);
  return [lat, lon];
}

async function fetchOverpass() {
  const cachePath = path.resolve('scripts/.cache_osm_v2.json');
  if (fs.existsSync(cachePath)) {
    console.log('Loaded cached Overpass OSM data from', cachePath);
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }

  const bbox = `${MIN_LAT},${MIN_LON},${MAX_LAT},${MAX_LON}`;
  const query = `[out:json][timeout:45];
(
  way["highway"~"secondary|tertiary|unclassified|residential|living_street|service|track"](${bbox});
  way["building"](${bbox});
  way["waterway"~"stream|river"](${bbox});
  way["landuse"~"forest|meadow|farmland"](${bbox});
  way["natural"="wood"](${bbox});
  node["name"](${bbox});
);
out body;
>;
out skel qt;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter'
  ];

  for (const url of endpoints) {
    try {
      console.log('Fetching real OpenStreetMap data from', url);
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'OpenWorldScorpionSim/2.0'
        }
      });
      if (res.ok) {
        const json = await res.json();
        fs.writeFileSync(cachePath, JSON.stringify(json));
        return json;
      }
      console.warn(`Mirror ${url} returned ${res.status}, trying next...`);
    } catch (err) {
      console.warn(`Mirror ${url} errored:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('All Overpass mirrors failed');
}

async function fetchElevationGrid(minX, maxX, minZ, maxZ, cols, rows) {
  console.log(`Fetching real ${cols}x${rows} SRTM DEM elevation grid (${cols * rows} points)...`);
  const points = [];
  for (let iz = 0; iz < rows; iz++) {
    const z = minZ + (iz / (rows - 1)) * (maxZ - minZ);
    for (let ix = 0; ix < cols; ix++) {
      const x = minX + (ix / (cols - 1)) * (maxX - minX);
      const [lat, lon] = unproject(x, z);
      points.push({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) });
    }
  }

  // Send ALL points in ONE single Open-Elevation POST request (avoids 429 on sequential requests!)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon })) })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.results && json.results.length === points.length) {
          console.log(`Got full ${cols}x${rows} real SRTM DEM grid in 1 request!`);
          return json.results.map((r) => Math.round(r.elevation * 10) / 10);
        }
      }
      console.warn(`Open-Elevation attempt ${attempt + 1} returned ${res.status}, retrying...`);
    } catch (e) {
      console.warn(`Open-Elevation attempt ${attempt + 1} error:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  // Fallback: resample our already-downloaded real SRTM DEM grid from existing muensingData.json via exact lat/lon!
  const prevPath = path.resolve('src/data/muensingData.json');
  if (fs.existsSync(prevPath)) {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    if (prev.elevation?.values?.length) {
      console.log('Resampling already-downloaded real SRTM DEM grid to exact new lat/lon coordinates!');
      const pCols = prev.elevation.cols;
      const pRows = prev.elevation.rows;
      const pOriginLat = 47.9105;
      const pOriginLon = 11.3450;
      const pScale = prev.meta.scale || 0.28;
      const pMLon = 111195 * Math.cos((pOriginLat * Math.PI) / 180);
      const { minX: pMinX, maxX: pMaxX, minZ: pMinZ, maxZ: pMaxZ, values: pVals } = prev.elevation;
      return points.map((pt) => {
        const px = (pt.lon - pOriginLon) * pMLon * pScale;
        const pz = -(pt.lat - pOriginLat) * 111195 * pScale;
        const u = Math.max(0, Math.min(pCols - 1.0001, ((px - pMinX) / (pMaxX - pMinX)) * (pCols - 1)));
        const v = Math.max(0, Math.min(pRows - 1.0001, ((pz - pMinZ) / (pMaxZ - pMinZ)) * (pRows - 1)));
        const ix = Math.floor(u);
        const iz = Math.floor(v);
        const fx = u - ix;
        const fz = v - iz;
        const e00 = pVals[iz * pCols + ix];
        const e10 = pVals[iz * pCols + ix + 1];
        const e01 = pVals[(iz + 1) * pCols + ix];
        const e11 = pVals[(iz + 1) * pCols + ix + 1];
        const val = (e00 * (1 - fx) + e10 * fx) * (1 - fz) + (e01 * (1 - fx) + e11 * fx) * fz;
        return Math.round(val * 10) / 10;
      });
    }
  }
  throw new Error('Open-Elevation failed after retries');
}

async function fetchBavariaDOP20Tiles() {
  const outDir = path.resolve('public/map');
  fs.mkdirSync(outDir, { recursive: true });

  const midLon = ORIGIN_LON;
  const midLat = ORIGIN_LAT;

  const tiles = [
    { name: 'dop_nw.jpg', bbox: [MIN_LON, midLat, midLon, MAX_LAT], w: 2048, h: 1480 },
    { name: 'dop_ne.jpg', bbox: [midLon, midLat, MAX_LON, MAX_LAT], w: 2048, h: 1480 },
    { name: 'dop_sw.jpg', bbox: [MIN_LON, MIN_LAT, midLon, midLat], w: 2048, h: 1480 },
    { name: 'dop_se.jpg', bbox: [midLon, MIN_LAT, MAX_LON, midLat], w: 2048, h: 1480 },
    { name: 'minimap_dop.jpg', bbox: [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT], w: 1024, h: 740 }
  ];

  for (const t of tiles) {
    const outPath = path.join(outDir, t.name);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 20000) {
      console.log(`Using cached Bavaria DOP20 tile ${t.name}`);
      continue;
    }
    const url =
      `https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
      `&LAYERS=by_dop20c&STYLES=&SRS=EPSG:4326&BBOX=${t.bbox.join(',')}&WIDTH=${t.w}&HEIGHT=${t.h}&FORMAT=image/jpeg`;
    console.log(`Downloading Bavaria DOP20 aerial tile ${t.name} (${t.w}x${t.h})...`);
    const res = await fetch(url, { headers: { 'User-Agent': 'OpenWorldScorpionSim/2.0' } });
    if (!res.ok) throw new Error(`DOP20 tile ${t.name} failed: ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('image')) throw new Error(`DOP20 tile ${t.name} returned non-image: ${ct}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log(`  -> Saved ${t.name} (${Math.round(buf.length / 1024)} KB)`);
  }
}

function simplifyPolyline(pts, minDist = 4.5) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= minDist) {
      out.push(pts[i]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function buildingBoxFromNodes(coords) {
  if (coords.length < 3) return null;
  let cx = 0;
  let cz = 0;
  const n =
    coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords.length - 1
      : coords.length;
  if (n < 3) return null;

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
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      angle = Math.atan2(dz, dx);
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
  if (rawW < 2.2 || rawD < 2.2) return null;

  return {
    x: Math.round(cx * 10) / 10,
    z: Math.round(cz * 10) / 10,
    w: Math.round(rawW * 10) / 10,
    d: Math.round(rawD * 10) / 10,
    rot: Math.round(-angle * 100) / 100
  };
}

async function main() {
  await fetchBavariaDOP20Tiles();
  const osm = await fetchOverpass();

  const nodeMap = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
  }

  const [minX, maxZ] = project(MIN_LAT, MIN_LON);
  const [maxX, minZ] = project(MAX_LAT, MAX_LON);
  console.log('Projected near-1:1 world bounds:', { minX, maxX, minZ, maxZ });

  const roads = [];
  const buildings = [];
  const forests = [];
  const streams = [];
  const landmarks = [];

  for (const el of osm.elements) {
    if (el.type === 'node' && el.tags?.name) {
      const [x, z] = project(el.lat, el.lon);
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const isPoi =
        el.tags.amenity ||
        el.tags.shop ||
        el.tags.tourism ||
        el.tags.place ||
        el.tags.historic ||
        /Altwirt|Sebald|Schloss|Kirch|Münsing|Wimpasing|Ammerland|Weipertshausen|Ried|Pinocchio|EDEKA|Bäckerei/i.test(
          el.tags.name
        );
      if (isPoi) {
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
      if (n) pts.push(project(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    if (el.tags.highway) {
      const hw = el.tags.highway;
      const simple = simplifyPolyline(pts, hw === 'track' || hw === 'service' ? 9.0 : 5.5);
      if (simple.length >= 2) {
        roads.push({ hw, name: el.tags.name || '', pts: simple });
      }
    } else if (el.tags.building) {
      const box = buildingBoxFromNodes(pts);
      if (box && box.x >= minX + 10 && box.x <= maxX - 10 && box.z >= minZ + 10 && box.z <= maxZ - 10) {
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
      if (box && box.w * box.d > 900) {
        forests.push({ x: box.x, z: box.z, w: box.w, d: box.d });
      }
    } else if (el.tags.waterway === 'stream' || el.tags.waterway === 'river') {
      const simple = simplifyPolyline(pts, 9.0);
      if (simple.length >= 2) {
        streams.push({ name: el.tags.name || 'Lübbach', pts: simple });
      }
    }
  }

  // Dense 32x22 SRTM DEM elevation grid (704 points in 1 request!)
  const cols = 32;
  const rows = 22;
  const elevRaw = await fetchElevationGrid(minX, maxX, minZ, maxZ, cols, rows);

  // Exact verified real GPS coordinates projected into our 0.65x world!
  const spots = {
    farm: project(47.9056, 11.3478), // Open meadow right beside Münsinger Straße between Wimpasing & Münsing!
    wimpasing: project(47.9043, 11.3439),
    sebaldPier: project(47.9065, 11.3352), // Fischerei Matthias Sebald right on Starnberger See!
    schlossAmmerland: project(47.9052, 11.3344), // Schloss Ammerland lakeside baroque palace!
    ried: project(47.9089, 11.3448),
    muensingChurch: project(47.9033, 11.3669), // Pfarrkirche St. Mariä Himmelfahrt!
    muensingAltwirt: project(47.90275, 11.36775), // Gasthaus & Metzgerei Zum Altwirt!
    edeka: project(47.9036, 11.3698),
    weipertshausen: project(47.9233, 11.3553)
  };

  const out = {
    meta: {
      minX,
      maxX,
      minZ,
      maxZ,
      minLat: MIN_LAT,
      maxLat: MAX_LAT,
      minLon: MIN_LON,
      maxLon: MAX_LON,
      scale: SCALE,
      lakeElevationM: 584.5,
      elevScale: 0.62
    },
    spots,
    elevation: { cols, rows, minX, maxX, minZ, maxZ, values: elevRaw },
    roads,
    buildings,
    forests,
    streams,
    landmarks
  };

  const outPath = path.resolve('src/data/muensingData.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('Saved near-1:1 Münsing OSM + DEM + DOP20 dataset!', {
    bounds: { minX, maxX, minZ, maxZ },
    spots,
    roads: roads.length,
    buildings: buildings.length,
    forests: forests.length,
    streams: streams.length,
    jsonKB: Math.round(fs.statSync(outPath).size / 1024)
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
