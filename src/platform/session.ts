import { Vibration } from 'react-native';
import { checkClock, localDate } from '../core/clock';
import { canClaim, type Claim } from '../core/ledger';
import type { Mission } from '../core/missions';
import { routeLengthM, routePath, type AreaPack } from '../core/pack';
import type { ReasonCode } from '../core/reasons';
import { RULES } from '../core/rules';
import { buildTrace, scenarioSegments, type ScenarioId } from '../core/sim';
import { SessionVerifier, evaluateEligibility, type Notice, type SensorEvent, type Snapshot } from '../core/verify';
import { NativeRecorder, SimRecorder, eventTime, type Recorder } from './recorder';
import { allClaims, bumpStat, getMeta, putSession, setMeta, writeClaim, type SessionRecord } from './store';

export interface SimConfig { scenario: ScenarioId; speed: number; seed: string }
export interface FinishResult { eligible: boolean; reasons: ReasonCode[]; claim?: Claim; snapshot: Snapshot }
export interface ControllerState {
  session: SessionRecord; mission: Mission; snapshot: Snapshot;
  tracking: boolean; interrupted: boolean; messages: { at: number; text: string; tone: 'info' | 'warn' | 'good' }[];
}

function makeVerifier(pack: AreaPack, mission: Mission, startT: number, motionAvailable: boolean) {
  const route = pack.routes.find((r) => r.id === mission.routeId)!;
  const poi = pack.pois.find((p) => p.id === mission.poiId)!;
  return new SessionVerifier({
    route: routePath(pack, route), routeLenM: routeLengthM(pack, route),
    target: { lat: poi.lat, lng: poi.lng, radiusM: poi.radiusM },
    waypoints: mission.waypoints, startT, motionAvailable,
  });
}

export function simTrace(pack: AreaPack, mission: Mission, startT: number, sim: SimConfig) {
  const route = pack.routes.find((r) => r.id === mission.routeId)!;
  const { segments, opts } = scenarioSegments(sim.scenario, routeLengthM(pack, route));
  return {
    events: buildTrace(routePath(pack, route), [{ kind: 'still', s: 3 }, ...segments], { startT, seed: sim.seed, ...opts }),
    motion: opts?.motion ?? true,
  };
}

export class SessionController {
  private listeners = new Set<(s: ControllerState) => void>();
  private lastT: number;
  private recoverGapEnd: number | null = null;
  private lastSave = 0;
  state: ControllerState;

  private constructor(
    private pack: AreaPack,
    mission: Mission,
    session: SessionRecord,
    private verifier: SessionVerifier,
    private recorder: Recorder,
  ) {
    this.lastT = session.lastT;
    this.state = { session, mission, snapshot: verifier.snapshot(), tracking: false, interrupted: false, messages: [] };
  }

