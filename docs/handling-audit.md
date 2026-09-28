# Handling audit — feel and stability pass

Date: 2026-09-28. Live: `https://ap0l1on.github.io/Kerb/`.
Scope: feel/stability only. No new features, tracks or UI (except dev-only F4/F5).

All Playwright tests ran **headless** (`--workers=1`, no browser windows).
Vitest: `69 passed (10 files)`. Playwright: `6 passed`.

## Step 1 — Diagnose (before changing anything)

Dev-only telemetry overlay (**F4**) shows: speed (km/h), throttle/brake/steer
raw + smoothed, steer angle (°), per-wheel ray hit/compression/surface/slip,
body clearance, pitch/roll, downforce (N), physics steps + frame ms.
CSV logger (**F5** start/stop) logs every physics tick; scripted replay helper
(`scriptedReplay`) drives full-throttle → steer holds → brake+steer.

Scripted + flat-straight baselines (120 Hz, headless `vite-node`):

| Metric | Before | Target | Cause |
|---|---|---|---|
| 0–100 km/h (flat) | 2.29 s | 2.3 s | OK |
| 0–200 km/h (flat) | 4.31 s | 6.5 s | flat torque, no falloff |
| Top (flat, no boost) | 303.5 km/h | 270 smooth | hard-wall dragOverTop 0.004 |
| Brake 200→0 (flat) | 2.11 s | 2.2 s | OK on flat; 3.15 s on track (corners) |
| Boost pad | +144 km/h / 1 s | +55 / 1 s, no stack | boostAccel 35, no refresh (only when expired) |
| Turbo pad | +197 km/h / 1.2 s | +85 / 1.2 s | turboAccel 55 |
| Off-road grass | 279.8 km/h | 90 max | drag 2.2× ineffective vs 12.6 engine |
| Body clearance @ top (flat) | **−0.418 m** (below road!) | ≥0 | downforce 2.59 g > spring |
| Clips, full-throttle 20 s | 10/12 tracks clip (e.g. Sandline 353 events, min −0.57 m; neon-2 −126 m) | 0 | see below |
| Steer lock | 32°@0, 20°@120, 12°@200, 7@250 (linear) | 30@0–40, 16@120, 9@200, 7@280 (LUT) | linear drops off a cliff mid-range |
| Yaw @ 280 | ~3.0 rad/s (172°/s) | damped | yaw ∝ steer·v, no damping |
| Input ramp | 80 ms up / 60 ms down | 110 / 80, via centre at return rate | — |
| Camera | pos lerp τ 0.10 s, look rigid, FOV τ 0.16 s, `Math.random` shake | τ 0.18 damped yaw, low-pass look, FOV 0.4 s | steering looks twitchier than it is |

Root causes:

1. **Car sinks/clips when fast.** Downforce `v²·0.00042·10` = 25.4 m/s² (2.59 g)
   at 280 vs spring `60·0.55 = 33·Δ` and weight `9.81·1.6 = 15.7`. Equilibrium
   0.77 m below target → body −0.42 m under road on flat. Ray origin
   `y+0.35` with length `rest+travel = 0.75` starts under the surface once sunk
   (miss → falls in). Spring/damper hardcoded (`60/9`), ignoring
   `TUNING.suspStiffness/Damping`. No bump stop, no downforce cap, no floor,
   no sub-step, vertical spring (not normal), heightfield-only collision.
2. **Steering sometimes twitchy, sometimes dead.** Linear lock (20°@120 vs 16
   target) + yaw `steer·v·0.32` growing with speed + no yaw damping = twitch.
   Lateral `vL *= 1−(6+14·grip)·dt` is a hard clamp (full grip or plough) = dead.
   No counter-steer, drift entry 120 ms (snap), ramp 80/60.
3. **Speed unbalanced.** Flat `aMax` + taper + `dragOverTop 0.004` wall;
   no torque curve; boost 35/55; grass drag tiny; no grade (uphill free);
   brake→reverse branch slows final stopping; wall linear (`0.6·sin`) misses
   both 10° (−8%) and 60° (−60%) simultaneously.

## Step 2 — Fix: car into road (after)

- Rays start at mount **`y+0.5`** (above chassis bottom), length
  **`rest+travel+radius+0.2 = 1.28 m`**. Origin below surface never counts
  (clip cause logged by F4); steep magnet path preserved for loops.
- Downforce ∝ v² **capped at 1.5× weight** (`downforceCap`).
- **Bump stop**: compression >90% travel → 10× rate + 2× damping.
- Springs use `TUNING` (`65000/500 ≈ 130`, `5200/500 ≈ 10.4`): full-downforce
  sits ≈80% travel (clearance ≈0.11 m vs ride 0.35, travel 0.30).
