import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Mission } from '../core/missions';
import type { AreaPack } from '../core/pack';
import { collection } from '../platform/store';
import type { FinishResult } from '../platform/session';
import { CreatureArt } from './CreatureArt';
import { Button, Card, H1, P, Row, Screen } from './kit';
import { fmtM } from './labels';
import { ShareCard } from './ShareCard';
import { shareCard } from './share';

const TAPS = 3;

export function Encounter({ pack, mission, result, onDone }: {
  pack: AreaPack; mission: Mission; result: FinishResult; onDone: (to: 'today' | 'collection') => void;
}) {
  const c = pack.creatures.find((x) => x.id === mission.creatureId)!;
  const [taps, setTaps] = useState(0);
  const [owned, setOwned] = useState(0);
  const [msg, setMsg] = useState('');
  const card = useRef<View>(null);
  useEffect(() => { void collection().then((cs) => setOwned(cs.length)); }, []);
  const items = (result.claim?.items ?? []).map((id) => pack.items.find((i) => i.id === id)).filter((x) => !!x);
  const met = taps >= TAPS;

  const share = async () => {
    try { setMsg((await shareCard(card)) === 'unavailable' ? 'Thiết bị không hỗ trợ chia sẻ.' : ''); }
    catch { setMsg('Không tạo được ảnh chia sẻ.'); }
  };

  if (!met) {
    return (
      <Screen testID="encounter">
        <H1>Có gì đó đang động đậy…</H1>
        <P muted>Chạm nhẹ {TAPS - taps} lần để làm quen</P>
        <Pressable testID="creature-tap" accessibilityRole="button" accessibilityLabel="Chạm vào sinh vật" onPress={() => setTaps(taps + 1)}
          style={{ alignItems: 'center', paddingVertical: 24, transform: [{ scale: 0.85 + taps * 0.06 }, { rotate: `${taps % 2 ? -6 : 6}deg` }] }}>
          <CreatureArt creature={c} size={220} hidden={taps === 0} />
        </Pressable>
      </Screen>
    );
  }
  return (
    <Screen testID="result">
      <View style={{ alignItems: 'center' }}>
        <ShareCard ref={card} creature={c} walkM={result.snapshot.walkM} owned={owned} total={pack.creatures.length} date={mission.date} />
      </View>
      <H1>Bạn đã kết bạn với {c.name}!</H1>
      <P style={{ fontStyle: 'italic' }}>“{c.line}”</P>
      <P>{c.description}</P>
      <Card>
        <P>Đi bộ được xác nhận: {fmtM(result.snapshot.walkM)}</P>
        <P>Bộ sưu tập: {owned}/{pack.creatures.length}</P>
        {items.length > 0 && <P>Nhặt trên đường: {items.map((i) => i!.name).join(', ')}</P>}
      </Card>
      <Row>
        <Button title="Chia sẻ ảnh" onPress={share} testID="share" />
        <Button kind="primary" title="Xem bộ sưu tập" onPress={() => onDone('collection')} testID="to-collection" />
      </Row>
      {!!msg && <P muted>{msg}</P>}
      <P muted small>Ảnh chia sẻ không chứa bản đồ, tuyến đường hay điểm xuất phát.</P>
      <Button kind="link" title="Về Hôm nay" onPress={() => onDone('today')} testID="to-today" />
    </Screen>
  );
}
