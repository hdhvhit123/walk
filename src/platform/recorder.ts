import { Platform } from 'react-native';
import type { SensorEvent } from '../core/verify';
import { appendSimEvents, simEvents } from './store';

/**
 * A session's evidence log. Every event the verifier sees — sensor data and
 * JS-side events such as pause or settle — goes through the log first, so the
 * order of the log is the replay order after a crash or restart.
 */
export interface Recorder {
  /** Start recording and deliver events (in log order) to `onEvent`. */
  start(onEvent: (e: SensorEvent) => void): Promise<void>;
  /** Stop recording (ends the foreground service / playback). */
  stop(): Promise<void>;
  /** Stop delivering to JS; native recording continues. */
  detach(): void;
  append(e: SensorEvent): Promise<void>;
  readAll(): Promise<SensorEvent[]>;
  /** Is the native recorder still running for this session (e.g. after the app was killed)? */
  stillRecording(): boolean;
  now(): number;
}

export const eventTime = (e: SensorEvent) => (e.kind === 'gap' ? e.to : e.t);

type NativeModuleShape = typeof import('../../modules/walk-sensors').default;
let native: NativeModuleShape | null = null;
export function walkSensors(): NativeModuleShape | null {
  if (Platform.OS !== 'android') return null;
  // Loaded lazily so tests and iOS (limited mode for now) never touch it.
  native ??= (require('../../modules/walk-sensors') as { default: NativeModuleShape }).default;
  return native;
}

export function parseLines(lines: string[]): SensorEvent[] {
  const out: SensorEvent[] = [];
  for (const l of lines) {
    try { out.push(JSON.parse(l) as SensorEvent); } catch { /* a torn line is skipped, never guessed */ }
  }
  return out;
}

/** Android foreground-service recorder; polls the shared JSON-lines log. */
export class NativeRecorder implements Recorder {
  private offset = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onEvent: (e: SensorEvent) => void = () => {};
  private chain: Promise<void> = Promise.resolve();

  constructor(private sessionId: string, startOffset = 0) { this.offset = startOffset; }

  private get mod() {
    const m = walkSensors();
    if (!m) throw new Error('Native recorder is only available on Android');
    return m;
  }

  now() { return Date.now(); }

  stillRecording() { return this.mod.activeSession() === this.sessionId; }

  async start(onEvent: (e: SensorEvent) => void) {
    this.onEvent = onEvent;
    if (!this.stillRecording()) await this.mod.startSession(this.sessionId);
    this.attach();
  }

  attach() {
    this.timer ??= setInterval(() => void this.poll(), 1000);
  }

  /** Polls are serialised, so awaiting one guarantees everything written before it was delivered. */
  private poll(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const { lines, offset } = await this.mod.readEvents(this.sessionId, this.offset);
      this.offset = offset;
      for (const e of parseLines(lines)) this.onEvent(e);
    }).catch(() => {});
    return this.chain;
  }

  /** Drain whatever is already in the log (used before a decision). */
  async flush() { await this.poll(); }

  async append(e: SensorEvent) {
    await this.mod.appendEvent(this.sessionId, JSON.stringify(e));
    await this.poll();
  }

  async readAll() {
    const { lines, offset } = await this.mod.readEvents(this.sessionId, 0);
    this.offset = offset;
    return parseLines(lines);
  }

  async stop() {
    this.detach();
    await this.poll();
    await this.mod.stopSession();
  }

  detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * Plays a precomputed trace on an accelerated virtual clock and keeps the
 * log in SQLite. Used for the in-app simulator and for iOS until its native
 * recorder exists.
 */
export class SimRecorder implements Recorder {
  private timer: ReturnType<typeof setInterval> | null = null;
  private i = 0;
  private wallStart = 0;
  private pending: SensorEvent[] = [];
  private onEvent: (e: SensorEvent) => void = () => {};

  constructor(private sessionId: string, private trace: SensorEvent[], private startT: number, private speed: number) {}

  now() { return this.wallStart ? this.startT + (Date.now() - this.wallStart) * this.speed : this.startT; }

  stillRecording() { return false; }

  async start(onEvent: (e: SensorEvent) => void) {
    this.onEvent = onEvent;
    this.wallStart = Date.now();
    this.timer = setInterval(() => this.tick(), 100);
    this.tick();
  }

  private tick() {
    const now = this.now();
    while (this.i < this.trace.length && eventTime(this.trace[this.i]) <= now) {
      this.deliver(this.trace[this.i]);
      this.i++;
    }
    if (this.pending.length > 50) void this.persist();
  }

  private deliver(e: SensorEvent) {
    this.pending.push(e);
    this.onEvent(e);
  }

  private async persist() {
    const evs = this.pending;
    this.pending = [];
    await appendSimEvents(this.sessionId, evs);
  }

  async append(e: SensorEvent) {
    this.deliver(e);
    await this.persist();
  }

  async readAll() { await this.persist(); return simEvents(this.sessionId); }

  async stop() { this.detach(); await this.persist(); }

  detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.persist();
  }

  get done() { return this.i >= this.trace.length; }
}
