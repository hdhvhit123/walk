import { fromXY, pathLengthM, pointAlong, toXY, type LatLng } from './geo';
import { seeded } from './rng';
import { StepDetector, type AccelSample } from './steps';
import type { GapReason, SensorEvent } from './verify';

/**
 * Synthetic sensor traces for field-test scenarios. Accelerometer samples are
 * synthesised at 50 Hz and pushed through the real StepDetector, so tests and
 * the in-app simulator exercise the same pipeline as a real walk.
 */
export type Segment =
  | { kind: 'walk'; m: number; speed?: number; cadence?: number; pocket?: boolean; spikeEveryS?: number }
  | { kind: 'run'; m: number; speed?: number; cadence?: number }
  | { kind: 'vehicle'; m: number; speed: number }
  | { kind: 'still'; s: number; shake?: boolean }
  | { kind: 'gap'; s: number; moveM?: number; reason?: GapReason }
  | { kind: 'pause'; s: number; moveM?: number };

export interface TraceOptions { startT: number; seed?: string; accuracyM?: number; motion?: boolean }

const HZ = 50;

export function buildTrace(route: LatLng[], segments: Segment[], opts: TraceOptions): SensorEvent[] {
  const rnd = seeded(opts.seed ?? 'sim');
  const gauss = () => {
    const u = Math.max(1e-9, rnd()), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const acc = opts.accuracyM ?? 6;
  const motion = opts.motion ?? true;
  const L = pathLengthM(route);
  const origin = route[0];
  const events: SensorEvent[] = [];
  const detector = new StepDetector();
  let t = opts.startT;
  let along = 0;
  let phase = 0;
  let nextFixT = t;
  let nextBeatT = t;
  let nextBumpT = t + 5000;

  const fixAt = (d: number, extraNoise = 0): SensorEvent => {
    const p = toXY(origin, pointAlong(route, Math.min(d, L)));
    const sd = acc / 3 + extraNoise;
    const q = fromXY(origin, p.x + gauss() * sd, p.y + gauss() * sd);
    return { kind: 'fix', t, lat: q.lat, lng: q.lng, acc: Math.max(3, acc + gauss()), speed: null };
  };

  /** Advance time by dt seconds while moving at `speed`, emitting sensors. */
  const run = (seconds: number, speed: number, accel: (dt: number) => number, spikeEveryS = 0) => {
    const end = t + seconds * 1000;
    let nextSpike = spikeEveryS ? t + spikeEveryS * 1000 : Infinity;
    while (t < end) {
      t += 1000 / HZ;
      along += speed / HZ;
      if (motion) {
        const m = accel(1 / HZ);
        const s: AccelSample = { t, x: 0, y: 0, z: m };
        for (const st of detector.push(s)) events.push({ kind: 'step', t: st });
        if (t >= nextBeatT) { events.push({ kind: 'motion', t }); nextBeatT = t + 1000; }
      }
      if (t >= nextFixT) {
        if (t >= nextSpike) {
          const f = fixAt(along) as Extract<SensorEvent, { kind: 'fix' }>;
          const off = fromXY(f, 250, 250);
          events.push({ ...f, lat: off.lat, lng: off.lng });
          nextSpike = t + spikeEveryS * 1000;
        } else events.push(fixAt(along));
        nextFixT = t + 1000;
      }
    }
  };

  const gait = (cadence: number, amp: number, noise: number) => (dt: number) => {
    phase += 2 * Math.PI * cadence * dt;
    return 9.81 + amp * Math.sin(phase) + noise * gauss();
  };
  const ride = (dt: number) => {
    phase += 2 * Math.PI * 12 * dt;
    let m = 9.81 + 0.25 * Math.sin(phase) + 0.15 * gauss();
    if (t >= nextBumpT) { m += 2.5; nextBumpT = t + 7000; }
    return m;
  };
  const still = () => 9.81 + 0.05 * gauss();

  for (const seg of segments) {
    switch (seg.kind) {
      case 'walk': {
        const v = seg.speed ?? 1.3;
        run(seg.m / v, v, gait(seg.cadence ?? 1.8, seg.pocket ? 3.2 : 2.4, seg.pocket ? 0.6 : 0.25), seg.spikeEveryS);
        break;
      }
      case 'run': {
        const v = seg.speed ?? 3.0;
        run(seg.m / v, v, gait(seg.cadence ?? 2.8, 6, 0.5));
        break;
      }
      case 'vehicle':
        run(seg.m / seg.speed, seg.speed, ride);
        break;
      case 'still':
        run(seg.s, 0, seg.shake ? gait(1.9, 3, 0.3) : still);
        break;
      case 'gap': {
        const from = t;
        t += seg.s * 1000;
        along += seg.moveM ?? 0;
        events.push({ kind: 'gap', from, to: t, reason: seg.reason ?? 'hidden' });
        nextFixT = t; nextBeatT = t;
        break;
      }
      case 'pause':
        events.push({ kind: 'pause', t });
        t += seg.s * 1000;
        along += seg.moveM ?? 0;
        events.push({ kind: 'resume', t });
        nextFixT = t; nextBeatT = t;
        break;
    }
  }
  return events;
}

export type ScenarioId =
  | 'walk' | 'walk-pocket' | 'walk-rest' | 'red-light' | 'gps-jump' | 'short-screen-off'
  | 'car-then-walk' | 'bus-jam' | 'motorbike-slow' | 'run' | 'screen-off' | 'pause-relocate' | 'shake-cheat'
  | 'weak-gps' | 'no-motion';

/** `expect` is the intended verdict; below `passMinRouteM` the verdict is borderline (large share of the walk unobserved). */
export const SCENARIOS: { id: ScenarioId; name: string; expect: 'pass' | 'fail'; passMinRouteM?: number }[] = [
  { id: 'walk', name: 'Đi bộ bình thường', expect: 'pass' },
  { id: 'walk-pocket', name: 'Đi bộ chậm, máy trong túi', expect: 'pass' },
  { id: 'walk-rest', name: 'Đi bộ, nghỉ ghế 90 giây', expect: 'pass' },
  { id: 'red-light', name: 'Đi bộ, dừng đèn đỏ', expect: 'pass' },
  { id: 'gps-jump', name: 'Đi bộ, GPS nhảy', expect: 'pass' },
  { id: 'short-screen-off', name: 'Đi bộ, tắt màn hình 40 giây', expect: 'pass', passMinRouteM: 400 },
  { id: 'car-then-walk', name: 'Đi ô tô rồi đi bộ đoạn cuối', expect: 'fail' },
  { id: 'bus-jam', name: 'Xe buýt kẹt đường', expect: 'fail' },
  { id: 'motorbike-slow', name: 'Xe máy chạy chậm', expect: 'fail' },
  { id: 'run', name: 'Chạy bộ gần hết tuyến', expect: 'fail' },
  { id: 'screen-off', name: 'Tắt màn hình 6 phút', expect: 'fail' },
  { id: 'pause-relocate', name: 'Tạm dừng rồi đổi chỗ', expect: 'fail' },
  { id: 'shake-cheat', name: 'Đứng yên lắc máy', expect: 'fail' },
  { id: 'weak-gps', name: 'GPS rất yếu', expect: 'fail' },
  { id: 'no-motion', name: 'Máy không có cảm biến chuyển động', expect: 'fail' },
];

export function scenarioSegments(id: ScenarioId, L: number): { segments: Segment[]; opts?: Partial<TraceOptions> } {
  const end: Segment = { kind: 'still', s: 10 };
  switch (id) {
    case 'walk': return { segments: [{ kind: 'walk', m: L + 5 }, end] };
    case 'walk-pocket': return { segments: [{ kind: 'walk', m: L + 5, speed: 0.9, cadence: 1.4, pocket: true }, end], opts: { accuracyM: 12 } };
    case 'walk-rest': return { segments: [{ kind: 'walk', m: L / 2 }, { kind: 'still', s: 90 }, { kind: 'walk', m: L / 2 + 5 }, end] };
    case 'red-light': return { segments: [{ kind: 'walk', m: L * 0.4 }, { kind: 'still', s: 45 }, { kind: 'walk', m: L * 0.6 + 5 }, end] };
    case 'gps-jump': return { segments: [{ kind: 'walk', m: L + 5, spikeEveryS: 45 }, end] };
    case 'short-screen-off': return { segments: [{ kind: 'walk', m: L * 0.4 }, { kind: 'gap', s: 40, moveM: 52 }, { kind: 'walk', m: L * 0.6 - 47 }, end] };
    case 'car-then-walk': return { segments: [{ kind: 'still', s: 5 }, { kind: 'vehicle', m: L * 0.7, speed: 8 }, { kind: 'walk', m: L * 0.3 + 5 }, end] };
    case 'bus-jam': return { segments: [{ kind: 'walk', m: L * 0.2 }, { kind: 'vehicle', m: L * 0.6, speed: 1.5 }, { kind: 'walk', m: L * 0.2 + 5 }, end] };
    case 'motorbike-slow': return { segments: [{ kind: 'vehicle', m: L * 0.8, speed: 3.5 }, { kind: 'walk', m: L * 0.2 + 5 }, end] };
    case 'run': return { segments: [{ kind: 'run', m: L * 0.8 }, { kind: 'walk', m: L * 0.2 + 5 }, end] };
    case 'screen-off': return { segments: [{ kind: 'walk', m: L * 0.3 }, { kind: 'gap', s: 360, moveM: L * 0.4 }, { kind: 'walk', m: L * 0.3 + 5 }, end] };
    case 'pause-relocate': return { segments: [{ kind: 'walk', m: L * 0.3 }, { kind: 'pause', s: 120, moveM: L * 0.5 }, { kind: 'walk', m: L * 0.2 + 5 }, end] };
    case 'shake-cheat': return { segments: [{ kind: 'still', s: 300, shake: true }] };
    case 'weak-gps': return { segments: [{ kind: 'walk', m: L + 5 }, end], opts: { accuracyM: 60 } };
    case 'no-motion': return { segments: [{ kind: 'walk', m: L + 5 }, end], opts: { motion: false } };
  }
}
