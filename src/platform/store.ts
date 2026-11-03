import * as SQLite from 'expo-sqlite';
import type { Mission } from '../core/missions';
import type { Claim } from '../core/ledger';
import type { SensorEvent, Snapshot } from '../core/verify';
import type { ReasonCode } from '../core/reasons';
import type { ScenarioId } from '../core/sim';
import { RULES } from '../core/rules';
import {
  canBuild, canCraft, canMoveIn, canTrade, canUpgrade, giftFor, tradeId, villageState,
  type BuildingKind, type BuildProblem, type Cost, type Craft, type Gift, type MaterialId, type MoveInProblem,
  type PlacedBuilding, type Resident, type VillageInput, type VillageState,
} from '../core/village';
import type { AreaPack, Habitat } from '../core/pack';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed' | 'abandoned';

export interface SessionRecord {
  id: string; missionId: string; poiId: string; date: string;
  startT: number; endedAt?: number; status: SessionStatus;
  motionAvailable: boolean; rulesVersion: string;
  /** 'native' = foreground-service log on the device; 'sim' = simulator log in SQLite. */
  recorder: 'native' | 'sim';
  reasons?: ReasonCode[];
  summary?: Pick<Snapshot, 'walkM' | 'progressM' | 'routeLenM' | 'unknownShare' | 'vehicleConfirmed' | 'collected'>;
  lastT: number; lastWall: number;
  sim?: { scenario: ScenarioId; speed: number; seed: string };
}

export interface Meta {
  onboarded?: boolean; clockMax?: number; motionAvailable?: boolean; simMode?: boolean;
  stats?: { started: number; completed: number; failed: Record<string, number>; abandoned: number; shares: number };
  simHub?: string;
}

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;
let currentName = '';

/** Simulation uses its own database file so its rewards never mix with real ones. */
export function useDatabase(sim: boolean) {
  const name = sim ? 'walk-sim.db' : 'walk.db';
  if (name !== currentName) { currentName = name; dbp = null; }
}

