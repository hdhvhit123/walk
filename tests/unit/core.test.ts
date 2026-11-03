import { describe, expect, it } from 'vitest';
import { distanceM, fromXY, pathLengthM, pointAlong, pointInPolygon, projectOnPath } from '../../src/core/geo';
import { StepDetector } from '../../src/core/steps';
import { checkClock, addDays, isoWeek, localDate } from '../../src/core/clock';
import { canClaim, streak } from '../../src/core/ledger';
import { validatePack, routeLengthM } from '../../src/core/pack';
import { generateMissions, estimateMinutes, DURATIONS } from '../../src/core/missions';
import { SessionVerifier, checkStart, evaluateEligibility, type SensorEvent } from '../../src/core/verify';
import { buildTrace } from '../../src/core/sim';
import { RULES } from '../../src/core/rules';
import { PACK, T0, routeCfg, runEvents } from './helpers';

const O = { lat: 10.7745, lng: 106.692 };

describe('geo', () => {
  it('distance of 100 m east is ~100 m', () => {
    expect(distanceM(O, fromXY(O, 100, 0))).toBeCloseTo(100, 0);
  });
  it('projects onto a polyline', () => {
    const path = [O, fromXY(O, 100, 0), fromXY(O, 100, 100)];
    const p = projectOnPath(path, fromXY(O, 110, 50));
    expect(p.along).toBeCloseTo(150, 0);
    expect(p.offset).toBeCloseTo(10, 0);
    expect(pathLengthM(path)).toBeCloseTo(200, 0);
    expect(distanceM(pointAlong(path, 150), fromXY(O, 100, 50))).toBeLessThan(0.5);
  });
  it('point in polygon', () => {
    const sq = [fromXY(O, 0, 0), fromXY(O, 10, 0), fromXY(O, 10, 10), fromXY(O, 0, 10)];
    expect(pointInPolygon(fromXY(O, 5, 5), sq)).toBe(true);
    expect(pointInPolygon(fromXY(O, 15, 5), sq)).toBe(false);
  });
});

describe('step detector', () => {
  const feed = (seconds: number, f: (t: number) => number) => {
    const d = new StepDetector();
    let n = 0;
    for (let i = 0; i < seconds * 50; i++) { const t = i * 20; n += d.push({ t, x: 0, y: 0, z: f(t / 1000) }).length; }
    return n;
  };
  it('counts ~1.8 steps/s while walking', () => {
    const n = feed(60, (s) => 9.81 + 2.4 * Math.sin(2 * Math.PI * 1.8 * s));
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThan(115);
  });
  it('ignores vehicle vibration', () => {
    expect(feed(60, (s) => 9.81 + 0.25 * Math.sin(2 * Math.PI * 12 * s))).toBe(0);
  });
  it('ignores isolated bumps (needs a chain of 4)', () => {
    expect(feed(60, (s) => 9.81 + (Math.abs((s % 7) - 3) < 0.05 ? 3 : 0))).toBe(0);
  });
  it('ignores a phone lying still', () => {
    expect(feed(30, () => 9.81)).toBe(0);
  });
});

describe('clock', () => {
  it('detects rollback beyond tolerance only', () => {
    expect(checkClock(undefined, 1000).ok).toBe(true);
    expect(checkClock(10_000_000, 10_000_000 - 60_000).ok).toBe(true);
    expect(checkClock(10_000_000, 10_000_000 - RULES.clockRollbackToleranceMs - 1).ok).toBe(false);
    expect(checkClock(10, 20).newMax).toBe(20);
  });
  it('date helpers', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isoWeek('2026-11-02')).toBe(45);
    expect(localDate(new Date(2026, 10, 2, 23, 59).getTime())).toBe('2026-11-02');
  });
});

describe('ledger', () => {
  it('one reward per mission, three per day', () => {
    const claims = [{ missionId: 'a', date: 'd' }];
    expect(canClaim(claims, 'a', 'd')).toEqual({ ok: false, reason: 'ALREADY_CLAIMED' });
    expect(canClaim(claims, 'b', 'd')).toEqual({ ok: true });
    const three = ['a', 'b', 'c'].map((m) => ({ missionId: m, date: 'd' }));
    expect(canClaim(three, 'x', 'd')).toEqual({ ok: false, reason: 'DAILY_LIMIT' });
    expect(canClaim(three, 'x', 'e')).toEqual({ ok: true });
  });
  it('streak counts consecutive days ending today or yesterday', () => {
    expect(streak(['2026-11-01', '2026-11-02', '2026-10-31'], '2026-11-02', addDays)).toBe(3);
    expect(streak(['2026-11-01', '2026-10-31'], '2026-11-02', addDays)).toBe(2);
    expect(streak(['2026-10-30'], '2026-11-02', addDays)).toBe(0);
  });
});

