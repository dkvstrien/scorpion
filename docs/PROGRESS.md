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

---

## Iteration 4 — Priority B: CLAAS Scorpion 741 Varipower Handling & Stability (2026-11-24)

**Goal**: Dial in real 2022 CLAAS Scorpion 741 Varipower physics (`7,640 kg`, `40 km/h` max across `15 / 30 / 40 km/h` gears, calm normal driving & wall bumps, genuine tipping only from boom height, load moment, or slope) without touching visual meshes yet.

### Changes Made
- [src/tractor.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/tractor.ts) (physics section only):
  - Set `chassisBody.mass = 7640` kg with rebalanced 4-wheel spring-damper + anti-roll bar (`kSpringFront=148000`, `kSpringRear=209000`, `cDamp=32500`, `kAntiRoll=58000`).
  - Added 3 real Varipower drive ranges (`snail` `15 km/h`, `turtle` `30 km/h`, `hare` `40 km/h`, cycle via `G` or clickable HUD badge; `Shift` engages Hare, `Alt` engages creep) with progressive 136 hp hydrostatic torque taper.
  - Added calm walking-pace static wall-bump damping (`collide` listener + `restitution: 0.0` in [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts)) and progressive speed-dependent steering & 4WS rear-axle taper.
  - Fixed high-CoG centrifugal roll torque to act purely around the longitudinal roll axis (`fwdWorld`) so elevated boom turning never creates counter-yaw and genuinely tips at top speed when the boom is raised high.
