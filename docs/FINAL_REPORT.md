# OpenWorld Scorpion Simulator — Round 2 Build Report

**Date**: 2026-11-24  
**Live Build**: https://dkvstrien.github.io/scorpion/  
**Asset Footprint**: `public/` = **`4.8 MB`** (`public/map/` `4.1 MB` + `public/audio/` `0.5 MB`; cap: `< 20 MB`)  
**Privacy Check**: Zero personal addresses, family names, serial numbers, or farm document prices anywhere in the repository.

---

## 1. Round 2 Changes (Iterations 15–21)

### First 5 Minutes & Finish (Iter 15 — `da82c66`)
- Simplified title screen in [index.html](file:///Users/danielvanstrien/Projects/Scorpion/index.html) to 5 core bindings (`WASD`, `Q/E / R/F`, `Space`, `J`, `Esc`) and moved full controls to `Esc → Controls`.
- Enabled destination `Hints: On` by default (`settings.hints = true`) and persisted settings in `localStorage`.
- Added `Go to Job` in the Jobs drawer, a 3D overhead directional guide arrow (amber for pickup, green for drop-off), and kept the 3D waypoint beacon active for Job 1 (`yard_shift`) pointing to the next incomplete yard zone ([src/contracts.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/contracts.ts), [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts)).
- Fixed stale and truncated location and job labels (`Old Farmstead`, `Schloss Ammerland`, `Münsinger Straße`, `4. Sebald Delivery (0/1)`), separated overlapping `Ammerland`/`Wimpasing` minimap labels ([src/minimap.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/minimap.ts)), fixed `#tipped-banner` wording for empty/boom-up vs loaded rollovers, reset per-job `Rollovers` & `Damaged` counters cleanly on job change/replay, removed marketing copy and title button emojis.
- Added **Mouse Orbit Sensitivity** (`30%–200%`) in `Esc → Settings` and interactive click-to-rebind **Key Rebinding** (21 actions + `Reset Defaults`) in `Esc → Controls`.
- Oriented `#btn-tp-lake` (`Sebald & Schloss`) camera at `(-998.0, 825.0)` so Schloss Ammerland and Starnberger See sit cleanly in frame while landing stationary on flat paved Nördliche Seestraße (`0 km/h`, `4/4` tires, `1°` tilt).
- Screenshots: `.scratch/loop/15/01_title_clean.png` .. `07_demo_label_clean.png`.

### Look (Iter 16 — `692381f`)
- Regenerated `public/map/dop_nw..se.jpg` via [scripts/build-stylized-ground.mjs](file:///Users/danielvanstrien/Projects/Scorpion/scripts/build-stylized-ground.mjs): filtered grey/purple DOP20 smears, raised village lawn coverage (`0.96`), removed blurry `4.4 m` grey building halos, ghost footprints near hero landmarks, and low-res elliptical plaza discs, and added DOP-inspired mown stripes, wheat, stubble, ploughed earth, and field-edge dirt track borders.
- Replaced stretched Home Farm cobble with high-res tiled `512×512` Bavarian *Hofpflaster* pavers (`repeat 13×12`, mipmaps + 8× anisotropy, shader-feathered edge) in [src/farm.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/farm.ts), plus terrain-conformed tiled gravel courtyards for St. Mariä Himmelfahrt, Gasthaus Zum Altwirt, and Schloss Ammerland in [src/realWorld.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/realWorld.ts).
- Upgraded the Old Farmstead Demolition Site ([src/destruction.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/destruction.ts), [src/textures.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/textures.ts)) with a tiled limestone gravel pad, running-bond brick & timber *Fachwerk* barn with stone plinths and shuttered loft windows, barn-wood tool sheds with braced doors, and hay-textured bales.
- Added matched window-pane `emissiveMap` textures for all 6 habitable LoD2 facade styles plus Schloss Ammerland and Zum Altwirt, and expanded village street lamps to 18 across all villages with warm halos, ground light pools, and physical-unit `PointLight` lighting at sunset and dusk.
- Screenshots: `.scratch/loop/16/01_home_farm_cobble.png` .. `08_open_country_fields.png`.

### World Density (Iter 17 — `225d23a`)
- Upgraded [src/worldDetails.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/worldDetails.ts) with paved-road clearance checks (`distToPavedRoad`) and batched `InstancedMesh` open-country rural scenery across Münsinger Straße (`x 220–1150`) and the Wimpasing–Ried–Weipertshausen corridors: golden wheat/barley strips, Bavarian maize rows with tassels, continuous field-edge hedgerows (`Hecken`), woodland undergrowth, 7 Bavarian hay huts (`Heustadl`), 6 cattle pastures with feeding racks, troughs, and 26 grazing Fleckvieh cows, 6 parked vintage tractors (with hitched hay wagons at alternating gates), and 11 wayside shrines (`Marterl`).
- Screenshots: `.scratch/loop/17/01_muensinger_str_463.png` .. `05_weipert_corridor.png`.

### Handling (Iter 18 — `65a6593`)
- Added boom-height/extension travel speed limiter (`10–15 km/h` above `30%` lift or `35%` ext, verified **`10.6 km/h`** at full lift/ext in Hare gear with `Boom Limit` pill) and debounced pre-tip stability warnings (`loadMoment > 0.72`) in [src/tractor.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/tractor.ts) and [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts).
- Tuned empty cornering body roll (`5°` visible lean at `33.3 km/h` full-lock, `4/4` tires, upright) while preserving realistic high-boom and heavy-load tipping.
- Separated off-throttle hydrostatic coasting from active reverse braking (`30.3 → 21.4 → 12.2 → 5.4 → 2.4 → 1.1 km/h` over `~5 s`).
- Graded the Home Farm yard-to-road ramp (`x ∈ [-324..-266], z ≈ 922`) in [src/terrain.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/terrain.ts) (`0°` roll, max `1°`, `4/4` tires at `30.1 km/h`).
- Replaced static roadside logs/bales at `(482, 938)` with real dynamic physics props, expanded grab reach, and added a pulsing 3D ground highlight ring + `[Space] Grab: <Label> (<kg>)` prompt (verified lifting `900 kg` pine log on first press).
- Screenshots: `.scratch/loop/18/01_yard_exit_smooth.png` .. `05_grabbed_open_country_log.png`.

### Sound (Iter 19 — `f599622`)
- Generated 6 seamless looping `22,050 Hz` PCM `.wav` samples in `public/audio/` (`494 KB` total) via [scripts/build-audio-samples.mjs](file:///Users/danielvanstrien/Projects/Scorpion/scripts/build-audio-samples.mjs): `diesel_idle.wav`, `diesel_load.wav`, `hydraulic_pump.wav`, `surface_tarmac.wav`, `surface_gravel.wav`, `surface_grass.wav`.
- Upgraded [src/audio.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/audio.ts) to decode and crossfade layered diesel idle/load loops and hydraulic pump audio with throttle, boom-motion, squeeze, and carried-mass pitch modulation, plus smooth surface rolling crossfades driven by live ground surface and wheel speed.
- Added a `100 m` spatial hash over all `2,022` real OSM road segments in `getSurfaceType(x, z)` ([src/terrain.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/terrain.ts)) distinguishing paved `'asphalt'`, `'gravel'` tracks/courtyards, `'grass'` meadows, and `'mud'`/`'water'` shorelines (also keeping chevron tire tracks off paved asphalt).
- Screenshots: `.scratch/loop/19/01_home_farm_gravel.png` .. `04_meadow_grass.png`.

### Content & Progression (Iter 20 — `709506f`)
- Added **Farm Workshop (`[B]`)** tab in the Pause Menu and Jobs drawer with persistent `localStorage` progression ([src/contracts.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/contracts.ts), [src/tractor.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/tractor.ts), [index.html](file:///Users/danielvanstrien/Projects/Scorpion/index.html), [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts)):
  - Career unlockable attachments (`Bale Grabber €350`, `Grapple Claw €500`, `Scoop Bucket €600`; `Pallet Forks` & `Bale Spike` unlocked from start; all 5 remain unlocked in Free Play).
  - Machine & regional upgrades (`Varipower Hydraulic Boost €900`, `Rear Counterweight +750 kg €1,250`, `All-Terrain Lug Tires & 160 hp Tune €1,550`, `Ried & EDEKA Depot Pass €800`).
- Built **Lagerhaus Ried Agricultural Co-op & Service Bay** (`-262, 394`) with leveled gravel yard, on-site owned-tool swapping (`[T]`), live commodity buy-in for hay/silage/logs (`€240–€300`), Contract **11 (`11. Ried Co-op Timber & Feed Depot`)**, and `Ried Co-op` fast travel.
- Built **EDEKA Graf Bauernmarkt Stall** (`1587, 906.5`) on a leveled forecourt beside `Höhenrainer Straße` with live direct buy-in for produce pallets (`€260`) and harvest pumpkins (`€140`, `+25%` with Depot Pass), nearby roadside pumpkins, Contract **12 (`12. EDEKA Autumn Pumpkin Market`)**, and `EDEKA Market` fast travel.
- Screenshots: `.scratch/loop/20/01_jobs_12_and_workshop_btn.png` .. `06_edeka_market_closeup.png`.

---

## 2. Performance Verification — True 60 Hz Chromium (`1280×720` at DPR 2)

Measured via Chrome DevTools Protocol in **Chromium (`Brave macOS`, 60 Hz display VSync, `1280×720` Retina DPR 2)** across 150 consecutive `requestAnimationFrame` frames per viewpoint (`.scratch/loop/21/chrome_60hz_fps.json`):
- **60 Hz VSync Control (`about:blank`)**: `58.3 fps` (`avg 16.67 ms`, `max 18.2 ms`, `0` frames > 33 ms).
- **Cold Load**: `5.26 s` to Title Screen, `7.58 s` to Live Driving (local Vite dev server).
- **Console / Page Errors**: **`0` console errors, `0` page errors**.

| Viewpoint | Screenshot Path | Measured FPS | Avg Frame | p95 Frame | Max Frame | > 33 ms | > 50 ms | Tires | Elev |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1. Münsing Church (`St. Mariä Himmelfahrt`) | `.scratch/loop/21/chrome_01_muensing_church.png` | **59.7 fps** | 16.66 ms | 18.1 ms | 18.6 ms | 0 | 0 | 4/4 | 663 m |
| 2. Münsing `Gasthaus Zum Altwirt` | `.scratch/loop/21/chrome_02_zum_altwirt.png` | **59.8 fps** | 16.67 ms | 18.5 ms | 18.6 ms | 0 | 0 | 4/4 | 662 m |
| 3. Wimpasing Home Farm | `.scratch/loop/21/chrome_03_wimpasing_farm.png` | **59.8 fps** | 16.67 ms | 18.1 ms | 18.6 ms | 0 | 0 | 4/4 | 633 m |
| 4. Ammerland / `Schloss Ammerland` | `.scratch/loop/21/chrome_04_ammerland_schloss.png` | **59.8 fps** | 16.66 ms | 18.0 ms | 18.6 ms | 0 | 0 | 4/4 | 593 m |
| 5. Open Country (`Münsinger Straße`) | `.scratch/loop/21/chrome_05_open_country.png` | **59.8 fps** | 16.67 ms | 18.4 ms | 18.8 ms | 0 | 0 | 4/4 | 632 m |
| 6. Weipertshausen Hamlet | `.scratch/loop/21/chrome_06_weipertshausen.png` | **59.9 fps** | 16.67 ms | 18.3 ms | 18.7 ms | 0 | 0 | 4/4 | 650 m |

---

## 3. Stability Verification — 30-Minute Endurance Drive Log

Executed inside live Chromium (`1280×720` DPR 2) running **`108,000` fixed `1/60 s` physics & game-loop ticks (`30.0` simulated minutes across `161.1 s` wall clock)** over 6 multi-terrain legs (`.scratch/loop/21/endurance_30min_log.json`):

- **Total Distance Driven**: **`7.96 km`** (`589–666 m ü.NN`)
- **NaN Position/Physics Violations**: **`0`**
- **Terrain Fall-Through Violations**: **`0`**
- **Unrecovered Crashes / Rollovers**: **`0`**
- **Console / Page Errors**: **`0` / `0`**
- **JS Heap Memory**: `88.0 MB` start → `90.5 MB` end (steady `65–97 MB` GC sawtooth, zero upward leak)

| Leg (5 simulated min each) | Terrain Covered | Distance | Elev Range | NaN / Fall-through | Proof Screenshot |
|---|---|---:|---:|---:|---|
| Leg 1 (Min 01–05) | Home Farm & Wimpasing roads | 0.43 km | 633–634 m | 0 / 0 | `.scratch/loop/21/endurance_01_wimpasing_roads.png` |
| Leg 2 (Min 06–10) | Starnberger See lake shore & Sebald Pier | 1.06 km | 589–594 m | 0 / 0 | `.scratch/loop/21/endurance_02_lakeshore.png` |
| Leg 3 (Min 11–15) | Open-country meadows & off-road slopes | 1.76 km | 632–654 m | 0 / 0 | `.scratch/loop/21/endurance_03_open_fields.png` |
| Leg 4 (Min 16–20) | Münsing Village (Church, Altwirt, EDEKA) | 0.44 km | 657–666 m | 0 / 0 | `.scratch/loop/21/endurance_04_muensing_village.png` |
| Leg 5 (Min 21–25) | Ried Co-op & rural backroads | 2.02 km | 639–647 m | 0 / 0 | `.scratch/loop/21/endurance_05_ried_backroads.png` |
| Leg 6 (Min 26–30) | Weipertshausen northern hills | 2.25 km | 641–657 m | 0 / 0 | `.scratch/loop/21/endurance_06_weipertshausen_30min.png` |

---

## 4. Known Notes & Limitations

- The 30-minute endurance stability log ran `108,000` full `1/60 s` live physics/game ticks stepped in accelerated simulation time (`161.1 s` wall clock, yielding real GPU frames between each simulated minute) rather than sitting idle for 30 wall-clock minutes.
- The 6 `.wav` audio loops in `public/audio/` are offline-synthesized multi-layered PCM samples (cylinder combustion impulses, axial-piston pump fluid hiss, pebble impacts, tread hum) rather than studio field recordings of a real Deutz diesel tractor.
- LoD2 buildings use procedural canvas facade/emissive textures paired with 3D overhangs, balconies, chimneys, barn doors, and solar arrays; pedestrian and parked vehicle models remain stylized low-poly figures.
