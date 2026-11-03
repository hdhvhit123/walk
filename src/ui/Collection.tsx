import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { addDays, localDate } from '../core/clock';
import { streak, type Claim } from '../core/ledger';
import type { AreaPack, Creature } from '../core/pack';
import { allClaims, collection, inventory } from '../platform/store';
import { CreatureArt } from './CreatureArt';
import { Button, Card, H1, H2, P, Pill, Row, Screen } from './kit';
import { HABITAT_LABEL, fmtM } from './labels';
import { ShareCard } from './ShareCard';
import { shareCard } from './share';
import { useTheme } from './theme';

export function Collection({ pack }: { pack: AreaPack }) {
  const t = useTheme();
  const [owned, setOwned] = useState<Map<string, number>>(new Map());
  const [items, setItems] = useState<{ itemId: string; count: number }[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [open, setOpen] = useState<Creature | null>(null);
  const card = useRef<View>(null);

  useEffect(() => {
    void (async () => {
      setOwned(new Map((await collection()).map((c) => [c.creatureId, c.count])));
      setItems(await inventory());
      setClaims(await allClaims());
    })();
  }, []);

  const total = claims.reduce((s, c) => s + c.walkM, 0);
  const today = localDate(Date.now());
  const last = open ? claims.filter((x) => x.creatureId === open.id).at(-1) : undefined;

  return (
    <Screen testID="collection">
      <H1>Bộ sưu tập</H1>
      <Row>
        <Pill>{owned.size}/{pack.creatures.length} sinh vật</Pill>
        <Pill>{claims.length} chuyến hoàn thành</Pill>
        <Pill>{fmtM(total)} đi bộ xác nhận</Pill>
        <Pill>🔥 {streak(claims.map((c) => c.date), today, addDays)} ngày</Pill>
      </Row>
      <View testID="collection-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {pack.creatures.map((c) => {
          const n = owned.get(c.id);
          return (
            <Pressable key={c.id} testID={n ? 'owned' : 'missing'} accessibilityRole="button" accessibilityLabel={n ? c.name : 'Sinh vật chưa gặp'} onPress={() => setOpen(c)}
              style={{ width: '31%', alignItems: 'center', padding: 8, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, opacity: n ? 1 : 0.7 }}>
              <CreatureArt creature={c} size={76} hidden={!n} />
              <Text numberOfLines={1} style={{ color: t.ink, fontSize: 13 }}>{n ? c.name : '???'}</Text>
              {!!n && n > 1 && <Text style={{ color: t.muted, fontSize: 12 }}>×{n}</Text>}
            </Pressable>
          );
        })}
      </View>

      <H2>Vật phẩm</H2>
      {items.length === 0 ? <P muted>Đi bộ qua các dấu vết trên tuyến để nhặt vật phẩm.</P> : items.map((i) => {
        const it = pack.items.find((x) => x.id === i.itemId);
        return <Card key={i.itemId}><P><Text style={{ fontWeight: '700' }}>{it?.name}</Text> ×{i.count}</P><P small muted>{it?.description}</P></Card>;
      })}
      <P muted small>Dùng vật phẩm và lá để xây công trình ở tab Làng; sinh vật đã gặp có thể chuyển đến ở.</P>

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 16 }}>
          {open && (
            <Card testID="creature-dialog" style={{ alignItems: 'center', gap: 8 }}>
              {owned.has(open.id) ? (
                <>
                  <ShareCard ref={card} creature={open} walkM={last?.walkM ?? 0} owned={owned.size} total={pack.creatures.length} date={last?.date ?? today} />
                  <P>{open.description}</P>
                  <P muted>Chủ đề {open.theme} · {open.rarity === 'rare' ? 'hiếm' : 'thường gặp'}</P>
                  <Row><Button title="Chia sẻ ảnh" onPress={() => void shareCard(card).catch(() => {})} /><Button title="Đóng" onPress={() => setOpen(null)} testID="close" /></Row>
                </>
              ) : (
                <>
                  <CreatureArt creature={open} size={160} hidden />
                  <H2>Chưa gặp</H2>
                  <P>Hay xuất hiện ở {open.habitats.map((h) => HABITAT_LABEL[h]).join(', ')}.</P>
                  <Button title="Đóng" onPress={() => setOpen(null)} testID="close" />
                </>
              )}
            </Card>
          )}
        </View>
      </Modal>
    </Screen>
  );
}
