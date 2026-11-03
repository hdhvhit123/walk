import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { AreaPack } from '../core/pack';
import { REASONS, type ReasonCode } from '../core/reasons';
import { RULES } from '../core/rules';
import type { ControllerState, FinishResult, SessionController } from '../platform/session';
import { MapView } from './MapView';
import { Bar, Button, Card, H1, H2, Note, P, Row, Screen } from './kit';
import { CLASS_LABEL, fmtM } from './labels';
import { tint, useTheme } from './theme';

export const FATAL: ReasonCode[] = ['VEHICLE_CONFIRMED', 'LONG_GAP', 'DEVICE_LIMITED', 'ALREADY_CLAIMED', 'DAILY_LIMIT', 'CLOCK_TAMPER', 'MOCK_LOCATION'];

export function Walking({ pack, ctrl, onClaimed, onEnded }: {
  pack: AreaPack; ctrl: SessionController; onClaimed: (r: FinishResult) => void; onEnded: () => void;
}) {
  const t = useTheme();
  const [st, setSt] = useState<ControllerState>(ctrl.state);
  const [refusal, setRefusal] = useState<ReasonCode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => ctrl.subscribe(setSt), [ctrl]);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  const { snapshot: s, mission, session } = st;
  const route = pack.routes.find((r) => r.id === mission.routeId)!;
  const poi = pack.pois.find((p) => p.id === mission.poiId)!;
  const needWalk = RULES.minWalkShare * s.routeLenM;
  const paused = session.status === 'paused';
  const elapsed = Math.max(0, Math.round((ctrl.now - session.startT) / 1000));
  const cls = s.currentClass ? CLASS_LABEL[s.currentClass] : { text: 'Đang khởi động…', tone: 'info' as const };
  const fatalNow = s.vehicleConfirmed || s.longGap || !session.motionAvailable || s.mockFixes > 0;
  const live = st.tracking && !paused;
  const toneColor = cls.tone === 'good' ? t.good : cls.tone === 'warn' ? t.warn : t.info;

  const conds: [boolean, string][] = [
    [s.walkM >= needWalk, `Đi bộ được xác nhận ${fmtM(s.walkM)} / ${fmtM(needWalk)}`],
    [s.progressM >= s.progressNeedM, `Dọc tuyến ${Math.round((100 * s.progressM) / s.routeLenM)}% (cần ${Math.round((100 * s.progressNeedM) / s.routeLenM)}%)`],
    [s.unknownShare <= RULES.maxUnknownShare, `Thời gian thiếu tín hiệu ${Math.round(s.unknownShare * 100)}% (tối đa 30%)`],
    [!s.vehicleConfirmed, s.vehicleConfirmed ? 'Có đoạn đi phương tiện' : 'Không có đoạn đi phương tiện'],
    [!s.longGap, s.longGap ? 'Gián đoạn quá 5 phút' : 'Hành trình liên tục'],
    [s.mockFixes === 0, s.mockFixes ? 'Phát hiện vị trí giả lập' : 'Vị trí thật'],
    [s.arrived, s.arrived ? 'Đang ở vùng điểm đến' : 'Chưa tới vùng điểm đến'],
  ];

  const claim = async () => {
    setBusy(true);
    try {
      const r = await ctrl.finish();
      if (r.eligible) onClaimed(r);
      else setRefusal(r.reasons);
    } finally { setBusy(false); }
  };
  const end = async (reasons: ReasonCode[] = []) => { setBusy(true); await ctrl.abandon(reasons); onEnded(); };
  const confirmEnd = () => Alert.alert('Kết thúc phiên đi bộ?', 'Nhiệm vụ sẽ không nhận thưởng và app ngừng theo dõi.', [
    { text: 'Quay lại', style: 'cancel' },
    { text: 'Kết thúc', style: 'destructive', onPress: () => void end() },
  ]);

  return (
    <Screen testID="walking">
      <View testID="tracking-status" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: live ? t.good : t.muted }} />
        <Text style={{ color: t.ink, flex: 1 }}>{st.interrupted ? 'Đã dừng theo dõi (gián đoạn)' : paused ? 'Tạm dừng' : 'Đang theo dõi hành trình'}</Text>
        <Text style={{ color: t.muted, fontVariant: ['tabular-nums'] }}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</Text>
      </View>
      <H1>Tới {poi.name}</H1>
      <View testID="segment-class" style={{ alignSelf: 'flex-start', backgroundColor: tint(toneColor, 0.15), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: toneColor, fontWeight: '600' }}>{paused ? 'Tạm dừng' : cls.text}</Text>
      </View>

      <P>Đi bộ được xác nhận <Text testID="walk-m" style={{ fontWeight: '700' }}>{fmtM(s.walkM)}</Text> / {fmtM(needWalk)}</P>
      <Bar value={s.walkM} max={needWalk} />
      <P>Tiến độ dọc tuyến <Text style={{ fontWeight: '700' }}>{Math.round((100 * s.progressM) / s.routeLenM)}%</Text></P>
      <Bar value={s.progressM} max={s.routeLenM} />

      <MapView pack={pack} route={route} highlightPoi={poi.id} player={s.lastFix} collected={s.collected} />

      {st.messages.slice(0, 3).map((m) => <Note key={m.at + m.text} tone={m.tone}>{m.text}</Note>)}

      <Card testID="conditions">
        <P style={{ fontWeight: '700' }}>Điều kiện nhận thưởng</P>
        {conds.map(([ok, text]) => <P key={text} small style={{ color: ok ? t.good : t.muted }}>{ok ? '✓' : '○'} {text}</P>)}
      </Card>

      {refusal ? (
        <Card testID="refusal" style={{ borderColor: t.warn }}>
          <H2>Chưa thể nhận thưởng</H2>
          {refusal.map((r) => <P key={r}><Text style={{ fontWeight: '700' }}>{REASONS[r].title}.</Text> {REASONS[r].hint}</P>)}
          {refusal.some((r) => FATAL.includes(r))
            ? <Button kind="primary" title="Kết thúc nhiệm vụ" onPress={() => void end(refusal)} testID="end-failed" disabled={busy} />
            : <Row><Button title="Tiếp tục đi" onPress={() => setRefusal(null)} testID="keep-going" /><Button title="Kết thúc" onPress={() => void end(refusal)} /></Row>}
        </Card>
      ) : st.interrupted ? (
        <Button kind="primary" title="Tiếp tục theo dõi" onPress={() => void ctrl.beginTracking()} testID="continue" />
      ) : (
        <>
          <Button kind={s.arrived && !fatalNow ? 'primary' : 'plain'} disabled={busy || paused} onPress={claim} testID="claim"
            title={fatalNow ? 'Xem kết quả' : s.arrived ? 'Gặp sinh vật' : 'Kiểm tra điều kiện'} />
          <Row>
            {paused
              ? <Button title="Tiếp tục" onPress={() => void ctrl.resume()} testID="resume" />
              : <Button title="Tạm dừng" onPress={() => void ctrl.pause()} testID="pause" />}
            <Button title="Kết thúc" onPress={confirmEnd} testID="end" />
          </Row>
        </>
      )}
    </Screen>
  );
}
