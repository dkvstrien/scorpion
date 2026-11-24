# OpenWorld Scorpion Simulator — Improvement Loop Progress

Scorecard scale: 0–3 per area (`Perf` / `First5m` / `Recog` / `Density` / `Look` / `Handling` / `Sound` / `Content` / `Finish` / `Stability`).

| Iter | Change | Scores Before → After | Evidence |
|---|---|---|---|
| 0 (Base) | Baseline capture before handoff loop (`0.65×` SRTM map, 4 archetypes, 59 km/h top speed) | `2/1/1/1/1/1/2/1/1/2` | `.scratch/loop/0/` · 60 fps · 0 errors |
| 1 | Priority A1: True `1:1` UTM32 (`3.8×2.9 km`) scale, 20 Bavaria `1 m` LiDAR `DGM1` tiles compiled to `217 KB` road-graded heightmap, `EPSG:25832` `DOP20` aerial tiles, plain start screen + OpenData Bayern credit, 6 fixed viewpoints | `2/1/1/1/1/1/2/1/1/2` → `3/2/2/1/2/1/2/1/1/2` | `.scratch/loop/1/` · 61 fps across all 6 viewpoints · 0 errors · all 6 spots `4/4` tires, `0–3°` tilt |
| 2 | Priority A2: 1,691 official Bavaria `LoD2` CityGML 3D buildings (6 merged draw calls, 45k tris) with real footprints/roof shapes, DOP20-sampled linear roof colors, 5 architectural styles (Einfirsthof, Village, Timber Barn, Machine Hall, Detached) + road-edge fix | `3/2/2/1/2/1/2/1/1/2` → `3/2/3/2/2/1/2/1/1/2` | `.scratch/loop/2/` · 60 fps · 0 errors · real gable/hip/hall roofs & colors verified |

---

## Iteration 3 — Priority A3 & A4: Open-Country Density, Atmosphere & Area Ambience (2026-11-24)

**Goal**: Finish Priority A (A3 open-country & village density + A4 sky/fog atmosphere & area-based ambient sound) and eliminate the last orphan CityGML turret cap near Schloss Ammerland.

### Changes Made
- Created & wired [src/worldDetails.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/worldDetails.ts) into [src/realWorld.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/realWorld.ts):
  - Batched wooden power/telephone poles with sagging catenary wires along secondary & tertiary roads.
  - Wooden pasture fences, hedgerow shrubs, orchard fruit trees (*Streuobstwiese*), roadside meadow grass & Bavarian wildflower tufts.
  - Bavarian wayside shrines (*Marterl*), German *Bushaltestelle* glass bus shelters with yellow-green `H` signs, yellow Deutsche Post letterboxes.
  - Neighboring farmyard clutter (golden hay & wrapped silage pyramids, stacked cordwood, green slurry tanks, tarped silage clamps under tires) across Wimpasing, Ried, Weipertshausen, Ammerland, and Münsing edges, plus Starnberger See lakeshore reed beds.
- Fixed orphan floating CityGML roof polygons mathematically in [scripts/compile-lod2-bavaria.mjs](file:///Users/danielvanstrien/Projects/Scorpion/scripts/compile-lod2-bavaria.mjs) (every roof polygon must touch ≥ 2 emitted wall vertices) and recompiled `public/map/lod2_buildings.bin` (`1,690` buildings, `45,101` tris).
- Added atmospheric horizon-to-zenith gradient Sky Dome shader with sun disc/glow synced to distance fog and clouds across Afternoon, Golden Sunset, Blue Hour Dusk, and Morning Mist in [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts).
- Added area-based ambient audio (`updateAmbience`) in [src/audio.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/audio.ts): lapping Starnberger See waves near shore, woodland birdsong in forest/open country, distant Alpine cowbells near farms, and warm breeze in villages (plus `setMasterVolume` / `setAmbienceEnabled`).

### Verification & Evidence (`.scratch/loop/3/`)
- `npx tsc --noEmit && npm run build`: clean pass (`0` errors).
- Browser verification (`agent-browser`, 0 console errors):
  - `01_muensing_church`: **60 fps** (`4/4` tires)
  - `02_zum_altwirt`: **60 fps** (`4/4` tires)
  - `03_wimpasing_farm`: **60 fps** (`4/4` tires)
  - `04_ammerland_schloss`: **60 fps** (`4/4` tires) — confirmed floating turret cap 100% gone!
  - `05_open_country`: **60 fps** (`4/4` tires) — power lines, fences, silage stack, fruit trees, wildflowers, Münsing village on horizon!
  - `06_weipertshausen`: **61 fps** (`4/4` tires)
  - Visual checks of `07_sunset_muensing.png` and `08_dusk_ammerland.png`: matched sky/fog/worklight glow.

### Scorecard Update
`Perf=3, First5m=2, Recog=3, Density=3, Look=3, Handling=1, Sound=3, Content=1, Finish=1, Stability=2`

**Next**: Iteration 4 — Priority B (Exact CLAAS Scorpion 741 Varipower handling & stability physics + automated telemetry benchmark).
