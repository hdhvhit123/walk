import type { Claim } from './ledger';
import type { AreaPack, Habitat } from './pack';

/**
 * The village: the long-term reward layer.
 *
 * Resources
 *   - Raw materials (gỗ, đá, tre, đất sét, cỏ tranh): every verified walk
 *     yields some, more for longer walks, mostly the kind that belongs to the
 *     destination (a pond gives clay, a tree gives wood…). So *where* you walk
 *     decides what you can build.
 *   - Treasures: the pack's items, picked up at waypoints along the route.
 *     Scarce; needed for homes and upgrades.
 *   - Crafted materials (ván, khung tre, gạch, ngói): made from raw materials
 *     at a workshop you have to build first.
 *
 * Everything is derived: balances = earned (claims + gifts) − used (buildings,
 * upgrades, crafting inputs) + crafted outputs. Nothing can drift or double count.
 */

export type MaterialId = 'go' | 'da' | 'tre' | 'dat' | 'co' | 'van' | 'khung' | 'gach' | 'ngoi';
export interface MaterialDef { id: MaterialId; name: string; icon: string; crafted: boolean }

export const MATERIALS: MaterialDef[] = [
  { id: 'go', name: 'Gỗ', icon: '🪵', crafted: false },
  { id: 'da', name: 'Đá', icon: '🪨', crafted: false },
  { id: 'tre', name: 'Tre', icon: '🎋', crafted: false },
  { id: 'dat', name: 'Đất sét', icon: '🟤', crafted: false },
  { id: 'co', name: 'Cỏ tranh', icon: '🌾', crafted: false },
  { id: 'van', name: 'Ván gỗ', icon: '🟫', crafted: true },
  { id: 'khung', name: 'Khung tre', icon: '🪜', crafted: true },
  { id: 'gach', name: 'Gạch', icon: '🧱', crafted: true },
  { id: 'ngoi', name: 'Ngói', icon: '🔶', crafted: true },
];
export const RAW: MaterialId[] = ['go', 'da', 'tre', 'dat', 'co'];
export const isMaterial = (id: string): id is MaterialId => MATERIALS.some((m) => m.id === id);

/** What each kind of destination mostly yields. */
export const HABITAT_MATERIAL: Record<Habitat, MaterialId> = { tree: 'go', plaza: 'da', pavilion: 'tre', pond: 'dat', garden: 'co' };

export type BuildingKind =
  | 'pebble-path' | 'thatched-hut' | 'carpenter' | 'lantern'
  | 'kiln' | 'banyan' | 'flower-garden' | 'bench'
  | 'lotus-pond' | 'plaza' | 'well' | 'pavilion' | 'bamboo-bridge' | 'longhouse';

/** Resource id → amount. Keys are material ids or treasure (pack item) ids. */
export type Cost = Record<string, number>;

export interface Recipe { id: MaterialId; inputs: Partial<Record<MaterialId, number>>; out: number }

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  icon: string;
  description: string;
  /** costs[0] builds it; costs[1..] upgrade to tier 2, 3. */
  costs: Cost[];
  /** Creatures it can house; 'any' fits every creature. null = not a home. */
  houses: Habitat | 'any' | null;
  /** Capacity per tier. */
  capacity: number[];
  /** Charm per tier (total at that tier, not the increment). */
  charm: number[];
  minLevel: number;
  /** How many the village may have; keeps cheap decorations from being spammed for charm. */
  max: number;
  /** Recipes this workshop unlocks. */
  recipes?: Recipe[];
}

