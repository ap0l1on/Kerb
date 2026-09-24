// Steering mapping: screen-right (D / Right) must yaw the car toward screen
// right. Physics-space steer is negative for screen-right (world +x appears
// screen-left from the chase camera), so D samples negative.
import { describe, it, expect } from 'vitest';
import { Input } from '../src/core/input';

describe('steering mapping', () => {
  it('D is screen-right (negative physics steer)', () => {
    const inp = new Input();
    inp.keys.add('KeyD');
    expect(inp.sample(1 / 120).steer).toBeLessThan(0);
  });
  it('A is screen-left (positive physics steer)', () => {
    const inp = new Input();
    inp.keys.add('KeyA');
    expect(inp.sample(1 / 120).steer).toBeGreaterThan(0);
  });
  it('arrows mirror WASD', () => {
    const r = new Input();
    r.keys.add('ArrowRight');
    expect(r.sample(1 / 120).steer).toBeLessThan(0);
    const l = new Input();
    l.keys.add('ArrowLeft');
    expect(l.sample(1 / 120).steer).toBeGreaterThan(0);
  });
});