- [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts), [index.html](file:///Users/danielvanstrien/Projects/Scorpion/index.html), [src/style.css](file:///Users/danielvanstrien/Projects/Scorpion/src/style.css):
  - Fixed HUD speedometer conversion to exact metric `m/s × 3.6 = km/h`.
  - Added Varipower gear pill (`Snail 15 / Turtle 30 / Hare 40 [G]`) and Green (`<0.50`) / Yellow (`0.50–0.80`) / Red (`>0.80`) Tip-O-Meter traffic-light indicator.

### Measured Physics Evidence (`.scratch/loop/4/`, automated `agent-browser` benchmark)
| Metric | Target (HANDOFF.md) | Measured Result |
|---|---|---|
| Operating Mass | `7,640 kg` | **`7,640 kg`** |
| Snail / Turtle / Hare Top Speed | `15 / 30 / 40 km/h` | **`15.1 / 30.2 / 40.2 km/h`** |
| `0 → 30 km/h` Acceleration | Realistic heavy diesel | **`4.04–4.12 s`** |
| Full-lock turn at `25 km/h` (empty, boom down) | Lift `0` wheels (`4/4`) | **`4/4` wheels**, `2°` max roll, `tipped: false` |
| Walking-pace (`6.3 km/h`) static stone wall bump | Stay on `4/4` wheels | **`4/4` wheels**, `0°` roll, `3°` pitch, `tipped: false` |
| Boom high (`1.08 rad, 3.6 m`) + `36 km/h` full-lock turn | Genuine rollover | Inside wheels lift at **`10°`**, rolls to **`65°+`**, **`tipped: true`** (`.scratch/loop/4/07_boom_up_turn.png`) |
| Heavy load (`2,200 kg`) extended `3.6 m` | Rear wheels lift & tip forward | Rear wheels lift at **`16°`** (`2/4` tires), pitches to **`32°`**, `loadMoment=1.25` Red (`.scratch/loop/4/08_heavy_load_ext.png`) |

### Scorecard Update
`Perf=3, First5m=2, Recog=3, Density=3, Look=3, Handling=3, Sound=3, Content=1, Finish=1, Stability=2`

**Next**: Iteration 5 — Priority C (Split visual mesh code out of `src/tractor.ts` into `src/scorpionModel.ts` and rebuild the 2022 CLAAS Scorpion 741 Varipower Platform 2 / K33 model accurately!).

---

## Iteration 5 — Priority C: Accurate 2022 CLAAS Scorpion 741 Varipower Model (`src/scorpionModel.ts`) (2026-11-24)

**Goal**: Split all visual mesh code cleanly out of `src/tractor.ts` into `src/scorpionModel.ts` and rebuild the Scorpion 741 (Platform 2 / Type K33) to match the real machine without touching Priority B physics.

### Changes Made
- Created [src/scorpionModel.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/scorpionModel.ts) (`buildScorpion741Model`, `buildAttachmentMesh`) and removed ~480 lines of inline mesh construction from [src/tractor.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/tractor.ts) while keeping every physics parameter & collider untouched.
- Rebuilt the 2022 CLAAS Scorpion 741 Varipower (K33) details:
  - Offset panoramic left cab with swept dark ROPS pillars, curved skylight, rear cab glass, windshield wiper blade, wing mirrors, interior joystick console, white roof with amber rotating beacon + **4 front AND 2 rear LED worklights**.
  - Sloped CLAAS-green right engine hood with dark cooling louvres, curved exhaust stack + heat shield, and high-res **`CLAAS SCORPION 741 VARIPOWER`** side decals + **`SCORPION 741`** boom decal.
  - Stepped charcoal chassis, left-side 2-step boarding stairs & hydraulic tank, sculpted rear counterweight with bold **`CLAAS`** badge, German **`TÖL SC741`** agricultural plate, red/amber LED taillights, and **rear automatic trailer hitch + 7-pin socket**.
  - Low rear-pivoting telescopic boom alongside cab with dark wear-pad collar, **front boom wiper**, boom LED worklight, twin curved hoses, and **front 4-pin electrical socket** on boom head.
  - Directional V-chevron lugged 460/70 R24 tires on CLAAS red-orange rims with 8 chrome lug bolts and steering-mounted front mudguards.

### Verification & Evidence (`.scratch/loop/5/`)
- `npx tsc --noEmit && npm run build`: clean pass (`0` errors).
- Visual close-up inspection via `read_file`: `hero_front_right.png`, `hero_front_left.png`, `hero_rear.png`, `01_muensing_church.png` — proportions, livery, decals, hitch, worklights, and tires read clearly as a real CLAAS Scorpion 741.
- Performance & Regression Check: `01_muensing_church` **`60 fps`**, `0` console errors; 25 km/h empty boom-down full-lock turn regression **`4/4` tires, `1°` max roll**.

### Scorecard Update
`Perf=3, First5m=2, Recog=3, Density=3, Look=3, Handling=3, Sound=3, Content=1, Finish=1, Stability=2`

**Next**: Iteration 6 — Priority D (Core gameplay loop: 10 varied repeatable 3–5 min Bavarian contracting jobs across every village with star ratings & cargo spawning).

---

## Iteration 6 — Priority D: 10 Varied Repeatable Bavarian Contracting Jobs (2026-11-24)

**Goal**: Expand the core contracting loop to 10 distinct, repeatable 3–5 minute jobs with clear finish criteria, par timers, 1–3 star ratings persisted in `localStorage`, and reasons to visit every village on the map.

### Changes Made
- Upgraded [src/contracts.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/contracts.ts) to **10 varied jobs** across every village:
  1. *Wimpasing Morning Yard Shift* (Wimpasing Home Yard)
  2. *Silage Precision: 6 Sealed Bales* (Wimpasing Clamp — Bale Grabber, zero torn wraps)
  3. *Flatbed Weight-Limit Load* (Wimpasing Trailer — 4 intact pallets)
  4. *Fischerei Sebald Lakeside Delivery* (Ammerland / Starnberger See)
  5. *Schloss Ammerland Park Firewood* (Schloss Ammerland — Grapple Claw)
  6. *Ried Meadow Hay Harvest* (Ried Hamlet — Bale Spike)
  7. *Zum Altwirt Mountain Resupply* (Münsing Center — +68 m climb)
  8. *Am Kirchberg Storm Timber Clear* (Münsing Church — Grapple Claw)
  9. *EDEKA Graf Loading Dock* (East Münsing — Pallet Forks)
  10. *Weipertshausen Northern Farm Run* (Weipertshausen — Bale Grabber)
- Updated [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts), [index.html](file:///Users/danielvanstrien/Projects/Scorpion/index.html), and [src/style.css](file:///Users/danielvanstrien/Projects/Scorpion/src/style.css):
  - Added recommended attachment pill, live job timer vs par time, delivered counter, and `↻ Replay` cargo respawn button.
  - Auto-spawns pickup cargo near village job origins so every job is cleanly playable & repeatable.
  - Computes and persists 1–3 star ratings (`bestStars`) and earnings in `localStorage`.

### Verification & Evidence (`.scratch/loop/6/`)
- `npx tsc --noEmit && npm run build`: clean pass (`0` errors).
- Browser test (`agent-browser`, 0 console errors): verified all 10 contracts enumerated, cargo spawned, GPS beacon positioned, and `job10_weipert_silage.png` inspected at **`60 fps`**.

### Scorecard Update
`Perf=3, First5m=2, Recog=3, Density=3, Look=3, Handling=3, Sound=3, Content=3, Finish=1, Stability=2`

**Next**: Iteration 7 — Priority E (Free-play destruction: breakable fences/gates/bale stacks/woodpiles/walls/sheds/trees/lamps/signs with pre-split physics debris, dust/sound/camera shake, and a self-contained Old Gravel Pit demolition site at 60 fps).
