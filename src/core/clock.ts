import { RULES } from './rules';

/** Detects the device clock being moved backwards relative to the latest time seen. */
export function checkClock(lastSeenMax: number | undefined, now: number): { ok: boolean; newMax: number } {
  if (lastSeenMax === undefined) return { ok: true, newMax: now };
  if (now < lastSeenMax - RULES.clockRollbackToleranceMs) return { ok: false, newMax: lastSeenMax };
  return { ok: true, newMax: Math.max(lastSeenMax, now) };
}

/** Local calendar date YYYY-MM-DD. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + n, 12).getTime());
}

/** ISO-8601 week number, used for the weekly creature theme. */
export function isoWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}
