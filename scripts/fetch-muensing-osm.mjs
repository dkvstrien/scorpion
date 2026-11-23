import fs from 'node:fs';
import path from 'node:path';

// Exact bounding box matching the user's map screenshot:
// Lake Starnberg & Schloss Ammerland (west) -> Wimpasing -> Ried -> Münsing -> Wolfratshausener Str. (east)
// Hartlweg / Pinocchio (south) -> Weipertshausen (north)
const MIN_LAT = 47.9022;
const MAX_LAT = 47.9238;
const MIN_LON = 11.3140;
const MAX_LON = 11.3742;

// Reference origin placed right in the heart between Wimpasing & Münsing
const ORIGIN_LAT = 47.9105;
const ORIGIN_LON = 11.3450;

// Real-world meters per degree at 47.91°N
const M_PER_DEG_LAT = 111195;
const M_PER_DEG_LON = 111195 * Math.cos((ORIGIN_LAT * Math.PI) / 180);

// Clean 0.28x spatial scale so the full ~4.5km x 2.4km Starnberger See -> Ammerland -> Wimpasing -> Münsing -> Weipertshausen
// map is ~1,250m x 670m in-game — authentically proportioned and super fun to drive across in 30-60 seconds!
const SCALE = 0.28;

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
  const cachePath = path.resolve('scripts/.cache_osm.json');
  if (fs.existsSync(cachePath)) {
    console.log('Loaded cached Overpass OSM data from', cachePath);
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }

  const bbox = `${MIN_LAT},${MIN_LON},${MAX_LAT},${MAX_LON}`;
  const query = `[out:json][timeout:45];
(
  way["highway"~"secondary|tertiary|unclassified|residential|living_street|service|track"](${bbox});
  way["building"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"~"stream|river"](${bbox});
  way["landuse"="forest"](${bbox});
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
          'User-Agent': 'Scorpion741MuensingSim/1.0'
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
  console.log(`Fetching real ${cols}x${rows} DEM elevation grid (Open-Meteo / Open-Elevation)...`);
  const points = [];
  for (let iz = 0; iz < rows; iz++) {
    const z = minZ + (iz / (rows - 1)) * (maxZ - minZ);
    for (let ix = 0; ix < cols; ix++) {
      const x = minX + (ix / (cols - 1)) * (maxX - minX);
      const [lat, lon] = unproject(x, z);
      points.push({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) });
    }
  }

  // Try Open-Elevation single POST first (handles 400+ points in ONE single fast request!)
  try {
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon })) })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.results && json.results.length === points.length) {
        console.log('Got full real DEM grid from Open-Elevation in 1 request!');
        return json.results.map((r) => Math.round(r.elevation * 10) / 10);
      }
    }
  } catch (e) {
    console.warn('Open-Elevation fallback triggered:', e.message);
  }

  // Fallback: Open-Meteo polite batches with retry
  const elevations = [];
  const batchSize = 90;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const lats = batch.map((p) => p.lat).join(',');
    const lons = batch.map((p) => p.lon).join(',');
    let ok = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
      if (res.ok) {
        const json = await res.json();
        elevations.push(...json.elevation.map((e) => Math.round(e * 10) / 10));
        ok = true;
        break;
      }
      console.warn(`Open-Meteo batch ${i} returned ${res.status}, waiting...`);
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
    if (!ok) throw new Error('Open-Meteo elevation failed after retries');
    await new Promise((r) => setTimeout(r, 1500));
  }
  return elevations;
}

function simplifyPolyline(pts, minDist = 3.0) {
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
  const n = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
    ? coords.length - 1
    : coords.length;
  if (n < 3) return null;

  for (let i = 0; i < n; i++) {
    cx += coords[i][0];
    cz += coords[i][1];
  }
  cx /= n;
  cz /= n;

  // Principal orientation from longest polygon edge!
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
  if (rawW < 0.8 || rawD < 0.8) return null;

  return {
    x: Math.round(cx * 10) / 10,
    z: Math.round(cz * 10) / 10,
    w: Math.round(rawW * 10) / 10,
    d: Math.round(rawD * 10) / 10,
    rot: Math.round(-angle * 100) / 100
  };
}

async function main() {
  const osm = await fetchOverpass();
  const nodeMap = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, el);
    }
  }

  const [minX, maxZ] = project(MIN_LAT, MIN_LON);
  const [maxX, minZ] = project(MAX_LAT, MAX_LON);
  console.log('Projected world bounds:', { minX, maxX, minZ, maxZ });

  const roads = [];
  const buildings = [];
  const forests = [];
  const streams = [];
  const landmarks = [];

  for (const el of osm.elements) {
    if (el.type === 'node' && el.tags?.name) {
      const [x, z] = project(el.lat, el.lon);
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
      const simple = simplifyPolyline(pts, hw === 'track' || hw === 'service' ? 6.0 : 3.5);
      if (simple.length >= 2) {
        roads.push({
          hw,
          name: el.tags.name || '',
          pts: simple
        });
      }
    } else if (el.tags.building) {
      const box = buildingBoxFromNodes(pts);
      if (box) {
        const bTag = el.tags.building;
        const name = el.tags.name || '';
        const isChurch = bTag === 'church' || /Kirche|Mariä/i.test(name);
        const isCastle = /Schloss/i.test(name) || el.tags.historic === 'castle';
        const isBarn = bTag === 'barn' || bTag === 'farm_auxiliary' || bTag === 'shed' || bTag === 'garage';
        buildings.push({
          ...box,
          type: isChurch ? 'church' : isCastle ? 'castle' : isBarn ? 'barn' : 'house',
          name
        });
      }
    } else if (el.tags.landuse === 'forest' || el.tags.natural === 'wood') {
      // Sample representative centroid + approximate radius for instanced Bavarian woodland clusters!
      const box = buildingBoxFromNodes(pts);
      if (box && box.w * box.d > 350) {
        forests.push({ x: box.x, z: box.z, w: box.w, d: box.d });
      }
    } else if (el.tags.waterway === 'stream' || el.tags.waterway === 'river') {
      const simple = simplifyPolyline(pts, 6.0);
      if (simple.length >= 2) {
        streams.push({ name: el.tags.name || 'Lübbach', pts: simple });
      }
    }
  }

  // Fetch real DEM elevation grid covering the projected world bounds!
  const cols = 26;
  const rows = 16;
  const elevRaw = await fetchElevationGrid(minX, maxX, minZ, maxZ, cols, rows);

  // Find key real-world GPS coordinates for quick navigation & spawning!
  const keySpots = {
    wimpasing: project(47.9082, 11.3312), // Right at the user's blue dot in Wimpasing!
    ammerlandPier: project(47.9094, 11.3198), // Fischerei Sebald & Schloss Ammerland shore!
    schlossAmmerland: project(47.9083, 11.3186),
    muensingCenter: project(47.9073, 11.3586), // Gasthaus Zum Altwirt & Dorfplatz!
    muensingChurch: project(47.9076, 11.3614), // St. Mariä Himmelfahrt!
    weipertshausen: project(47.9212, 11.3446),
    ried: project(47.9122, 11.3320)
  };

  const out = {
    meta: {
      minX: Math.round(minX),
      maxX: Math.round(maxX),
      minZ: Math.round(minZ),
      maxZ: Math.round(maxZ),
      scale: SCALE,
      lakeElevationM: 584.5,
      elevScale: 0.42
    },
    elevation: { cols, rows, minX, maxX, minZ, maxZ, values: elevRaw },
    keySpots,
    roads,
    buildings,
    forests,
    streams,
    landmarks
  };

  const outPath = path.resolve('src/data/muensingData.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(
    `Saved real Münsing OSM + DEM dataset to ${outPath}!`,
    {
      roads: roads.length,
      buildings: buildings.length,
      forests: forests.length,
      streams: streams.length,
      landmarks: landmarks.length,
      bytes: fs.statSync(outPath).size,
      keySpots
    }
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
