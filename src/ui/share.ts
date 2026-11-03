import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { bumpStat } from '../platform/store';

/** Render the on-screen share card to PNG and open the system share sheet. */
export async function shareCard(ref: RefObject<View | null>): Promise<'shared' | 'unavailable'> {
  if (!ref.current || !(await Sharing.isAvailableAsync())) return 'unavailable';
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Chia sẻ thành tích' });
  await bumpStat((s) => { s.shares++; });
  return 'shared';
}