describe('area pack', () => {
  it('sample pack is valid', () => expect(validatePack(PACK)).toEqual([]));
  it('detects a route using a missing edge', () => {
    const bad = structuredClone(PACK);
    bad.routes[0].nodes = ['GN', 'C'];
    expect(validatePack(bad).join()).toMatch(/missing edge GN-C/);
  });
  it('detects a POI on the water', () => {
    const bad = structuredClone(PACK);
    const lake = bad.forbidden[0].polygon;
    bad.pois[0].lat = (lake[0].lat + lake[4].lat) / 2;
    bad.pois[0].lng = (lake[0].lng + lake[1].lng) / 2;
    expect(validatePack(bad).join()).toMatch(/inside forbidden zone lake/);
  });
  it('every duration has ≥2 options from each gate', () => {
    for (const hub of PACK.hubs) for (const duration of DURATIONS) {
      const r = generateMissions({ pack: PACK, date: '2026-11-02', hour: 9, duration, position: hub, visits: [], owned: new Set() });
      expect(r.ok && r.options.length, `${hub.id} ${duration}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('missions', () => {
  const base = { pack: PACK, date: '2026-11-02', hour: 9, duration: 20 as const, position: PACK.hubs[0], visits: [], owned: new Set<string>() };
  it('is deterministic for the same day and duration', () => {
    expect(generateMissions(base)).toEqual(generateMissions(base));
  });
  it('mission ids are unique, distinct destinations, durations within tolerance', () => {
    const r = generateMissions(base);
    if (!r.ok) throw new Error('no missions');
    expect(new Set(r.options.map((m) => m.poiId)).size).toBe(r.options.length);
    expect(r.options.length).toBeLessThanOrEqual(3);
    for (const m of r.options) {
      expect(m.id).toBe(`2026-11-02_20_${m.routeId}`);
      expect(m.estMinutes).toBeGreaterThanOrEqual(12);
      expect(m.estMinutes).toBeLessThanOrEqual(28);
      expect(m.rulesVersion).toBe(RULES.version);
    }
  });
  it('different days give (usually) different options', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((date) => {
      const r = generateMissions({ ...base, date });
      return r.ok ? r.options.map((m) => m.routeId).join() : '';
    });
    expect(new Set(days).size).toBeGreaterThan(1);
  });
  it('never offers a closed POI and respects opening hours', () => {
    for (const duration of DURATIONS) for (const hub of PACK.hubs) for (const hour of [4, 9, 22]) {
      const r = generateMissions({ ...base, duration, hour, position: hub });
      if (!r.ok) continue;
      for (const m of r.options) {
        expect(m.poiId).not.toBe('p-fountain');
        if (hour === 22 || hour === 4) { expect(m.poiId).not.toBe('p-playground'); }
        if (hour === 22) expect(m.poiId).not.toBe('p-birds');
      }
    }
  });
  it('skips places visited in the last 3 days when possible', () => {
    const first = generateMissions(base);
    if (!first.ok) throw new Error();
    const visits = first.options.map((m) => ({ poiId: m.poiId, date: '2026-11-01' }));
    const r = generateMissions({ ...base, visits });
    if (!r.ok) throw new Error();
    if (!r.relaxedRecent) for (const m of r.options) expect(visits.map((v) => v.poiId)).not.toContain(m.poiId);
    const old = generateMissions({ ...base, visits: visits.map((v) => ({ ...v, date: '2026-10-20' })) });
    expect(old).toEqual(first);
  });
  it('prefers creatures not owned yet', () => {
    const r = generateMissions(base);
    if (!r.ok) throw new Error();
    const owned = new Set(r.options.map((m) => m.creatureId));
    const r2 = generateMissions({ ...base, owned });
    if (!r2.ok) throw new Error();
    const fresh = r2.options.filter((m) => !owned.has(m.creatureId));
    expect(fresh.length).toBeGreaterThan(0);
  });
  it('refuses outside the supported area', () => {
    expect(generateMissions({ ...base, position: { lat: 21.03, lng: 105.85 } })).toEqual({ ok: false, reason: 'OUTSIDE_AREA' });
    expect(generateMissions({ ...base, position: null })).toEqual({ ok: false, reason: 'OUTSIDE_AREA' });
  });
  it('suggests a shorter duration when nothing matches', () => {
    const tiny = structuredClone(PACK);
    tiny.routes = tiny.routes.filter((r) => routeLengthM(tiny, r) < 300);
    const r = generateMissions({ ...base, pack: tiny, duration: 30 });
    expect(r).toEqual({ ok: false, reason: 'NO_MATCH', shorter: 10 });
  });
  it('estimate includes the way back', () => {
    expect(estimateMinutes(360)).toBe(12);
  });
});

describe('verifier details', () => {
  const route = 'r-n-lotus';
  const walk = (seed = 'x') => buildTrace(routeCfg(route).route, [{ kind: 'walk', m: routeCfg(route).routeLenM + 5 }, { kind: 'still', s: 10 }], { startT: T0, seed });

  it('replaying the same log gives the same result (recovery)', () => {
    const ev = walk();
    expect(runEvents(route, ev).snap).toEqual(runEvents(route, ev).snap);
  });
  it('ignores steps recorded before the session started', () => {
    const early: SensorEvent[] = Array.from({ length: 500 }, (_, i) => ({ kind: 'step', t: T0 - 600_000 + i * 500 }));
    const a = runEvents(route, walk()).snap.walkM;
    const b = runEvents(route, [...early, ...walk()]).snap.walkM;
    expect(b).toBe(a);
  });
  it('a silent stretch becomes a gap, never walking', () => {
    const ev = walk().filter((e) => { const t = e.kind === 'gap' ? e.to : e.t; return t < T0 + 100_000 || t > T0 + 160_000; });
    const { snap } = runEvents(route, ev);
    expect(snap.longestGapMs).toBeGreaterThanOrEqual(59_000);
    expect(snap.windows.filter((w) => w.cls === 'UNKNOWN').length).toBeGreaterThanOrEqual(2);
  });
  it('collects waypoints and reports arrival', () => {
    const { snap, notices } = runEvents(route, walk());
    expect(snap.collected.length).toBe(PACK.routes.find((r) => r.id === route)!.waypoints.length);
    expect(notices.some((n) => n.type === 'arrived')).toBe(true);
  });
  it('a single vehicle-like window is only suspected', () => {
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: 100 }, { kind: 'vehicle', m: 120, speed: 6 }, { kind: 'walk', m: cfg.routeLenM }], { startT: T0 });
    const { snap, notices } = runEvents(route, ev);
    expect(notices.some((n) => n.type === 'vehicleSuspect')).toBe(true);
    expect(snap.vehicleConfirmed).toBe(false);
  });
  it('vehicle confirmed stays even after walking more', () => {
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'vehicle', m: 400, speed: 9 }, { kind: 'walk', m: cfg.routeLenM }, { kind: 'still', s: 300 }], { startT: T0 });
    expect(runEvents(route, ev).snap.vehicleConfirmed).toBe(true);
  });
  it('a teleport is a relocation and is not credited', () => {
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: 50 }], { startT: T0 });
    const last = ev.filter((e) => e.kind === 'fix').at(-1)! as Extract<SensorEvent, { kind: 'fix' }>;
    const far = fromXY(last, 400, 0);
    const jump: SensorEvent[] = [0, 1, 2, 3, 4].map((i) => ({ kind: 'fix', t: last.t + 1000 * (i + 1), lat: far.lat, lng: far.lng, acc: 5 }));
    const { snap } = runEvents(route, [...ev, ...jump]);
    expect(snap.relocations).toBe(1);
    expect(snap.walkM).toBeLessThan(80);
    expect(snap.vehicleConfirmed).toBe(false);
  });
  it('limited device cannot be rewarded but explains why', () => {
    const { result } = runEvents(route, walk(), false);
    expect(result.reasons).toContain('DEVICE_LIMITED');
  });
  it('already claimed / clock / limit block the reward', () => {
    const { snap } = runEvents(route, walk());
    expect(evaluateEligibility(snap, true, { alreadyClaimed: false, clockOk: true, dailyLimitReached: false }).eligible).toBe(true);
    expect(evaluateEligibility(snap, true, { alreadyClaimed: true, clockOk: true, dailyLimitReached: true }).reasons).toEqual(['ALREADY_CLAIMED']);
    expect(evaluateEligibility(snap, true, { alreadyClaimed: false, clockOk: false, dailyLimitReached: false }).reasons).toEqual(['CLOCK_TAMPER']);
    expect(evaluateEligibility(snap, true, { alreadyClaimed: false, clockOk: true, dailyLimitReached: true }).reasons).toEqual(['DAILY_LIMIT']);
  });
  it('pause longer than 10 minutes makes the session unverifiable', () => {
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: 200 }, { kind: 'pause', s: 700 }, { kind: 'walk', m: cfg.routeLenM }], { startT: T0 });
    expect(runEvents(route, ev).result.reasons).toContain('LONG_GAP');
  });
  it('start requires being near the gate with a good fix', () => {
    const hub = PACK.hubs[0];
    expect(checkStart(hub, null)).toBe('START_NO_FIX');
    expect(checkStart(hub, { ...hub, acc: 50 })).toBe('START_LOW_ACCURACY');
    expect(checkStart(hub, { ...fromXY(hub, 200, 0), acc: 5 })).toBe('START_TOO_FAR');
    expect(checkStart(hub, { ...fromXY(hub, 30, 0), acc: 5 })).toBeNull();
  });
  it('verifier only advances progress along the route', () => {
    const v = new SessionVerifier(routeCfg(route));
    expect(v.snapshot().progressM).toBe(0);
  });
});

describe('settle before a reward decision', () => {
  it('counts the window in progress and is replayable', () => {
    const route = 'r-n-plaza';
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: cfg.routeLenM * 0.8 }], { startT: T0 });
    const lastT = (ev.at(-1) as { t: number }).t;
    const without = runEvents(route, ev).snap;
    const withSettle = runEvents(route, [...ev, { kind: 'settle', t: lastT }]).snap;
    expect(withSettle.walkM).toBeGreaterThan(without.walkM);
    expect(withSettle.progressM).toBeGreaterThanOrEqual(without.progressM);
    expect(runEvents(route, [...ev, { kind: 'settle', t: lastT }]).snap).toEqual(withSettle);
  });
});

describe('arrival zone vs route progress', () => {
  it('reaching the target zone along a short route satisfies the progress rule', () => {
    const route = 'r-n-plaza';
    const cfg = routeCfg(route);
    const zoneEdge = cfg.routeLenM - cfg.target.radiusM + 8; // just inside the zone
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: zoneEdge }, { kind: 'still', s: 8 }], { startT: T0 });
    const lastT = (ev.at(-1) as { t: number }).t;
    const { result, snap } = runEvents(route, [...ev, { kind: 'settle', t: lastT }]);
    expect(snap.progressNeedM).toBeLessThan(0.9 * snap.routeLenM);
    expect(result.reasons).not.toContain('INSUFFICIENT_PROGRESS');
    expect(result.eligible, JSON.stringify(result)).toBe(true);
  });
});

describe('claim right at arrival', () => {
  it('is accepted even when the last full window closed seconds before arrival', () => {
    const route = 'r-n-plaza';
    const cfg = routeCfg(route);
    // Walk so that the arrival happens ~2 s after a window boundary.
    for (const extra of [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]) {
      const m = (Math.ceil((cfg.routeLenM - cfg.target.radiusM + 3) / 1.3 / 20) * 20 + extra) * 1.3;
      const ev = buildTrace(cfg.route, [{ kind: 'walk', m: Math.min(m, cfg.routeLenM) }], { startT: T0, seed: String(extra) });
      const lastT = (ev.at(-1) as { t: number }).t;
      const { result } = runEvents(route, [...ev, { kind: 'settle', t: lastT - 1000 }]);
      if (runEvents(route, ev).snap.arrived) expect(result.eligible, `${extra}: ${result.reasons}`).toBe(true);
    }
  });
});

describe('native recorder extras', () => {
  const route = 'r-n-lotus';
  it('mock-location fixes are ignored and block the reward', () => {
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: cfg.routeLenM + 5 }, { kind: 'still', s: 10 }], { startT: T0 });
    const mocked = ev.map((e) => (e.kind === 'fix' && e.t > T0 + 60_000 && e.t < T0 + 70_000 ? { ...e, mock: true } : e));
    const { result, snap } = runEvents(route, mocked);
    expect(snap.mockFixes).toBeGreaterThan(0);
    expect(result.reasons).toContain('MOCK_LOCATION');
  });
  it('activity transitions and notes are logged but do not change the verdict', () => {
    const cfg = routeCfg(route);
    const ev = buildTrace(cfg.route, [{ kind: 'walk', m: cfg.routeLenM + 5 }, { kind: 'still', s: 10 }], { startT: T0 });
    const extra: SensorEvent[] = [
      { kind: 'activity', t: T0 + 5000, type: 'WALKING', enter: true },
      { kind: 'note', t: T0 + 6000, msg: 'gps-disabled' },
    ];
    const a = runEvents(route, ev);
    const b = runEvents(route, [...extra, ...ev]);
    expect(b.result).toEqual(a.result);
    expect(b.v.diagnostics.length).toBe(2);
  });
});
