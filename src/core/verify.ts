import { distanceM, projectOnPath, type LatLng } from './geo';
import { RULES } from './rules';
import type { ReasonCode } from './reasons';

export type GapReason = 'silence' | 'hidden' | 'reload' | 'permission';

export type SensorEvent =
  | { kind: 'fix'; t: number; lat: number; lng: number; acc: number; speed?: number | null; mock?: boolean }
  | { kind: 'step'; t: number }
  /** Heartbeat emitted while accelerometer data is flowing. */
  | { kind: 'motion'; t: number }
  | { kind: 'gap'; from: number; to: number; reason: GapReason }
  | { kind: 'pause'; t: number }
  | { kind: 'resume'; t: number }
  /** Close the in-progress window now (before a reward decision), so recent walking counts. */
  | { kind: 'settle'; t: number }
  /** Activity Recognition transition (Android). Logged for calibration; not yet used in decisions. */
  | { kind: 'activity'; t: number; type: string; enter: boolean }
  /** Diagnostic note from the native recorder (e.g. GPS disabled). */
  | { kind: 'note'; t: number; msg: string };

export type WindowClass = 'WALK' | 'STATIONARY' | 'VEHICLE' | 'RUN' | 'UNKNOWN';

export interface WindowResult {
  start: number; end: number; cls: WindowClass;
  distM: number; speedMps: number; cadence: number; steps: number; fixes: number;
  gapShare: number; why: string;
}

export interface Notice { type: 'window' | 'waypoint' | 'arrived' | 'vehicleSuspect' | 'vehicleConfirmed' | 'relocated'; data?: unknown }

export interface VerifierConfig {
  route: LatLng[];
  routeLenM: number;
  target: LatLng & { radiusM: number };
  waypoints: (LatLng & { id: string })[];
  startT: number;
  motionAvailable: boolean;
}

interface AcceptedFix { t: number; lat: number; lng: number; acc: number; linked: boolean }

