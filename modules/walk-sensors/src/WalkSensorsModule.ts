import { NativeModule, requireNativeModule } from 'expo';
import type { Capabilities } from './WalkSensors.types';

declare class WalkSensorsModule extends NativeModule<Record<string, never>> {
  getCapabilities(): Capabilities;
  startSession(sessionId: string): Promise<void>;
  stopSession(): Promise<void>;
  activeSession(): string | null;
  appendEvent(sessionId: string, json: string): Promise<void>;
  readEvents(sessionId: string, fromOffset: number): Promise<{ lines: string[]; offset: number }>;
  deleteSession(sessionId: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export default requireNativeModule<WalkSensorsModule>('WalkSensors');