export const BUILDINGS: BuildingDef[] = [
  // Level 1: things a first walk or two can pay for.
  { kind: 'pebble-path', name: 'Lối sỏi', icon: '🪨', description: 'Con đường nhỏ nối các ngôi nhà.',
    costs: [{ da: 2 }], houses: null, capacity: [0], charm: [2], minLevel: 1, max: 8 },
  { kind: 'thatched-hut', name: 'Nhà tranh', icon: '🛖', description: 'Ngôi nhà ấm cho mọi sinh vật. Nâng cấp để có thêm chỗ ở.',
    costs: [{ go: 3, co: 4, tre: 2 }, { van: 2, khung: 2, 'la-bang': 1 }, { gach: 4, ngoi: 3, 'long-den': 1 }],
    houses: 'any', capacity: [1, 2, 3], charm: [6, 12, 20], minLevel: 1, max: 6 },
  { kind: 'carpenter', name: 'Xưởng mộc', icon: '🪚', description: 'Làm ván gỗ và khung tre từ vật liệu thô.',
    costs: [{ go: 4, da: 2, tre: 2 }], houses: null, capacity: [0], charm: [5], minLevel: 1, max: 1,
    recipes: [{ id: 'van', inputs: { go: 2 }, out: 1 }, { id: 'khung', inputs: { tre: 2, co: 1 }, out: 1 }] },
  { kind: 'lantern', name: 'Cột đèn lồng', icon: '🏮', description: 'Thắp sáng làng vào buổi tối.',
    costs: [{ tre: 2, 'long-den': 1 }], houses: null, capacity: [0], charm: [6], minLevel: 1, max: 4 },
  // Level 2: the second workshop and habitat homes.
  { kind: 'kiln', name: 'Lò gạch', icon: '🔥', description: 'Nung gạch và ngói từ đất sét.',
    costs: [{ dat: 5, da: 4, van: 2 }], houses: null, capacity: [0], charm: [6], minLevel: 2, max: 1,
    recipes: [{ id: 'gach', inputs: { dat: 2, go: 1 }, out: 1 }, { id: 'ngoi', inputs: { dat: 2, da: 1 }, out: 1 }] },
  { kind: 'banyan', name: 'Cây đa', icon: '🌳', description: 'Chỗ ở cho sinh vật thích cây cối.',
    costs: [{ go: 4, dat: 3, 'la-bang': 2 }, { van: 3, khung: 2, 'la-bang': 1 }],
    houses: 'tree', capacity: [2, 3], charm: [10, 18], minLevel: 2, max: 3 },
  { kind: 'flower-garden', name: 'Vườn hoa giấy', icon: '🌺', description: 'Chỗ ở cho sinh vật của vườn hoa.',
    costs: [{ co: 4, dat: 3, khung: 1, 'hoa-giay': 2 }, { gach: 2, khung: 2, 'hoa-giay': 1 }],
    houses: 'garden', capacity: [2, 3], charm: [10, 18], minLevel: 2, max: 3 },
  { kind: 'bench', name: 'Ghế đá', icon: '🪑', description: 'Nơi dân làng ngồi nghỉ chân.',
    costs: [{ da: 3, van: 1 }], houses: null, capacity: [0], charm: [4], minLevel: 2, max: 4 },
  // Level 3
  { kind: 'lotus-pond', name: 'Ao sen', icon: '🪷', description: 'Chỗ ở cho sinh vật sống dưới nước.',
    costs: [{ dat: 6, da: 4, 'hat-sen': 2, 'vo-oc': 1 }, { gach: 3, 'hat-sen': 1, 'vo-oc': 1 }],
    houses: 'pond', capacity: [2, 3], charm: [14, 24], minLevel: 3, max: 3 },
  { kind: 'plaza', name: 'Quảng trường', icon: '⛲', description: 'Trung tâm làng, nơi sinh vật quảng trường tụ họp.',
    costs: [{ da: 6, gach: 4, 'soi-cuoi': 2 }, { gach: 4, ngoi: 2, 'soi-cuoi': 1 }],
    houses: 'plaza', capacity: [2, 3], charm: [16, 26], minLevel: 3, max: 2 },
  // Level 4
  { kind: 'well', name: 'Giếng làng', icon: '🪣', description: 'Giếng nước trong cho cả làng.',
    costs: [{ da: 4, gach: 3, 'vo-oc': 1 }], houses: null, capacity: [0], charm: [12], minLevel: 4, max: 2 },
  { kind: 'pavilion', name: 'Đình nhỏ', icon: '⛩️', description: 'Mái đình cho sinh vật thích nơi yên tĩnh.',
    costs: [{ van: 4, ngoi: 4, khung: 3, 'long-den': 2 }, { van: 3, ngoi: 3, 'long-den': 1 }],
    houses: 'pavilion', capacity: [1, 2], charm: [20, 32], minLevel: 4, max: 2 },
  // Level 5
  { kind: 'bamboo-bridge', name: 'Cầu tre', icon: '🌉', description: 'Cây cầu bắc qua dòng suối của làng.',
    costs: [{ tre: 6, khung: 3, 'vo-oc': 1 }], houses: null, capacity: [0], charm: [16], minLevel: 5, max: 2 },
  { kind: 'longhouse', name: 'Nhà rông', icon: '🏯', description: 'Ngôi nhà chung lớn nhất làng, mọi sinh vật đều ở được.',
    costs: [{ van: 8, khung: 6, ngoi: 6, 'la-bang': 2, 'hoa-giay': 2 }], houses: 'any', capacity: [4], charm: [36], minLevel: 5, max: 2 },
];