export interface Snapshot {
  walkM: number; runM: number; progressM: number; routeLenM: number;
  /** Route progress required: 90% of the route, or reaching the target zone along it, whichever is less. */
  progressNeedM: number;
  activeMs: number; unknownMs: number; unknownShare: number;
  arrived: boolean; vehicleConfirmed: boolean; vehicleSuspect: boolean;
  longGap: boolean; longestGapMs: number; relocations: number;
  gpsSpikes: number; lowQualityFixes: number; mockFixes: number;
  collected: string[]; currentClass: WindowClass | null; paused: boolean;
  lastFix: LatLng | null; windows: WindowResult[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Deterministic, replayable journey verifier. Feed events in arrival order;
 * every decision uses event timestamps, so replaying a stored log yields the
 * same result (used for crash recovery and for tests).
 */
export class SessionVerifier {
  private fixes: AcceptedFix[] = [];
  private steps: number[] = [];
  private motion: number[] = [];
  private gaps: { from: number; to: number; reason: GapReason }[] = [];
  private pendingJump: (AcceptedFix & { from: AcceptedFix }) | null = null;
  private cursor: number;
  private maxT: number;
  private lastSensorT: number;
  private paused = false;
  private pauseStart = 0;
  private pauseAnchor: AcceptedFix | null = null;
  private checkRelocation = false;
  private nextLinked = true;

  readonly windows: WindowResult[] = [];
  private walkM = 0;
  private runM = 0;
  private progressM = 0;
  private activeMs = 0;
  private unknownMs = 0;
  private vehicleStreak = 0;
  private vehicleConfirmed = false;
  private longGap = false;
  private longestGapMs = 0;
  private relocations = 0;
  private gpsSpikes = 0;
  private lowQualityFixes = 0;
  private arrivalCount = 0;
  private arrived = false;
  private collected = new Set<string>();
  private mockFixes = 0;
  readonly diagnostics: SensorEvent[] = [];

  constructor(private cfg: VerifierConfig) {
    this.cursor = cfg.startT;
    this.maxT = cfg.startT;
    this.lastSensorT = cfg.startT;
  }

  ingest(ev: SensorEvent): Notice[] {
    const out: Notice[] = [];
    const t = ev.kind === 'gap' ? ev.to : ev.t;
    if (t < this.cfg.startT) return out;
    if (ev.kind === 'activity' || ev.kind === 'note') {
      this.diagnostics.push(ev);
      return out;
    }

    switch (ev.kind) {
      case 'pause':
        if (this.paused) return out;
        this.closeWindows(ev.t, out, true);
        this.paused = true;
        this.pauseStart = ev.t;
        this.pauseAnchor = this.fixes.at(-1) ?? null;
        this.vehicleStreak = 0;
        return out;
      case 'resume': {
        if (!this.paused) return out;
        this.paused = false;
        const pausedMs = ev.t - this.pauseStart;
        if (pausedMs > RULES.maxPauseMs) this.longGap = true;
        this.longestGapMs = Math.max(this.longestGapMs, pausedMs > RULES.maxPauseMs ? pausedMs : 0);
        this.cursor = ev.t;
        this.lastSensorT = ev.t;
        this.maxT = Math.max(this.maxT, ev.t);
        this.checkRelocation = true;
        this.nextLinked = false;
        this.pendingJump = null;
        return out;
      }
      case 'settle':
        if (this.paused || ev.t <= this.cursor) return out;
        this.closeWindows(ev.t, out, true, 1000);
        this.maxT = Math.max(this.maxT, ev.t);
        return out;
      case 'gap':
        if (this.paused) return out;
        this.addGap(ev.from, ev.to, ev.reason);
        this.nextLinked = false;
        this.pendingJump = null;
        break;
      default:
        if (this.paused) return out;
        if (ev.t - this.lastSensorT > RULES.gapThresholdMs) {
          this.addGap(this.lastSensorT, ev.t, 'silence');
          this.nextLinked = false;
          this.pendingJump = null;
        }
        this.lastSensorT = Math.max(this.lastSensorT, ev.t);
        if (ev.kind === 'step') this.steps.push(ev.t);
        else if (ev.kind === 'motion') this.motion.push(ev.t);
        else this.onFix(ev, out);
    }
    this.maxT = Math.max(this.maxT, t);
    this.closeWindows(this.maxT - RULES.lateMs, out, false);
    return out;
  }

  private addGap(from: number, to: number, reason: GapReason) {
    if (to <= from) return;
    const last = this.gaps.at(-1);
    if (last && from <= last.to) {
      last.to = Math.max(last.to, to);
    } else {
      this.gaps.push({ from, to, reason });
    }
    const g = this.gaps.at(-1)!;
    const len = g.to - g.from;
    this.longestGapMs = Math.max(this.longestGapMs, len);
    if (len > RULES.maxGapMs) this.longGap = true;
  }

  private onFix(f: Extract<SensorEvent, { kind: 'fix' }>, out: Notice[]) {
    if (f.mock) { this.mockFixes++; return; }
    if (f.acc > RULES.maxFixAccuracyM) { this.lowQualityFixes++; return; }
    const fix: AcceptedFix = { t: f.t, lat: f.lat, lng: f.lng, acc: f.acc, linked: false };
    const last = this.fixes.at(-1);

    if (this.pendingJump && last) {
      const pj = this.pendingJump;
      this.pendingJump = null;
      if (distanceM(last, fix) >= 0.9 * distanceM(last, pj)) {
        this.accept(pj, last, out); // sustained: the move was real
      } else {
        this.gpsSpikes++; // came back: it was a spike
      }
    }
    const prev = this.fixes.at(-1);
    if (prev && this.nextLinked) {
      const dt = Math.max(0.5, (fix.t - prev.t) / 1000);
      if (distanceM(prev, fix) / dt > RULES.jumpSpeedMps) {
        this.pendingJump = { ...fix, from: prev };
        return;
      }
    }
    this.accept(fix, prev, out);
  }

  private accept(fix: AcceptedFix, prev: AcceptedFix | undefined, out: Notice[]) {
    let linked = !!prev && this.nextLinked && fix.t - prev.t <= RULES.gapThresholdMs;
    if (linked && prev) {
      const dt = Math.max(0.5, (fix.t - prev.t) / 1000);
      if (distanceM(prev, fix) / dt > RULES.teleportSpeedMps) {
        linked = false;
        this.relocations++;
        out.push({ type: 'relocated' });
      }
    }
    if (this.checkRelocation) {
      this.checkRelocation = false;
      if (this.pauseAnchor && distanceM(this.pauseAnchor, fix) > RULES.pauseRelocateM) {
        this.relocations++;
        out.push({ type: 'relocated' });
      }
    }
    this.fixes.push({ ...fix, linked });
    this.nextLinked = true;

    const inZone = distanceM(fix, this.cfg.target) <= this.cfg.target.radiusM && fix.acc <= RULES.arrivalMaxAccuracyM;
    this.arrivalCount = inZone ? this.arrivalCount + 1 : 0;
    if (inZone && this.arrivalCount >= RULES.arrivalFixes && !this.arrived) {
      this.arrived = true;
      out.push({ type: 'arrived' });
    } else if (!inZone) {
      this.arrived = false;
    }
  }

  /** Close every full window that ends at or before `upTo`; on pause also close the partial one. */
  private closeWindows(upTo: number, out: Notice[], partial: boolean, minPartialMs = RULES.windowMs / 4) {
    while (this.cursor + RULES.windowMs <= upTo) {
      this.evaluateWindow(this.cursor, this.cursor + RULES.windowMs, out);
      this.cursor += RULES.windowMs;
    }
    if (partial && upTo - this.cursor >= minPartialMs) {
      this.evaluateWindow(this.cursor, upTo, out);
      this.cursor = upTo;
    }
  }

  private evaluateWindow(start: number, end: number, out: Notice[]) {
    const dur = end - start;
    const inWin = (t: number) => t >= start && t < end;
    const fixes = this.fixes.filter((f) => inWin(f.t));
    const steps = this.steps.filter(inWin).length;
    const hasMotion = this.motion.some(inWin);
    const gapMs = this.gaps.reduce((s, g) => s + Math.max(0, Math.min(end, g.to) - Math.max(start, g.from)), 0);
    const gapShare = gapMs / dur;
    const observedS = Math.max(1, (dur - gapMs) / 1000);
    const cadence = steps / observedS;

    // Anchor = the fix before the window when the first fix links to it.
    // An unlinked fix (after a gap or relocation) restarts the anchor.
    let anchor: AcceptedFix | undefined;
    let nUsable = 0;
    if (fixes.length) {
      const idx = this.fixes.indexOf(fixes[0]);
      anchor = fixes[0].linked && idx > 0 ? this.fixes[idx - 1] : fixes[0];
      nUsable = anchor === fixes[0] ? 1 : 2;
      for (const f of fixes.slice(1)) {
        if (!f.linked) { anchor = f; nUsable = 1; } else nUsable++;
      }
    }
    const last = fixes.at(-1);
    const distM = anchor && last ? distanceM(anchor, last) : 0;
    const spanS = anchor && last ? Math.max(1, (last.t - anchor.t) / 1000) : 1;
    const speed = distM / spanS;
    const meanAcc = fixes.length ? fixes.reduce((s, f) => s + f.acc, 0) / fixes.length : 99;

    let cls: WindowClass;
    let why: string;
    const R = RULES;
    if (gapShare > R.maxGapShareInWindow) { cls = 'UNKNOWN'; why = 'gap'; }
    else if (this.cfg.motionAvailable && !hasMotion) { cls = 'UNKNOWN'; why = 'no-motion-data'; }
    else if (nUsable < R.minFixesPerWindow) {
      if (this.cfg.motionAvailable && hasMotion && steps === 0) { cls = 'STATIONARY'; why = 'no-steps-no-fix'; }
      else { cls = 'UNKNOWN'; why = 'few-fixes'; }
    }
    else if (distM < R.stationaryDistM || speed < R.stationarySpeedMps) { cls = 'STATIONARY'; why = 'little-displacement'; }
    else if (!this.cfg.motionAvailable) { cls = 'UNKNOWN'; why = 'device-limited'; }
    else if (speed >= R.vehicleFastMps && cadence < R.vehicleFastMaxCadence) { cls = 'VEHICLE'; why = 'fast'; }
    else if (speed >= R.vehicleMidMps && cadence < R.vehicleMidMaxCadence) { cls = 'VEHICLE'; why = 'moving-few-steps'; }
    else if (speed >= R.vehicleSlowMps && cadence < R.vehicleSlowMaxCadence && distM > 2 * meanAcc) { cls = 'VEHICLE'; why = 'moving-no-steps'; }
    else if (cadence >= R.runMinCadence && speed >= R.runMinSpeedMps) { cls = 'RUN'; why = 'run'; }
    else if (
      cadence >= R.walkCadence[0] && cadence <= R.walkCadence[1] &&
      speed >= R.walkSpeedMps[0] && speed <= R.walkSpeedMps[1] &&
      steps > 0 && distM / steps >= R.walkStrideM[0] && distM / steps <= R.walkStrideM[1]
    ) { cls = 'WALK'; why = 'walk'; }
    else { cls = 'UNKNOWN'; why = 'inconsistent'; }

    const w: WindowResult = { start, end, cls, distM, speedMps: speed, cadence, steps, fixes: fixes.length, gapShare, why };
    this.windows.push(w);
    this.activeMs += dur;
    if (cls === 'UNKNOWN') this.unknownMs += dur;
    if (cls === 'WALK') this.walkM += distM;
    if (cls === 'RUN') this.runM += distM;

    // Vehicle confirmation: walking/running resets the streak; rest/unknown do not (stop-and-go traffic).
    if (cls === 'VEHICLE') {
      this.vehicleStreak++;
      const certain = speed >= R.vehicleCertainMps && cadence < R.vehicleMidMaxCadence && fixes.length >= R.vehicleCertainMinFixes;
      if (!this.vehicleConfirmed && (certain || this.vehicleStreak >= R.vehicleConsecutiveWindows)) {
        this.vehicleConfirmed = true;
        out.push({ type: 'vehicleConfirmed' });
      } else if (!this.vehicleConfirmed) {
        out.push({ type: 'vehicleSuspect' });
      }
    } else if (cls === 'WALK' || cls === 'RUN') {
      this.vehicleStreak = 0;
    }

    // Route progress only advances through observed on-foot/rest windows, capped by distance moved.
    if (cls === 'WALK' || cls === 'RUN' || cls === 'STATIONARY') {
      const along = fixes
        .map((f) => projectOnPath(this.cfg.route, f))
        .filter((p) => p.offset <= R.routeCorridorM)
        .map((p) => p.along);
      if (along.length) {
        const cap = this.progressM + distM + R.progressSlackM;
        this.progressM = Math.max(this.progressM, Math.min(Math.max(...along), cap, this.cfg.routeLenM));
      }
    }

    if (cls === 'WALK') {
      for (const wp of this.cfg.waypoints) {
        if (this.collected.has(wp.id)) continue;
        if (fixes.some((f) => distanceM(f, wp) <= R.waypointRadiusM)) {
          this.collected.add(wp.id);
          out.push({ type: 'waypoint', data: wp.id });
        }
      }
    }
    out.push({ type: 'window', data: w });
  }

  snapshot(): Snapshot {
    const lastW = this.windows.at(-1);
    const lf = this.fixes.at(-1);
    return {
      walkM: this.walkM, runM: this.runM, progressM: this.progressM, routeLenM: this.cfg.routeLenM,
      progressNeedM: Math.min(RULES.minRouteProgress * this.cfg.routeLenM, this.cfg.routeLenM - this.cfg.target.radiusM),
      activeMs: this.activeMs, unknownMs: this.unknownMs,
      unknownShare: this.activeMs ? this.unknownMs / this.activeMs : 0,
      arrived: this.arrived, vehicleConfirmed: this.vehicleConfirmed,
      vehicleSuspect: !this.vehicleConfirmed && lastW?.cls === 'VEHICLE',
      longGap: this.longGap, longestGapMs: this.longestGapMs, relocations: this.relocations,
      gpsSpikes: this.gpsSpikes, lowQualityFixes: this.lowQualityFixes, mockFixes: this.mockFixes,
      collected: [...this.collected], currentClass: lastW?.cls ?? null, paused: this.paused,
      lastFix: lf ? { lat: lf.lat, lng: lf.lng } : null,
      windows: this.windows,
    };
  }

  /** Median cadence over walking windows, for the result screen. */
  walkCadence(): number {
    return median(this.windows.filter((w) => w.cls === 'WALK').map((w) => w.cadence));
  }
}

export interface ClaimContext { alreadyClaimed: boolean; clockOk: boolean; dailyLimitReached: boolean }

/** Reward decision with reasons. The UI only displays this; it never decides. */
export function evaluateEligibility(s: Snapshot, motionAvailable: boolean, ctx: ClaimContext): { eligible: boolean; reasons: ReasonCode[] } {
  const reasons: ReasonCode[] = [];
  if (!ctx.clockOk) reasons.push('CLOCK_TAMPER');
  if (ctx.alreadyClaimed) reasons.push('ALREADY_CLAIMED');
  if (ctx.dailyLimitReached && !ctx.alreadyClaimed) reasons.push('DAILY_LIMIT');
  if (!motionAvailable) reasons.push('DEVICE_LIMITED');
  if (s.mockFixes > 0) reasons.push('MOCK_LOCATION');
  if (s.vehicleConfirmed) reasons.push('VEHICLE_CONFIRMED');
  if (s.longGap) reasons.push('LONG_GAP');
  if (motionAvailable && !s.vehicleConfirmed && !s.longGap) {
    if (s.unknownShare > RULES.maxUnknownShare) reasons.push('LOW_COVERAGE');
    if (s.progressM < s.progressNeedM) reasons.push('INSUFFICIENT_PROGRESS');
    if (s.walkM < RULES.minWalkShare * s.routeLenM) reasons.push('INSUFFICIENT_WALK');
  }
  if (!s.arrived) reasons.push('NOT_AT_TARGET');
  return { eligible: reasons.length === 0, reasons };
}

export function checkStart(start: LatLng, fix: { lat: number; lng: number; acc: number } | null): ReasonCode | null {
  if (!fix) return 'START_NO_FIX';
  if (fix.acc > RULES.startMaxAccuracyM) return 'START_LOW_ACCURACY';
  if (distanceM(start, fix) > RULES.startMaxDistM) return 'START_TOO_FAR';
  return null;
}
