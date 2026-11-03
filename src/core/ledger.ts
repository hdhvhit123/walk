import { RULES } from './rules';

export interface Claim {
  claimId: string;      // == missionId: one reward per mission
  missionId: string; sessionId: string; date: string; at: number;
  creatureId: string; items: string[]; walkM: number;
  /** Local-only progress; becomes 'pending' → 'accepted'/'rejected' once a backend exists. */
  syncState: 'local';
}

export type ClaimDecision = { ok: true } | { ok: false; reason: 'ALREADY_CLAIMED' | 'DAILY_LIMIT' };

export function canClaim(claims: Pick<Claim, 'missionId' | 'date'>[], missionId: string, date: string): ClaimDecision {
  if (claims.some((c) => c.missionId === missionId)) return { ok: false, reason: 'ALREADY_CLAIMED' };
  if (claims.filter((c) => c.date === date).length >= RULES.maxClaimsPerDay) return { ok: false, reason: 'DAILY_LIMIT' };
  return { ok: true };
}

/** Consecutive days (ending today or yesterday) with at least one claim. */
export function streak(claimDates: string[], today: string, addDays: (d: string, n: number) => string): number {
  const set = new Set(claimDates);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) { n++; day = addDays(day, -1); }
  return n;
}
