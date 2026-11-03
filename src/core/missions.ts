import { addDays, isoWeek } from './clock';
import { distanceM, type LatLng } from './geo';
import { routeLengthM, type AreaPack, type Poi } from './pack';
import { seeded, shuffle } from './rng';
import { RULES } from './rules';

export type Duration = 10 | 20 | 30;
export const DURATIONS: Duration[] = [10, 20, 30];

export interface Mission {
  id: string; date: string; duration: Duration;
  hubId: string; routeId: string; poiId: string; creatureId: string;
  distanceM: number; estMinutes: number;
  waypoints: { id: string; itemId: string; lat: number; lng: number }[];
  packId: string; packVersion: string; rulesVersion: string;
}

export interface MissionInput {
  pack: AreaPack;
  date: string;          // local YYYY-MM-DD
  hour: number;          // local hour 0-23
  duration: Duration;
  position: LatLng | null;
  visits: { poiId: string; date: string }[];
  owned: Set<string>;
}

export type MissionResult =
  | { ok: true; hubId: string; options: Mission[]; relaxedRecent: boolean }
  | { ok: false; reason: 'OUTSIDE_AREA' | 'NO_MATCH'; shorter?: Duration };

/** Round-trip estimate in minutes for a one-way route length. */
export const estimateMinutes = (oneWayM: number) =>
  Math.round((2 * oneWayM) / RULES.missionWalkSpeedMps / 60 + RULES.encounterMinutes);

const isOpen = (p: Poi, hour: number) => p.status === 'active' && (!p.hours || (hour >= p.hours[0] && hour < p.hours[1]));

export const MAX_HUB_DISTANCE_M = 1500;

export function nearestHub(pack: AreaPack, pos: LatLng | null) {
  if (!pos) return null;
  let best: { hub: AreaPack['hubs'][number]; d: number } | null = null;
  for (const hub of pack.hubs) {
    const d = distanceM(hub, pos);
    if (!best || d < best.d) best = { hub, d };
  }
  return best && best.d <= MAX_HUB_DISTANCE_M ? best : null;
}

export function weeklyTheme(pack: AreaPack, date: string): string {
  return pack.themes[isoWeek(date) % pack.themes.length];
}

function candidates(input: MissionInput, hubId: string, duration: Duration, excludeRecent: boolean) {
  const { pack, date, hour, visits } = input;
  const since = addDays(date, -RULES.recentDays);
  const recent = new Set(visits.filter((v) => v.date > since && v.date <= date).map((v) => v.poiId));
  const pois = new Map(pack.pois.map((p) => [p.id, p]));
  const [lo, hi] = RULES.durationTolerance;
  return pack.routes.filter((r) => {
    const poi = pois.get(r.poi);
    if (r.hub !== hubId || !poi || !isOpen(poi, hour)) return false;
    if (excludeRecent && recent.has(r.poi)) return false;
    const est = estimateMinutes(routeLengthM(pack, r));
    return est >= duration * lo && est <= duration * hi;
  });
}

/**
 * Deterministic daily mission options: same pack, date, duration and hub
 * always give the same options (callers persist them so reopening the app
 * never creates extra reward chances).
 */
export function generateMissions(input: MissionInput): MissionResult {
  const { pack, date, duration } = input;
  const near = nearestHub(pack, input.position);
  if (!near) return { ok: false, reason: 'OUTSIDE_AREA' };
  const hubId = near.hub.id;

  let pool = candidates(input, hubId, duration, true);
  let relaxedRecent = false;
  if (pool.length < 2) {
    const all = candidates(input, hubId, duration, false);
    if (all.length > pool.length) { pool = all; relaxedRecent = true; }
  }
  if (pool.length === 0) {
    const shorter = [...[10, 20, 30] as Duration[]].reverse()
      .find((d) => d < duration && candidates(input, hubId, d, false).length > 0);
    return { ok: false, reason: 'NO_MATCH', shorter };
  }

  const rnd = seeded(`${date}|${duration}|${hubId}|${pack.id}@${pack.version}`);
  // one option per distinct destination
  const seen = new Set<string>();
  const picked = shuffle(pool, rnd).filter((r) => !seen.has(r.poi) && !!seen.add(r.poi)).slice(0, RULES.maxOptions);

  const theme = weeklyTheme(pack, date);
  const used = new Set<string>();
  const pois = new Map(pack.pois.map((p) => [p.id, p]));
  const options = picked.map((r): Mission => {
    const poi = pois.get(r.poi)!;
    const fits = pack.creatures.filter((c) => c.habitats.includes(poi.type));
    const score = (c: (typeof fits)[number]) =>
      (used.has(c.id) ? 100 : 0) + (input.owned.has(c.id) ? 10 : 0) + (c.theme === theme ? 0 : 5) + (c.rarity === 'rare' ? 2 : 0);
    const ranked = shuffle(fits, rnd).sort((a, b) => score(a) - score(b));
    const creature = ranked[0];
    used.add(creature.id);
    const len = routeLengthM(pack, r);
    return {
      id: `${date}_${duration}_${r.id}`, date, duration, hubId, routeId: r.id, poiId: r.poi, creatureId: creature.id,
      distanceM: Math.round(len), estMinutes: estimateMinutes(len),
      waypoints: r.waypoints.map((w) => ({ ...w })),
      packId: pack.id, packVersion: pack.version, rulesVersion: RULES.version,
    };
  });
  return { ok: true, hubId, options, relaxedRecent };
}
