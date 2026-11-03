import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Mission } from '../core/missions';
import type { AreaPack } from '../core/pack';
import { REASONS, type ReasonCode } from '../core/reasons';
import { SCENARIOS, type ScenarioId } from '../core/sim';
import { checkStart } from '../core/verify';
import type { Meta } from '../platform/store';
import { currentFix } from '../platform/device';
import { SessionController } from '../platform/session';
import { MapView } from './MapView';
import { Button, Card, H1, Note, P, Screen } from './kit';
import { fmtM } from './labels';
import { useTheme } from './theme';
import { simPosition } from './Today';

function Chips<T extends string | number>({ items, value, onChange, testID }: { items: { v: T; label: string }[]; value: T; onChange: (v: T) => void; testID: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((it) => (
        <Pressable key={String(it.v)} testID={`${testID}-${it.v}`} accessibilityRole="radio" accessibilityState={{ checked: it.v === value }} onPress={() => onChange(it.v)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: it.v === value ? t.accent : t.line, backgroundColor: it.v === value ? t.accent : t.card }}>
          <Text style={{ color: it.v === value ? '#fff' : t.ink, fontSize: 13 }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MissionMap({ pack, mission, meta, sim, onBack, onStarted }: {
  pack: AreaPack; mission: Mission; meta: Meta; sim: boolean; onBack: () => void; onStarted: (c: SessionController) => void;
}) {
  const route = pack.routes.find((r) => r.id === mission.routeId)!;
  const poi = pack.pois.find((p) => p.id === mission.poiId)!;
  const hub = pack.hubs.find((h) => h.id === mission.hubId)!;
  const [fix, setFix] = useState<{ lat: number; lng: number; acc: number } | null>(sim ? simPosition(pack, meta) : null);
  const [problem, setProblem] = useState<ReasonCode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>('walk');
  const [speed, setSpeed] = useState(30);
  const motion = sim || !!meta.motionAvailable;

  useEffect(() => { if (!sim) currentFix().then(setFix).catch(() => setFix(null)); }, [sim]);

  const start = async () => {
    setBusy(true);
    setError('');
    let f = fix;
    if (!sim) { try { f = await currentFix(); setFix(f); } catch { f = null; } }
    const issue = checkStart(hub, f);
    setProblem(issue);
    if (issue) { setBusy(false); return; }
    try {
      const ctrl = await SessionController.start(pack, mission, motion, sim ? { scenario, speed, seed: `${mission.id}|${scenario}` } : undefined);
      onStarted(ctrl);
    } catch (e) {
      setError(`Không khởi động được phiên theo dõi: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <Screen testID="mission-map">
      <Button kind="link" title="← Hôm nay" onPress={onBack} style={{ alignSelf: 'flex-start', flexGrow: 0 }} />
      <H1>{poi.name}</H1>
      <P muted>Xuất phát: {hub.name} · {fmtM(mission.distanceM)} mỗi chiều · khoảng {mission.estMinutes} phút khứ hồi · {mission.waypoints.length} dấu vết trên đường</P>
      <MapView pack={pack} route={route} highlightPoi={poi.id} player={fix} />
      <Card>
        <P>• Bản đồ và tuyến đã lưu trên máy: chơi được khi không có mạng.</P>
        <P>• Phải đi bộ ít nhất 70% tuyến; nghỉ thoải mái, chạy bộ không được tính, đi xe thì nhiệm vụ không nhận thưởng.</P>
        <P>• Có thể tắt màn hình và cất máy vào túi; thông báo trên thanh trạng thái cho biết app đang theo dõi.</P>
      </Card>
      {!motion && <Note>Thiết bị ở chế độ theo dõi hạn chế: chuyến đi này sẽ không nhận thưởng.</Note>}
      {sim && (
        <Card>
          <P>Mô phỏng · kịch bản</P>
          <Chips testID="scenario" value={scenario} onChange={setScenario}
            items={SCENARIOS.map((s) => ({ v: s.id, label: `${s.name}${s.expect === 'pass' ? '' : ' ✗'}` }))} />
          <P>Tốc độ tua</P>
          <Chips testID="speed" value={speed} onChange={setSpeed} items={[10, 30, 60, 120].map((x) => ({ v: x, label: `×${x}` }))} />
        </Card>
      )}
      {problem && <Note testID="start-problem"><P><Text style={{ fontWeight: '700' }}>{REASONS[problem].title}.</Text> {REASONS[problem].hint}</P></Note>}
      {!!error && <Note>{error}</Note>}
      <Button kind="primary" disabled={busy} title={busy ? 'Đang chuẩn bị…' : 'Bắt đầu đi bộ'} onPress={start} testID="start" />
    </Screen>
  );
}
