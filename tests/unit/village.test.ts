import { describe, expect, test } from 'vitest';
import packJson from '../../src/data/area-pack.json';
import type { Claim } from '../../src/core/ledger';
import type { AreaPack } from '../../src/core/pack';
import {
  BUILDINGS, HABITAT_MATERIAL, LEVEL_CHARM, MATERIALS, RAW, RECIPES, TRADE_RATE, canBuild, canCraft, canMoveIn, canTrade, canUpgrade,
  claimRewards, giftFor, gridSize, habitatOfClaim, levelFor, materialsForClaim, missing, parseTrade, sourcesOf, tradeId, villageState,
  type PlacedBuilding, type VillageInput,
} from '../../src/core/village';

const pack = packJson as unknown as AreaPack;
const routeTo = (type: string) => pack.routes.find((r) => pack.pois.find((p) => p.id === r.poi)?.type === type)!;
const claim = (id: string, creatureId: string, walkM: number, opts: { date?: string; at?: number; to?: string; items?: string[] } = {}): Claim => {
  const mid = `${opts.date ?? '2026-11-03'}_${id || '20'}_${routeTo(opts.to ?? 'tree').id}`;
  return { claimId: mid, missionId: mid, sessionId: 's', date: opts.date ?? '2026-11-03', at: opts.at ?? 0, creatureId, items: opts.items ?? [], walkM, syncState: 'local' };
};
const real = (c: Claim, type: string): Claim => { const mid = `2026-11-03_20_${routeTo(type).id}`; return { ...c, claimId: mid, missionId: mid }; };
const empty: VillageInput = { claims: [], gifts: [], buildings: [], residents: [], crafts: [] };
const st = (i: Partial<VillageInput>) => villageState(pack, { ...empty, ...i });
const B = (kind: PlacedBuilding['kind'], x = 0, y = 0, tier = 1, id = `${kind}${x}${y}`): PlacedBuilding => ({ id, kind, x, y, tier, builtAt: 0 });

describe('catalog', () => {
  const resources = new Set([...MATERIALS.map((m) => m.id), ...pack.items.map((i) => i.id)]);
  test('every cost uses a known material or a treasure from the pack; every treasure is used somewhere', () => {
    for (const b of BUILDINGS) for (const c of b.costs) for (const id of Object.keys(c)) expect(resources.has(id), `${b.kind}: ${id}`).toBe(true);
    const used = new Set(BUILDINGS.flatMap((b) => b.costs.flatMap((c) => Object.keys(c))));
    for (const i of pack.items) expect(used.has(i.id), i.id).toBe(true);
  });
  test('tiers line up: one cost, capacity and charm per tier; charm grows with tier', () => {
    for (const b of BUILDINGS) {
      expect(b.capacity.length, b.kind).toBe(b.costs.length);
      expect(b.charm.length, b.kind).toBe(b.costs.length);
      for (let i = 1; i < b.charm.length; i++) expect(b.charm[i]).toBeGreaterThan(b.charm[i - 1]);
    }
  });
  test('crafted materials are only needed from the level their workshop unlocks', () => {
    for (const b of BUILDINGS) for (const [tier, c] of b.costs.entries()) for (const id of Object.keys(c)) {
      const r = RECIPES.find((x) => x.id === id);
      if (!r) continue;
      const shop = BUILDINGS.find((x) => x.kind === r.workshop)!;
      expect(shop.minLevel, `${b.kind} tier ${tier + 1} needs ${id}`).toBeLessThanOrEqual(b.minLevel + tier);
    }
  });
  test('every raw material has a real place to walk to', () => {
    for (const m of RAW) expect(sourcesOf(pack, m).length, m).toBeGreaterThan(0);
  });
  test('every creature has at least two kinds of home', () => {
    for (const c of pack.creatures) expect(BUILDINGS.filter((b) => b.houses === 'any' || (b.houses && c.habitats.includes(b.houses))).length, c.id).toBeGreaterThanOrEqual(2);
  });
  test('levels and land', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(LEVEL_CHARM[1])).toBe(2);
    expect(levelFor(1e9)).toBe(LEVEL_CHARM.length);
    expect(gridSize(1)).toBe(4);
  });
});

describe('earning materials', () => {
  test('mostly the destination material, more for longer walks, deterministic', () => {
    for (const type of ['tree', 'pond', 'garden', 'plaza', 'pavilion']) {
      const c = real(claim('', 'x', 500), type);
      expect(habitatOfClaim(pack, c)).toBe(type);
      const m = materialsForClaim(pack, c, false);
      const main = HABITAT_MATERIAL[type as keyof typeof HABITAT_MATERIAL];
      const total = Object.values(m).reduce((a, b) => a + b, 0);
      expect(total).toBe(4 + 5);
      expect(m[main]).toBe(5);
      expect(materialsForClaim(pack, c, false)).toEqual(m);
    }
    const short = materialsForClaim(pack, real(claim('', 'x', 120), 'tree'), false);
    const long = materialsForClaim(pack, real(claim('', 'x', 1000), 'tree'), false);
    expect(Object.values(long).reduce((a, b) => a + b, 0)).toBeGreaterThan(Object.values(short).reduce((a, b) => a + b, 0));
  });
  test('first meeting adds 2 of the destination material; treasures come from the claim', () => {
    const a = claim('a', 'meo', 300, { at: 1, items: ['la-bang', 'la-bang'] });
    const b = claim('b', 'meo', 300, { at: 2 });
    const [ra, rb] = claimRewards(pack, [b, a]);
    expect(ra.claimId).toBe(a.claimId);
    expect((ra.materials.go ?? 0) - (rb.materials.go ?? 0)).toBe(2);
    expect(ra.treasures).toEqual({ 'la-bang': 2 });
  });
});

