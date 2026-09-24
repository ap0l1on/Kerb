// Dev benchmark (?bench): replays each author ghost through real physics in node
// and logs physics throughput + estimated headroom. Render fps must be measured
// in-browser (see README table); this covers the deterministic sim side.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrackCollider } from '../src/physics/collide';
import { buildSamples } from '../src/track/build';
import { TRACKS } from '../src/tracks/index';
import { Race } from '../src/game/race';
import { decodeGhost } from '../src/game/ghost';
import type { InputFrame } from '../src/core/input';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function benchTrack(id: string): void {
  const def = TRACKS.find((t) => t.id === id)!;
  const p = join(root, 'public', 'ghosts', `${id}.kghost`);
  if (!existsSync(p)) {
    console.log(`${id}: no author ghost (run npm run ghosts first)`);
    return;
  }
  const code = readFileSync(p, 'utf8').trim();
  const d = decodeGhost(code);
  if (!d) {
    console.log(`${id}: BROKEN ghost`);
    return;
  }
  const { samples, totalLen } = buildSamples(def);
  const col = new TrackCollider();
  col.build(samples, totalLen, def.killY);
  const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };
  // Warmup.
  for (let w = 0; w < 3; w++) {
    const r = new Race(def, col);
    r.reset(null);
    for (let i = 0; i < 300; i++) r.step(idle);
    for (const f of d.frames) r.step(f);
  }
  const times: number[] = [];
  const N = 20;
  for (let w = 0; w < N; w++) {
    const r = new Race(def, col);
    r.reset(null);
    for (let i = 0; i < 300; i++) r.step(idle);
    const t0 = performance.now();
    for (const f of d.frames) r.step(f);
    times.push((performance.now() - t0) / Math.max(1, d.frames.length));
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)] ?? avg;
  const worst = times[times.length - 1] ?? avg;
  const budget = 1000; // µs per step: 2ms physics budget per 60fps frame, 2 steps/frame
  console.log(
    `${id}: ticks=${d.frames.length} avg=${(avg * 1000).toFixed(3)}µs/step ` +
    `p99=${(p99 * 1000).toFixed(3)}µs worst=${(worst * 1000).toFixed(3)}µs ` +
    `(budget ${budget}µs/step)`,
  );
}

for (const def of TRACKS) benchTrack(def.id);
