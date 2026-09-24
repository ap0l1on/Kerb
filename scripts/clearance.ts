// Clearance audit: min vertical separation between non-adjacent samples that
// overlap in XZ. Anything under ~2.5 m means intersecting roads.
import { buildSamples } from '../src/track/build';
import { TRACKS } from '../src/tracks/index';

for (const def of TRACKS) {
  const { samples } = buildSamples(def);
  let worst = Infinity;
  let worstAt = '';
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    for (let j = i + 30; j < samples.length; j++) {
      const b = samples[j];
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      if (dx * dx + dz * dz > 8 * 8) continue;
      const dy = Math.abs(a.y - b.y);
      if (dy < worst) {
        worst = dy;
        worstAt = `t=${a.t.toFixed(3)}/t=${b.t.toFixed(3)} (@${a.x.toFixed(0)},${a.y.toFixed(1)},${a.z.toFixed(0)})`;
      }
    }
  }
  console.log(`${def.id}: min clearance ${worst.toFixed(2)}m ${worstAt}`);
}
