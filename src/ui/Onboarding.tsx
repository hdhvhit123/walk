import { useState } from 'react';
import { Text, View } from 'react-native';
import { setMeta } from '../platform/store';
import { canVerify, checkDevice, type DeviceCheck } from '../platform/device';
import { Button, Card, H1, Note, P, Row, Screen } from './kit';
import { useTheme } from './theme';

const CARDS = [
  { title: 'Mỗi ngày một chuyến đi bộ', body: 'Chọn 10, 20 hoặc 30 phút. App gợi ý vài điểm đến gần bạn, có sinh vật đang chờ.' },
  { title: 'Phải đi bộ cả hành trình', body: 'App xét toàn bộ chuyến đi từ lúc bấm Bắt đầu: bước chân, chuyển động và vị trí. Có mặt ở đích thôi chưa đủ; đi xe thì không nhận thưởng.' },
  { title: 'Bạn luôn biết khi nào app theo dõi', body: 'Chỉ theo dõi trong phiên bạn bắt đầu, có thông báo trên thanh trạng thái suốt phiên, dữ liệu nằm trên máy và xóa được bất cứ lúc nào. Có thể tắt màn hình, cất máy vào túi.' },
];

export function Onboarding({ sim, onDone }: { sim: boolean; onDone: () => void }) {
  const t = useTheme();
  const [step, setStep] = useState(0);
  const [check, setCheck] = useState<DeviceCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setCheck(sim
        ? { location: 'granted', gpsEnabled: true, activity: true, notifications: true, stepSensor: true, activityRecognition: true, backgroundTracking: true }
        : await checkDevice());
    } finally { setBusy(false); }
  };
  const finish = async () => {
    await setMeta('motionAvailable', !!check && canVerify(check));
    await setMeta('onboarded', true);
    onDone();
  };

  if (step < CARDS.length) {
    const c = CARDS[step];
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
          <Row>{CARDS.map((_, i) => <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === step ? t.accent : t.line }} />)}</Row>
          <H1>{c.title}</H1>
          <P style={{ fontSize: 17, lineHeight: 26 }}>{c.body}</P>
          <Button kind="primary" title="Tiếp" onPress={() => setStep(step + 1)} testID="next" />
        </View>
      </Screen>
    );
  }

  const row = (ok: boolean, label: string, detail: string) => (
    <Card key={label} testID={`check-${ok ? 'ok' : 'bad'}`}>
      <Text style={{ color: t.ink, fontSize: 15 }}><Text style={{ color: ok ? t.good : t.warn, fontWeight: '700' }}>{ok ? '✓ ' : '✗ '}</Text>{label}</Text>
      {!!detail && <P small muted>{detail}</P>}
    </Card>
  );

  return (
    <Screen>
      <H1>Kiểm tra thiết bị</H1>
      <P>App cần vị trí, cảm biến bước chân và quyền nhận diện hoạt động để xác minh bạn đi bộ. Bấm nút để cấp quyền.</P>
      {!check && <Button kind="primary" disabled={busy} title={busy ? 'Đang kiểm tra…' : 'Kiểm tra thiết bị'} onPress={run} testID="run-check" />}
      {check && (
        <View style={{ gap: 8 }}>
          {row(check.location === 'granted', 'Quyền vị trí', check.location === 'granted' ? '' : 'Đã bị từ chối. Mở Cài đặt của máy để cho phép.')}
          {row(check.gpsEnabled, 'GPS đang bật', check.gpsEnabled ? '' : 'Hãy bật Vị trí trong cài đặt nhanh.')}
          {row(check.stepSensor, 'Cảm biến bước chân', check.stepSensor ? '' : 'Máy không có cảm biến bước chân phần cứng.')}
          {row(check.activity, 'Quyền nhận diện hoạt động', check.activity ? '' : 'Cần để đọc bước chân và phân biệt đi bộ với đi xe.')}
          {row(check.notifications, 'Thông báo', check.notifications ? '' : 'Không bắt buộc, nhưng bạn sẽ không thấy thông báo "đang theo dõi".')}
          {row(check.backgroundTracking, 'Theo dõi khi tắt màn hình', check.backgroundTracking ? '' : 'Chưa hỗ trợ trên thiết bị này (iOS đang được làm).')}
          {canVerify(check)
            ? <Note tone="good" testID="verify-ok">Thiết bị đủ điều kiện xác minh đầy đủ.</Note>
            : <Note testID="verify-limited">Chế độ theo dõi hạn chế: bạn vẫn xem bản đồ và đi thử, nhưng nhiệm vụ không nhận thưởng vì không đủ bằng chứng.</Note>}
          <Row>
            <Button title="Kiểm tra lại" onPress={run} />
            <Button kind="primary" title="Vào app" onPress={finish} testID="enter" />
          </Row>
        </View>
      )}
    </Screen>
  );
}
