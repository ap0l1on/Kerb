// Verify shipped author ghosts: decode + resimulate through real physics.
// The resim must finish (quantized inputs can diverge from the live run).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InputFrame } from '../src/core/input';
import { TrackCollider } from '../src/physics/collide';
import { buildSamples } from '../src/track/build';
import { TRACKS } from '../src/tracks/index';
import { Race } from '../src/game/race';
import { decodeGhost } from '../src/game/ghost';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const idle: InputFrame = { steer: 0, throttle: 0, brake: 0, respawn: false, checkpoint: false };

for (const def of TRACKS) {
  const p = join(root, 'public', 'ghosts', `${def.id}.kghost`);
  if (!existsSync(p)) {
    console.log(`${def.id}: MISSING`);
    continue;
  }
  const code = readFileSync(p, 'utf8').trim();
  const d = decodeGhost(code);
  if (!d) {
    console.log(`${def.id}: BROKEN CODE`);
    continue;
  }
  const { samples, totalLen } = buildSamples(def);
  const col = new TrackCollider();
  col.build(samples, totalLen, def.killY);
  const race = new Race(def, col);
  race.reset(null);
  for (let i = 0; i < 340; i++) race.step(idle);
  let maxT = 0;
  for (const f of d.frames) {
    race.step(f);
    maxT = Math.max(maxT, samples[race.car.sampleIndex]?.t ?? 0);
    if (race.phase === 'finished') break;
  }
  const status = race.phase === 'finished' ? `OK ${race.finishTime.toFixed(3)}` : `DNF (maxT=${maxT.toFixed(3)})`;
  console.log(`${def.id}: ${status} (author ${def.medals.author.toFixed(3)})`);
}
