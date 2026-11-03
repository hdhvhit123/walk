import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App, { PACK } from '../../src/App';
import { simTrace } from '../../src/platform/session';
import { eventTime } from '../../src/platform/recorder';
import type { SensorEvent } from '../../src/core/verify';
import * as store from '../../src/platform/store';
import { device, native } from './fakes';

const T0 = new Date('2026-11-03T08:00:00+07:00').getTime();

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
});
afterEach(() => { jest.useRealTimers(); });

/** Let promises settle without moving the clock much. */
async function flush(n = 5) { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(1); }); }
async function tap(id: string) { fireEvent.press(await screen.findByTestId(id)); await flush(); }

async function onboard() {
  for (let i = 0; i < 3; i++) await tap('next');
  await tap('run-check');
  await screen.findByTestId('verify-ok');
  await tap('enter');
  await screen.findByTestId('today');
}

/** Stand at the hub of the first mission and open it. */
async function pickFirstMission(duration: 10 | 20 | 30 = 10) {
  await tap(`duration-${duration}`);
  const first = await screen.findByTestId('mission-0');
  fireEvent.press(first);
  await flush();
  await screen.findByTestId('mission-map');
}

/** Drive the fake foreground service with a scripted trace while the fake clock runs. */
function feeder(id: () => string | null, trace: SensorEvent[]) {
  let i = 0;
  return async (ms: number) => {
    for (let left = ms; left > 0; left -= 1000) {
      const now = Date.now() + 1000;
      while (i < trace.length && eventTime(trace[i]) <= now) {
        const e = trace[i++];
        const sid = id();
        // A scripted gap is just silence from the service.
        if (sid && e.kind !== 'gap') native.write(sid, e);
      }
      await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    }
    return i >= trace.length;
  };
}

function hubOf(missionHub: string) {
  const h = PACK.hubs.find((x) => x.id === missionHub)!;
  return { lat: h.lat, lng: h.lng, acc: 5 };
}

async function startRealWalk(scenario: 'walk' | 'car-then-walk' = 'walk', duration: 10 | 20 | 30 = 10) {
  render(<App />);
  await onboard();
  // Ask Today for missions from the first hub.
  device.position = hubOf(PACK.hubs[0].id);
  fireEvent.press(await screen.findByTestId('tab-settings'));
  await flush();
  fireEvent.press(await screen.findByTestId('tab-today'));
  await flush(10);
  await pickFirstMission(duration);
  await tap('start');
  await screen.findByTestId('walking');
  const id = native.active!;
  expect(id).toBeTruthy();
  const session = (await store.activeSession())!;
  const mission = (await store.getMission(session.missionId))!;
  const trace = simTrace(PACK, mission, session.startT, { scenario, speed: 1, seed: 'app-test' }).events;
  return { id, session, mission, trace };
}

