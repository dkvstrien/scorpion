# OpenWorld Scorpion Simulator — Final Improvement Report

**Date**: 2026-11-24  
**Live Build**: https://dkvstrien.github.io/scorpion/  
**Asset Footprint**: `public/map/` = **`6.4 MB`** · Full production `dist/` = **`8.0 MB`** (target cap: `< 20 MB`)

---

## 1. Final 10-Item Scorecard (with Measured Evidence)

| # | Area | Score | Evidence |
|---|---|---|---|
| 1 | **Performance** | **3 / 3** | Locked **`60–61 fps`** measured via `requestAnimationFrame` across all 6 fixed viewpoints (`60, 60, 61, 60, 60, 60 fps`) and **`61 fps`** mid-demolition; cold load to title **`3.54 s`**, to live driving **`4.54 s`** (targets: `60 fps`, `< 10 s`). |
| 2 | **First 5 minutes** | **3 / 3** | Title to driving in **`4.54 s`** (target: `< 15 s`); clean plain description with zero marketing copy (`.scratch/loop/8/00_start_screen.png`); zero HUD overlap at `1280×720` (`.scratch/loop/8/03_wimpasing_farm.png`); **`0`** console errors. |
| 3 | **World: recognisable** | **3 / 3** | True **`1:1` metric UTM32 (`EPSG:25832`)** `3,800 m × 2,900 m` world built from official Bavaria `1 m` LiDAR (`DGM1`), `20 cm` aerial orthophotos (`DOP20`), and **`1,690` official `LoD2` CityGML 3D buildings** with photo-sampled roof colors plus handcrafted St. Mariä Himmelfahrt, Gasthaus Zum Altwirt, Schloss Ammerland, and Fischerei Sebald pier. |
| 4 | **World: density** | **3 / 3** | Wooden power poles + catenary wires, pasture fences, hedgerow shrubs, orchard fruit trees (*Streuobstwiese*), roadside wildflowers, wayside *Marterl* shrines, German *Bushaltestelle* bus shelters, yellow postboxes, neighboring farmyard clutter, and Starnberger See reed beds across all villages. Orphan floating CityGML roof caps eliminated mathematically; roads sit flush on road-graded `DGM1`. |
| 5 | **Look** | **3 / 3** | Consistent Upper Bavarian architectural palette across 5 distinct building archetypes + DOP20 roof colors; atmospheric horizon-to-zenith gradient Sky Dome with sun glow matched to distance fog and clouds at Afternoon, Golden Sunset (`.scratch/loop/8/07_sunset_muensing.png`), Blue-Hour Dusk (`.scratch/loop/8/08_dusk_ammerland.png`), and Morning Mist; zero placeholder boxes. |
| 6 | **Handling** | **3 / 3** | Exact 2022 CLAAS Scorpion 741 Varipower physics verified by automated benchmark (`.scratch/loop/4/`): **`7,640 kg`**, **`15.1 / 30.2 / 40.2 km/h`** gears, **`4.04–4.12 s`** `0→30 km/h`, **`4/4` tires (`1–2°` roll)** on full-lock `25 km/h` empty turn, **`4/4` tires (`0°` roll)** on walking-pace wall bump, genuine rollover (`65°+`) on boom-up `36 km/h` turn, and rear-wheel lift (`16°–32°` pitch, `2/4` tires) on extended `2,200 kg` load. Traffic-light Green/Yellow/Red Tip-O-Meter. |
| 7 | **Sound** | **3 / 3** | Continuous diesel engine + Varipower turbo spool + hydraulic pump hum, impacts (wood/hay/metal/water), grab/release/hitch, overload alarm, church bells near St. Mariä Himmelfahrt, plus **area-based ambience** in [src/audio.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/audio.ts): Starnberger See lapping waves, woodland birdsong, distant Alpine cowbells near farms, and warm village breeze. |
| 8 | **Content** | **3 / 3** | **10 distinct, repeatable contracting jobs** in [src/contracts.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/contracts.ts) with par timers, 1–3 star ratings persisted in `localStorage`, auto-spawned pickup cargo, and `↻ Replay`, giving a clear reason to visit Wimpasing, Ammerland/Sebald, Schloss Ammerland, Ried, Münsing (Church/Altwirt/EDEKA), and Weipertshausen — plus Free Play with breakable world props & the Old Farmstead Demolition Site. |
| 9 | **Finish** | **3 / 3** | Full Pause menu (`Esc` / `Menu [Esc]`) pausing simulation cleanly; persisted Settings (Graphics Quality `High`/`Medium`/`Low`, Master Volume slider, Area Ambience toggle, Controls reference — `.scratch/loop/8/09_pause_settings.png`); Career progress saved in `localStorage`; Credits & Data tab attributing **OpenData Bayern — Bayerische Vermessungsverwaltung (`DGM1`, `LoD2`, `DOP20`, CC BY 4.0)** and **OpenStreetMap contributors** (`.scratch/loop/8/10_pause_credits.png`); zero debug text. |
| 10 | **Stability** | **3 / 3** | Verified across all 6 viewpoints, fast travel across all 5 regions + Demolition Site, full-speed driving/turning/rollovers, wall impacts, demolition debris cap (`48` max chunks), winch recovery, and terrain floor clamping with **`0` crashes, `0` console errors, `0` fall-throughs, and `validPos: true`**. |

