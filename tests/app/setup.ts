import { device, native, sqlite } from './fakes';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async (name: string) => require('./fakes').sqlite.open(name) }));
jest.mock('../../modules/walk-sensors', () => ({ __esModule: true, default: require('./fakes').native.module }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: async () => ({ granted: require('./fakes').device.locationGranted, canAskAgain: true }),
  hasServicesEnabledAsync: async () => true,
  getCurrentPositionAsync: async () => {
    const p = require('./fakes').device.position;
    return { coords: { latitude: p.lat, longitude: p.lng, accuracy: p.acc } };
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async (uri: string) => { require('./fakes').device.shared.push(uri); },
}));
jest.mock('react-native-view-shot', () => ({ captureRef: async () => 'file:///cache/share.png' }));
jest.mock('expo-file-system', () => {
  class File {
    uri: string; exists = false; content = '';
    constructor(dir: { uri: string }, name: string) { this.uri = `${dir.uri}/${name}`; }
    create() { this.exists = true; } delete() { this.exists = false; }
    write(s: string) { this.content = s; require('./fakes').device.shared.push(`write:${this.uri}:${s.length}`); }
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});

beforeEach(() => {
  sqlite.reset(); native.reset(); device.reset();
  // Drop the store's cached connection so the fresh database gets its schema.
  const store = require('../../src/platform/store');
  store.useDatabase(true); store.useDatabase(false);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RN = require('react-native');
beforeEach(() => {
  jest.spyOn(RN.PermissionsAndroid, 'request').mockResolvedValue('granted');
  // Confirmation dialogs: press the destructive (confirm) button.
  jest.spyOn(RN.Alert, 'alert').mockImplementation((...a: unknown[]) => {
    const buttons = (a[2] ?? []) as { style?: string; onPress?: () => void }[];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
  });
});
