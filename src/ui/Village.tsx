import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { localDate } from '../core/clock';
import type { AreaPack } from '../core/pack';
import { BUILDINGS, LEVEL_CHARM, buildingDef, canBuild, canMoveIn, fits, type BuildProblem, type BuildingKind, type PlacedBuilding, type VillageState } from '../core/village';
import { collectGift, collection, moveBuilding, moveIn, moveOut, placeBuilding, village } from '../platform/store';
import { CreatureArt } from './CreatureArt';
import { Bar, Button, Card, H1, H2, Note, P, Pill, Row, Screen } from './kit';
import { tint, useTheme } from './theme';

const PROBLEM: Record<BuildProblem, string> = {
  LEVEL: 'Cần làng lên cấp cao hơn',
  LEAVES: 'Chưa đủ lá',
  ITEMS: 'Chưa đủ vật phẩm',
  OCCUPIED: 'Ô này đã có công trình',
  OUTSIDE: 'Ngoài vùng đất của làng',
};

type Mode = { kind: 'view' } | { kind: 'place'; building: BuildingKind } | { kind: 'move'; id: string };

export function Village({ pack }: { pack: AreaPack }) {
  const t = useTheme();
  const today = localDate(Date.now());
  const [v, setV] = useState<(VillageState & { gift: number }) | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const reload = useCallback(async () => {
    setV(await village(today));
    setOwned(new Set((await collection()).map((c) => c.creatureId)));
  }, [today]);
  useEffect(() => { void reload(); }, [reload]);

  if (!v) return <Screen testID="village"><P muted>Đang tải…</P></Screen>;

  const itemName = (id: string) => pack.items.find((i) => i.id === id)?.name ?? id;
  const creature = (id: string) => pack.creatures.find((c) => c.id === id)!;
  const at = (x: number, y: number) => v.buildings.find((b) => b.x === x && b.y === y);
  const residentsOf = (b: PlacedBuilding) => v.residents.filter((r) => r.buildingId === b.id).map((r) => creature(r.creatureId));
  const sel = v.buildings.find((b) => b.id === selected) ?? null;
  const prevLevelCharm = LEVEL_CHARM[v.level - 1];

  const onTile = async (x: number, y: number) => {
    setMsg('');
    const b = at(x, y);
    if (mode.kind === 'place') {
      if (b) return setMsg(PROBLEM.OCCUPIED);
      const problem = await placeBuilding(mode.building, x, y, Date.now());
      if (problem) return setMsg(PROBLEM[problem]);
      setMsg(`Đã xây ${buildingDef(mode.building).name}!`);
      setMode({ kind: 'view' });
      return reload();
    }
    if (mode.kind === 'move') {
      if (b) return setMsg(PROBLEM.OCCUPIED);
      await moveBuilding(mode.id, x, y);
      setMode({ kind: 'view' });
      return reload();
    }
    setSelected(b ? b.id : null);
  };

  const tile = `${100 / v.size}%` as const;

  return (
    <Screen testID="village">
      <H1>Ngôi làng</H1>
      <Row>
        <Pill>Cấp {v.level}</Pill>
        <Pill>🍃 <Text testID="leaves">{v.leaves}</Text> lá</Pill>
        <Pill>{v.residents.length} cư dân</Pill>
      </Row>
      <P small muted>{v.nextLevelCharm === null ? `Độ đẹp ${v.charm} · làng đã đạt cấp cao nhất` : `Độ đẹp ${v.charm}/${v.nextLevelCharm} để lên cấp ${v.level + 1} và mở thêm đất`}</P>
      {v.nextLevelCharm !== null && <Bar value={v.charm - prevLevelCharm} max={v.nextLevelCharm - prevLevelCharm} />}

      {v.gift > 0 && (
        <Note tone="good">
          <P>Dân làng có quà cho chuyến đi bộ hôm nay!</P>
          <Button kind="primary" title={`Nhận ${v.gift} lá`} testID="collect-gift" onPress={async () => { const n = await collectGift(today); setMsg(`+${n} lá từ dân làng`); await reload(); }} />
        </Note>
      )}

      {mode.kind !== 'view' && (
        <Note tone="info">
          <P>{mode.kind === 'place' ? `Chạm một ô trống để đặt ${buildingDef(mode.building).name}.` : 'Chạm một ô trống để dời công trình tới.'}</P>
          <Button title="Hủy" onPress={() => setMode({ kind: 'view' })} testID="cancel-mode" />
        </Note>
      )}
      {!!msg && <P testID="village-msg" style={{ fontWeight: '600' }}>{msg}</P>}

      <View testID="village-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: tint(t.good, 0.25) }}>
        {Array.from({ length: v.size * v.size }, (_, i) => {
          const x = i % v.size, y = Math.floor(i / v.size);
          const b = at(x, y);
          const res = b ? residentsOf(b) : [];
          const on = b && b.id === selected;
          return (
            <Pressable key={i} testID={b ? `tile-${b.kind}` : `tile-${x}-${y}`} accessibilityRole="button"
              accessibilityLabel={b ? buildingDef(b.kind).name : `Ô trống ${x + 1}, ${y + 1}`} onPress={() => void onTile(x, y)}
              style={{ width: tile, height: tile, borderWidth: 0.5, borderColor: tint(t.good, 0.35), alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? tint(t.accent2, 0.35) : mode.kind !== 'view' && !b ? tint(t.accent, 0.12) : 'transparent' }}>
              {b && <Text style={{ fontSize: v.size > 6 ? 22 : 28 }}>{buildingDef(b.kind).icon}</Text>}
              {res.length > 0 && (
                <View style={{ position: 'absolute', right: 1, bottom: 1, flexDirection: 'row' }}>
                  {res.map((c) => <CreatureArt key={c.id} creature={c} size={v.size > 6 ? 14 : 18} />)}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {sel && (
        <Card testID="building-detail">
          <H2>{buildingDef(sel.kind).icon} {buildingDef(sel.kind).name}</H2>
          <P muted small>{buildingDef(sel.kind).description}</P>
          {buildingDef(sel.kind).capacity > 0 ? (
            <>
              <P>Cư dân ({residentsOf(sel).length}/{buildingDef(sel.kind).capacity})</P>
              {residentsOf(sel).map((c) => (
                <Row key={c.id}><CreatureArt creature={c} size={36} /><P style={{ flex: 1, alignSelf: 'center' }}>{c.name}</P>
                  <Button kind="link" title="Chuyển đi" onPress={async () => { await moveOut(c.id); await reload(); }} style={{ flexGrow: 0 }} /></Row>
              ))}
              {(() => {
                const candidates = pack.creatures.filter((c) => owned.has(c.id) && fits(buildingDef(sel.kind), c.habitats) && !v.residents.some((r) => r.creatureId === c.id));
                if (!candidates.length) return <P small muted>{owned.size ? 'Chưa có sinh vật phù hợp đang rảnh. Đi bộ gặp thêm sinh vật nhé!' : 'Đi bộ gặp sinh vật đầu tiên để mời về ở.'}</P>;
                return candidates.map((c) => {
                  const p = canMoveIn(v, sel, c, owned);
                  return <Button key={c.id} title={`Mời ${c.name} về ở`} disabled={!!p} testID={`invite-${c.id}`}
                    onPress={async () => { const r = await moveIn(c, sel.id); setMsg(r ? 'Nhà đã đủ chỗ' : `${c.name} đã chuyển đến!`); await reload(); }} />;
                });
              })()}
            </>
          ) : <P small muted>Công trình trang trí: tăng độ đẹp của làng.</P>}
          <Row>
            <Button title="Dời chỗ" onPress={() => { setMode({ kind: 'move', id: sel.id }); setSelected(null); }} testID="move-building" />
            <Button title="Đóng" onPress={() => setSelected(null)} />
          </Row>
        </Card>
      )}

      <H2>Xây dựng</H2>
      <P small muted>Mỗi chuyến đi bộ hợp lệ cho 10 lá + 1 lá mỗi 20 m, thêm 20 lá khi gặp sinh vật mới. Vật phẩm nhặt dọc tuyến dùng để xây.</P>
      {BUILDINGS.map((def) => {
        const problem = canBuild(v, def.kind);
        const locked = problem === 'LEVEL';
        return (
          <Pressable key={def.kind} testID={`build-${def.kind}`} accessibilityRole="button" accessibilityState={{ disabled: !!problem }}
            onPress={() => { setMsg(''); if (problem) return setMsg(PROBLEM[problem]); setSelected(null); setMode({ kind: 'place', building: def.kind }); }}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: mode.kind === 'place' && mode.building === def.kind ? t.accent : t.line, backgroundColor: t.card, opacity: problem ? 0.6 : 1 }}>
            <Text style={{ fontSize: 30 }}>{locked ? '🔒' : def.icon}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.ink, fontWeight: '700' }}>{def.name}{def.capacity ? ` · ở được ${def.capacity}` : ''}</Text>
              <P small muted>{locked ? `Mở ở cấp ${def.minLevel}` : def.description}</P>
              <P small>
                <Text style={{ color: v.leaves >= def.leaves ? t.ink : t.warn }}>🍃 {def.leaves}</Text>
                {Object.entries(def.items).map(([id, n]) => (
                  <Text key={id} style={{ color: (v.items[id] ?? 0) >= n ? t.ink : t.warn }}>{`  ·  ${itemName(id)} ${Math.max(0, v.items[id] ?? 0)}/${n}`}</Text>
                ))}
              </P>
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}
