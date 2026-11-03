import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { localDate } from '../core/clock';
import type { AreaPack } from '../core/pack';
import {
  BUILDINGS, LEVEL_CHARM, MATERIALS, RAW, RECIPES, TRADE_RATE, buildingDef, canBuild, canCraft, canMoveIn, canTrade, canUpgrade,
  capacityOf, fits, missing, resourceName, sourcesOf, upgradeCost,
  type BuildProblem, type BuildingKind, type Cost, type MaterialId, type PlacedBuilding, type VillageState,
} from '../core/village';
import { collectGift, collection, craft, moveBuilding, moveIn, moveOut, placeBuilding, trade, upgradeBuilding, village } from '../platform/store';
import { CreatureArt } from './CreatureArt';
import { Bar, Button, Card, H1, H2, Note, P, Pill, Row, Screen } from './kit';
import { tint, useTheme } from './theme';

const PROBLEM: Record<BuildProblem, string> = {
  LEVEL: 'Cần làng lên cấp cao hơn',
  RESOURCES: 'Chưa đủ vật liệu',
  OCCUPIED: 'Ô này đã có công trình',
  OUTSIDE: 'Ngoài vùng đất của làng',
  MAX_TIER: 'Đã nâng cấp tối đa',
  NO_WORKSHOP: 'Cần xây xưởng trước',
  LIMIT: 'Làng đã có đủ số công trình loại này',
};

type Mode = { kind: 'view' } | { kind: 'place'; building: BuildingKind } | { kind: 'move'; id: string };
type V = VillageState & { gift: Cost | null };

