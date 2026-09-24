// Fixed-step accumulator with render interpolation.
// Physics runs at a fixed dt; rendering interpolates between the two latest steps.
export class FixedLoop {
  acc = 0;
  last = -1;
  constructor(
    public dt: number,
    public maxSteps = 5,
  ) {}
  /** Advance. Returns number of steps taken; calls step(dt) per step. */
  frame(frameDt: number, step: (dt: number) => void): { steps: number; alpha: number } {
    const clamped = Math.min(Math.max(frameDt, 0), 0.25);
    this.acc += clamped;
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      step(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0;
    return { steps, alpha: this.acc / this.dt };
  }
  reset(): void {
    this.acc = 0;
  }
}