async function db() {
  if (!currentName) useDatabase(false);
  dbp ??= (async () => {
    const d = await SQLite.openDatabaseAsync(currentName);
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, date TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mission_sets (k TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, status TEXT NOT NULL, start_t INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sim_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sim_events_session ON sim_events(session_id);
      CREATE TABLE IF NOT EXISTS claims (claim_id TEXT PRIMARY KEY, date TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collection (creature_id TEXT PRIMARY KEY, first_at INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS inventory (item_id TEXT PRIMARY KEY, count INTEGER NOT NULL);
      DROP TABLE IF EXISTS village_buildings; DROP TABLE IF EXISTS village_residents; DROP TABLE IF EXISTS village_gifts;
      CREATE TABLE IF NOT EXISTS vl_buildings (id TEXT PRIMARY KEY, kind TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, tier INTEGER NOT NULL, built_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS vl_residents (creature_id TEXT PRIMARY KEY, building_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vl_gifts (date TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vl_crafts (seq INTEGER PRIMARY KEY AUTOINCREMENT, recipe TEXT NOT NULL, times INTEGER NOT NULL);
    `);
    return d;
  })();
  return dbp;
}

/**
 * Write transactions run one at a time. Each exclusive transaction takes its
 * own connection, so two overlapping ones (e.g. the simulator flushing while
 * a claim is written) would otherwise fight over the lock and one would fail.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
async function transaction(fn: (tx: SQLite.SQLiteDatabase) => Promise<void>) {
  const d = await db();
  const run = writeQueue.then(() => d.withExclusiveTransactionAsync(fn));
  writeQueue = run.catch(() => {});
  return run;
}

const parse = <T,>(rows: { json: string }[]) => rows.map((r) => JSON.parse(r.json) as T);

export async function getMeta(): Promise<Meta> {
  const rows = await (await db()).getAllAsync<{ k: string; v: string }>('SELECT k, v FROM kv');
  return Object.fromEntries(rows.map((r) => [r.k, JSON.parse(r.v)])) as Meta;
}

export async function setMeta<K extends keyof Meta>(key: K, value: Meta[K]) {
  await (await db()).runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', key, JSON.stringify(value ?? null));
}

export async function bumpStat(fn: (s: NonNullable<Meta['stats']>) => void) {
  const m = await getMeta();
  const s = m.stats ?? { started: 0, completed: 0, failed: {}, abandoned: 0, shares: 0 };
  fn(s);
  await setMeta('stats', s);
}

/** Persist a generated mission set once; later calls return the stored set (no re-rolls). */
export async function saveOrLoadMissionSet(key: string, generate: () => { options: Mission[]; relaxedRecent: boolean } | null) {
  const d = await db();
  const existing = await d.getFirstAsync<{ json: string }>('SELECT json FROM mission_sets WHERE k = ?', key);
  if (existing) {
    const set = JSON.parse(existing.json) as { ids: string[]; relaxedRecent: boolean };
    const ms = await Promise.all(set.ids.map(getMission));
    return { options: ms.filter((m): m is Mission => !!m), relaxedRecent: set.relaxedRecent };
  }
  const gen = generate();
  if (!gen) return null;
  await transaction(async (tx) => {
    for (const m of gen.options) await tx.runAsync('INSERT OR REPLACE INTO missions (id, date, json) VALUES (?, ?, ?)', m.id, m.date, JSON.stringify(m));
    await tx.runAsync('INSERT INTO mission_sets (k, json) VALUES (?, ?)', key, JSON.stringify({ ids: gen.options.map((m) => m.id), relaxedRecent: gen.relaxedRecent }));
  });
  return gen;
}

export async function getMission(id: string): Promise<Mission | undefined> {
  const r = await (await db()).getFirstAsync<{ json: string }>('SELECT json FROM missions WHERE id = ?', id);
  return r ? (JSON.parse(r.json) as Mission) : undefined;
}

export async function putSession(s: SessionRecord) {
  await (await db()).runAsync('INSERT OR REPLACE INTO sessions (id, status, start_t, json) VALUES (?, ?, ?, ?)', s.id, s.status, s.startT, JSON.stringify(s));
}

export async function allSessions() {
  return parse<SessionRecord>(await (await db()).getAllAsync<{ json: string }>('SELECT json FROM sessions ORDER BY start_t'));
}

export async function activeSession(): Promise<SessionRecord | undefined> {
  const r = await (await db()).getFirstAsync<{ json: string }>("SELECT json FROM sessions WHERE status IN ('active', 'paused') ORDER BY start_t DESC");
  return r ? (JSON.parse(r.json) as SessionRecord) : undefined;
}

export async function appendSimEvents(sessionId: string, evs: SensorEvent[]) {
  if (!evs.length) return;
  await transaction(async (tx) => {
    for (const e of evs) await tx.runAsync('INSERT INTO sim_events (session_id, json) VALUES (?, ?)', sessionId, JSON.stringify(e));
  });
}

export async function simEvents(sessionId: string): Promise<SensorEvent[]> {
  return parse<SensorEvent>(await (await db()).getAllAsync<{ json: string }>('SELECT json FROM sim_events WHERE session_id = ? ORDER BY seq', sessionId));
}

export async function allClaims() {
  return parse<Claim>(await (await db()).getAllAsync<{ json: string }>('SELECT json FROM claims ORDER BY date'));
}

export async function collection() {
  return (await (await db()).getAllAsync<{ creature_id: string; first_at: number; count: number }>('SELECT * FROM collection'))
    .map((r) => ({ creatureId: r.creature_id, firstAt: r.first_at, count: r.count }));
}

export async function inventory() {
  return (await (await db()).getAllAsync<{ item_id: string; count: number }>('SELECT * FROM inventory')).map((r) => ({ itemId: r.item_id, count: r.count }));
}

/** Atomic, idempotent reward write: one claim per mission id. */
export async function writeClaim(claim: Claim): Promise<{ claim: Claim; created: boolean }> {
  let result: { claim: Claim; created: boolean } = { claim, created: false };
  await transaction(async (tx) => {
    const existing = await tx.getFirstAsync<{ json: string }>('SELECT json FROM claims WHERE claim_id = ?', claim.claimId);
    if (existing) { result = { claim: JSON.parse(existing.json) as Claim, created: false }; return; }
    await tx.runAsync('INSERT INTO claims (claim_id, date, json) VALUES (?, ?, ?)', claim.claimId, claim.date, JSON.stringify(claim));
    await tx.runAsync(
      'INSERT INTO collection (creature_id, first_at, count) VALUES (?, ?, 1) ON CONFLICT(creature_id) DO UPDATE SET count = count + 1',
      claim.creatureId, claim.at,
    );
    for (const itemId of claim.items) {
      await tx.runAsync('INSERT INTO inventory (item_id, count) VALUES (?, 1) ON CONFLICT(item_id) DO UPDATE SET count = count + 1', itemId);
    }
    result = { claim, created: true };
  });
  return result;
}

/** Sessions whose raw sensor logs are past retention (summaries stay). */
export async function expiredSessions(now: number) {
  const cutoff = now - RULES.rawRetentionDays * 86_400_000;
  return (await allSessions()).filter((s) => s.startT < cutoff && s.status !== 'active' && s.status !== 'paused');
}

export async function deleteSimEvents(sessionId: string) {
  await (await db()).runAsync('DELETE FROM sim_events WHERE session_id = ?', sessionId);
}

export async function wipeAll() {
  for (const sim of [false, true]) {
    useDatabase(sim);
    const d = await db();
    await d.execAsync('DELETE FROM kv; DELETE FROM missions; DELETE FROM mission_sets; DELETE FROM sessions; DELETE FROM sim_events; DELETE FROM claims; DELETE FROM collection; DELETE FROM inventory; DELETE FROM vl_buildings; DELETE FROM vl_residents; DELETE FROM vl_gifts; DELETE FROM vl_crafts;');
  }
  useDatabase(false);
}

export function currentDatabase() { return currentName; }

// ---- Village -------------------------------------------------------------
// Only what the player did is stored (buildings, residents, gifts, crafts);
// every balance is recomputed from it and the claim ledger.

type Q = Pick<SQLite.SQLiteDatabase, 'getAllAsync'>;

async function villageInput(q: Q): Promise<VillageInput> {
  const claims = parse<Claim>(await q.getAllAsync<{ json: string }>('SELECT json FROM claims ORDER BY date'));
  const buildings = (await q.getAllAsync<{ id: string; kind: BuildingKind; x: number; y: number; tier: number; built_at: number }>('SELECT * FROM vl_buildings ORDER BY built_at'))
    .map((r): PlacedBuilding => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, tier: r.tier, builtAt: r.built_at }));
  const residents = (await q.getAllAsync<{ creature_id: string; building_id: string }>('SELECT * FROM vl_residents'))
    .map((r): Resident => ({ creatureId: r.creature_id, buildingId: r.building_id }));
  const gifts = (await q.getAllAsync<{ date: string; json: string }>('SELECT * FROM vl_gifts')).map((r): Gift => ({ date: r.date, resources: JSON.parse(r.json) as Cost }));
  const crafts = await q.getAllAsync<Craft>('SELECT recipe, times FROM vl_crafts ORDER BY seq');
  return { claims, buildings, residents, gifts, crafts };
}

export async function village(pack: AreaPack, today: string): Promise<VillageState & { gift: Cost | null }> {
  const input = await villageInput(await db());
  return { ...villageState(pack, input), gift: giftFor(pack, input.claims, input.gifts, input.residents, today) };
}

/** Each action re-checks the rules inside its transaction, so a double tap can never overspend. */
async function act<T>(pack: AreaPack, fn: (v: VillageState, input: VillageInput, tx: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  let out!: T;
  await transaction(async (tx) => {
    const input = await villageInput(tx);
    out = await fn(villageState(pack, input), input, tx);
  });
  return out;
}

export const placeBuilding = (pack: AreaPack, kind: BuildingKind, x: number, y: number, now: number) =>
  act<BuildProblem | null>(pack, async (v, _i, tx) => {
    const p = canBuild(v, kind, x, y);
    if (!p) await tx.runAsync('INSERT INTO vl_buildings (id, kind, x, y, tier, built_at) VALUES (?, ?, ?, ?, 1, ?)', `b_${now.toString(36)}_${x}_${y}`, kind, x, y, now);
    return p;
  });

export const upgradeBuilding = (pack: AreaPack, id: string) =>
  act<BuildProblem | null>(pack, async (v, _i, tx) => {
    const b = v.buildings.find((x) => x.id === id);
    const p = b ? canUpgrade(v, b) : 'MAX_TIER';
    if (!p) await tx.runAsync('UPDATE vl_buildings SET tier = tier + 1 WHERE id = ?', id);
    return p;
  });

export const craft = (pack: AreaPack, recipe: MaterialId, times = 1) =>
  act<BuildProblem | null>(pack, async (v, _i, tx) => {
    const p = canCraft(v, recipe, times);
    if (!p) await tx.runAsync('INSERT INTO vl_crafts (recipe, times) VALUES (?, ?)', recipe, times);
    return p;
  });

export const trade = (pack: AreaPack, give: MaterialId, get: MaterialId, times = 1) =>
  act<BuildProblem | null>(pack, async (v, _i, tx) => {
    const p = canTrade(v, give, get, times);
    if (!p) await tx.runAsync('INSERT INTO vl_crafts (recipe, times) VALUES (?, ?)', tradeId(give, get), times);
    return p;
  });

export const moveBuilding = (pack: AreaPack, id: string, x: number, y: number) =>
  act<boolean>(pack, async (v, _i, tx) => {
    if (x < 0 || y < 0 || x >= v.size || y >= v.size || v.buildings.some((b) => b.x === x && b.y === y)) return false;
    await tx.runAsync('UPDATE vl_buildings SET x = ?, y = ? WHERE id = ?', x, y, id);
    return true;
  });

export const moveIn = (pack: AreaPack, creature: { id: string; habitats: Habitat[] }, buildingId: string) =>
  act<MoveInProblem | null>(pack, async (v, _i, tx) => {
    const b = v.buildings.find((x) => x.id === buildingId);
    const owned = new Set((await tx.getAllAsync<{ creature_id: string }>('SELECT creature_id FROM collection')).map((r) => r.creature_id));
    const p = b ? canMoveIn(v, b, creature, owned) : 'NOT_A_HOME';
    if (!p) await tx.runAsync('INSERT OR REPLACE INTO vl_residents (creature_id, building_id) VALUES (?, ?)', creature.id, buildingId);
    return p;
  });

export async function moveOut(creatureId: string) {
  await (await db()).runAsync('DELETE FROM vl_residents WHERE creature_id = ?', creatureId);
}

export const collectGift = (pack: AreaPack, today: string) =>
  act<Cost | null>(pack, async (_v, input, tx) => {
    const g = giftFor(pack, input.claims, input.gifts, input.residents, today);
    if (g) await tx.runAsync('INSERT INTO vl_gifts (date, json) VALUES (?, ?)', today, JSON.stringify(g));
    return g;
  });