export function Village({ pack }: { pack: AreaPack }) {
  const t = useTheme();
  const today = localDate(Date.now());
  const [v, setV] = useState<V | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [give, setGive] = useState<MaterialId>('tre');
  const [get, setGet] = useState<MaterialId>('go');

  const reload = useCallback(async () => {
    setV(await village(pack, today));
    setOwned(new Set((await collection()).map((c) => c.creatureId)));
  }, [pack, today]);
  useEffect(() => { void reload(); }, [reload]);

  if (!v) return <Screen testID="village"><P muted>Đang tải…</P></Screen>;

  const name = (id: string) => resourceName(pack, id);
  const have = (id: string) => Math.max(0, v.stock[id] ?? 0);
  const creature = (id: string) => pack.creatures.find((c) => c.id === id)!;
  const at = (x: number, y: number) => v.buildings.find((b) => b.x === x && b.y === y);
  const residentsOf = (b: PlacedBuilding) => v.residents.filter((r) => r.buildingId === b.id).map((r) => creature(r.creatureId));
  const sel = v.buildings.find((b) => b.id === selected) ?? null;
  const prevLevelCharm = LEVEL_CHARM[v.level - 1];
  const treasures = pack.items.filter((i) => have(i.id) > 0);
  const say = (s: string) => setMsg(s);

  /** One line telling the player how to get what a cost lacks. */
  const hint = (cost: Cost) => {
    const lack = missing(v.stock, cost);
    const parts = Object.entries(lack).map(([id, n]) => {
      const m = MATERIALS.find((x) => x.id === id);
      if (m && !m.crafted) return `${name(id)} ×${n}: đi tới ${sourcesOf(pack, id as MaterialId).slice(0, 2).join(', ')} hoặc đổi ở chợ`;
      if (m?.crafted) return `${name(id)} ×${n}: làm ở ${buildingDef(RECIPES.find((r) => r.id === id)!.workshop).name}`;
      return `${name(id)} ×${n}: nhặt dọc tuyến đi bộ`;
    });
    return parts.join(' · ');
  };

  const CostLine = ({ cost }: { cost: Cost }) => (
    <Text style={{ fontSize: 13, lineHeight: 19 }}>
      {Object.entries(cost).map(([id, n], i) => (
        <Text key={id} style={{ color: have(id) >= n ? t.ink : t.warn }}>{i ? '  ·  ' : ''}{name(id)} {have(id)}/{n}</Text>
      ))}
    </Text>
  );

  const onTile = async (x: number, y: number) => {
    setMsg('');
    const b = at(x, y);
    if (mode.kind === 'place') {
      if (b) return say(PROBLEM.OCCUPIED);
      const p = await placeBuilding(pack, mode.building, x, y, Date.now());
      if (p) return say(PROBLEM[p]);
      say(`Đã xây ${buildingDef(mode.building).name}!`);
      setMode({ kind: 'view' });
      return reload();
    }
    if (mode.kind === 'move') {
      if (b) return say(PROBLEM.OCCUPIED);
      await moveBuilding(pack, mode.id, x, y);
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
        <Pill>{v.buildings.length} công trình</Pill>
        <Pill>{v.residents.length} cư dân</Pill>
      </Row>
      <P small muted>{v.nextLevelCharm === null ? `Độ đẹp ${v.charm} · làng đã đạt cấp cao nhất` : `Độ đẹp ${v.charm}/${v.nextLevelCharm} để lên cấp ${v.level + 1}: mở thêm đất và công trình mới`}</P>
      {v.nextLevelCharm !== null && <Bar value={v.charm - prevLevelCharm} max={v.nextLevelCharm - prevLevelCharm} />}

      <Card testID="stock">
        <P style={{ fontWeight: '700' }}>Kho</P>
        <Text style={{ color: t.ink, lineHeight: 22 }}>{MATERIALS.filter((m) => !m.crafted).map((m) => `${m.icon} ${m.name} ${have(m.id)}`).join('   ')}</Text>
        <Text style={{ color: t.ink, lineHeight: 22 }}>{MATERIALS.filter((m) => m.crafted).map((m) => `${m.icon} ${m.name} ${have(m.id)}`).join('   ')}</Text>
        <Text style={{ color: t.muted, lineHeight: 20 }}>{treasures.length ? treasures.map((i) => `✨ ${i.name} ${have(i.id)}`).join('   ') : 'Báu vật: nhặt dọc tuyến khi đi bộ qua các dấu vết.'}</Text>
      </Card>

      {v.gift && (
        <Note tone="good">
          <P>Dân làng có quà cho chuyến đi bộ hôm nay: {Object.entries(v.gift).map(([id, n]) => `${name(id)} ×${n}`).join(', ')}</P>
          <Button kind="primary" title="Nhận quà" testID="collect-gift" onPress={async () => { await collectGift(pack, today); say('Đã nhận quà của dân làng'); await reload(); }} />
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
          return (
            <Pressable key={i} testID={b ? `tile-${b.kind}` : `tile-${x}-${y}`} accessibilityRole="button"
              accessibilityLabel={b ? buildingDef(b.kind).name : `Ô trống ${x + 1}, ${y + 1}`} onPress={() => void onTile(x, y)}
              style={{ width: tile, height: tile, borderWidth: 0.5, borderColor: tint(t.good, 0.35), alignItems: 'center', justifyContent: 'center',
                backgroundColor: b && b.id === selected ? tint(t.accent2, 0.35) : mode.kind !== 'view' && !b ? tint(t.accent, 0.12) : 'transparent' }}>
              {b && <Text style={{ fontSize: v.size > 6 ? 22 : 28 }}>{buildingDef(b.kind).icon}</Text>}
              {b && b.tier > 1 && <Text style={{ position: 'absolute', left: 2, top: 0, fontSize: 10, color: t.ink }}>{'★'.repeat(b.tier - 1)}</Text>}
              {res.length > 0 && (
                <View style={{ position: 'absolute', right: 1, bottom: 1, flexDirection: 'row' }}>
                  {res.slice(0, 3).map((c) => <CreatureArt key={c.id} creature={c} size={v.size > 6 ? 14 : 18} />)}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {sel && (() => {
        const def = buildingDef(sel.kind);
        const up = upgradeCost(sel);
        const upProblem = canUpgrade(v, sel);
        return (
          <Card testID="building-detail">
            <H2>{def.icon} {def.name}{sel.tier > 1 ? ` ${'★'.repeat(sel.tier - 1)}` : ''}</H2>
            <P muted small>{def.description}</P>
            {def.houses !== null && (
              <>
                <P>Cư dân ({residentsOf(sel).length}/{capacityOf(sel)})</P>
                {residentsOf(sel).map((c) => (
                  <Row key={c.id}><CreatureArt creature={c} size={36} /><P style={{ flex: 1, alignSelf: 'center' }}>{c.name}</P>
                    <Button kind="link" title="Chuyển đi" onPress={async () => { await moveOut(c.id); await reload(); }} style={{ flexGrow: 0 }} /></Row>
                ))}
                {(() => {
                  const candidates = pack.creatures.filter((c) => owned.has(c.id) && fits(def, c.habitats) && !v.residents.some((r) => r.creatureId === c.id));
                  if (!candidates.length) return <P small muted>{owned.size ? 'Chưa có sinh vật phù hợp đang rảnh. Đi bộ gặp thêm sinh vật nhé!' : 'Đi bộ gặp sinh vật đầu tiên để mời về ở.'}</P>;
                  return candidates.map((c) => (
                    <Button key={c.id} title={`Mời ${c.name} về ở`} disabled={!!canMoveIn(v, sel, c, owned)} testID={`invite-${c.id}`}
                      onPress={async () => { const r = await moveIn(pack, c, sel.id); say(r ? 'Nhà đã đủ chỗ' : `${c.name} đã chuyển đến!`); await reload(); }} />
                  ));
                })()}
              </>
            )}
            {def.recipes && <P small muted>Xưởng: chế tạo {def.recipes.map((r) => name(r.id)).join(', ')} (xem mục Xưởng bên dưới).</P>}
            {up && (
              <View style={{ gap: 4 }}>
                <P>Nâng cấp lên {'★'.repeat(sel.tier)}: độ đẹp {def.charm[sel.tier]}{def.houses !== null ? `, ở được ${def.capacity[sel.tier]}` : ''}</P>
                <CostLine cost={up} />
                {upProblem === 'RESOURCES' && <P small muted>{hint(up)}</P>}
                {upProblem === 'LEVEL' && <P small muted>Cần làng cấp {def.minLevel + sel.tier}</P>}
                <Button kind="primary" title="Nâng cấp" disabled={!!upProblem} testID="upgrade"
                  onPress={async () => { const p = await upgradeBuilding(pack, sel.id); say(p ? PROBLEM[p] : `${def.name} đã được nâng cấp!`); await reload(); }} />
              </View>
            )}
            <Row>
              <Button title="Dời chỗ" onPress={() => { setMode({ kind: 'move', id: sel.id }); setSelected(null); }} testID="move-building" />
              <Button title="Đóng" onPress={() => setSelected(null)} />
            </Row>
          </Card>
        );
      })()}

      <H2>Xây dựng</H2>
      <P small muted>Mỗi chuyến đi bộ hợp lệ cho vật liệu thô (4 + 1 mỗi 100 m), phần lớn là loại của nơi đến: gốc cây cho gỗ, bờ hồ cho đất sét, vườn cho cỏ tranh, quảng trường cho đá, mái đình cho tre. Chọn nơi đi theo thứ bạn cần.</P>
      {BUILDINGS.map((def) => {
        const problem = canBuild(v, def.kind);
        const locked = problem === 'LEVEL';
        const count = v.buildings.filter((b) => b.kind === def.kind).length;
        return (
          <Pressable key={def.kind} testID={`build-${def.kind}`} accessibilityRole="button" accessibilityState={{ disabled: !!problem }}
            onPress={() => { setMsg(''); if (problem) return say(problem === 'RESOURCES' ? `${PROBLEM.RESOURCES}. ${hint(def.costs[0])}` : PROBLEM[problem]); setSelected(null); setMode({ kind: 'place', building: def.kind }); }}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: mode.kind === 'place' && mode.building === def.kind ? t.accent : t.line, backgroundColor: t.card, opacity: problem ? 0.65 : 1 }}>
            <Text style={{ fontSize: 30 }}>{locked ? '🔒' : def.icon}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.ink, fontWeight: '700' }}>{def.name}{def.houses ? ` · ở được ${def.capacity[0]}` : ''}{def.costs.length > 1 ? ` · ${def.costs.length} bậc` : ''} <Text style={{ color: t.muted, fontWeight: '400' }}>({count}/{def.max})</Text></Text>
              <P small muted>{locked ? `Mở ở cấp ${def.minLevel}` : `${def.description} Độ đẹp +${def.charm[0]}.`}</P>
              {!locked && <CostLine cost={def.costs[0]} />}
            </View>
          </Pressable>
        );
      })}

      <H2>Xưởng</H2>
      {RECIPES.map((r) => {
        const p = canCraft(v, r.id);
        return (
          <Card key={r.id} testID={`recipe-${r.id}`}>
            <P><Text style={{ fontWeight: '700' }}>{name(r.id)}</Text> ← {Object.entries(r.inputs).map(([id, n]) => `${name(id)} ×${n}`).join(' + ')}</P>
            {p === 'NO_WORKSHOP'
              ? <P small muted>Cần xây {buildingDef(r.workshop).name}</P>
              : <Row>
                  <Button title="Làm 1" disabled={!!p} testID={`craft-${r.id}`} onPress={async () => { const e = await craft(pack, r.id); say(e ? PROBLEM[e] : `+1 ${name(r.id)}`); await reload(); }} />
                  <Button title="Làm 5" disabled={!!canCraft(v, r.id, 5)} onPress={async () => { const e = await craft(pack, r.id, 5); say(e ? PROBLEM[e] : `+5 ${name(r.id)}`); await reload(); }} />
                </Row>}
          </Card>
        );
      })}

      <H2>Chợ phiên</H2>
      <Card testID="market">
        <P small muted>Đổi {TRADE_RATE} vật liệu thô lấy 1 loại khác, khi tuyến đi bộ của bạn ít qua nơi có thứ mình cần.</P>
        <P>Đưa</P>
        <Row>{RAW.map((m) => <Chip key={m} on={give === m} label={`${name(m)} ${have(m)}`} testID={`give-${m}`} onPress={() => { setGive(m); if (get === m) setGet(RAW.find((x) => x !== m)!); }} />)}</Row>
        <P>Nhận</P>
        <Row>{RAW.filter((m) => m !== give).map((m) => <Chip key={m} on={get === m} label={name(m)} testID={`get-${m}`} onPress={() => setGet(m)} />)}</Row>
        <Button title={`Đổi ${TRADE_RATE} ${name(give)} → 1 ${name(get)}`} disabled={!!canTrade(v, give, get)} testID="trade"
          onPress={async () => { const e = await trade(pack, give, get); say(e ? PROBLEM[e] : `+1 ${name(get)}`); await reload(); }} />
      </Card>
    </Screen>
  );
}

function Chip({ on, label, onPress, testID }: { on: boolean; label: string; onPress: () => void; testID: string }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.card }}>
      <Text style={{ color: on ? '#fff' : t.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
