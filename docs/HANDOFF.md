# Handoff: next phase of OpenWorld Scorpion Simulator

Written 24 Nov 2026 after a review of the live build (https://dkvstrien.github.io/scorpion/), the code, and all of Dan's
prompts so far. Read this whole file before starting. It replaces any earlier plan where they conflict.

## What Dan wants, in his priority order

1. **The world first.** Driving around should feel like the real Münsing / Starnberger See area, with the density and
   detail of a proper open-world game: worth exploring for its own sake.
2. **Stable, believable handling.** Calm in normal driving; only unstable at speed with the boom up, or with a heavy load
   at full reach.
3. **Later:** rebuild the Scorpion model to match the real machine (spec below). The current one is clearly a Scorpion,
   so this is cosmetic and comes after the world.
4. **After that:** a core gameplay loop (short, repeatable jobs that are satisfying to finish).

Free play is an open-world sandbox. No GTA mechanics: no money for destruction, no fleeing-pedestrian systems.

## Ground rules

- **The repo is public** and every push to `main` deploys to GitHub Pages. Never commit personal data from the farm's
  documents (names, addresses, serial numbers, prices). Machine specs are fine.
- **Keep the deploy green.** Run `npm run build` before every commit. Commit in small working steps, not one big batch.
- **No marketing copy.** Remove claims like "True 6.8-ton rigid-body physics" and "730+ buildings" from the start screen.
  Describe the game plainly.
- **Prove it before you claim it.** For anything visual, take screenshots from the fixed viewpoints below and look at
  them. For handling, report measured numbers (top speed, 0→30 km/h time, tilt angle at which wheels lift). Don't
  report adjectives.
- **Keep the repo light.** Cache fetched map data, but keep `public/` under about 20 MB. Don't commit raw downloads,
  and never commit anything near 100 MB.
- **Don't break what works:** the attachments, the HUD, the minimap, fast travel, gamepad support.

## Data sources: use Bavaria's official open geodata

Bavaria publishes survey-grade 3D data for free (OpenData Bayern, Bayerische Vermessungsverwaltung; credit it on an
About/credits screen). It is the same approach as "drive around my village" projects built on UK LIDAR, but better,
because Bavaria ships finished 3D buildings, not only point heights. All of these were checked to download on 24 Nov 2026:

| Data | What it gives | URL pattern (UTM32 km grid) |
|---|---|---|
| **LoD2 3D buildings** (CityGML) | Every building with its real footprint, height and roof shape. The 2 km tile covering Münsing has 1,158 buildings, mostly gable roofs, plus shed, flat and hip. No textures. | `https://download1.bayernwolke.de/a/lod2/citygml/{E}_{N}.gml`, 2 km tiles with even E/N, e.g. `676_5308` covers Münsing |
| **DGM1** terrain (GeoTIFF) | 1 m elevation grid; replaces Open-Elevation completely | `https://download1.bayernwolke.de/a/dgm/dgm1/{E}_{N}.tif`, 1 km tiles, about 3 MB each |
| **DOP20** aerial photos | 20 cm imagery for roof colours, ground textures and field patterns (already used via WMS) | the existing WMS in `scripts/fetch-muensing-osm.mjs` |
| **OpenStreetMap** | Roads, names, land use, POIs | already used |

Münsing village centre sits in UTM32 tile 677/5308 and Ammerland in 674/5307. The play area (about 2.4 × 1.7 km)
needs roughly 4–6 LoD2 tiles and 6–8 DGM1 tiles.

**Pipeline:** a Node script in `scripts/` downloads the tiles into a git-ignored cache (`.scratch/` or `data-cache/`).
It converts the LoD2 buildings to compact game geometry (merged glTF/GLB per area, or a small binary of roof and wall
polygons), samples each roof's colour from DOP20, and writes the terrain as a heightmap. Commit only the processed
output, and keep it lean (aim for under 15 MB for the whole map). Process offline, not at runtime.

**Style:** the goal is accurate shapes with a stylised look, not photorealism. Real footprints, heights, roof shapes
and positions do most of the work of making it read as Münsing. Materials still come from the building types in A2.

## Priority A: make the world feel real (main focus)

The current world reads as a cheap rendition, mainly for three reasons. Every regular building is the same scaled box
plus a four-sided cone roof (`realWorld.ts` `buildRealOSMBuildings`). The ground between villages is empty green. And
the map has been squashed to fit (buildings at ×0.56, the street grid at ×0.28 in places).

### A1. Fix the scale once, consistently
- Choose one world scale (1:1 metres is preferred) and apply it everywhere: roads, buildings, terrain, props and the
  tractor. A Scorpion is about 4.9 m long and 2.3 m wide, and a village house about 10–14 m by 9–12 m. If driving
  distances get too long, add fast-travel points rather than shrinking the world.
- Elevation fetching fails with 429s from Open-Elevation. Switch to Bavaria's DGM1 tiles (see Data sources), fetch
  once, and commit only the processed heightmap. The game must never fetch at runtime. Flatten and smooth a corridor
  under each OSM road so roads sit cleanly on the terrain.

### A2. Varied Bavarian buildings, not one box
Build 5–6 procedural building types, picked by OSM tags, footprint size and location:
- **Einfirsthof (traditional farmhouse):** the house and the stable or barn under one long ridge. White rendered ground
  floor, a dark-timber upper floor or gable with a wooden balcony and flower boxes, a shallow roof of about 20–25° with
  deep overhangs, red-brown tiles.
- **Village house:** white or cream render, green or brown shutters, shallow gable roof, sometimes a painted
  (Lüftlmalerei-style) gable.
- **Timber barn / Stadl:** dark weathered vertical boards, big doors, sometimes open-fronted with hay inside.
- **Modern machine hall / cattle shed:** grey or green steel cladding, low pitch, translucent roof strip.
- **Newer detached home:** plainer render, darker roof, a garage.
- **Landmarks:** St. Mariä Himmelfahrt in Münsing (onion or pointed tower as in reference photos), the Gasthaus Zum
  Altwirt, Schloss Ammerland and the Sebald fishery. Use photos as reference, not projected meshes.

Take the geometry (footprint, height, roof shape, ridge direction) from the LoD2 data, not from guesses. Use the types
above to choose materials and details: farmhouse, barn or shed is clear from size, shape and OSM tags, and roof colour
can be sampled from DOP20. Vary colours, window patterns, roof shades, chimneys, balconies and wear within each type, so no
two neighbours match. Keep draw calls down with merged geometry or instancing per type.

### A3. Fill the space between buildings
- **Land use from OSM** (`landuse=farmland|meadow|forest|residential`, `natural=water`) gives distinct ground materials:
  mown meadow, maize stubble, ploughed field, gravel yards, asphalt. The aerial tiles in `public/map/` work as colour
  reference or a faint overlay.
- **Edges and boundaries:** wooden and electric fences, hedgerows, field-edge grass strips, ditches.
- **Roadside life:** delineator posts, road signs, power and telephone poles with sagging wires, bus stops, wayside
  shrines (Marterl), a Maibaum in Münsing, benches, letterboxes, bins.
- **Farm clutter at every farm, not just the home farm:** round bale stacks, silage clamps under tyres, parked tractors
  and trailers, wood piles, slurry tanks.
- **Vegetation:** mixed spruce and beech forest with a proper edge, single field trees, fruit trees near farms,
  grass/flower patches, reeds at the lake shore.

### A4. Atmosphere
Distance fog matched to the sky, softer shadows, time of day already exists (make dusk and dawn look good), and the
Alps visible on the southern horizon as a backdrop silhouette. Water on Starnberger See with reflection or sheen and a
shoreline. Add a few ambient sounds by area: birds near forest, cowbells near farms, water at the lake.

### A5. Performance
Target 60 fps on a MacBook in Chrome. Use LOD or impostors for distant buildings and trees, and keep a draw-call
budget. Check the frame rate after every big addition.

### Acceptance check for Priority A
Save screenshots from these fixed viewpoints, before and after, in `.scratch/` (it is git-ignored). Show them to Dan.
1. Münsing church square
2. Zum Altwirt street
3. The home farm yard in Wimpasing
4. Ammerland lakeshore / Schloss
5. The road between Wimpasing and Münsing (open country)
6. Weipertshausen

## Priority B: handling and stability (can run alongside A, physics code only)

Tune to the real machine (data below):
- **Top speed:** 40 km/h maximum. Optional gears: 15 km/h (snail), 30 km/h (turtle), 40 km/h (hare). Today, boost
  allows about 66 km/h (`maxSpeed` 18.5 m/s in `tractor.ts`) and acceleration is near-instant.
- **Mass** about 7,640 kg (it's 6,800 in code), with a low centre of gravity and a heavy rear counterweight.
- **Normal driving must be calm.** A full-lock turn at 25 km/h with the boom down and empty must not lift a wheel.
  Bumping a wall at walking pace must not put it on two wheels; it currently does.
- **Instability comes from load moment and height:** the boom raised at speed, a heavy load at long reach, or a sharp
  turn on a slope. Map the tip-o-meter to the real machine's load-moment indicator: green is safe, yellow is at the
  limit, red is over.
- Report measured numbers for each of these cases after tuning.

Keep all physics changes in the physics part of `tractor.ts`. Don't touch the visual mesh code, so the model rebuild
below can happen separately later.

## Priority C (later, not now): rebuild the Scorpion model

Confirmed from the farm's own paperwork: the machine is a **CLAAS Scorpion 741 Varipower**, built 2022. Dan's reference
photo (the green Scorpion with orange rims in front of a stone building) shows the **same model and generation**:
the decal reads "741 SCORPION VARIPOWER". Use that photo as the main visual reference.

| Spec | Value |
|---|---|
| Model / platform | Scorpion 741 Varipower, Platform 2 (type K33) |
| Max lift height | 6.9 m |
| Max load | 4.1 t |
| Engine | 100 kW / 136 hp |
| Operating weight | 7,640 kg |
| Top speed | 40 km/h (gears 15 / 30 / 40 km/h) |
| Tyres | 460/70 R24 (Alliance) |
| Steering | front-axle, four-wheel, crab |
| Fitted extras | LED work lights front and rear, front boom wiper, front 4-pin socket, rear auto hitch, return-to-dig |

Before rebuilding, move all of the tractor's mesh-building code out of `tractor.ts` into its own file (for example
`src/scorpionModel.ts`), with the physics reading attachment points from it. Then the model can be replaced without
touching the handling. Key shapes: the cab offset to the left, the boom pivoting low at the rear and running alongside
the cab, the engine on the right, the stepped grey chassis, the white cab roof with beacon and lights, and the CLAAS
green/grey/white livery.

## Priority D (after A and B): the core loop

Short jobs that take 3–5 minutes each, with a clear finish and a score. For example: clear and stack this yard; deliver
6 wrapped bales without popping one; load a trailer to the weight limit without tipping. Add a reason to visit other
farms and villages, building on the existing contracts system.

## Can this be done in parallel?

Yes, split by file:
- **A (world):** `realWorld.ts`, `terrain.ts`, `textures.ts`, new world files, `scripts/`, `public/map/`
- **B (handling):** the physics sections of `tractor.ts` only
- **C (model):** start only after the mesh code has been split out of `tractor.ts`, otherwise it collides with B

If several agents work at the same time, give each its own git worktree or branch, and merge into `main` one at a time
after `npm run build` passes.
