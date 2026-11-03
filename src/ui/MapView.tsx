import { useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { toXY, type LatLng } from '../core/geo';
import { nodeMap, routePath, type AreaPack, type Route } from '../core/pack';
import { useTheme } from './theme';

const ICON: Record<string, string> = { plaza: '◆', pond: '◉', tree: '▲', garden: '✿', pavilion: '⌂' };

interface Props {
  pack: AreaPack;
  route?: Route;
  player?: (LatLng & { acc?: number }) | null;
  collected?: string[];
  highlightPoi?: string;
}

/** Offline schematic map drawn from the area pack (no tile server needed). */
export function MapView({ pack, route, player, collected = [], highlightPoi }: Props) {
  const t = useTheme();
  const geo = useMemo(() => {
    const o = pack.origin;
    const sw = toXY(o, { lat: pack.bounds.south, lng: pack.bounds.west });
    const ne = toXY(o, { lat: pack.bounds.north, lng: pack.bounds.east });
    const P = (p: LatLng) => { const q = toXY(o, p); return { x: q.x - sw.x, y: ne.y - q.y }; };
    return { P, w: ne.x - sw.x, h: ne.y - sw.y };
  }, [pack]);
  const nodes = useMemo(() => nodeMap(pack), [pack]);
  const { P, w, h } = geo;
  const path = route ? routePath(pack, route).map(P) : [];
  const d = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
  const me = player ? P(player) : null;
  const anchor = (x: number) => (x < w * 0.25 ? { textAnchor: 'start' as const, x: x - 18 } : x > w * 0.75 ? { textAnchor: 'end' as const, x: x + 18 } : { textAnchor: 'middle' as const, x });
  const label = { fill: t.ink, stroke: t.mapBg, strokeWidth: 5, paintOrder: 'stroke' as const, fontWeight: '600' as const };

  return (
    <Svg testID="map" width="100%" style={{ aspectRatio: w / h, borderRadius: 14 }} viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`} accessibilityLabel="Bản đồ khu vực">
      <Rect width={w} height={h} fill={t.mapBg} />
      {pack.forbidden.map((f) => <Path key={f.id} d={d(f.polygon.map(P)) + 'Z'} fill={t.water} />)}
      <G stroke={t.path} strokeWidth={9} strokeLinecap="round">
        {pack.edges.map(([a, b]) => {
          const A = P(nodes.get(a)!), B = P(nodes.get(b)!);
          return <Line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} />;
        })}
      </G>
      {route && <Path d={d(path)} stroke={t.route} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 14" />}
      {route?.waypoints.map((wp) => {
        const q = P(wp);
        const got = collected.includes(wp.id);
        return <G key={wp.id}><Circle cx={q.x} cy={q.y} r={13} fill={got ? t.muted : t.accent2} /><SvgText x={q.x} y={q.y + 6} textAnchor="middle" fontSize={16} fill="#fff">{got ? '✓' : '?'}</SvgText></G>;
      })}
      {pack.pois.map((p) => {
        const q = P(p);
        const on = p.id === highlightPoi;
        const closed = p.status !== 'active';
        return (
          <G key={p.id} opacity={closed ? 0.4 : route && !on ? 0.55 : 1}>
            <Circle cx={q.x} cy={q.y} r={on ? 22 : 15} fill={on ? t.accent : t.poi} stroke="#fff" strokeWidth={2} />
            <SvgText x={q.x} y={q.y + 6} textAnchor="middle" fontSize={on ? 20 : 15} fill="#fff">{ICON[p.type]}</SvgText>
            {(on || !route) && <SvgText {...anchor(q.x)} y={q.y - (on ? 30 : 22)} fontSize={on ? 24 : 18} {...label}>{p.name + (closed ? ' (đóng)' : '')}</SvgText>}
          </G>
        );
      })}
      {pack.hubs.map((hb) => {
        const q = P(hb);
        return <G key={hb.id}><Rect x={q.x - 13} y={q.y - 13} width={26} height={26} rx={5} fill={t.hub} /><SvgText {...anchor(q.x)} y={q.y + 36} fontSize={20} {...label}>{hb.name}</SvgText></G>;
      })}
      {me && (
        <G>
          {!!player?.acc && <Circle cx={me.x} cy={me.y} r={Math.min(60, player.acc)} fill={t.me} opacity={0.15} />}
          <Circle cx={me.x} cy={me.y} r={11} fill={t.me} stroke="#fff" strokeWidth={3} />
        </G>
      )}
    </Svg>
  );
}