export const buildingDef = (kind: BuildingKind) => BUILDINGS.find((b) => b.kind === kind)!;
export const RECIPES: (Recipe & { workshop: BuildingKind })[] =
  BUILDINGS.flatMap((b) => (b.recipes ?? []).map((r) => ({ ...r, workshop: b.kind })));

/** Charm needed to reach each level (index 0 = level 1). Tuned with tests/unit/village-pacing.test.ts. */
export const LEVEL_CHARM = [0, 15, 55, 120, 210, 330];
export const MAX_LEVEL = LEVEL_CHARM.length;

export interface PlacedBuilding { id: string; kind: BuildingKind; x: number; y: number; tier: number; builtAt: number }
export interface Resident { creatureId: string; buildingId: string }
export interface Gift { date: string; resources: Cost }
/** A workshop recipe (`van`, `gach`…) or a market trade (`trade:tre>go`). */
export interface Craft { recipe: string; times: number }

/** At the market any raw material trades 3 → 1 for another, so no village is stuck when its walks never pass a tree. */
export const TRADE_RATE = 3;
export const tradeId = (give: MaterialId, get: MaterialId) => `trade:${give}>${get}`;
export function parseTrade(recipe: string): { give: MaterialId; get: MaterialId } | null {
  const m = /^trade:(\w+)>(\w+)$/.exec(recipe);
  if (!m || !RAW.includes(m[1] as MaterialId) || !RAW.includes(m[2] as MaterialId) || m[1] === m[2]) return null;
  return { give: m[1] as MaterialId, get: m[2] as MaterialId };
}

// ---- earning ---------------------------------------------------------------

/** Deterministic 32-bit hash for spreading the secondary materials. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function routeOfClaim(c: Claim) { return c.missionId.split('_').slice(2).join('_'); }

export function habitatOfClaim(pack: AreaPack, c: Claim): Habitat | undefined {
  const route = pack.routes.find((r) => r.id === routeOfClaim(c));
  return pack.pois.find((p) => p.id === route?.poi)?.type;
}

/**
 * Materials for one verified walk: 4 + 1 per 100 m. Half (rounded up) is the
 * destination's material; the rest is spread over the other four, starting
 * from a place fixed by the claim id so the same claim always gives the same.
 * A first meeting with a creature adds 2 of the destination's material.
 */
