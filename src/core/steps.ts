export interface AccelSample { t: number; x: number; y: number; z: number }

/**
 * Step detector on accelerometer magnitude (accelerationIncludingGravity).
 * - slow EMA tracks gravity, fast EMA smooths the dynamic part;
 * - a step is a peak above an adaptive threshold, ≥ 250 ms after the last;
 * - steps are only emitted once 4 consecutive peaks have walking-like
 *   intervals (0.25–2 s), so isolated bumps (potholes, phone taps) do not count.
 */
export class StepDetector {
  private gravity: number | null = null;
  private smooth = 0;
  private prev = 0;
  private rising = false;
  private peakAvg = 1.5;
  private lastPeakT = -Infinity;
  private pending: number[] = [];
  private confirmed = false;

  static readonly MIN_THRESHOLD = 0.9; // m/s²
  static readonly MIN_INTERVAL = 250;
  static readonly MAX_INTERVAL = 2000;
  static readonly CHAIN = 4;

  push(s: AccelSample): number[] {
    const m = Math.hypot(s.x, s.y, s.z);
    this.gravity = this.gravity === null ? m : this.gravity + 0.02 * (m - this.gravity);
    const dyn = m - this.gravity;
    this.smooth += 0.35 * (dyn - this.smooth);
    const out: number[] = [];
    const goingDown = this.smooth < this.prev;
    if (this.rising && goingDown) {
      const peak = this.prev;
      const threshold = Math.max(StepDetector.MIN_THRESHOLD, 0.45 * this.peakAvg);
      if (peak > threshold && s.t - this.lastPeakT >= StepDetector.MIN_INTERVAL) {
        this.peakAvg += 0.2 * (peak - this.peakAvg);
        out.push(...this.onPeak(s.t));
        this.lastPeakT = s.t;
      }
    }
    this.rising = this.smooth > this.prev;
    this.prev = this.smooth;
    return out;
  }

  private onPeak(t: number): number[] {
    const gap = t - this.lastPeakT;
    if (gap > StepDetector.MAX_INTERVAL) {
      this.pending = [];
      this.confirmed = false;
    }
    if (this.confirmed) return [t];
    this.pending.push(t);
    if (this.pending.length >= StepDetector.CHAIN) {
      this.confirmed = true;
      const steps = this.pending;
      this.pending = [];
      return steps;
    }
    return [];
  }
}
