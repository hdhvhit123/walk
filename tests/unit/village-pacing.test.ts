/**
 * Plays the village with a simple greedy player for many in-game weeks, using
 * the real mission generator and the real area pack, to check the economy:
 * steady progress, no dead ends, and the top level taking weeks, not days.
 */
import { describe, expect, test } from 'vitest';
import packJson from '../../src/data/area-pack.json';
import { addDays } from '../../src/core/clock';
import type { Claim } from '../../src/core/ledger';
import { generateMissions, type Duration } from '../../src/core/missions';
import type { AreaPack } from '../../src/core/pack';
import {
  BUILDINGS, MAX_LEVEL, RAW, RECIPES, TRADE_RATE, add, canTrade, tradeId, buildingDef, canBuild, canCraft, canMoveIn, canUpgrade, capacityOf, charmOf, giftFor, missing,
  upgradeCost, villageState, type Cost, type Craft, type Gift, type MaterialId, type PlacedBuilding, type Resident, type VillageState,
} from '../../src/core/village';

const pack = packJson as unknown as AreaPack;

interface Run { charmAtWalk: number[]; levelAtWalk: number[]; levelAtDay: number[]; walks: number; days: number; buildings: number; residents: number; stuckDays: number }

function play(walksPerDay: (day: number) => number, days: number, seed: number): Run {
  const claims: Claim[] = [];
  const gifts: Gift[] = [];
  const buildings: PlacedBuilding[] = [];
  const residents: Resident[] = [];
  const crafts: Craft[] = [];
  const owned = new Set<string>();
  const visits: { poiId: string; date: string }[] = [];
  const levelAtWalk: number[] = [];
  const charmAtWalk: number[] = [];
  const levelAtDay: number[] = [];
  let walks = 0, stuckDays = 0, idc = 0;
  const state = () => villageState(pack, { claims, gifts, buildings, residents, crafts });
  const durations: Duration[] = [10, 20, 30];

  const free = (v: VillageState) => {
    for (let y = 0; y < v.size; y++) for (let x = 0; x < v.size; x++) if (!buildings.some((b) => b.x === x && b.y === y)) return { x, y };
    return null;
  };
  /** Get one unit of a raw material at the market from the biggest surplus not needed by `cost`. */
  const tradeFor = (m: MaterialId, cost: Cost) => {
    const v = state();
    const give = RAW.filter((r) => r !== m).sort((a, b) => ((v.stock[b] ?? 0) - (cost[b] ?? 0)) - ((v.stock[a] ?? 0) - (cost[a] ?? 0)))[0];
    if ((v.stock[give] ?? 0) - (cost[give] ?? 0) < TRADE_RATE || canTrade(v, give, m)) return false;
    crafts.push({ recipe: tradeId(give, m), times: 1 });
    return true;
  };
  /** Craft (and trade for raw inputs) what a cost lacks. */
  const craftFor = (v: VillageState, cost: Cost) => {
    const lack = missing(v.stock, cost);
    for (const [k, n] of Object.entries(lack)) {
      if (RAW.includes(k as MaterialId)) { for (let i = 0; i < n; i++) if (!tradeFor(k as MaterialId, cost)) return false; continue; }
      const r = RECIPES.find((x) => x.id === k);
      if (!r) return false; // a treasure: only walking finds those
      for (let i = 0; i < n; i++) {
        if (canCraft(state(), k as MaterialId)) {
          // Trade for the recipe's raw inputs first.
          const need = add({}, cost);
          add(need, r.inputs as Cost);
          for (const [ik, inN] of Object.entries(r.inputs)) while ((state().stock[ik] ?? 0) < inN!) if (!tradeFor(ik as MaterialId, need)) return false;
          if (canCraft(state(), k as MaterialId)) return false;
        }
        crafts.push({ recipe: k, times: 1 });
      }
    }
    return true;
  };
  const tryUndoCrafts = (n: number) => crafts.splice(crafts.length - n, n);

  const spend = () => {
    let did = true;
    let progressed = false;
    while (did) {
      did = false;
      const v = state();
      // Options: new buildings (preferring ones not built yet) and upgrades, best charm gain first.
      const opts: { gain: number; act: () => boolean }[] = [];
      for (const def of BUILDINGS) {
        if (v.level < def.minLevel || buildings.filter((b) => b.kind === def.kind).length >= def.max) continue;
        const count = buildings.filter((b) => b.kind === def.kind).length;
        const want = def.recipes ? (count ? -1 : 100) : def.charm[0] / (1 + count);
        if (want < 0) continue;
        opts.push({ gain: want, act: () => {
          const spot = free(state()); if (!spot) return false;
          const before = crafts.length;
          if (!craftFor(state(), def.costs[0])) { tryUndoCrafts(crafts.length - before); return false; }
          if (canBuild(state(), def.kind, spot.x, spot.y)) { tryUndoCrafts(crafts.length - before); return false; }
          buildings.push({ id: `b${idc++}`, kind: def.kind, x: spot.x, y: spot.y, tier: 1, builtAt: 0 });
          return true;
        } });
      }
      for (const b of buildings) {
        const cost = upgradeCost(b); if (!cost) continue;
        opts.push({ gain: buildingDef(b.kind).charm[b.tier] - charmOf(b) + 1, act: () => {
          const before = crafts.length;
          if (!craftFor(state(), cost)) { tryUndoCrafts(crafts.length - before); return false; }
          if (canUpgrade(state(), b)) { tryUndoCrafts(crafts.length - before); return false; }
          b.tier++;
          return true;
        } });
      }
      opts.sort((a, b) => b.gain - a.gain);
      for (const o of opts) if (o.act()) { did = true; progressed = true; break; }
    }
    // Move everyone in who has a home.
    const v = state();
    for (const c of pack.creatures) {
      if (!owned.has(c.id) || residents.some((r) => r.creatureId === c.id)) continue;
      const home = buildings.find((b) => !canMoveIn(v, b, c, owned) && capacityOf(b) > 0);
      if (home) residents.push({ creatureId: c.id, buildingId: home.id });
    }
    return progressed;
  };

  let date = '2026-11-02';
  for (let day = 0; day < days; day++) {
    date = addDays(date, 1);
    let progressed = false;
    for (let w = 0; w < walksPerDay(day); w++) {
      const hub = pack.hubs[(day + w + seed) % pack.hubs.length];
      const duration = durations[(day * 2 + w + seed) % 3];
      const r = generateMissions({ pack, date, hour: 9 + w * 4, duration, position: hub, visits, owned });
      if (!r.ok) continue;
      const m = r.options[(seed + w) % r.options.length];
      if (claims.some((c) => c.claimId === m.id)) continue;
      claims.push({ claimId: m.id, missionId: m.id, sessionId: 's', date, at: day * 100 + w, creatureId: m.creatureId,
        items: m.waypoints.map((x) => x.itemId), walkM: m.distanceM, syncState: 'local' });
      owned.add(m.creatureId);
      visits.push({ poiId: m.poiId, date });
      walks++;
      progressed = spend() || progressed;
      levelAtWalk.push(state().level);
      charmAtWalk.push(state().charm);
    }
    const g = giftFor(pack, claims, gifts, residents, date);
    if (g) { gifts.push({ date, resources: g }); progressed = spend() || progressed; }
    if (walksPerDay(day) > 0 && !progressed) stuckDays++;
    levelAtDay.push(state().level);
  }
  return { charmAtWalk, levelAtWalk, levelAtDay, walks, days, buildings: buildings.length, residents: residents.length, stuckDays };
}

