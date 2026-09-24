# Kerb

A fast low-poly time-trial racer for the browser. Beat your ghost, chase the medals.

Short, fast tracks. Instant restart. Beat your ghost, chase the medals, send your time to a friend.

**Live:** https://ap0l1on.github.io/kerb/

## Controls

| Action | Keys | Gamepad |
|---|---|---|
| Accelerate | W / ↑ | RT |
| Brake / reverse | S / ↓ | LT |
| Steer | A D / ← → | left stick |
| Restart run | R | Y |
| Back to last checkpoint | Enter / Backspace | B |
| Pause | Esc | Start |
| Camera | C | RB |
| Ghost on/off | G | LB |
| FPS counter | F3 | — |

All keys remappable in Settings. `R` restarts instantly. Brake + steer to drift. Hit every checkpoint.

## The 12 tracks

| # | Group | Theme | Name | Signature |
|---|---|---|---|---|
| 1 | Rookie | Canyon | Sandline | Boost straight into a banked right |
| 2 | Rookie | Canyon | Mesa Run | Gentle jump over a gap |
| 3 | Rookie | Coast | Harbour Loop | Flowing seaside chicane |
| 4 | Rookie | Alpine | First Frost | Safe ice patch on a straight |
| 5 | Pro | Canyon | Red Hollow | Dirt hairpin + boost out |
| 6 | Pro | Coast | Cliffside | Cliff-edge jump onto a lower road |
| 7 | Pro | Neon | Night Shift | Banked spiral up 3 levels, turbo exit |
| 8 | Pro | Alpine | Switchback | 4 hairpins down a mountain |
| 9 | Elite | Neon | Overclock | Full loop into turbo (engine-off before) |
| 10 | Elite | Canyon | Dust Devil | Dirt drift section, two jumps |
| 11 | Elite | Alpine | Whiteout | Ice descent + wall-ride |
| 12 | Elite | Neon | Kerbstone | Boss: jump + loop + wall-ride + ice |

Pro unlocks with bronze on all Rookie tracks; Elite with gold on 3 Pro tracks.

## Ghosts & challenge links

- Your best run per track is saved locally and replayed through the same physics as a translucent ghost (toggle `G`).
- Author ghosts ship with the game (`public/ghosts/*.kghost`) — race them from any track card.
- Finish screen: **Watch replay** (orbit camera, 0.5×/1×/2×, scrub), **Share** (copies `Kerb · Sandline · 0:21.884 🥇 https://…/#t=canyon-1`), **Challenge a friend** (copies `#t=<id>&g=<code>`).
- Challenge times are **re-simulated** from inputs, never trusted from the link. Bad codes show *This challenge link is broken*.
- No global leaderboard (no server) — *Leaderboards later*.

## Dev

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run typecheck
npm run ghosts     # auto-drive author runs -> public/ghosts + times table
npm run thumbs     # build-time track thumbnails -> public/thumbs
npm run bench      # physics throughput per track
npx playwright test
```

Physics: custom deterministic raycast car, 120 Hz fixed step with render interpolation.
Stack: TypeScript (strict), Three.js, Vite, Vitest, Playwright. No physics engine, no UI framework, no backend.

## Benchmark (dev, physics sim in node)

| track | author | ticks | avg µs/step | p99 µs/step |
|---|---|---|---|---|
| canyon-1 Sandline | 0:19.467 | 2322 | 25.6 | 31.9 |
| canyon-2 Mesa Run | 0:25.567 | 3054 | 24.7 | 25.2 |
| coast-1 Harbour Loop | 0:18.558 | 2213 | 24.3 | 25.2 |
| alpine-1 First Frost | 0:23.733 | 2834 | 24.2 | 25.1 |
| canyon-3 Red Hollow | 0:23.508 | 2807 | 24.7 | 25.3 |
| coast-2 Cliffside | 0:24.200 | 2890 | 19.6 | 21.6 |
| neon-1 Night Shift | 0:24.300 | 2902 | 25.0 | 26.0 |
| alpine-2 Switchback | 0:35.992 | 4305 | 28.6 | 31.3 |
| neon-2 Overclock | 0:22.342 | 2667 | 31.8 | 63.0 |
| canyon-4 Dust Devil | 0:33.750 | 4036 | 25.3 | 30.8 |
| alpine-3 Whiteout | 0:39.933 | 4778 | 25.3 | 27.6 |
| neon-3 Kerbstone | 0:41.508 | 4967 | 25.0 | 25.6 |

Budget: under 2 ms of physics per frame on Medium (2 steps/frame = 1000 µs/step budget; we use ~25 µs). Render: steady 60 fps at 1080p on integrated GPUs (Medium); uncapped on gaming PCs.

## License

MIT — "The Kerb contributors". See LICENSE.