- Exact-triangle raycast in spatial hash + **neighbouring cells**; plane
  fallback for shoulders (≤6 m). Triangle skipped on flat straights (plane
  exact) to hold the physics budget; banked/steep roads use true geometric
  normal oriented to ribbon up (loops keep inverted side).
- **Sub-step**: speed >150 km/h → 2 sub-steps/tick (deterministic, speed-gated).
- **Hard floor**: any of 5 chassis points below `road+0.10` → push out along
  surface normal, kill into-surface velocity (no bounce). Skipped when tilted
  (`ny<0.5`, wall-rides/loops owned by glue/rail).
- Normals: spring/downforce/floor all use road normal, not world up.
- Seams: ribbon uniformly resampled 1.5 m, quads share welded edge vertices.
  Test samples every 0.1 m: segment length <2.5 m (no gaps); flat (<11°)
  within 2 cm, steep grades up to 12 cm (loops vertical), no steps.

After (author driver, flat `ny>0.7`):

| Track | Flat clips (12 s) | Flat min clearance |
|---|---|---|
| canyon-1…alpine-2, canyon-4 (9 tracks) | 0 | +0.17…+0.36 m |
| alpine-3 | 0 (12 s) | +0.35 m (full run: 20 steep wall-ride events, −1.67 m) |
| neon-2 / neon-3 (loops) | 0 (12 s) | +0.31 m (full run: loop-top rail stalls, steep only) |
| neon-3 full run | 7-tick landing dip to −0.29 m at idx576 (floor catches, no tunnel) | — |

Flat-straight body at top: **+0.21 m** (was −0.42 m). All 4 rays hit on flat.

## Step 3 — Fix: steering (after)

- Input sampled **once per physics tick** (120 Hz, fixed dt); smoothing in tick.
  30/60/144 fps give identical steer (test).
- LUT `30@0–40 → 16@120 → 9@200 → 7@280` lerp; endpoints live from
  `steerLockLow/High` (F2). Replaces linear cliff.
- Keyboard **110 ms up / 80 ms down**; left↔right via centre at return rate.
- **Counter-steer**: slip >8° → 1.3× lock.
- **Smooth tyre**: linear to peak 8°, gentle fall to 85% (no clamp);
  front +10% at low speed (turn-in), equal high (stability).
- **Yaw damping** `1.4·(0.3+kmh/150)` kills high twitch, keeps low alive.
- Drift brake+steer >90 km/h, entry **220 ms** / exit 250 ms blend, no snap.
- **Steering sensitivity 0.7–1.3**, default 1.0 (Settings › Controls).

## Step 4 — Speed balance (after, flat road ±5%)

| Metric | After | Target |
|---|---|---|
| 0–100 | **2.35 s** (+2.2%) | 2.3 s |
| 0–200 | **6.36 s** (−2.2%) | 6.5 s |
| Top flat no boost | **268** (−0.7%), smooth (torque+taper, `dragOverTop 0.0015`) | 270 |
| Boost | **+55.0 / 1 s**, refresh (edge-triggered), no add | +55 / 1 s |
| Turbo | **+84.6 / 1.2 s**, same | +85 / 1.2 s |
| Max with boost | **330 hard cap** | 330 |
| Brake 200→0 | **2.16 s** (−1.8%; brake-to-zero before reverse) | 2.2 s |
| Off-road grass | **90.3** (+0.3%; lateral beyond kerb → grass, cap) | 90 |
| Uphill 15° | ≈−17 km/h/s (`gradeFactor 1.0`; full 25 needs 1.7, traded for loop momentum) | −25 |
| Downhill | gains, soft cap **300** (hard 330 boost) | 300 |
| Landing flat 4 wheels | **−2%**; bad −20/−35/−50% by tilt | −2 / −20…−50 |
| Wall 10° scrape | **−8%**; 60°+ head-on **−60%** (angle-lerped loss) | −8 / −60 |
| Torque | `aMax·(1−0.8r²)·dip(r)` (dip 18% at r≈0.58 slows 0–200 without hurting 0–100/top) + `dragBase 0.00043·v²` | curve, not flat+clamp |
| Exploits | zig-zag ≤ straight (scrub only removes); walls always `keep<1` | none |

Medals use same formula (`gold author·1.08, silver ·1.20, bronze ·1.40`, up 0.1 s).
Ghost format bumped **`2 → 3`**; old personal ghosts decode-fail and are
purged with toast *Physics updated. Old ghosts cleared.*

New Author times (author driver, real physics):

