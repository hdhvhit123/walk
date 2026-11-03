import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { RULES } from '../core/rules';
import { parseLines, walkSensors } from './recorder';
import { allClaims, allSessions, currentDatabase, deleteSimEvents, expiredSessions, simEvents, useDatabase, wipeAll, type SessionRecord } from './store';

async function eventsOf(s: SessionRecord) {
  if (s.recorder === 'sim') return simEvents(s.id);
  const m = walkSensors();
  return m ? parseLines((await m.readEvents(s.id, 0)).lines) : [];
}

/** Field-test log: every session with its raw events, for calibrating rules.ts. */
export async function exportLog() {
  const sessions = [];
  for (const s of await allSessions()) sessions.push({ ...s, events: await eventsOf(s) });
  const data = { exportedAt: new Date().toISOString(), rulesVersion: RULES.version, db: currentDatabase(), sessions, claims: await allClaims() };
  const file = new File(Paths.cache, `nhat-ky-di-bo-${new Date().toISOString().slice(0, 10)}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data, null, 1));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Xuất nhật ký phiên' });
  return { sessions: sessions.length, uri: file.uri };
}

/** Delete raw sensor logs past retention in the current database (summaries stay). */
export async function pruneRawLogs(now: number) {
  const m = walkSensors();
  for (const s of await expiredSessions(now)) {
    if (s.recorder === 'sim') await deleteSimEvents(s.id);
    else await m?.deleteSession(s.id);
  }
}

/** Erase everything on the device: both databases and all native session logs. */
export async function eraseEverything() {
  const m = walkSensors();
  if (m?.activeSession()) await m.stopSession();
  await m?.deleteAll();
  await wipeAll();
  useDatabase(false);
}