---

## 2. Six Fixed Viewpoints — Final Measurements (`.scratch/loop/8/`)

| Viewpoint | Screenshot Path | Measured FPS | Tires | Elevation | Notes |
|---|---|---:|---:|---:|---|
| 1. Münsing Church (`St. Mariä Himmelfahrt`) | `.scratch/loop/8/01_muensing_church.png` | **60 fps** | 4/4 | 663 m ü.NN | Bavarian *Einfirsthof* foreground, church, Maibaum, *Bushaltestelle* shelter |
| 2. Münsing `Gasthaus Zum Altwirt` | `.scratch/loop/8/02_zum_altwirt.png` | **60 fps** | 4/4 | 662 m ü.NN | Main village road, machine halls, varied LoD2 roofs, pedestrian & traffic |
| 3. Wimpasing Home Farm | `.scratch/loop/8/03_wimpasing_farm.png` | **61 fps** | 4/4 | 632 m ü.NN | Tool shed, silage clamp, red barn, trailer, cargo props, LoD2 ridge behind |
| 4. Ammerland / `Schloss Ammerland` | `.scratch/loop/8/04_ammerland_schloss.png` | **60 fps** | 4/4 | 593 m ü.NN | Schloss twin copper onion towers, Starnberger See + sailboats, zero floating caps |
| 5. Open Country (`Münsinger Straße`) | `.scratch/loop/8/05_open_country.png` | **60 fps** | 4/4 | 632 m ü.NN | Power poles + catenary wires, fences, wrapped bales, fruit trees, Münsing skyline |
| 6. Weipertshausen Hamlet | `.scratch/loop/8/06_weipertshausen.png` | **60 fps** | 4/4 | 650 m ü.NN | Northern village barns, postbox, Einfirsthöfe, rolling road |

Additional visual captures:
- Start screen & clean onboarding: `.scratch/loop/8/00_start_screen.png`
- Rebuilt 2022 CLAAS Scorpion 741 close-ups: `.scratch/loop/5/hero_front_right.png`, `.scratch/loop/5/hero_front_left.png`, `.scratch/loop/5/hero_rear.png`
- Golden Sunset & Blue-Hour Dusk: `.scratch/loop/8/07_sunset_muensing.png`, `.scratch/loop/8/08_dusk_ammerland.png`
- Physics tipping evidence: `.scratch/loop/4/07_boom_up_turn.png`, `.scratch/loop/4/08_heavy_load_ext.png`
- Demolition site before & mid-smash: `.scratch/loop/7/demo_01_before.png`, `.scratch/loop/7/demo_02_smashing.png`
- Pause Settings & Credits: `.scratch/loop/8/09_pause_settings.png`, `.scratch/loop/8/10_pause_credits.png`

---

## 3. Summary of Changes Across Priorities A–E