describe('Android app, real-device path (fake foreground service)', () => {
  test('first launch → onboarding → mission → walk → reward → collection', async () => {
    const { id, trace } = await startRealWalk('walk');
    const feed = feeder(() => native.active, trace);
    let done = false;
    for (let k = 0; k < 40 && !done; k++) done = await feed(60_000);
    expect(done).toBe(true);
    await screen.findByText('Gặp sinh vật');
    await tap('claim');
    // Recording stops as soon as the reward is decided.
    expect(native.active).toBeNull();
    await screen.findByTestId('encounter');
    for (let i = 0; i < 3; i++) await tap('creature-tap');
    await screen.findByTestId('result');
    // Building materials for the village, named on the result screen.
    await waitFor(() => expect(within('materials-earned')).toMatch(/×\d/));
    await tap('share');
    expect(device.shared).toContain('file:///cache/share.png');
    await tap('to-collection');
    expect((await screen.findAllByTestId('owned')).length).toBe(1);
    // The raw log is still on the device for export (retention is 30 days).
    expect(native.logs.get(id)!.length).toBeGreaterThan(1000);
  });

  test('vehicle segment: reward refused with the reason, session failed, stats updated', async () => {
    const { trace } = await startRealWalk('car-then-walk', 20);
    const feed = feeder(() => native.active, trace);
    let done = false;
    for (let k = 0; k < 40 && !done; k++) done = await feed(60_000);
    expect(done).toBe(true);
    // Once a vehicle is confirmed the main button says so, and the walk can only end.
    await screen.findByText('Xem kết quả');
    expect(within('conditions')).toMatch(/Có đoạn đi phương tiện/);
    await tap('claim');
    await screen.findByTestId('refusal');
    expect(within('refusal')).toMatch(/phương tiện/i);
    await tap('end-failed');
    await screen.findByTestId('today');
    expect(native.active).toBeNull();
    fireEvent.press(screen.getByTestId('tab-settings'));
    await flush(10);
    expect(within('stats')).toMatch(/Bắt đầu\s+1\b/);
  });

  test('app closed mid-walk while the service keeps recording: nothing is lost', async () => {
    const { id, trace } = await startRealWalk('walk');
    const feed = feeder(() => native.active, trace);
    await feed(120_000);
    const before = (await screen.findByTestId('walk-m')).props.children;
    screen.unmount(); // JS gone (swiped away); process + service alive
    await feed(120_000); // the service records with no one listening
    render(<App />);
    await screen.findByTestId('walking');
    await screen.findByText(/vẫn được ghi trong lúc app đóng/);
    expect(native.active).toBe(id);
    expect(native.starts).toBe(1); // not restarted, just reattached
    await feed(10_000);
    const after = screen.getByTestId('walk-m').props.children;
    expect(parseInt(after)).toBeGreaterThan(parseInt(before));
  });

  test('process killed mid-walk: interrupted, gap is not counted, continuing restarts recording', async () => {
    const { id, trace } = await startRealWalk('walk');
    const feed = feeder(() => native.active, trace);
    await feed(90_000);
    screen.unmount();
    native.killProcess();
    await act(async () => { jest.advanceTimersByTime(60_000); });
    render(<App />);
    await screen.findByTestId('walking');
    await screen.findByText(/Phiên bị gián đoạn/);
    expect(screen.getByTestId('tracking-status')).toHaveTextContent(/gián đoạn/);
    await tap('continue');
    expect(native.active).toBe(id);
    expect(native.starts).toBe(2);
    const log = native.logs.get(id)!.toString('utf8');
    expect(log).toMatch(/"kind":"gap".*"reason":"reload"/);
  });

  test('pause stops the service, resume starts it again', async () => {
    const { id, trace } = await startRealWalk('walk');
    const feed = feeder(() => native.active, trace);
    await feed(30_000);
    await tap('pause');
    expect(native.active).toBeNull();
    expect(screen.getByTestId('tracking-status')).toHaveTextContent(/^Tạm dừng/);
    await tap('resume');
    expect(native.active).toBe(id);
    const kinds = native.logs.get(id)!.toString('utf8').trim().split('\n').map((l) => JSON.parse(l).kind);
    expect(kinds.indexOf('pause')).toBeLessThan(kinds.indexOf('resume'));
  });

  test('mock location from the OS blocks the reward', async () => {
    const { trace } = await startRealWalk('walk');
    const mocked = trace.map((e) => (e.kind === 'fix' ? { ...e, mock: true } : e));
    const feed = feeder(() => native.active, mocked);
    let done = false;
    for (let k = 0; k < 40 && !done; k++) done = await feed(60_000);
    await tap('claim');
    await screen.findByTestId('refusal');
    expect(within('refusal')).toMatch(/vị trí giả lập/i);
  });

  test('torn line at the end of the log is skipped until complete', async () => {
    const { id } = await startRealWalk('walk');
    native.append(id, '{"kind":"step","t":');
    await act(async () => { jest.advanceTimersByTime(2000); });
    native.append(id, `${Date.now()}}\n`);
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(screen.getByTestId('walking')).toBeTruthy();
  });

  test('device without step sensor → limited mode, no reward', async () => {
    native.caps = { ...native.caps, stepDetector: false, stepCounter: false };
    render(<App />);
    for (let i = 0; i < 3; i++) await tap('next');
    await tap('run-check');
    await screen.findByTestId('verify-limited');
  });

  test('end walk early: confirmation, service stopped, back on Today', async () => {
    await startRealWalk('walk');
    await tap('end');
    await screen.findByTestId('today');
    expect(native.active).toBeNull();
  });

  test('start refused when far from the start gate', async () => {
    render(<App />);
    await onboard();
    device.position = hubOf(PACK.hubs[0].id);
    fireEvent.press(screen.getByTestId('tab-settings')); await flush();
    fireEvent.press(screen.getByTestId('tab-today')); await flush(10);
    await pickFirstMission();
    device.position = { lat: device.position.lat + 0.01, lng: device.position.lng, acc: 5 };
    await tap('start');
    await screen.findByTestId('start-problem');
    expect(native.active).toBeNull();
  });
});

