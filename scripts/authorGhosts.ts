// Author runs: pure-pursuit auto-driver plays every track through real physics,
// writes public/ghosts/<id>.kghost and prints author times (paste into TrackDefs).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKS } from '../src/tracks/index';
import { authorRun } from '../src/game/authorDriver';
import { encodeGhost } from '../src/game/ghost';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  mkdirSync(join(root, 'public', 'ghosts'), { recursive: true });
  console.log('| track | author | frames | KB |');
  console.log('|---|---|---|---|');
  for (const def of TRACKS) {
    const r = authorRun(def.id);
    if (r.time == null) {
      console.log(`| ${def.id} | DNF (maxT=${r.maxT.toFixed(3)}) | — | — |`);
      continue;
    }
    const code = encodeGhost(r.frames);
    writeFileSync(join(root, 'public', 'ghosts', `${def.id}.kghost`), code);
    console.log(`| ${def.id} | ${r.time.toFixed(3)} | ${r.frames.length} | ${(code.length / 1024).toFixed(2)} |`);
  }
}

void main();