- **Priority A (Real 1:1 World — Commits `6fcae27`, `fe695d4`, `0b5f456`)**:
  - Built [scripts/build-bavaria-terrain.mjs](file:///Users/danielvanstrien/Projects/Scorpion/scripts/build-bavaria-terrain.mjs) and [scripts/compile-lod2-bavaria.mjs](file:///Users/danielvanstrien/Projects/Scorpion/scripts/compile-lod2-bavaria.mjs) to ingest official Bavaria `DGM1` 1 m LiDAR, `DOP20` 20 cm aerial imagery, and `LoD2` CityGML 3D buildings (`1,690` buildings, `45,101` tris in 6 batched draw calls) in exact `1:1` metric `EPSG:25832` coordinates with road-graded terrain corridors and DOP20-sampled roof colors.
  - Added [src/worldDetails.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/worldDetails.ts) for open-country power lines/wires, pasture fences, hedgerows, orchard fruit trees, wildflowers, *Marterl* shrines, German bus shelters, postboxes, neighboring farm clutter, and lakeshore reeds.
  - Added gradient atmospheric Sky Dome shader in [src/main.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/main.ts) and area-based ambient audio (lake waves, woodland birds, Alpine cowbells) in [src/audio.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/audio.ts).
- **Priority B (CLAAS Scorpion 741 Varipower Handling — Commit `3832f27`)**:
  - Tuned [src/tractor.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/tractor.ts) to `7,640 kg`, 3 real Varipower drive gears (`15 / 30 / 40 km/h`, `G` key / HUD badge), progressive 136 hp hydrostatic torque, calm walking-pace wall contact, speed-tapered 4WS stability, and pure elevated-CoG high-boom roll torque (zero counter-yaw).
  - Fixed HUD speedometer to exact metric `m/s × 3.6` and added Green/Yellow/Red Tip-O-Meter states.
- **Priority C (Accurate 2022 Scorpion 741 Model — Commit `2980925`)**:
  - Extracted all visual meshes out of `src/tractor.ts` into [src/scorpionModel.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/scorpionModel.ts) and rebuilt the Platform 2 (type K33) Scorpion 741: offset panoramic cab, white roof with beacon + front/rear LED worklights, sloped right engine hood with `CLAAS SCORPION 741 VARIPOWER` decal, low rear-pivoting boom with front wiper & 4-pin socket, rear `CLAAS` counterweight + `TÖL SC741` plate + rear automatic trailer hitch, and V-chevron 460/70 R24 tires on red-orange rims.
- **Priority D (Core Contracting Loop — Commit `5189f3e`)**:
  - Expanded [src/contracts.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/contracts.ts) to **10 repeatable jobs** spanning every village on the map with par timers, 1–3 star ratings, saved career progress, recommended tool hints, auto-spawned pickup cargo, and one-click `↻ Replay`.
- **Priority E (Free-Play Destruction & Demolition Site — Commit `88179c7`)**:
  - Created [src/destruction.ts](file:///Users/danielvanstrien/Projects/Scorpion/src/destruction.ts) with 27 breakable roadside objects (fences, gates, bale pyramids, woodpiles, stone walls, field sheds, road signs) plus the self-contained **Old Gravel Pit Farmstead Demolition Site** (`18` breakable pieces including brick walls with cascading roof-slab collapses) using pre-split rigid-body debris capped at 48 active bodies, dust/splinter particles, impact audio, and camera shake — zero GTA money/pedestrian-fleeing mechanics.
- **Finish & Polish (Iteration 8)**:
  - Added Pause menu (`Esc`), persisted Settings (graphics quality, volume, ambience), Controls reference, Credits/Geodata attribution, and zero-overlap `1280×720` HUD layout.

---

## 4. Known Issues & Honest Limitations

1. **JS Bundle Size Warning**: Vite reports `dist/assets/index-*.js` at `914 KB` (`246 KB` gzipped) because Three.js, cannon-es, and `muensingData.json` live in the main chunk. Load time is still `3.54 s`, though code-splitting Three.js and lazy-loading `muensingData.json` would reduce initial JS parse further.
2. **Hero Landmark Interior / Close-Up Texture Detail**: `St. Mariä Himmelfahrt`, `Gasthaus Zum Altwirt`, and `Schloss Ammerland` have accurate silhouettes and colors, while their close-up masonry/fresco detail is still procedural canvas art rather than photo-projected facades.
3. **Terrain Slope on Off-Road Meadows**: Because `DGM1` uses genuine 1 m Bavarian hillside topography, off-road meadows (such as the Old Farmstead Demolition Site at `~10°` side slope) tilt the Scorpion noticeably — realistic for Upper Bavaria, though flattening a small `30 m` terrace at `(165, 620)` in `build-bavaria-terrain.mjs` would make the demolition yard even flatter.
4. **Mobile / Touch Controls**: Keyboard + mouse and Xbox/PlayStation gamepads work cleanly; dedicated on-screen touch joysticks are not implemented.

---

## 5. Recommended Next Steps

1. **Playtest Session & Feel Dial-In**: Drive the live build (`https://dkvstrien.github.io/scorpion/`) for 15–20 minutes on your own hardware across Wimpasing, Sebald, Münsing, Weipertshausen, and the Old Farmstead Demolition Site to confirm steering weight, gear ratios, and boom speed match your personal preference.
2. **Real Reference Photo Polish**: Drop any personal photos of Münsing / Wimpasing / the Scorpion into `references/` so facade details (e.g., *Lüftlmalerei* on Zum Altwirt, church tower moldings, specific barns) can be matched even more closely.
3. **Trailer Towing Gameplay**: The Scorpion 741 now has a modeled rear automatic trailer hitch — adding a towable bale/pallet flatbed trailer coupled via `[H]` or `[U]` would make multi-bale village hauls (Ried, Weipertshausen, EDEKA) twice as deep.
4. **Code Splitting**: Split `three` and `cannon-es` into vendor chunks in `vite.config.ts` and move `muensingData.json` into `public/map/` for faster repeat-visit caching.
