import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { validatePack, type AreaPack } from '../core/pack';
import { RULES } from '../core/rules';
import { REASONS, type ReasonCode } from '../core/reasons';
import { eraseEverything, exportLog } from '../platform/maintenance';
import { setMeta, type Meta } from '../platform/store';
import { Button, Card, H1, H2, P, Screen } from './kit';
import { useTheme } from './theme';

export function Settings({ pack, meta, sim, onChanged, onToggleSim, onRecheck, onWiped }: {
  pack: AreaPack; meta: Meta; sim: boolean; onChanged: () => void; onToggleSim: () => void; onRecheck: () => void; onWiped: () => void;
}) {
  const t = useTheme();
  const [packMsg, setPackMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const st = meta.stats;

  const checkPack = () => {
    const errs = validatePack(pack);
    setPackMsg(errs.length ? `Gói lỗi: ${errs.length} vấn đề` : `Gói hợp lệ: ${pack.pois.length} địa điểm, ${pack.routes.length} tuyến. Gói nằm sẵn trong app, dùng được khi không có mạng.`);
  };
  const doExport = async () => {
    try { const r = await exportLog(); setExportMsg(`Đã xuất ${r.sessions} phiên.`); }
    catch (e) { setExportMsg(`Không xuất được: ${(e as Error).message}`); }
  };
  const wipe = () => Alert.alert('Xóa toàn bộ dữ liệu?', 'Bộ sưu tập, lịch sử và nhật ký trên máy sẽ mất vĩnh viễn.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa vĩnh viễn', style: 'destructive', onPress: async () => { await eraseEverything(); onWiped(); } },
  ]);

  return (
    <Screen testID="settings">
      <H1>Cài đặt</H1>

      <Card>
        <H2>Gói khu vực</H2>
        <P><Text style={{ fontWeight: '700' }}>{pack.name}</Text> · phiên bản {pack.version} · cập nhật {pack.updated}</P>
        <P muted>{pack.pois.filter((p) => p.status === 'active').length} địa điểm đang hoạt động · {pack.hubs.length} cổng xuất phát{pack.sample ? ' · tọa độ mẫu, cần khảo sát thực địa' : ''}</P>
        <Button title="Kiểm tra gói" onPress={checkPack} testID="check-pack" />
        {!!packMsg && <P muted testID="pack-msg">{packMsg}</P>}
      </Card>

      <Card>
        <H2>Chế độ mô phỏng</H2>
        <P muted>Thử vòng chơi và các tình huống (đi xe, GPS nhảy, mất tín hiệu…) mà không cần ra đường. Dùng kho dữ liệu riêng, không lẫn vào bộ sưu tập thật.</P>
        <Button title={sim ? 'Tắt mô phỏng' : 'Bật mô phỏng'} onPress={onToggleSim} testID="toggle-sim" />
        {sim && (
          <View style={{ gap: 6 }}>
            <P>Cổng xuất phát giả lập</P>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {pack.hubs.map((h) => {
                const on = (meta.simHub ?? pack.hubs[0].id) === h.id;
                return (
                  <Pressable key={h.id} testID={`sim-hub-${h.id}`} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    onPress={async () => { await setMeta('simHub', h.id); onChanged(); }}
                    style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.card }}>
                    <Text style={{ color: on ? '#fff' : t.ink, textAlign: 'center' }}>{h.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </Card>

      <Card>
        <H2>Thiết bị</H2>
        <P>{sim ? 'Mô phỏng: xác minh đầy đủ' : meta.motionAvailable ? 'Xác minh đầy đủ' : 'Theo dõi hạn chế (không nhận thưởng)'}</P>
        {Platform.OS === 'ios' && <P muted small>Bản iOS hiện chỉ chạy chế độ mô phỏng; bộ ghi cảm biến native cho iOS sẽ làm ở giai đoạn sau.</P>}
        <Button title="Kiểm tra lại thiết bị" onPress={onRecheck} testID="recheck" />
      </Card>

      <Card testID="stats">
        <H2>Thống kê trên máy</H2>
        <P>Bắt đầu {st?.started ?? 0} · hoàn thành {st?.completed ?? 0} · tự kết thúc {st?.abandoned ?? 0} · chia sẻ {st?.shares ?? 0}</P>
        {st && Object.entries(st.failed).map(([k, v]) => <P key={k} small>{REASONS[k as ReasonCode]?.title ?? k}: {v}</P>)}
        <Button title="Xuất nhật ký phiên (JSON)" onPress={doExport} testID="export" />
        {!!exportMsg && <P muted>{exportMsg}</P>}
        <P muted small>Dùng cho thử nghiệm thực địa: gồm sự kiện cảm biến, kết quả từng đoạn và phiên bản quy tắc {RULES.version}.</P>
      </Card>

      <Card>
        <H2>Quyền riêng tư</H2>
        <P small>• Chỉ theo dõi khi bạn bấm Bắt đầu; có thông báo trên thanh trạng thái suốt phiên; dừng khi kết thúc.</P>
        <P small>• Dữ liệu chỉ nằm trên máy này, không gửi đi đâu.</P>
        <P small>• Dữ liệu cảm biến thô tự xóa sau {RULES.rawRetentionDays} ngày.</P>
        <P small>• Ảnh chia sẻ không chứa bản đồ hay điểm xuất phát.</P>
        <P small>• Chưa có sao lưu: xóa app hoặc đổi máy sẽ mất tiến độ.</P>
        <Button kind="danger" title="Xóa toàn bộ dữ liệu" onPress={wipe} testID="wipe" />
      </Card>
    </Screen>
  );
}