describe('simulation mode', () => {
  test('separate database; sim walk rewards only the sim collection', async () => {
    render(<App />);
    await onboard();
    fireEvent.press(screen.getByTestId('tab-settings')); await flush();
    await tap('toggle-sim');
    await screen.findByTestId('sim-banner');
    await screen.findByTestId('today');
    await pickFirstMission();
    await tap('speed-120');
    await tap('start');
    await screen.findByTestId('walking');
    expect(native.active).toBeNull(); // the simulator never starts the service
    for (let k = 0; k < 60 && !screen.queryByText('Gặp sinh vật'); k++) await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await tap('claim');
    await screen.findByTestId('encounter');
    for (let i = 0; i < 3; i++) await tap('creature-tap');
    await tap('to-collection');
    expect((await screen.findAllByTestId('owned')).length).toBe(1);
    // Back to real mode: the real collection is still empty.
    fireEvent.press(screen.getByTestId('tab-settings')); await flush();
    await tap('toggle-sim');
    await screen.findByTestId('today');
    expect(screen.queryByTestId('sim-banner')).toBeNull();
    fireEvent.press(screen.getByTestId('tab-collection')); await flush(10);
    expect(screen.queryAllByTestId('owned').length).toBe(0);
  });
});

describe('village', () => {
  const tree = () => PACK.routes.find((r) => PACK.pois.find((p) => p.id === r.poi)?.type === 'tree')!.id;
  const pav = () => PACK.routes.find((r) => PACK.pois.find((p) => p.id === r.poi)?.type === 'pavilion')!.id;
  /** Verified walks written through the same claim path a real walk uses. */
  async function seed() {
    // Tree, 1000 m, first meeting: 14 units → 7+2 wood + 7 spread over stone/bamboo/clay/thatch.
    await store.writeClaim({ claimId: `2026-11-03_30_${tree()}`, missionId: `2026-11-03_30_${tree()}`, sessionId: 's1', date: '2026-11-03', at: T0,
      creatureId: 'meo-may', items: ['la-bang', 'long-den'], walkM: 1000, syncState: 'local' });
    // Pavilion, 1000 m: bamboo.
    await store.writeClaim({ claimId: `2026-11-03_20_${pav()}`, missionId: `2026-11-03_20_${pav()}`, sessionId: 's2', date: '2026-11-03', at: T0 + 1,
      creatureId: 'meo-may', items: [], walkM: 1000, syncState: 'local' });
  }
  const stock = async () => (await store.village(PACK, '2026-11-03')).stock;

  test('build from materials, craft at the workshop, trade at the market, invite, gift, persist', async () => {
    await seed();
    render(<App />);
    await onboard();
    await tap('tab-village');
    expect(within('stock')).toMatch(/Gỗ \d+/);
    const s0 = await stock();
    // Workshop first.
    await tap('build-carpenter');
    await tap('tile-0-0');
    await screen.findByTestId('tile-carpenter');
    let s = await stock();
    expect(s.go).toBe(s0.go! - 4);
    // Craft a plank: 2 wood → 1 ván.
    await tap('craft-van');
    s = await stock();
    expect(s.van).toBe(1);
    // Trade bamboo for thatch at the market.
    await tap('give-tre');
    await tap('get-co');
    const coBefore = s.co ?? 0;
    await tap('trade');
    s = await stock();
    expect(s.co).toBe(coBefore + 1);
    // A hut (3 wood, 4 thatch, 2 bamboo); trade more thatch if needed.
    while (((await stock()).co ?? 0) < 4) await tap('trade');
    await tap('build-thatched-hut');
    await tap('tile-1-1');
    await screen.findByTestId('tile-thatched-hut');
    await tap('tile-thatched-hut');
    await tap('invite-meo-may');
    expect(within('village-msg')).toMatch(/Mèo Mây đã chuyển đến/);
    await tap('collect-gift');
    expect(screen.queryByTestId('collect-gift')).toBeNull();
    expect((await store.village(PACK, '2026-11-03')).gift).toBeNull();
    // Reopen: everything persisted.
    screen.unmount();
    render(<App />);
    await screen.findByTestId('today');
    await tap('tab-village');
    await screen.findByTestId('tile-thatched-hut');
    await screen.findByTestId('tile-carpenter');
  });

  test('a building you cannot afford says what is missing and where to get it', async () => {
    render(<App />);
    await onboard();
    await tap('tab-village');
    await tap('build-thatched-hut');
    expect(within('village-msg')).toMatch(/Chưa đủ vật liệu/);
    expect(within('village-msg')).toMatch(/Gỗ ×3: đi tới/);
    expect(screen.queryByTestId('tile-thatched-hut')).toBeNull();
    // Locked by level.
    await tap('build-kiln');
    expect(within('village-msg')).toMatch(/cấp/);
    // Workshop recipes are disabled without the workshop.
    expect(within('recipe-gach')).toMatch(/Cần xây\s+Lò gạch/);
  });

  test('cannot overspend and only one workshop of a kind', async () => {
    await seed();
    render(<App />);
    await onboard();
    await tap('tab-village');
    await tap('build-carpenter');
    await tap('tile-0-0');
    await tap('build-carpenter');
    expect(within('village-msg')).toMatch(/đủ số công trình/);
    // Direct double write through the store is refused too.
    expect(await store.placeBuilding(PACK, 'carpenter', 2, 2, T0)).toBe('LIMIT');
  });

  test('move a building to another tile', async () => {
    await seed();
    render(<App />);
    await onboard();
    await tap('tab-village');
    await tap('build-pebble-path');
    await tap('tile-0-0');
    await tap('tile-pebble-path');
    await tap('move-building');
    await tap('tile-3-3');
    expect(screen.getByTestId('tile-0-0')).toBeTruthy();
    expect(screen.queryByTestId('tile-3-3')).toBeNull();
  });
});

