import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import { walkSensors } from './recorder';

export interface DeviceCheck {
  location: 'granted' | 'denied' | 'unavailable';
  gpsEnabled: boolean;
  activity: boolean;          // ACTIVITY_RECOGNITION permission (Android 10+)
  notifications: boolean;     // needed to show the "tracking" notification (Android 13+)
  stepSensor: boolean;
  activityRecognition: boolean;
  backgroundTracking: boolean;
}

/** Fully verified play needs location, a hardware step sensor and permission to read it. */
export const canVerify = (c: DeviceCheck) => c.location === 'granted' && c.stepSensor && c.activity && c.backgroundTracking;

async function requestAndroid(p: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS], minApi: number) {
  if (Platform.OS !== 'android' || (Platform.Version as number) < minApi) return true;
  const r = await PermissionsAndroid.request(p);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function checkDevice(): Promise<DeviceCheck> {
  const loc = await Location.requestForegroundPermissionsAsync();
  const location = loc.granted ? 'granted' : loc.canAskAgain ? 'denied' : 'denied';
  const gpsEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
  const activity = await requestAndroid(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION, 29);
  const notifications = await requestAndroid(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, 33);
  const caps = walkSensors()?.getCapabilities();
  return {
    location, gpsEnabled, activity, notifications,
    stepSensor: !!caps && (caps.stepDetector || caps.stepCounter),
    activityRecognition: !!caps?.activityRecognition,
    backgroundTracking: !!caps?.backgroundTracking,
  };
}

export async function currentFix(): Promise<{ lat: number; lng: number; acc: number }> {
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
  return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? 99 };
}
