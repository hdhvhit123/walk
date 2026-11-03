import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../src/core/sim';
import { routeCfg, runScenario } from './helpers';

const ROUTES = ['r-n-plaza', 'r-n-lotus', 'r-n-lotus-grand', 'r-w-pavilion'];
const SEEDS = ['seed-1', 'seed-2', 'seed-3'];

describe('field-test scenarios (simulated)', () => {
  for (const routeId of ROUTES) {
    for (const sc of SCENARIOS) for (const seed of SEEDS) {
      const len = routeCfg(routeId).routeLenM;
      const borderline = len < (sc.passMinRouteM ?? 0);
      const expectPass = sc.expect === 'pass';
      it(`${routeId} · ${sc.id} · ${seed} → ${borderline ? 'borderline' : sc.expect}`, () => {
        const { result, snap } = runScenario(routeId, sc.id, seed);
        const msg = JSON.stringify({ reasons: result.reasons, walk: Math.round(snap.walkM), len: Math.round(snap.routeLenM),
          prog: Math.round(snap.progressM), unk: snap.unknownShare.toFixed(2), veh: snap.vehicleConfirmed,
          cls: snap.windows.map((w) => w.cls[0] + ':' + w.why).join(' ') });
        if (borderline) {
          // Short route: a 40 s blackout is a large share of the walk; either verdict is acceptable, never "vehicle".
          expect(snap.vehicleConfirmed, msg).toBe(false);
          return;
        }
        expect(result.eligible, msg).toBe(expectPass);
      });
    }
  }
});