describe('startup maintenance', () => {
  test('raw logs older than the retention window are deleted at launch; summaries stay', async () => {
    const old = T0 - 40 * 86_400_000; // retention is RULES.rawRetentionDays (30)
    const base = { missionId: 'm', poiId: 'p', date: '2026-10-14', motionAvailable: true, rulesVersion: '1', lastT: old, lastWall: old };
    await store.putSession({ ...base, id: 'old', startT: old, status: 'completed', recorder: 'native' });
    await store.putSession({ ...base, id: 'recent', startT: T0 - 86_400_000, status: 'failed', recorder: 'native' });
    native.append('old', '{"kind":"step","t":1}\n');
    native.append('recent', '{"kind":"step","t":1}\n');
    render(<App />);
    await screen.findByTestId('next');
    expect(native.logs.has('old')).toBe(false);
    expect(native.logs.has('recent')).toBe(true);
    expect((await store.allSessions()).map((s) => s.id).sort()).toEqual(['old', 'recent']);
  });

  test('a recorder left running without its session is stopped', async () => {
    render(<App />);
    await onboard();
    screen.unmount();
    native.active = 'orphan';
    render(<App />);
    await screen.findByTestId('today');
    expect(native.active).toBeNull();
  });
});

describe('settings', () => {
  test('export log shares a JSON file; wipe erases everything and restarts onboarding', async () => {
    render(<App />);
    await onboard();
    fireEvent.press(screen.getByTestId('tab-settings')); await flush();
    await tap('check-pack');
    expect(screen.getByTestId('pack-msg')).toHaveTextContent(/Gói hợp lệ/);
    await tap('export');
    expect(device.shared.some((s) => s.startsWith('write:file:///cache/nhat-ky-di-bo-'))).toBe(true);
    native.append('old', '{"kind":"step","t":1}\n');
    await tap('wipe');
    await flush(10);
    await screen.findByTestId('next');
    expect(native.logs.size).toBe(0);
  });
});

function within(id: string) {
  const node = screen.getByTestId(id);
  const texts: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') texts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object' && 'children' in n) walk((n as { children: unknown }).children);
  };
  walk(node.children);
  return texts.join(' ');
}

void waitFor;