export function materialsForClaim(pack: AreaPack, c: Claim, firstMeeting: boolean): Cost {
  const units = 4 + Math.floor(c.walkM / 100);
  const main = HABITAT_MATERIAL[habitatOfClaim(pack, c) ?? 'plaza'];
  const out: Cost = { [main]: Math.ceil(units / 2) + (firstMeeting ? 2 : 0) };
  const others = RAW.filter((m) => m !== main);
  const start = hash(c.claimId) % others.length;
  for (let i = 0; i < Math.floor(units / 2); i++) {
    const m = others[(start + i) % others.length];
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

export function claimRewards(pack: AreaPack, claims: Claim[]) {
  const seen = new Set<string>();
  return [...claims].sort((a, b) => a.at - b.at).map((c) => {
    const first = !seen.has(c.creatureId);
    seen.add(c.creatureId);
    const materials = materialsForClaim(pack, c, first);
    const treasures: Cost = {};
    for (const id of c.items) treasures[id] = (treasures[id] ?? 0) + 1;
    return { claimId: c.claimId, materials, treasures };
  });
}

// ---- state -------------------------------------------------------------------

export const add = (into: Cost, from: Cost, sign = 1) => {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + sign * n;
  return into;
};

export const charmOf = (b: PlacedBuilding) => buildingDef(b.kind).charm[b.tier - 1];
export const capacityOf = (b: PlacedBuilding) => buildingDef(b.kind).capacity[b.tier - 1];

export function levelFor(charmPoints: number) {
  let lv = 1;
  for (let i = 0; i < LEVEL_CHARM.length; i++) if (charmPoints >= LEVEL_CHARM[i]) lv = i + 1;
  return lv;
}

/** Land grows with the village: 4×4 at level 1, one more row and column per level. */
export const gridSize = (level: number) => 3 + Math.min(level, MAX_LEVEL);

export interface VillageInput {
  claims: Claim[]; gifts: Gift[]; buildings: PlacedBuilding[]; residents: Resident[]; crafts: Craft[];
}

export interface VillageState {
  /** Everything on hand: materials and treasures. */
  stock: Cost;
  charm: number; level: number; size: number;
  nextLevelCharm: number | null;
  buildings: PlacedBuilding[];
  residents: Resident[];
  workshops: Set<BuildingKind>;
}

export function villageState(pack: AreaPack, input: VillageInput): VillageState {
  const stock: Cost = {};
  for (const r of claimRewards(pack, input.claims)) { add(stock, r.materials); add(stock, r.treasures); }
  for (const g of input.gifts) add(stock, g.resources);
  for (const b of input.buildings) {
    const def = buildingDef(b.kind);
    for (let t = 0; t < b.tier; t++) add(stock, def.costs[t], -1);
  }
  for (const c of input.crafts) {
    const tr = parseTrade(c.recipe);
    if (tr) { add(stock, { [tr.give]: TRADE_RATE }, -c.times); add(stock, { [tr.get]: 1 }, c.times); continue; }
    const r = RECIPES.find((x) => x.id === c.recipe);
    if (!r) continue;
    add(stock, r.inputs as Cost, -c.times);
    stock[r.id] = (stock[r.id] ?? 0) + r.out * c.times;
  }
  const charm = input.buildings.reduce((s, b) => s + charmOf(b), 0);
  const level = levelFor(charm);
  return {
    stock, charm, level, size: gridSize(level),
    nextLevelCharm: level < MAX_LEVEL ? LEVEL_CHARM[level] : null,
    buildings: input.buildings, residents: input.residents,
    workshops: new Set(input.buildings.filter((b) => buildingDef(b.kind).recipes).map((b) => b.kind)),
  };
}

export const affordable = (stock: Cost, cost: Cost) => Object.entries(cost).every(([k, n]) => (stock[k] ?? 0) >= n);
export const missing = (stock: Cost, cost: Cost): Cost =>
  Object.fromEntries(Object.entries(cost).filter(([k, n]) => (stock[k] ?? 0) < n).map(([k, n]) => [k, n - Math.max(0, stock[k] ?? 0)]));

// ---- actions -----------------------------------------------------------------

export type BuildProblem = 'LEVEL' | 'RESOURCES' | 'OCCUPIED' | 'OUTSIDE' | 'MAX_TIER' | 'NO_WORKSHOP' | 'LIMIT';

export function canBuild(v: VillageState, kind: BuildingKind, x?: number, y?: number): BuildProblem | null {
  const def = buildingDef(kind);
  if (v.level < def.minLevel) return 'LEVEL';
  if (v.buildings.filter((b) => b.kind === kind).length >= def.max) return 'LIMIT';
  if (!affordable(v.stock, def.costs[0])) return 'RESOURCES';
  if (x !== undefined && y !== undefined) {
    if (x < 0 || y < 0 || x >= v.size || y >= v.size) return 'OUTSIDE';
    if (v.buildings.some((b) => b.x === x && b.y === y)) return 'OCCUPIED';
  }
  return null;
}

export function upgradeCost(b: PlacedBuilding): Cost | null {
  return buildingDef(b.kind).costs[b.tier] ?? null;
}

export function canUpgrade(v: VillageState, b: PlacedBuilding): BuildProblem | null {
  const cost = upgradeCost(b);
  if (!cost) return 'MAX_TIER';
  // Each upgrade tier needs one more village level than the building itself.
  if (v.level < buildingDef(b.kind).minLevel + b.tier) return 'LEVEL';
  if (!affordable(v.stock, cost)) return 'RESOURCES';
  return null;
}

export function canTrade(v: VillageState, give: MaterialId, get: MaterialId, times = 1): BuildProblem | null {
  if (!parseTrade(tradeId(give, get))) return 'NO_WORKSHOP';
  return (v.stock[give] ?? 0) >= TRADE_RATE * times ? null : 'RESOURCES';
}

/** Where a raw material comes from, for telling the player where to walk. */
export function sourcesOf(pack: AreaPack, m: MaterialId) {
  const hab = (Object.keys(HABITAT_MATERIAL) as Habitat[]).find((h) => HABITAT_MATERIAL[h] === m);
  return pack.pois.filter((p) => p.type === hab && p.status === 'active').map((p) => p.name);
}

/** The destination material a mission will mostly yield (for the Today list). */
export function mainMaterialOfPoi(pack: AreaPack, poiId: string): MaterialId {
  return HABITAT_MATERIAL[pack.pois.find((p) => p.id === poiId)?.type ?? 'plaza'];
}

export function canCraft(v: VillageState, recipe: MaterialId, times = 1): BuildProblem | null {
  const r = RECIPES.find((x) => x.id === recipe);
  if (!r || !v.workshops.has(r.workshop)) return 'NO_WORKSHOP';
  const need: Cost = {};
  add(need, r.inputs as Cost, times);
  return affordable(v.stock, need) ? null : 'RESOURCES';
}

export function fits(def: BuildingDef, habitats: Habitat[]) {
  return def.houses === 'any' || (def.houses !== null && habitats.includes(def.houses));
}

export type MoveInProblem = 'NOT_OWNED' | 'NO_ROOM' | 'WRONG_HOME' | 'NOT_A_HOME';

export function canMoveIn(v: VillageState, building: PlacedBuilding, creature: { id: string; habitats: Habitat[] }, owned: Set<string>): MoveInProblem | null {
  const def = buildingDef(building.kind);
  if (!owned.has(creature.id)) return 'NOT_OWNED';
  if (def.houses === null) return 'NOT_A_HOME';
  if (!fits(def, creature.habitats)) return 'WRONG_HOME';
  const living = v.residents.filter((r) => r.buildingId === building.id && r.creatureId !== creature.id).length;
  if (living >= capacityOf(building)) return 'NO_ROOM';
  return null;
}

/**
 * Residents bring a gift once a day, only on a day with a verified walk: the
 * village grows from walking, never from just opening the app. Each resident
 * brings one unit of the material of its home habitat (1 random raw for 'any').
 */
export function giftFor(pack: AreaPack, claims: Claim[], gifts: Gift[], residents: Resident[], today: string): Cost | null {
  if (!residents.length || !claims.some((c) => c.date === today) || gifts.some((g) => g.date === today)) return null;
  const out: Cost = {};
  for (const r of residents) {
    const c = pack.creatures.find((x) => x.id === r.creatureId);
    const hab = c?.habitats[hash(today + r.creatureId) % (c?.habitats.length || 1)];
    const m = hab ? HABITAT_MATERIAL[hab] : RAW[hash(today + r.creatureId) % RAW.length];
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

export function resourceName(pack: AreaPack, id: string) {
  const m = MATERIALS.find((x) => x.id === id);
  if (m) return `${m.icon} ${m.name}`;
  return `✨ ${pack.items.find((i) => i.id === id)?.name ?? id}`;
}