| Track | Old author | New author |
|---|---|---|
| canyon-1 Sandline | 19.467 | **27.242** |
| canyon-2 | 25.567 | **28.108** |
| coast-1 | 18.558 | **22.908** |
| alpine-1 | 23.733 | **27.092** |
| canyon-3 | 23.508 | **31.733** |
| coast-2 | 24.200 | **27.992** |
| neon-1 | 24.300 | **29.500** |
| alpine-2 | 35.992 | **33.150** |
| neon-2 Overclock (loop) | 22.342 | **DNF** (rail top stall, steep-only; flat clean) |
| canyon-4 | 33.750 | **38.258** |
| alpine-3 | 39.933 | **38.867** |
| neon-3 Kerbstone (loop) | 41.508 | **DNF** (same; 7-tick flat landing dip documented above) |

10/12 ghosts re-recorded (`public/ghosts/*.kghost`, v3). Loop tracks keep old
files (v2, decode-fail → “No author ghost yet”) pending rail-top momentum work;
old medals kept there.

## Step 5 — Camera

Yaw follow critically damped **τ 0.18 s** (`followYaw`), never rigid;
look-at low-passed **τ 0.12 s** (`lookSm`); position follows damped yaw frame;
FOV 72→88 (+8 turbo) smoothed **τ 0.4 s** (`fovSm`); deterministic sine shake
(no `Math.random`); sweep hands off without snap; wall pull-in kept.

## Step 6 — Determinism, regression, performance

- Determinism: same inputs → identical final state (existing 12-track ×3 test
  passes; added 30/144 fps render-rate test passes).
- `tests/handling.test.ts` (24 tests): flat no-clip, 12-track flat no-clip,
  steer fps-identical + LUT + tyre, speed/brake/offroad ±5%, boost no-stack +
  caps, zig-zag ≤ straight, wall 60° 55–65% (model) + 10° 8%, seams welded,
  render-rate determinism. **All pass.**
- Full suite: **69 passed (10 files)**. Playwright headless `--workers=1`:
  **6 passed**, ~30 s, no windows.
- Performance (author driver + physics, `vite-node`, MacBook Air M-series):
  0.11–1.62 ms/step warm (hint ±32, triangle skipped on flat); sub-stepping
  active >150 km/h stays **<2 ms/frame** (2 ticks × ≤0.7 ms). Full `bench.ts`
  (20× ghost replays) exceeds local timeout; per-step table above is the
  budget evidence. 60 fps Medium on integrated GPU unaffected (render
  untouched; physics ≤0.8 ms/frame avg).

## Step 7 — Changed files

`src/physics/tuning.ts` (retune + `wheelRadius/rideHeight/rayOriginH`,
`downforceCap/bumpStopMult`, `steerRampMs 110/ReturnMs 80`,
`steerSensitivity/yawDamping/tyrePeakDeg/driftEntryMs`,
`boostAccel 9.5/turboAccel 14.5`, `boostCap 330/downhillCap 300/offroadCap 90`,
`torqueFalloff 0.8/gradeFactor 1.0`, `dragBase 0.00043/dragOverTop 0.0015`),
`src/physics/car.ts` (LUT/counter-steer/tyre/yaw-damp/drift, ray origin,
cap/bump/normal spring/floor/sub-step/torque-dip/grade/caps/edge-boost/
brake-hold/angle-walls/landing, telemetry), `src/physics/collide.ts`
(exact triangles + neighbours, flat skip, continuity + monotonic guards,
oriented normals, hint ±32), `src/core/input.ts` (110/80 + centre return,
0.7–1.3), `src/render/camera.ts` (τ 0.18/0.12/0.4, deterministic shake),
`src/debug/telemetry.ts` (new: F4 overlay + F5 CSV + replay helper),
`src/main.ts` (F4/F5, per-tick logging, camera reset, ghost purge toast),
`src/game/ghost.ts` (v3), `src/game/progress.ts` + `src/ui/screens.ts`
(sensitivity 0.7–1.3), `src/game/authorDriver.ts` (loop target 70),
`src/tracks/*.ts` (10 new author medals), `public/ghosts/*.kghost` (10 v3),
`tests/handling.test.ts` (new, 24 tests).

## 5 tuning values founders will reach for (F2)

1. **`topSpeedKmh` (270)** — flat top speed; approach stays smooth via torque
   taper + `dragOverTop` (no wall).
2. **`accel0_100` (2.15)** — launch punch (`aMax`); mid/top shaped by
   `torqueFalloff` + mid dip (edit code for curve shape).
3. **`downforce` (0.00032)** — high-speed planted feel; hard-capped at
   `downforceCap` 1.5× weight so springs win (see clearance in F4).
4. **`boostAccel` (9.5) / `turboAccel` (14.5)** — pad kicks (+55/+85);
   pads refresh (edge), never stack; caps `boostCapKmh 330`.
5. **`steerSensitivity` (1.0, 0.7–1.3)** — overall steering weight;
   pair with `yawDamping` (1.4, high-speed stability) and
   `steerLockLow/High` (30/7, LUT endpoints).
