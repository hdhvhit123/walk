import type { Claim } from './ledger';
import type { Habitat } from './pack';

/**
 * The village: the long-term reward layer. Everything here is derived from
 * the claim ledger plus a list of what was built, so balances can never drift
 * and replaying the same claims always gives the same village.
 *
 *   leaves earned  = Σ leavesForClaim(claims) + Σ daily gifts
 *   leaves spent   = Σ cost of buildings placed
 *   items left     = items picked up on walks − items used in buildings
 */

export type BuildingKind =
  | 'mushroom-house' | 'lotus-pond' | 'banyan' | 'flower-garden' | 'pavilion' | 'plaza'
  | 'lantern' | 'pebble-path' | 'bench' | 'well';

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  icon: string;
  description: string;
  leaves: number;
  items: Record<string, number>;
  /** Creatures it can house; 'any' fits every creature. Decorations house none. */
  houses: Habitat | 'any' | null;
  capacity: number;
  charm: number;
  minLevel: number;
}

export const BUILDINGS: BuildingDef[] = [
  { kind: 'pebble-path', name: 'Lối sỏi', icon: '🪨', description: 'Con đường nhỏ nối các ngôi nhà.', leaves: 5, items: { 'soi-cuoi': 1 }, houses: null, capacity: 0, charm: 2, minLevel: 1 },
  { kind: 'mushroom-house', name: 'Nhà nấm', icon: '🍄', description: 'Ngôi nhà ấm cho một sinh vật bất kỳ.', leaves: 30, items: { 'la-bang': 1 }, houses: 'any', capacity: 1, charm: 8, minLevel: 1 },
  { kind: 'lantern', name: 'Cột đèn lồng', icon: '🏮', description: 'Thắp sáng làng vào buổi tối.', leaves: 15, items: { 'long-den': 1 }, houses: null, capacity: 0, charm: 5, minLevel: 1 },
  { kind: 'banyan', name: 'Cây đa', icon: '🌳', description: 'Chỗ ở cho sinh vật thích cây cối.', leaves: 50, items: { 'la-bang': 2 }, houses: 'tree', capacity: 2, charm: 12, minLevel: 2 },
  { kind: 'flower-garden', name: 'Vườn hoa giấy', icon: '🌺', description: 'Chỗ ở cho sinh vật của vườn hoa.', leaves: 50, items: { 'hoa-giay': 2 }, houses: 'garden', capacity: 2, charm: 12, minLevel: 2 },
  { kind: 'bench', name: 'Ghế đá', icon: '🪑', description: 'Nơi dân làng ngồi nghỉ chân.', leaves: 20, items: { 'soi-cuoi': 1 }, houses: null, capacity: 0, charm: 4, minLevel: 2 },
  { kind: 'lotus-pond', name: 'Ao sen', icon: '🪷', description: 'Chỗ ở cho sinh vật sống dưới nước.', leaves: 60, items: { 'hat-sen': 2, 'vo-oc': 1 }, houses: 'pond', capacity: 2, charm: 15, minLevel: 3 },
  { kind: 'plaza', name: 'Quảng trường', icon: '⛲', description: 'Trung tâm làng, nơi sinh vật quảng trường tụ họp.', leaves: 70, items: { 'soi-cuoi': 3 }, houses: 'plaza', capacity: 2, charm: 18, minLevel: 3 },
  { kind: 'well', name: 'Giếng làng', icon: '🪣', description: 'Giếng nước trong cho cả làng.', leaves: 40, items: { 'vo-oc': 1, 'soi-cuoi': 2 }, houses: null, capacity: 0, charm: 10, minLevel: 4 },
  { kind: 'pavilion', name: 'Đình nhỏ', icon: '⛩️', description: 'Mái đình cho sinh vật thích nơi yên tĩnh.', leaves: 80, items: { 'long-den': 2, 'soi-cuoi': 1 }, houses: 'pavilion', capacity: 1, charm: 20, minLevel: 4 },
];

export const buildingDef = (kind: BuildingKind) => BUILDINGS.find((b) => b.kind === kind)!;

/** Charm needed to reach each level (index 0 = level 1). */
export const LEVEL_CHARM = [0, 15, 45, 90, 150, 230];
export const MAX_LEVEL = LEVEL_CHARM.length;

export interface PlacedBuilding { id: string; kind: BuildingKind; x: number; y: number; builtAt: number }
export interface Resident { creatureId: string; buildingId: string }
export interface Gift { date: string; leaves: number }

export function leavesForClaim(c: Claim, firstMeeting: boolean) {
  return 10 + Math.floor(c.walkM / 20) + (firstMeeting ? 20 : 0);
}

