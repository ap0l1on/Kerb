# Kerb

A fast low-poly time-trial racer for the browser. Beat your ghost, chase the medals.

**Live:** https://ap0l1on.github.io/kerb/

## Play

**WASD/arrows** to drive, **R** instant restart, **Enter** back to checkpoint, **Esc** pause, **C** camera, **G** ghost. Gamepad supported; every key remappable. Brake + steer to drift. Hit every checkpoint.

12 handcrafted tracks across Rookie/Pro/Elite (Canyon, Coast, Alpine, Neon) — jumps, loops, wall-rides, ice, boost/turbo zones. Bronze on all Rookie unlocks Pro; gold on 3 Pro unlocks Elite.

Your best run per track is saved locally and raced as a translucent ghost. Author ghosts ship with the game. From the finish screen: watch replay, share your time, or send a challenge link (`#t=<id>&g=<code>`) — times are re-simulated from inputs, never trusted. No accounts, no leaderboard.

## Dev

```sh
npm install; npm run dev
npm test; npm run typecheck; npm run build
npm run ghosts   # auto-drive author runs -> public/ghosts
npm run thumbs   # build-time thumbnails -> public/thumbs
npm run bench    # physics throughput per track
npx playwright test
```

Deterministic 120 Hz custom raycast-car physics (no engine). TypeScript strict, Three.js, Vite, Vitest, Playwright. No backend.

## Benchmark (physics sim, node; ~25 µs/step vs 1000 µs budget)

| track | author | avg/p99 µs/step |
|---|---|---|
| Sandline | 0:19.467 | 25.6/31.9 |
| Mesa Run | 0:25.567 | 24.7/25.2 |
| Harbour Loop | 0:18.558 | 24.3/25.2 |
| First Frost | 0:23.733 | 24.2/25.1 |
| Red Hollow | 0:23.508 | 24.7/25.3 |
| Cliffside | 0:24.200 | 19.6/21.6 |
| Night Shift | 0:24.300 | 25.0/26.0 |
| Switchback | 0:35.992 | 28.6/31.3 |
| Overclock | 0:22.342 | 31.8/63.0 |
| Dust Devil | 0:33.750 | 25.3/30.8 |
| Whiteout | 0:39.933 | 25.3/27.6 |
| Kerbstone | 0:41.508 | 25.0/25.6 |

## License

MIT — "The Kerb contributors". See LICENSE.
