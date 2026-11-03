import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, checkClock, localDate } from '../core/clock';
import { streak } from '../core/ledger';
import { DURATIONS, generateMissions, nearestHub, weeklyTheme, type Duration, type Mission } from '../core/missions';
import type { AreaPack } from '../core/pack';
import { RULES } from '../core/rules';
import type { LatLng } from '../core/geo';
import { allClaims, allSessions, collection, saveOrLoadMissionSet, setMeta, type Meta } from '../platform/store';
import { currentFix } from '../platform/device';
import { CreatureArt } from './CreatureArt';
import { Button, H1, Note, P, Pill, Row, Screen } from './kit';
import { fmtM } from './labels';
import { useTheme } from './theme';

type PosState = { status: 'loading' } | { status: 'ok'; pos: LatLng & { acc: number } } | { status: 'error'; msg: string };

export function simPosition(pack: AreaPack, meta: Meta) {
  const hub = pack.hubs.find((h) => h.id === meta.simHub) ?? pack.hubs[0];
  return { lat: hub.lat, lng: hub.lng, acc: 5 };
}

export function Today({ pack, meta, sim, onPick }: { pack: AreaPack; meta: Meta; sim: boolean; onPick: (m: Mission) => void }) {
  const t = useTheme();
  const [duration, setDuration] = useState<Duration>(20);
  const [pos, setPos] = useState<PosState>({ status: 'loading' });
  const [info, setInfo] = useState<{ claimsToday: number; streak: number; owned: Set<string>; visits: { poiId: string; date: string }[]; clockOk: boolean } | null>(null);
  const [result, setResult] = useState<{ options: Mission[]; relaxed: boolean } | { error: string; shorter?: Duration } | null>(null);
  const date = localDate(Date.now());

  const locate = useCallback(async () => {
    setPos({ status: 'loading' });
    if (sim) return setPos({ status: 'ok', pos: simPosition(pack, meta) });
    try { setPos({ status: 'ok', pos: await currentFix() }); }
    catch { setPos({ status: 'error', msg: 'Chưa lấy được vị trí. Kiểm tra quyền vị trí và GPS, rồi thử lại ở nơi thoáng.' }); }
  }, [sim, pack, meta]);

  useEffect(() => {
    void locate();
    void (async () => {
      const now = Date.now();
      const clock = checkClock(meta.clockMax, now);
      if (clock.ok) await setMeta('clockMax', clock.newMax);
      const claims = await allClaims();
      const sessions = await allSessions();
      setInfo({
        claimsToday: claims.filter((c) => c.date === date).length,
        streak: streak(claims.map((c) => c.date), date, addDays),
        owned: new Set((await collection()).map((c) => c.creatureId)),
        visits: sessions.filter((s) => s.status === 'completed').map((s) => ({ poiId: s.poiId, date: s.date })),
        clockOk: clock.ok,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pos.status !== 'ok' || !info) return;
    void (async () => {
      const near = nearestHub(pack, pos.pos);
      if (!near) return setResult({ error: 'Bạn đang ở ngoài khu vực có dữ liệu. Hãy tới gần một cổng xuất phát của khu vực.' });
      const input = { pack, date, hour: new Date().getHours(), duration, position: pos.pos, visits: info.visits, owned: info.owned };
      let shorter: Duration | undefined;
      const set = await saveOrLoadMissionSet(`${date}|${duration}|${near.hub.id}`, () => {
        const r = generateMissions(input);
        if (!r.ok) { shorter = r.reason === 'NO_MATCH' ? r.shorter : undefined; return null; }
        return { options: r.options, relaxedRecent: r.relaxedRecent };
      });
      setResult(set ? { options: set.options, relaxed: set.relaxedRecent } : { error: 'Chưa có nhiệm vụ phù hợp với thời lượng này trong khu vực hỗ trợ.', shorter });
    })();
  }, [pos, info, duration, pack, date]);

  const left = Math.max(0, RULES.maxClaimsPerDay - (info?.claimsToday ?? 0));

  return (
    <Screen testID="today">
      <H1>Hôm nay đi đâu?</H1>
      <Row>
        <Pill>🔥 {info?.streak ?? 0} ngày</Pill>
        <Pill>Bộ sưu tập {info?.owned.size ?? 0}/{pack.creatures.length}</Pill>
        <Pill>{`Còn ${left} lượt thưởng`}</Pill>
      </Row>
      <P muted small>Chủ đề tuần: {weeklyTheme(pack, date)} · {pack.name}{pack.sample ? ' · dữ liệu mẫu' : ''}</P>
      {info && !info.clockOk && <Note testID="clock-warning">Đồng hồ thiết bị đang chậm hơn lần dùng trước. Hãy bật ngày giờ tự động; nhận thưởng tạm khóa.</Note>}

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
        {DURATIONS.map((d) => (
          <Pressable key={d} testID={`duration-${d}`} accessibilityRole="radio" accessibilityState={{ checked: d === duration }} onPress={() => setDuration(d)}
            style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: d === duration ? t.accent : t.line, backgroundColor: d === duration ? t.accent : t.card }}>
            <Text style={{ color: d === duration ? '#fff' : t.ink, fontWeight: d === duration ? '700' : '500', fontSize: 16 }}>{d} phút</Text>
          </Pressable>
        ))}
      </View>

      {pos.status === 'loading' && <P muted>Đang lấy vị trí…</P>}
      {pos.status === 'ok' && !sim && <Button kind="link" title={`Cập nhật vị trí (±${Math.round(pos.pos.acc)} m)`} onPress={locate} />}
      {pos.status === 'error' && <Note>{pos.msg}</Note>}
      {pos.status === 'error' && <Button title="Thử lại" onPress={locate} />}
      {result && 'error' in result && (
        <Note testID="no-mission">
          <P>{result.error}</P>
          {result.shorter && <Button title={`Thử ${result.shorter} phút`} onPress={() => setDuration(result.shorter!)} />}
        </Note>
      )}
      {result && 'options' in result && (
        <View style={{ gap: 10 }}>
          {result.relaxed && <P muted small>Hôm nay một số điểm bạn vừa ghé gần đây được gợi ý lại vì khu vực còn ít lựa chọn.</P>}
          {result.options.map((m, i) => {
            const poi = pack.pois.find((p) => p.id === m.poiId)!;
            const c = pack.creatures.find((x) => x.id === m.creatureId)!;
            const have = info?.owned.has(c.id);
            return (
              <Pressable key={m.id} testID={`mission-${i}`} accessibilityRole="button" accessibilityLabel={poi.name} onPress={() => onPick(m)}
                style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, opacity: pressed ? 0.8 : 1 })}>
                <CreatureArt creature={c} size={64} hidden={!have} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: t.ink, fontWeight: '700', fontSize: 16 }}>{poi.name}</Text>
                  <P small muted>{fmtM(m.distanceM)} mỗi chiều · khoảng {m.estMinutes} phút khứ hồi</P>
                  <P small muted>{have ? `Có thể gặp lại ${c.name}` : 'Một sinh vật bạn chưa gặp'}{c.rarity === 'rare' ? ' · hiếm' : ''} · {m.waypoints.length} dấu vết</P>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