  static async start(pack: AreaPack, mission: Mission, motionAvailable: boolean, sim?: SimConfig) {
    const startT = Date.now();
    const id = `s_${startT.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    let motion = motionAvailable;
    let recorder: Recorder;
    if (sim) {
      const t = simTrace(pack, mission, startT, sim);
      motion = t.motion;
      recorder = new SimRecorder(id, t.events, startT, sim.speed);
    } else {
      recorder = new NativeRecorder(id);
    }
    const session: SessionRecord = {
      id, missionId: mission.id, poiId: mission.poiId, date: localDate(startT), startT, status: 'active',
      motionAvailable: motion, rulesVersion: RULES.version, recorder: sim ? 'sim' : 'native',
      lastT: startT, lastWall: startT, sim,
    };
    await putSession(session);
    await bumpStat((s) => { s.started++; });
    const c = new SessionController(pack, mission, session, makeVerifier(pack, mission, startT, motion), recorder);
    await c.beginTracking();
    return c;
  }

  /**
   * Rebuild a session after the app was closed by replaying its log. On
   * Android the foreground service may have kept recording meanwhile; then
   * nothing was lost and tracking simply continues.
   */
  static async recover(pack: AreaPack, session: SessionRecord, mission: Mission) {
    const verifier = makeVerifier(pack, mission, session.startT, session.motionAvailable);
    let recorder: Recorder;
    let resumeT = Date.now();
    if (session.recorder === 'sim' && session.sim) {
      resumeT = session.lastT + (Date.now() - session.lastWall) * session.sim.speed;
      const shift = resumeT - session.lastT;
      const rest = simTrace(pack, mission, session.startT, session.sim).events
        .filter((e) => eventTime(e) > session.lastT)
        .map((e) => (e.kind === 'gap' ? { ...e, from: e.from + shift, to: e.to + shift } : { ...e, t: e.t + shift }));
      recorder = new SimRecorder(session.id, rest, resumeT, session.sim.speed);
    } else {
      recorder = new NativeRecorder(session.id);
    }
    const events = await recorder.readAll();
    for (const e of events) verifier.ingest(e);
    const c = new SessionController(pack, mission, session, verifier, recorder);
    c.lastT = Math.max(session.lastT, ...events.map(eventTime));
    if (recorder.stillRecording()) {
      await c.beginTracking();
      c.say('Phiên vẫn được ghi trong lúc app đóng. Không mất dữ liệu.', 'good');
    } else if (session.status === 'paused') {
      c.publish();
    } else {
      c.recoverGapEnd = resumeT;
      c.publish({ interrupted: true });
      c.say(`Phiên bị gián đoạn lúc ${new Date(c.lastT).toLocaleTimeString('vi-VN')}. Khoảng mất dữ liệu không được tính là đi bộ.`, 'warn');
    }
    return c;
  }

  subscribe(fn: (s: ControllerState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private publish(patch: Partial<ControllerState> = {}) {
    this.state = { ...this.state, ...patch, snapshot: this.verifier.snapshot() };
    for (const l of this.listeners) l(this.state);
  }

  private say(text: string, tone: 'info' | 'warn' | 'good' = 'info') {
    this.publish({ messages: [{ at: Date.now(), text, tone }, ...this.state.messages].slice(0, 6) });
  }

  async beginTracking() {
    if (this.recoverGapEnd !== null) {
      await this.recorder.append({ kind: 'gap', from: this.lastT, to: this.recoverGapEnd, reason: 'reload' });
      this.recoverGapEnd = null;
    }
    await this.recorder.start((e) => this.ingest(e));
    this.publish({ tracking: true, interrupted: false });
  }

  private ingest(e: SensorEvent) {
    const notices = this.verifier.ingest(e);
    this.lastT = Math.max(this.lastT, eventTime(e));
    for (const n of notices) this.onNotice(n);
    this.publish();
    // Keep lastT/lastWall fresh so a crash can be measured as a gap.
    if (Date.now() - this.lastSave > 5000) { this.lastSave = Date.now(); void this.saveSession({}); }
  }

  private onNotice(n: Notice) {
    switch (n.type) {
      case 'waypoint': {
        const wp = this.state.mission.waypoints.find((w) => w.id === n.data);
        const item = this.pack.items.find((i) => i.id === wp?.itemId);
        Vibration.vibrate(80);
        this.say(`Nhặt được ${item?.name ?? 'vật phẩm'} trên đường!`, 'good');
        break;
      }
      case 'arrived': Vibration.vibrate([0, 100, 60, 100]); this.say('Bạn đã tới điểm đến. Có thứ gì đó đang chờ…', 'good'); break;
      case 'vehicleSuspect': this.say('Có vẻ bạn đang di chuyển nhanh mà ít bước chân. App sẽ xác nhận thêm.', 'warn'); break;
      case 'vehicleConfirmed': Vibration.vibrate(300); this.say('Phát hiện đoạn đi bằng phương tiện. Nhiệm vụ này sẽ không nhận thưởng.', 'warn'); break;
      case 'relocated': this.say('Vị trí thay đổi đột ngột. Quãng này không được tính.', 'warn'); break;
    }
  }

  get now() { return this.recorder.now(); }

  private async saveSession(patch: Partial<SessionRecord>) {
    const session = { ...this.state.session, ...patch, lastT: this.lastT, lastWall: Date.now() };
    await putSession(session);
    this.publish({ session });
  }

  async pause() {
    await this.recorder.append({ kind: 'pause', t: this.now });
    if (this.state.session.recorder === 'native') { await this.recorder.stop(); }
    await this.saveSession({ status: 'paused' });
    this.publish({ tracking: false });
    this.say('Đã tạm dừng và ngừng ghi. Tối đa 10 phút; nếu bạn đổi chỗ, quãng đó không được tính.');
  }

  async resume() {
    await this.recorder.append({ kind: 'resume', t: this.now });
    if (this.state.session.recorder === 'native') await this.recorder.start((e) => this.ingest(e));
    await this.saveSession({ status: 'active' });
    this.publish({ tracking: true });
  }

  /** Decide the reward. The verifier decides; this only records. */
  async finish(): Promise<FinishResult> {
    if (this.state.session.status === 'active') await this.recorder.append({ kind: 'settle', t: this.now - 1000 });
    const meta = await getMeta();
    const now = Date.now();
    const clock = checkClock(meta.clockMax, now);
    await setMeta('clockMax', clock.newMax);
    const date = localDate(now);
    const decision = canClaim(await allClaims(), this.state.mission.id, date);
    const snapshot = this.verifier.snapshot();
    const { eligible, reasons } = evaluateEligibility(snapshot, this.state.session.motionAvailable, {
      clockOk: clock.ok,
      alreadyClaimed: !decision.ok && decision.reason === 'ALREADY_CLAIMED',
      dailyLimitReached: !decision.ok && decision.reason === 'DAILY_LIMIT',
    });
    if (!eligible) { await this.saveSession({}); return { eligible, reasons, snapshot }; }

    await this.recorder.stop();
    const items = snapshot.collected
      .map((id) => this.state.mission.waypoints.find((w) => w.id === id)?.itemId)
      .filter((x): x is string => !!x);
    const { claim } = await writeClaim({
      claimId: this.state.mission.id, missionId: this.state.mission.id, sessionId: this.state.session.id,
      date, at: now, creatureId: this.state.mission.creatureId, items, walkM: Math.round(snapshot.walkM), syncState: 'local',
    });
    await this.saveSession({ status: 'completed', endedAt: now, reasons: [], summary: summarize(snapshot) });
    await bumpStat((s) => { s.completed++; });
    this.publish({ tracking: false });
    return { eligible: true, reasons: [], claim, snapshot };
  }

  async abandon(reasons: ReasonCode[] = []) {
    await this.recorder.stop();
    const status = reasons.length ? 'failed' : 'abandoned';
    await this.saveSession({ status, endedAt: Date.now(), reasons, summary: summarize(this.verifier.snapshot()) });
    await bumpStat((s) => {
      if (status === 'abandoned') s.abandoned++;
      for (const r of reasons) s.failed[r] = (s.failed[r] ?? 0) + 1;
    });
    this.publish({ tracking: false });
  }

  /** Leave the screen: JS stops listening, the Android service keeps recording. */
  dispose() {
    this.recorder.detach();
    this.listeners.clear();
  }

  windows() { return this.verifier.windows; }
}

function summarize(s: Snapshot): SessionRecord['summary'] {
  return { walkM: s.walkM, progressM: s.progressM, routeLenM: s.routeLenM, unknownShare: s.unknownShare, vehicleConfirmed: s.vehicleConfirmed, collected: s.collected };
}
