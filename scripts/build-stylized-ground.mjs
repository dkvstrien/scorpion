import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ORIGIN_E, ORIGIN_N, wgs84ToUtm32 } from './build-bavaria-terrain.mjs';

const muensingData = JSON.parse(fs.readFileSync(path.resolve('src/data/muensingData.json'), 'utf8'));
const { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: WORLD_MAX_Z } = muensingData.meta;
const MID_X = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
const MID_Z = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;

const rawDir = path.resolve('data-cache/dop_raw');
const outDir = path.resolve('public/map');
fs.mkdirSync(rawDir, { recursive: true });

function projectLatLon(lat, lon) {
  const [E, N] = wgs84ToUtm32(lat, lon);
  return [E - ORIGIN_E, -(N - ORIGIN_N)];
}

function getShorelineX(z) {
  const pts = [
    [-1480, -1285],
    [-970, -1325],
    [-490, -1320],
    [-100, -1255],
    [415, -1065],
    [702, -1032],
    [849, -1062],
    [1080, -1085],
    [1460, -1125]
  ];
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (z <= pts[i + 1][0]) {
      const t = (z - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

function loadOsmFeatures() {
  const osm = JSON.parse(fs.readFileSync(path.resolve('data-cache/osm_1to1.json'), 'utf8'));
  const nodeMap = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
  }

  const forests = [];
  const farmlands = [];
  const meadows = [];
  const residentials = [];
  const waters = [];
  const buildings = [];
  const roadsMain = [];
  const roadsVillage = [];
  const roadsTrack = [];

  for (const el of osm.elements) {
    if (el.type !== 'way' || !el.nodes || !el.tags) continue;
    const pts = [];
    for (const nid of el.nodes) {
      const n = nodeMap.get(nid);
      if (n) pts.push(projectLatLon(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    const t = el.tags;
    if (t.highway) {
      if (t.highway === 'secondary' || t.highway === 'tertiary') roadsMain.push(pts);
      else if (t.highway === 'track' || t.highway === 'service') roadsTrack.push(pts);
      else roadsVillage.push(pts);
    } else if (t.building && pts.length >= 3) {
      buildings.push(pts);
    } else if ((t.landuse === 'forest' || t.natural === 'wood') && pts.length >= 3) {
      forests.push(pts);
    } else if (t.landuse === 'farmland' && pts.length >= 3) {
      farmlands.push({ id: el.id, pts });
    } else if (t.landuse === 'meadow' && pts.length >= 3) {
      meadows.push({ id: el.id, pts });
    } else if (t.landuse === 'residential' && pts.length >= 3) {
      residentials.push(pts);
    } else if (t.natural === 'water' && pts.length >= 3) {
      waters.push(pts);
    }
  }

  return { forests, farmlands, meadows, residentials, waters, buildings, roadsMain, roadsVillage, roadsTrack };
}

/**
 * Sanitizes a raw Bavaria DOP20 aerial tile into a clean, glare-free Bavarian countryside colour base:
 * removes ALL bright white roofs, pale concrete/gravel smears, and black cast shadows that otherwise read
 * as "melting snow" on the terrain, while preserving subtle natural field/meadow tonal rhythm!
 */
function sanitizeDopToMeadowBase(rawBuf, w, h, ch) {
  const out = Buffer.alloc(w * h * 3);
  // Target rich Upper Bavarian meadow green (sRGB): RGB(92, 134, 62)
  const baseR = 92;
  const baseG = 134;
  const baseB = 62;

  for (let i = 0, o = 0; i < rawBuf.length; i += ch, o += 3) {
    const r = rawBuf[i];
    const g = rawBuf[i + 1];
    const b = rawBuf[i + 2];

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = maxC > 1 ? (maxC - minC) / maxC : 0;

    // 1. Any bright white/grey concrete, roof, road, car, or pale smear -> clean meadow green!
    // 2. Any pitch-black tree/building cast shadow -> clean deep meadow green!
    // 3. Any red/orange roof tiles leaking through raw aerial -> clean meadow green!
    const isWhiteOrGreySmear = lum > 136 && sat < 0.26;
    const isGlare = lum > 175 || (b > 135 && r > 135);
    const isRoofRed = r > g + 18 && r > b + 22;
    const isBlueWaterOrPool = b > g + 8 && b > r + 12;

    if (isWhiteOrGreySmear || isGlare || isRoofRed || isBlueWaterOrPool) {
      out[o] = baseR;
      out[o + 1] = baseG;
      out[o + 2] = baseB;
      continue;
    }

    if (lum < 56) {
      // Dark forest / shadow -> rich woodland green (never charcoal smudge!)
      out[o] = 66;
      out[o + 1] = 102;
      out[o + 2] = 48;
      continue;
    }

    // Natural vegetation / pasture / soil pixels: gently map toward our cohesive Bavarian meadow palette!
    // Keep subtle warm/cool organic variation (+/- 18% around base meadow) without any muddy grey or snow white.
    const isSoil = r > g * 0.98 && r > b * 1.18 && lum < 145;
    if (isSoil) {
      // Warm Bavarian tilled soil / golden harvest field hint blended softly
      out[o] = Math.round(baseR * 0.45 + Math.min(148, r) * 0.55);
      out[o + 1] = Math.round(baseG * 0.48 + Math.min(136, g) * 0.52);
      out[o + 2] = Math.round(baseB * 0.52 + Math.min(84, b) * 0.48);
    } else {
      // Lush meadow / pasture / tree canopy green
      const lumFactor = Math.max(0.76, Math.min(1.16, lum / 105));
      const nr = Math.round(baseR * (0.62 + 0.38 * lumFactor) + (r - lum) * 0.25);
      const ng = Math.round(baseG * (0.62 + 0.38 * lumFactor) + (g - lum) * 0.3);
      const nb = Math.round(baseB * (0.62 + 0.38 * lumFactor) + (b - lum) * 0.2);
      out[o] = Math.max(58, Math.min(132, nr));
      out[o + 1] = Math.max(92, Math.min(156, ng));
      out[o + 2] = Math.max(42, Math.min(82, nb));
    }
  }
  return out;
}

function buildQuadrantSvg(q, W, H, osm) {
  const sx = (wx) => (((wx - q.minX) / (q.maxX - q.minX)) * W).toFixed(1);
  const sy = (wz) => (((wz - q.minZ) / (q.maxZ - q.minZ)) * H).toFixed(1);
  const pxPerM = W / (q.maxX - q.minX);
  const pad = 60;

  const overlaps = (pts) => {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (z < minz) minz = z;
      if (z > maxz) maxz = z;
    }
    return maxx >= q.minX - pad && minx <= q.maxX + pad && maxz >= q.minZ - pad && minz <= q.maxZ + pad;
  };

  const toPointsAttr = (pts) => pts.map(([x, z]) => `${sx(x)},${sy(z)}`).join(' ');

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<defs>
    <pattern id="plough" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
      <rect width="14" height="14" fill="#826b49"/>
      <line x1="0" y1="3" x2="14" y2="3" stroke="#6f583a" stroke-width="2.5"/>
      <line x1="0" y1="10" x2="14" y2="10" stroke="#967e58" stroke-width="1.8"/>
    </pattern>
    <pattern id="stubble" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
      <rect width="16" height="16" fill="#9c914d"/>
      <line x1="0" y1="4" x2="16" y2="4" stroke="#8a7f40" stroke-width="2.5"/>
      <line x1="0" y1="12" x2="16" y2="12" stroke="#afa55c" stroke-width="2"/>
    </pattern>
    <pattern id="mown" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
      <rect width="18" height="18" fill="#6f9845"/>
      <rect x="0" y="0" width="18" height="9" fill="#7aa34e" fill-opacity="0.45"/>
    </pattern>
  </defs>`);

  // 1. OSM Farmland patchwork (mown meadow, maize stubble, ploughed fields, spring barley)
  const farmFills = ['url(#mown)', 'url(#stubble)', 'url(#plough)', '#6b9443', '#7ea149'];
  for (const f of osm.farmlands) {
    if (!overlaps(f.pts)) continue;
    const fill = farmFills[f.id % farmFills.length];
    parts.push(`<polygon points="${toPointsAttr(f.pts)}" fill="${fill}" fill-opacity="0.82" stroke="#537a37" stroke-width="${(2.6 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 2. OSM Meadows (fresh lush Bavarian meadow green with clean field-edge strips)
  const meadowFills = ['#5f8c40', '#679445', '#5a863d'];
  for (const m of osm.meadows) {
    if (!overlaps(m.pts)) continue;
    const fill = meadowFills[m.id % meadowFills.length];
    parts.push(`<polygon points="${toPointsAttr(m.pts)}" fill="${fill}" fill-opacity="0.58" stroke="#4f7735" stroke-width="${(1.8 * pxPerM).toFixed(1)}"/>`);
  }

  // 3. OSM Forests / Woods (deep mossy Bavarian woodland floor)
  for (const pts of osm.forests) {
    if (!overlaps(pts)) continue;
    parts.push(`<polygon points="${toPointsAttr(pts)}" fill="#3e6130" fill-opacity="0.78" stroke="#37572a" stroke-width="${(3.5 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
  }

  // 4. OSM Residential village zones (clean trimmed Bavarian village garden grass — ZERO melting snow!)
  for (const pts of osm.residentials) {
    if (!overlaps(pts)) continue;
    parts.push(`<polygon points="${toPointsAttr(pts)}" fill="#5f8b42" fill-opacity="0.72" stroke="#547f3a" stroke-width="${(2.2 * pxPerM).toFixed(1)}"/>`);
  }

  // 5. Key Village Courtyards, Church Plaza, Gravel Yards & Demolition Gravel Pit (warm stone/gravel, NEVER snow-white!)
  const spots = muensingData.spots;
  const plazas = [
    // Münsing St. Mariä Himmelfahrt churchyard gravel/cobble square
    { x: spots.muensingChurch[0] + 6, z: spots.muensingChurch[1] + 6, rx: 24, ry: 18, col: '#8d8576', edge: '#6f695c' },
    // Münsing Gasthaus Zum Altwirt & Biergarten gravel forecourt
    { x: spots.muensingAltwirt[0] - 2, z: spots.muensingAltwirt[1] - 4, rx: 22, ry: 16, col: '#8c8475', edge: '#6d675b' },
    // EDEKA Graf loading yard
    { x: spots.edeka[0], z: spots.edeka[1] + 4, rx: 24, ry: 18, col: '#696c6e', edge: '#555a58' },
    // Schloss Ammerland gravel park forecourt
    { x: spots.schlossAmmerland[0] + 10, z: spots.schlossAmmerland[1], rx: 24, ry: 22, col: '#8f8778', edge: '#716a5d' },
    // Fischerei Sebald lakeside courtyard
    { x: spots.sebaldPier[0] + 4, z: spots.sebaldPier[1] - 4, rx: 18, ry: 16, col: '#8e8677', edge: '#70695d' },
    // Home Farm working gravel yard
    { x: spots.farm[0] - 33.5, z: spots.farm[1] + 16.4, rx: 25, ry: 22, col: '#8a8274', edge: '#69724e' },
    // Old Gravel Pit Farmstead demolition yard
    { x: 165, z: 620, rx: 26, ry: 24, col: '#8f8470', edge: '#6f734d' }
  ];
  for (const p of plazas) {
    if (p.x + p.rx < q.minX - 20 || p.x - p.rx > q.maxX + 20 || p.z + p.ry < q.minZ - 20 || p.z - p.ry > q.maxZ + 20) continue;
    parts.push(`<ellipse cx="${sx(p.x)}" cy="${sy(p.z)}" rx="${(p.rx * pxPerM).toFixed(1)}" ry="${(p.ry * pxPerM).toFixed(1)}" fill="${p.col}" stroke="${p.edge}" stroke-width="${(2.0 * pxPerM).toFixed(1)}"/>`);
  }

  // 6. Clean warm gravel farm tracks & driveways (track + service)
  for (const pts of osm.roadsTrack) {
    if (!overlaps(pts)) continue;
    const pAttr = toPointsAttr(pts);
    parts.push(`<polyline points="${pAttr}" fill="none" stroke="#6f7e49" stroke-width="${(5.4 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<polyline points="${pAttr}" fill="none" stroke="#928772" stroke-width="${(3.4 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // 7. Clean Building Courtyards / Drip Edges (warm gravel perimeter + subtle foundation contact shadow under every building!)
  for (const pts of osm.buildings) {
    if (!overlaps(pts)) continue;
    const pAttr = toPointsAttr(pts);
    parts.push(`<polygon points="${pAttr}" fill="#6e685d" stroke="#8b8375" stroke-width="${(4.4 * pxPerM).toFixed(1)}" stroke-linejoin="round"/>`);
    parts.push(`<polygon points="${pAttr}" fill="#505644"/>`);
  }

  // 8. Crisp Paved Road Corridors (clean green verge + dark charcoal asphalt roadbed right under the 3D road ribbons!)
  // First draw grass shoulders, then dark asphalt beds so intersections join seamlessly!
  for (const pts of osm.roadsVillage) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#587e3d" stroke-width="${(10.0 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const pts of osm.roadsMain) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#567c3c" stroke-width="${(13.6 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const pts of osm.roadsVillage) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#4c5055" stroke-width="${(6.8 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const pts of osm.roadsMain) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#3e4247" stroke-width="${(9.4 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Home Farm East & West access driveways
  const farmYardX = spots.farm[0] - 33.5;
  const farmYardZ = spots.farm[1] + 16.4;
  const farmLanes = [
    [[farmYardX + 20, farmYardZ - 4], [-305, 921.5], [-277.6, 922.2]],
    [[farmYardX - 21, farmYardZ - 5], [-379, 914], [-395.1, 904.6]]
  ];
  for (const pts of farmLanes) {
    if (!overlaps(pts)) continue;
    parts.push(`<polyline points="${toPointsAttr(pts)}" fill="none" stroke="#857d6e" stroke-width="${(6.2 * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // 9. Starnberger See Shoreline Pebble Bank & Deep Emerald Lakebed (west quadrants)
  if (q.minX < -900) {
    const shorePoly = [];
    const bedPoly = [];
    for (let z = q.minZ - 30; z <= q.maxZ + 30; z += 25) {
      const sh = getShorelineX(z);
      shorePoly.push([sh + 6, z]);
      bedPoly.push([sh - 2, z]);
    }
    shorePoly.push([q.minX - 50, q.maxZ + 30], [q.minX - 50, q.minZ - 30]);
    bedPoly.push([q.minX - 50, q.maxZ + 30], [q.minX - 50, q.minZ - 30]);
    parts.push(`<polygon points="${toPointsAttr(shorePoly)}" fill="#928770"/>`);
    parts.push(`<polygon points="${toPointsAttr(bedPoly)}" fill="#23555e"/>`);
  }

  // 10. Small inland OSM ponds/water
  for (const pts of osm.waters) {
    if (!overlaps(pts)) continue;
    // Skip giant Starnberger See way if it covers the whole lake (handled smoothly above)
    if (pts.some(([x]) => x < -1300)) continue;
    parts.push(`<polygon points="${toPointsAttr(pts)}" fill="#2b6e78" stroke="#7d7761" stroke-width="${(1.8 * pxPerM).toFixed(1)}"/>`);
  }

  parts.push('</svg>');
  return Buffer.from(parts.join('\n'));
}

async function main() {
  const osm = loadOsmFeatures();
  const quads = [
    { name: 'dop_nw.jpg', minX: WORLD_MIN_X, maxX: MID_X, minZ: WORLD_MIN_Z, maxZ: MID_Z },
    { name: 'dop_ne.jpg', minX: MID_X, maxX: WORLD_MAX_X, minZ: WORLD_MIN_Z, maxZ: MID_Z },
    { name: 'dop_sw.jpg', minX: WORLD_MIN_X, maxX: MID_X, minZ: MID_Z, maxZ: WORLD_MAX_Z },
    { name: 'dop_se.jpg', minX: MID_X, maxX: WORLD_MAX_X, minZ: MID_Z, maxZ: WORLD_MAX_Z }
  ];

  for (const q of quads) {
    const rawPath = path.join(rawDir, q.name);
    const outPath = path.join(outDir, q.name);
    if (!fs.existsSync(rawPath)) {
      fs.copyFileSync(outPath, rawPath);
    }

    const { data, info } = await sharp(rawPath).raw().toBuffer({ resolveWithObject: true });
    const sanitized = sanitizeDopToMeadowBase(data, info.width, info.height, info.channels);
    const svgBuf = buildQuadrantSvg(q, info.width, info.height, osm);

    await sharp(sanitized, { raw: { width: info.width, height: info.height, channels: 3 } })
      .blur(2.0)
      .composite([{ input: svgBuf, top: 0, left: 0 }])
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toFile(outPath);

    console.log(`Built clean stylized ground tile ${q.name}: ${Math.round(fs.statSync(outPath).size / 1024)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