describe('stock is derived from what happened', () => {
  test('earned − buildings − upgrades − craft inputs + craft outputs', () => {
    const c = claim('a', 'meo', 900, { items: ['la-bang'] }); // tree: lots of wood
    const s0 = st({ claims: [c] }).stock;
    const v = st({ claims: [c], buildings: [B('carpenter')], crafts: [{ recipe: 'van', times: 1 }] });
    expect(v.stock.go).toBe((s0.go ?? 0) - 4 - 2);
    expect(v.stock.van).toBe(1);
    expect(v.stock['la-bang']).toBe(1);
  });
  test('market trades 3 → 1 between raw materials only', () => {
    expect(parseTrade(tradeId('tre', 'go'))).toEqual({ give: 'tre', get: 'go' });
    expect(parseTrade('trade:go>go')).toBeNull();
    expect(parseTrade('trade:van>go')).toBeNull();
    const c = real(claim('', 'x', 1000), 'pavilion'); // lots of bamboo
    const before = st({ claims: [c] });
    const v = st({ claims: [c], crafts: [{ recipe: tradeId('tre', 'go'), times: 2 }] });
    expect(v.stock.tre).toBe((before.stock.tre ?? 0) - 2 * TRADE_RATE);
    expect(v.stock.go).toBe((before.stock.go ?? 0) + 2);
    expect(canTrade(st({}), 'tre', 'go')).toBe('RESOURCES');
  });
});

describe('rules', () => {
  const rich = st({ claims: Array.from({ length: 30 }, (_, i) => claim(`c${i}`, `k${i}`, 1000, { to: ['tree', 'pond', 'garden', 'plaza', 'pavilion'][i % 5], items: pack.items.map((x) => x.id) })) });
  test('build: level, limit, resources, land', () => {
    expect(canBuild(st({}), 'thatched-hut')).toBe('RESOURCES');
    expect(canBuild(rich, 'kiln')).toBe('LEVEL');
    expect(canBuild(rich, 'thatched-hut', 0, 0)).toBeNull();
    expect(canBuild(rich, 'thatched-hut', 4, 0)).toBe('OUTSIDE');
    const one = st({ claims: Array.from({ length: 30 }, (_, i) => claim(`c${i}`, `k${i}`, 1000, { to: 'tree' })), buildings: [B('carpenter')] });
    expect(canBuild(one, 'carpenter', 1, 1)).toBe('LIMIT');
    expect(canBuild(one, 'thatched-hut', 0, 0)).toBe('OCCUPIED');
  });
  test('missing() reports exactly what is lacking', () => {
    expect(missing({ go: 1, da: 5 }, { go: 3, da: 2, 'la-bang': 1 })).toEqual({ go: 2, 'la-bang': 1 });
  });
  test('crafting needs the workshop and the inputs', () => {
    const c = claim('a', 'meo', 900);
    expect(canCraft(st({ claims: [c] }), 'van')).toBe('NO_WORKSHOP');
    expect(canCraft(st({ claims: [c], buildings: [B('carpenter')] }), 'van')).toBeNull();
    expect(canCraft(st({ claims: [c], buildings: [B('carpenter')] }), 'gach')).toBe('NO_WORKSHOP');
  });
  test('upgrade needs the next tier cost and one village level per tier', () => {
    const hut = B('thatched-hut');
    expect(canUpgrade(st({ buildings: [hut] }), hut)).toBe('LEVEL');
    const path = B('pebble-path');
    expect(canUpgrade(st({ buildings: [path] }), path)).toBe('MAX_TIER');
  });
  test('residents: habitat, capacity per tier, decorations house no one', () => {
    const hut = B('thatched-hut', 0, 0, 1, 'h');
    const pond = B('lotus-pond', 1, 0, 1, 'p');
    const lamp = B('lantern', 2, 0, 1, 'l');
    const owned = new Set(['meo-may', 'rua-reu', 'ca-chep-gio', 'oc-ngoc']);
    const cr = (id: string) => pack.creatures.find((c) => c.id === id)!;
    const v = st({ buildings: [hut, pond, lamp] });
    expect(canMoveIn(v, hut, cr('meo-may'), owned)).toBeNull();
    expect(canMoveIn(v, pond, cr('meo-may'), owned)).toBe('WRONG_HOME');
    expect(canMoveIn(v, lamp, cr('rua-reu'), owned)).toBe('NOT_A_HOME');
    expect(canMoveIn(v, hut, cr('nghe-suong'), owned)).toBe('NOT_OWNED');
    const full = st({ buildings: [hut, pond], residents: [{ creatureId: 'meo-may', buildingId: 'h' }] });
    expect(canMoveIn(full, hut, cr('rua-reu'), owned)).toBe('NO_ROOM');
    const hut2 = { ...hut, tier: 2 };
    expect(canMoveIn(st({ buildings: [hut2], residents: [{ creatureId: 'meo-may', buildingId: 'h' }] }), hut2, cr('rua-reu'), owned)).toBeNull();
  });
  test('gift: only on a walking day, once, one material per resident matching its habitat', () => {
    const res = [{ creatureId: 'rua-reu', buildingId: 'p' }, { creatureId: 've-sau-tre', buildingId: 'h' }];
    const walk = claim('a', 'x', 300, { date: 'D' });
    expect(giftFor(pack, [], [], res, 'D')).toBeNull();
    expect(giftFor(pack, [walk], [], [], 'D')).toBeNull();
    expect(giftFor(pack, [walk], [], res, 'D')).toEqual({ dat: 1, go: 1 });
    expect(giftFor(pack, [walk], [{ date: 'D', resources: {} }], res, 'D')).toBeNull();
  });
});
