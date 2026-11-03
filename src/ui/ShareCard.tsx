import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import type { Creature } from '../core/pack';
import { CreatureArt } from './CreatureArt';
import { fmtM } from './labels';

/** The share image. Deliberately has no map, route or start point. */
export const ShareCard = forwardRef<View, { creature: Creature; walkM: number; owned: number; total: number; date: string }>(
  function ShareCard({ creature, walkM, owned, total, date }, ref) {
    return (
      <View ref={ref} collapsable={false} style={{ width: 320, padding: 20, borderRadius: 20, backgroundColor: '#fbf7f0', alignItems: 'center', gap: 6 }}>
        <CreatureArt creature={creature} size={180} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#2d2a26' }}>{creature.name}</Text>
        <Text style={{ color: '#2f7d5b', fontWeight: '600' }}>Đã đi bộ {fmtM(walkM)} để gặp</Text>
        <Text style={{ color: '#7a7268' }}>Bộ sưu tập {owned}/{total} · {date}</Text>
        <Text style={{ color: '#7a7268', fontSize: 12, marginTop: 6 }}>Đi bộ khám phá</Text>
      </View>
    );
  },
);
