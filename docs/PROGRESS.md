# OpenWorld Scorpion Simulator — Improvement Loop Progress

Scorecard scale: 0–3 per area (`Perf` / `First5m` / `Recog` / `Density` / `Look` / `Handling` / `Sound` / `Content` / `Finish` / `Stability`).

| Iter | Change | Scores Before → After | Evidence |
|---|---|---|---|
| 0 (Base) | Baseline capture before handoff loop (`0.65×` SRTM map, 4 archetypes, 59 km/h top speed) | `2/1/1/1/1/1/2/1/1/2` | `.scratch/loop/0/` · 60 fps · 0 errors |
| 1 | Priority A1: True `1:1` UTM32 (`3.8×2.9 km`) scale, 20 Bavaria `1 m` LiDAR `DGM1` tiles compiled to `217 KB` road-graded heightmap, `EPSG:25832` `DOP20` aerial tiles, plain start screen + OpenData Bayern credit, 6 fixed viewpoints | `2/1/1/1/1/1/2/1/1/2` → `3/2/2/1/2/1/2/1/1/2` | `.scratch/loop/1/` · 61 fps across all 6 viewpoints · 0 errors · all 6 spots `4/4` tires, `0–3°` tilt |
