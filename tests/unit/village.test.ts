import { describe, expect, test } from 'vitest';
import packJson from '../../src/data/area-pack.json';
import type { Claim } from '../../src/core/ledger';
import type { AreaPack } from '../../src/core/pack';
import {
  BUILDINGS, LEVEL_CHARM, buildingDef, canBuild, canMoveIn, claimEarnings, giftAvailable, gridSize, levelFor, villageState,
  type PlacedBuilding,
} from '../../src/core/village';

const pack = packJson as unknown as AreaPack;
const claim = (id: string, creatureId: string, walkM: number, date = '2026-11-03', at = 0): Claim =>
  ({ claimId: id, missionId: id, sessionId: 's', date, at, creatureId, items: [], walkM, syncState: 'local' });
const empty = { claims: [], gifts: [], inventory: [], buildings: [], residents: [] };

describe('village catalog', () => {
  test('every building uses items that exist in the area pack', () => {
    const ids = new Set(pack.items.map((i) => i.id));
    for (const b of BUILDINGS) for (const id of Object.keys(b.items)) expect(ids.has(id), `${b.kind} uses ${id}`).toBe(true);
  });
  test('every creature has at least one home it fits, and that home unlocks by the max level', () => {
    for (const c of pack.creatures) {
      const homes = BUILDINGS.filter((b) => b.houses === 'any' || (b.houses && c.habitats.includes(b.houses)));
      expect(homes.length, c.id).toBeGreaterThan(1);
    }
  });
  test('kinds are unique and levels are reachable with the catalog', () => {
    expect(new Set(BUILDINGS.map((b) => b.kind)).size).toBe(BUILDINGS.length);
    // Each next level must be reachable with the land and buildings of the current one.
    for (let lv = 1; lv < LEVEL_CHARM.length; lv++) {
      const best = Math.max(...BUILDINGS.filter((b) => b.minLevel <= lv).map((b) => b.charm));
      expect(gridSize(lv) ** 2 * best, `level ${lv}`).toBeGreaterThanOrEqual(LEVEL_CHARM[lv]);
    }
  });
});

describe('leaves', () => {
  test('first meeting with a creature earns a bonus; repeat meetings do not', () => {
    const e = claimEarnings([claim('b', 'meo', 400, 'd', 2), claim('a', 'meo', 400, 'd', 1)]);
    expect(e).toEqual([{ claimId: 'a', leaves: 10 + 20 + 20 }, { claimId: 'b', leaves: 10 + 20 }]);
  });
  test('balance = earned − spent; items are consumed by buildings', () => {
    const buildings: PlacedBuilding[] = [{ id: 'b1', kind: 'mushroom-house', x: 0, y: 0, builtAt: 1 }];
    const v = villageState({ ...empty, claims: [claim('a', 'meo', 600)], inventory: [{ itemId: 'la-bang', count: 3 }], buildings, gifts: [{ date: 'x', leaves: 6 }] });
    expect(v.earned).toBe(10 + 30 + 20 + 6);
    expect(v.spent).toBe(30);
    expect(v.leaves).toBe(36);
    expect(v.items['la-bang']).toBe(2);
  });
});

describe('levels and land', () => {
  test('level follows charm thresholds; land grows from 4×4', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(LEVEL_CHARM[1] - 1)).toBe(1);
    expect(levelFor(LEVEL_CHARM[1])).toBe(2);
    expect(levelFor(99999)).toBe(LEVEL_CHARM.length);
    expect(gridSize(1)).toBe(4);
    expect(gridSize(LEVEL_CHARM.length)).toBe(3 + LEVEL_CHARM.length);
  });
});

describe('building rules', () => {
  const rich = { ...empty, claims: Array.from({ length: 20 }, (_, i) => claim(`c${i}`, `k${i}`, 1000)), inventory: pack.items.map((i) => ({ itemId: i.id, count: 9 })) };
  test('needs level, leaves, items and a free tile inside the land', () => {
    expect(canBuild(villageState(empty), 'mushroom-house')).toBe('LEAVES');
    expect(canBuild(villageState({ ...empty, claims: [claim('a', 'm', 2000)] }), 'mushroom-house')).toBe('ITEMS');
    const v = villageState(rich);
    expect(canBuild(v, 'lotus-pond')).toBe('LEVEL');
    expect(canBuild(v, 'mushroom-house', 0, 0)).toBeNull();
    expect(canBuild(v, 'mushroom-house', 4, 0)).toBe('OUTSIDE');
    const v2 = villageState({ ...rich, buildings: [{ id: 'x', kind: 'lantern', x: 0, y: 0, builtAt: 1 }] });
    expect(canBuild(v2, 'mushroom-house', 0, 0)).toBe('OCCUPIED');
  });
});

describe('residents', () => {
  const house: PlacedBuilding = { id: 'h', kind: 'mushroom-house', x: 0, y: 0, builtAt: 1 };
  const pond: PlacedBuilding = { id: 'p', kind: 'lotus-pond', x: 1, y: 0, builtAt: 1 };
  const lamp: PlacedBuilding = { id: 'l', kind: 'lantern', x: 2, y: 0, builtAt: 1 };
  const v = villageState({ ...empty, buildings: [house, pond, lamp] });
  const owned = new Set(['meo-may', 'rua-reu', 'ca-chep-gio', 'oc-ngoc']);
  const cr = (id: string) => pack.creatures.find((c) => c.id === id)!;
  test('homes accept matching habitats up to capacity; decorations house no one', () => {
    expect(canMoveIn(v, house, cr('meo-may'), owned)).toBeNull();
    expect(canMoveIn(v, pond, cr('meo-may'), owned)).toBe('WRONG_HOME');
    expect(canMoveIn(v, pond, cr('rua-reu'), owned)).toBeNull();
    expect(canMoveIn(v, lamp, cr('rua-reu'), owned)).toBe('NOT_A_HOME');
    expect(canMoveIn(v, house, cr('nghe-suong'), owned)).toBe('NOT_OWNED');
    const full = villageState({ ...empty, buildings: [house, pond], residents: [{ creatureId: 'rua-reu', buildingId: 'p' }, { creatureId: 'ca-chep-gio', buildingId: 'p' }] });
    expect(canMoveIn(full, pond, cr('oc-ngoc'), owned)).toBe('NO_ROOM');
    // A resident already living there can "move in" again without counting twice.
    expect(canMoveIn(full, pond, cr('rua-reu'), owned)).toBeNull();
  });
  test('daily gift only on a day with a verified walk, once, scaled by residents', () => {
    const res = [{ creatureId: 'meo-may', buildingId: 'h' }, { creatureId: 'rua-reu', buildingId: 'p' }];
    expect(giftAvailable([], [], res, 'd')).toBe(0);
    expect(giftAvailable([claim('a', 'x', 1, 'd')], [], [], 'd')).toBe(0);
    expect(giftAvailable([claim('a', 'x', 1, 'd')], [], res, 'd')).toBe(6);
    expect(giftAvailable([claim('a', 'x', 1, 'd')], [{ date: 'd', leaves: 6 }], res, 'd')).toBe(0);
    expect(buildingDef('pond' as never)).toBeUndefined();
  });
});
