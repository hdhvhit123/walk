/**
 * Fakes for the native edges. Each mirrors the contract of the real thing:
 * - sqlite: real SQL (node:sqlite), databases persist across app restarts within a test.
 * - native: the Kotlin EventLog semantics (byte offsets, complete lines only,
 *   in-memory "active" that dies with the process).
 */
type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

export const sqlite = {
  dbs: new Map<string, InstanceType<typeof DatabaseSync>>(),
  reset() { for (const d of this.dbs.values()) d.close(); this.dbs.clear(); },
  open(name: string) {
    let d = this.dbs.get(name);
    if (!d) { d = new DatabaseSync(':memory:'); this.dbs.set(name, d); }
    const db = d;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      execAsync: async (sql: string) => { db.exec(sql.replace(/PRAGMA journal_mode = WAL;/, '')); },
      runAsync: async (sql: string, ...args: unknown[]) => { db.prepare(sql).run(...args); return { changes: 1 }; },
      getAllAsync: async <T,>(sql: string, ...args: unknown[]) => db.prepare(sql).all(...args) as T[],
      getFirstAsync: async <T,>(sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) ?? null) as T | null,
      withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => {
        db.exec('BEGIN');
        try { await fn(api); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      },
    };
    return api;
  },
};

const FULL_CAPS = { stepDetector: true, stepCounter: true, gps: true, gpsEnabled: true, activityRecognition: true, backgroundTracking: true };

export const native = {
  logs: new Map<string, Buffer>(),
  active: null as string | null,
  caps: { ...FULL_CAPS },
  starts: 0,
  reset() { this.logs.clear(); this.active = null; this.starts = 0; this.caps = { ...FULL_CAPS }; },
  /** What the foreground service writes while recording. */
  write(id: string, e: object) {
    if (this.active !== id) return;
    this.append(id, JSON.stringify(e) + '\n');
  },
  append(id: string, text: string) { this.logs.set(id, Buffer.concat([this.logs.get(id) ?? Buffer.alloc(0), Buffer.from(text, 'utf8')])); },
  /** The OS kills the process: the service and its in-memory state are gone, the log file stays. */
  killProcess() { this.active = null; },
  module: {
    getCapabilities: () => native.caps,
    startSession: async (id: string) => { native.active = id; native.starts++; },
    stopSession: async () => { native.active = null; },
    activeSession: () => native.active,
    appendEvent: async (id: string, json: string) => { JSON.parse(json); native.append(id, json.trim() + '\n'); },
    readEvents: async (id: string, from: number) => {
      const buf = native.logs.get(id) ?? Buffer.alloc(0);
      const start = Math.max(0, Math.min(from, buf.length));
      const rest = buf.subarray(start);
      const nl = rest.lastIndexOf(0x0a);
      if (nl < 0) return { lines: [], offset: start };
      return { lines: rest.subarray(0, nl).toString('utf8').split('\n').filter(Boolean), offset: start + nl + 1 };
    },
    deleteSession: async (id: string) => { native.logs.delete(id); },
    deleteAll: async () => { native.logs.clear(); },
  },
};

export const device = {
  position: { lat: 0, lng: 0, acc: 5 },
  locationGranted: true,
  shared: [] as string[],
  reset() { this.position = { lat: 0, lng: 0, acc: 5 }; this.locationGranted = true; this.shared = []; },
};

export type { Row };