/** Leaves earned per claim, in claim order; the first claim of a creature counts as a first meeting. */
export function claimEarnings(claims: Claim[]) {
  const seen = new Set<string>();
  return [...claims].sort((a, b) => a.at - b.at).map((c) => {
    const first = !seen.has(c.creatureId);
    seen.add(c.creatureId);
    return { claimId: c.claimId, leaves: leavesForClaim(c, first) };
  });
}

export function charm(buildings: PlacedBuilding[]) {
  return buildings.reduce((s, b) => s + buildingDef(b.kind).charm, 0);
}

export function levelFor(charmPoints: number) {
  let lv = 1;
  for (let i = 0; i < LEVEL_CHARM.length; i++) if (charmPoints >= LEVEL_CHARM[i]) lv = i + 1;
  return lv;
}

/** Land grows with the village: 4×4 at level 1, one more row and column per level. */
export const gridSize = (level: number) => 3 + Math.min(level, MAX_LEVEL);

export const GIFT_PER_RESIDENT = 3;

export interface VillageState {
  earned: number; spent: number; leaves: number;
  items: Record<string, number>;
  charm: number; level: number; size: number;
  nextLevelCharm: number | null;
  buildings: PlacedBuilding[];
  residents: Resident[];
}

export function villageState(input: {
  claims: Claim[]; gifts: Gift[]; inventory: { itemId: string; count: number }[];
  buildings: PlacedBuilding[]; residents: Resident[];
}): VillageState {
  const earned = claimEarnings(input.claims).reduce((s, e) => s + e.leaves, 0) + input.gifts.reduce((s, g) => s + g.leaves, 0);
  const items: Record<string, number> = Object.fromEntries(input.inventory.map((i) => [i.itemId, i.count]));
  let spent = 0;
  for (const b of input.buildings) {
    const def = buildingDef(b.kind);
    spent += def.leaves;
    for (const [id, n] of Object.entries(def.items)) items[id] = (items[id] ?? 0) - n;
  }
  const c = charm(input.buildings);
  const level = levelFor(c);
  return {
    earned, spent, leaves: earned - spent, items, charm: c, level, size: gridSize(level),
    nextLevelCharm: level < MAX_LEVEL ? LEVEL_CHARM[level] : null,
    buildings: input.buildings, residents: input.residents,
  };
}

export type BuildProblem = 'LEVEL' | 'LEAVES' | 'ITEMS' | 'OCCUPIED' | 'OUTSIDE';

export function canBuild(v: VillageState, kind: BuildingKind, x?: number, y?: number): BuildProblem | null {
  const def = buildingDef(kind);
  if (v.level < def.minLevel) return 'LEVEL';
  if (v.leaves < def.leaves) return 'LEAVES';
  if (Object.entries(def.items).some(([id, n]) => (v.items[id] ?? 0) < n)) return 'ITEMS';
  if (x !== undefined && y !== undefined) {
    if (x < 0 || y < 0 || x >= v.size || y >= v.size) return 'OUTSIDE';
    if (v.buildings.some((b) => b.x === x && b.y === y)) return 'OCCUPIED';
  }
  return null;
}

export function fits(def: BuildingDef, habitats: Habitat[]) {
  return def.houses === 'any' || (def.houses !== null && habitats.includes(def.houses));
}

export type MoveInProblem = 'NOT_OWNED' | 'NO_ROOM' | 'WRONG_HOME' | 'NOT_A_HOME';

export function canMoveIn(v: VillageState, building: PlacedBuilding, creature: { id: string; habitats: Habitat[] }, owned: Set<string>): MoveInProblem | null {
  const def = buildingDef(building.kind);
  if (!owned.has(creature.id)) return 'NOT_OWNED';
  if (def.capacity === 0) return 'NOT_A_HOME';
  if (!fits(def, creature.habitats)) return 'WRONG_HOME';
  const living = v.residents.filter((r) => r.buildingId === building.id && r.creatureId !== creature.id).length;
  if (living >= def.capacity) return 'NO_ROOM';
  return null;
}

/**
 * Residents bring a small gift once a day, but only on a day with a verified
 * walk: the village grows from walking, never from just opening the app.
 */
export function giftAvailable(claims: Claim[], gifts: Gift[], residents: Resident[], today: string) {
  if (!residents.length) return 0;
  if (!claims.some((c) => c.date === today)) return 0;
  if (gifts.some((g) => g.date === today)) return 0;
  return residents.length * GIFT_PER_RESIDENT;
}
