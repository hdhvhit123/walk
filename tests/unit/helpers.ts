import pack from '../../src/data/area-pack.json';
import type { AreaPack } from '../../src/core/pack';
import { routeLengthM, routePath } from '../../src/core/pack';
import { SessionVerifier, evaluateEligibility, type SensorEvent } from '../../src/core/verify';
import { buildTrace, scenarioSegments, type ScenarioId } from '../../src/core/sim';

export const PACK = pack as unknown as AreaPack;
export const T0 = Date.UTC(2026, 10, 2, 1, 0, 0);

export function routeCfg(routeId: string, motionAvailable = true) {
  const route = PACK.routes.find((r) => r.id === routeId)!;
  const path = routePath(PACK, route);
  const poi = PACK.pois.find((p) => p.id === route.poi)!;
  return {
    route: path, routeLenM: routeLengthM(PACK, route),
    target: { lat: poi.lat, lng: poi.lng, radiusM: poi.radiusM },
    waypoints: route.waypoints, startT: T0, motionAvailable,
  };
}

export function runEvents(routeId: string, events: SensorEvent[], motionAvailable = true) {
  const v = new SessionVerifier(routeCfg(routeId, motionAvailable));
  const notices = events.flatMap((e) => v.ingest(e));
  const snap = v.snapshot();
  const result = evaluateEligibility(snap, motionAvailable, { alreadyClaimed: false, clockOk: true, dailyLimitReached: false });
  return { v, snap, result, notices };
}

export function runScenario(routeId: string, id: ScenarioId, seed = 'seed-1') {
  const cfg = routeCfg(routeId);
  const { segments, opts } = scenarioSegments(id, cfg.routeLenM);
  const events = buildTrace(cfg.route, segments, { startT: T0, seed, ...opts });
  return runEvents(routeId, events, opts?.motion ?? true);
}