/** Longest run of walks after which nothing new could be built or upgraded. */
const longestDry = (r: Run) => {
  let best = 0, run = 0;
  for (let i = 1; i < r.charmAtWalk.length; i++) { run = r.charmAtWalk[i] > r.charmAtWalk[i - 1] ? 0 : run + 1; best = Math.max(best, run); }
  return best;
};
const firstDay = (r: Run, lv: number) => r.levelAtDay.findIndex((x) => x >= lv) + 1 || Infinity;
const firstWalk = (r: Run, lv: number) => r.levelAtWalk.findIndex((x) => x >= lv) + 1 || Infinity;

describe('village economy (greedy player, real missions)', () => {
  const regular = [0, 1, 2].map((s) => play((d) => (d % 2 ? 2 : 1), 70, s)); // ~1.5 walks a day
  const casual = [0, 1, 2].map((s) => play((d) => (d % 3 === 0 ? 1 : 0), 120, s)); // a walk every 3 days

  test('report', () => {
    for (const [name, runs] of [['regular', regular], ['casual', casual]] as const) {
      for (const r of runs) {
        const lv = Array.from({ length: MAX_LEVEL }, (_, i) => `L${i + 1}:d${firstDay(r, i + 1)}/w${firstWalk(r, i + 1)}`).join(' ');
        console.log(`${name.padEnd(8)} ${lv} · ${r.buildings} công trình, ${r.residents} cư dân, dài nhất ${longestDry(r)} chuyến không xây được gì`);
      }
    }
  });

  test('first building comes from the first walk; level 2 within the first week', () => {
    for (const r of regular) {
      expect(firstWalk(r, 2)).toBeLessThanOrEqual(8);
      expect(firstDay(r, 2)).toBeLessThanOrEqual(7);
    }
  });

  test('top level takes weeks of regular walking, but is reachable', () => {
    for (const r of regular) {
      expect(firstDay(r, MAX_LEVEL)).toBeGreaterThanOrEqual(21);
      expect(firstDay(r, MAX_LEVEL)).toBeLessThanOrEqual(70);
    }
  });

  test('every level-up gap is under two weeks of regular play (no grind wall)', () => {
    for (const r of regular) for (let lv = 2; lv <= MAX_LEVEL; lv++) {
      expect(firstDay(r, lv) - firstDay(r, lv - 1), `L${lv - 1}→L${lv}`).toBeLessThanOrEqual(14);
    }
  });

  test('a casual walker (only short walks, every third day) still builds something every few walks', () => {
    for (const r of casual) {
      expect(firstWalk(r, 3)).toBeLessThanOrEqual(20);
      // Measured over the first 30 walks: later the land fills up and that is expected.
      expect(longestDry({ ...r, charmAtWalk: r.charmAtWalk.slice(0, 30) })).toBeLessThanOrEqual(3);
    }
  });

  test('regular walkers rarely finish a walk with nothing to build', () => {
    for (const r of regular) expect(longestDry({ ...r, charmAtWalk: r.charmAtWalk.slice(0, 35) })).toBeLessThanOrEqual(2);
  });
});
