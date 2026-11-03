/**
 * Generates src/data/area-pack.json from a metre-based layout.
 * Run: npx vite-node scripts/build-pack.ts
 * Coordinates are SAMPLE data around a park in District 1, HCMC; they must be
 * surveyed on site before real use.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fromXY, pathLengthM, pointAlong, type LatLng } from '../src/core/geo';
import type { AreaPack, Creature, Habitat, Item, Poi, Route } from '../src/core/pack';

const origin: LatLng = { lat: 10.7745, lng: 106.692 };
const xy: Record<string, [number, number]> = {
  N1: [-220, 160], N2: [-80, 160], N0: [0, 160], N3: [80, 160], N4: [220, 160],
  E1: [220, 40], E2: [220, -60], S4: [220, -160], L2: [150, -160], S3: [80, -160],
  S2: [-80, -160], S1: [-220, -160], W2: [-220, -60], W1: [-220, 40],
  C: [0, 0], I1: [-80, 40], I2: [80, 40], I3: [80, -60], I4: [-80, -60], L1: [150, -60],
  GN: [0, 185], GW: [-245, -60],
};
const edges: [string, string][] = [
  ['N1', 'N2'], ['N2', 'N0'], ['N0', 'N3'], ['N3', 'N4'], ['N4', 'E1'], ['E1', 'E2'], ['E2', 'S4'],
  ['S4', 'L2'], ['L2', 'S3'], ['S3', 'S2'], ['S2', 'S1'], ['S1', 'W2'], ['W2', 'W1'], ['W1', 'N1'],
  ['N2', 'I1'], ['N3', 'I2'], ['N0', 'C'], ['I1', 'I2'], ['I2', 'I3'], ['I3', 'I4'], ['I4', 'I1'],
  ['C', 'I1'], ['C', 'I2'], ['C', 'I3'], ['C', 'I4'], ['E1', 'I2'], ['I3', 'L1'], ['L1', 'E2'],
  ['S2', 'I4'], ['W1', 'I1'], ['W2', 'I4'], ['S3', 'I3'], ['GN', 'N0'], ['GW', 'W2'],
];
const ll = (id: string) => fromXY(origin, xy[id][0], xy[id][1]);
const round = (p: LatLng) => ({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) });

// Dijkstra on the path network
function shortest(a: string, b: string): string[] {
  const dist: Record<string, number> = { [a]: 0 };
  const prev: Record<string, string> = {};
  const todo = new Set(Object.keys(xy));
  while (todo.size) {
    let u = ''; let best = Infinity;
    for (const n of todo) if ((dist[n] ?? Infinity) < best) { best = dist[n]; u = n; }
    if (!u || u === b) break;
    todo.delete(u);
    for (const [p, q] of edges) {
      const v = p === u ? q : q === u ? p : null;
      if (!v || !todo.has(v)) continue;
      const d = best + Math.hypot(xy[u][0] - xy[v][0], xy[u][1] - xy[v][1]);
      if (d < (dist[v] ?? Infinity)) { dist[v] = d; prev[v] = u; }
    }
  }
  const path = [b];
  while (path[0] !== a) path.unshift(prev[path[0]]);
  return path;
}
const via = (...stops: string[]) => stops.slice(1).reduce<string[]>((acc, s, i) => {
  const seg = shortest(stops[i], s);
  return acc.length ? acc.concat(seg.slice(1)) : seg;
}, []);

const P = (id: string, name: string, node: string, type: Habitat, extra: Partial<Poi> = {}): Poi => ({
  id, name, node, type, radiusM: 30, hours: null, status: 'active', ...round(ll(node)), ...extra,
});
const pois: Poi[] = [
  P('p-plaza', 'Quảng trường trung tâm', 'C', 'plaza'),
  P('p-banyan', 'Gốc đa trăm tuổi', 'I2', 'tree'),
  P('p-pavilion', 'Chòi nghỉ mái ngói', 'I4', 'pavilion'),
  P('p-lotus', 'Bờ hồ sen', 'L1', 'pond'),
  P('p-stone-pier', 'Bến đá phía nam', 'L2', 'pond'),
  P('p-bougainvillea', 'Vườn hoa giấy', 'I1', 'garden'),
  P('p-bamboo', 'Lối tre', 'W1', 'tree'),
  P('p-playground', 'Sân chơi thiếu nhi', 'N1', 'plaza', { hours: [6, 21] }),
  P('p-chess', 'Góc cờ tướng', 'N4', 'pavilion'),
  P('p-fountain', 'Đài phun nước', 'E1', 'plaza', { status: 'closed', note: 'Đang bảo trì' }),
  P('p-rock-garden', 'Vườn đá', 'S2', 'garden'),
  P('p-birds', 'Hàng sao chim hót', 'S1', 'tree', { hours: [5, 18] }),
  P('p-drum', 'Nhà trống', 'I3', 'pavilion'),
];
const poiNode = Object.fromEntries(pois.map((p) => [p.id, p.node]));
const hubs = [
  { id: 'h-north', name: 'Cổng Bắc', node: 'GN', ...round(ll('GN')) },
  { id: 'h-west', name: 'Cổng Tây', node: 'GW', ...round(ll('GW')) },
];

// Authored routes: [id, hub node, poi, via nodes...]
const spec: [string, string, string, ...string[]][] = [
  ['r-n-plaza', 'GN', 'p-plaza'],
  ['r-n-banyan', 'GN', 'p-banyan'],
  ['r-n-bougainvillea', 'GN', 'p-bougainvillea'],
  ['r-n-pavilion', 'GN', 'p-pavilion'],
  ['r-n-drum', 'GN', 'p-drum'],
  ['r-n-chess', 'GN', 'p-chess'],
  ['r-n-playground', 'GN', 'p-playground'],
  ['r-n-lotus', 'GN', 'p-lotus', 'N3', 'N4', 'E1', 'E2'],
  ['r-n-stone-pier', 'GN', 'p-stone-pier', 'N4', 'E1', 'E2', 'S4'],
  ['r-n-rock-garden', 'GN', 'p-rock-garden', 'N2', 'N1', 'W1', 'W2', 'S1'],
  ['r-n-birds', 'GN', 'p-birds', 'N2', 'N1', 'W1', 'W2'],
  ['r-n-bamboo-loop', 'GN', 'p-bamboo', 'C', 'I4', 'W2'],
  ['r-n-lotus-grand', 'GN', 'p-lotus', 'N2', 'N1', 'W1', 'W2', 'S1', 'S2', 'S3', 'I3'],
  ['r-n-birds-grand', 'GN', 'p-birds', 'N3', 'N4', 'E1', 'E2', 'S4', 'L2', 'S3', 'S2'],
  ['r-w-bamboo', 'GW', 'p-bamboo'],
  ['r-w-pavilion', 'GW', 'p-pavilion'],
  ['r-w-birds', 'GW', 'p-birds'],
  ['r-w-plaza', 'GW', 'p-plaza'],
  ['r-w-rock-garden', 'GW', 'p-rock-garden', 'S1'],
  ['r-w-drum', 'GW', 'p-drum', 'I4', 'C'],
  ['r-w-lotus', 'GW', 'p-lotus', 'S1', 'S2', 'S3', 'I3'],
  ['r-w-stone-pier', 'GW', 'p-stone-pier', 'W1', 'N1', 'N2', 'C', 'I3', 'S3'],
  ['r-w-chess', 'GW', 'p-chess', 'W1', 'N1', 'N2', 'N0', 'N3'],
  ['r-w-banyan', 'GW', 'p-banyan', 'S1', 'S2', 'I4', 'C'],
];
const itemCycle = ['la-bang', 'hat-sen', 'long-den', 'vo-oc', 'hoa-giay', 'soi-cuoi'];
const routes: Route[] = spec.map(([id, hubNode, poi, ...v], i) => {
  const nodes = via(hubNode, ...v, poiNode[poi]);
  const path = nodes.map(ll);
  const len = pathLengthM(path);
  const fractions = len > 450 ? [0.35, 0.7] : [0.5];
  return {
    id, hub: hubs.find((h) => h.node === hubNode)!.id, poi, nodes,
    waypoints: fractions.map((f, k) => ({
      id: `${id}-w${k + 1}`, itemId: itemCycle[(i + k) % itemCycle.length], ...round(pointAlong(path, len * f)),
    })),
  };
});

const creatures: Creature[] = [
  { id: 'meo-may', name: 'Mèo Mây', habitats: ['plaza', 'pavilion'], theme: 'Gió', rarity: 'common',
    description: 'Cuộn tròn như một cụm mây nhỏ, thích nằm nơi có gió lùa.', line: 'Meo... gió hôm nay mát quá!',
    art: { body: '#e8eef7', accent: '#8fb3e0', shape: 'round', feature: 'cat' } },
  { id: 'rua-reu', name: 'Rùa Rêu', habitats: ['pond'], theme: 'Nước', rarity: 'common',
    description: 'Mai phủ rêu xanh, đi chậm nhưng nhớ mọi lối quanh hồ.', line: 'Từ từ thôi, hồ vẫn ở đây mà.',
    art: { body: '#7fae6a', accent: '#3f6b3a', shape: 'flat', feature: 'shell' } },
  { id: 'se-den-long', name: 'Sẻ Đèn Lồng', habitats: ['tree', 'plaza'], theme: 'Lễ hội', rarity: 'common',
    description: 'Bụng phát sáng dịu như đèn lồng giấy mỗi khi trời chạng vạng.', line: 'Chíp! Đèn đã sẵn sàng!',
    art: { body: '#f2a65a', accent: '#d9472b', shape: 'round', feature: 'wings' } },
  { id: 'ca-chep-gio', name: 'Cá Chép Gió', habitats: ['pond'], theme: 'Gió', rarity: 'rare',
    description: 'Bơi trong không khí như diều cá chép, chỉ hiện khi có người đi bộ đủ xa.', line: 'Bạn đi xa thật đấy!',
    art: { body: '#f05d4a', accent: '#ffd166', shape: 'tall', feature: 'fins' } },
  { id: 'nghe-suong', name: 'Nghé Sương', habitats: ['garden'], theme: 'Nước', rarity: 'common',
    description: 'Chú nghé nhỏ uống sương sớm trên lá cỏ.', line: 'Ụm bò... sương còn đọng kìa.',
    art: { body: '#9aa4b5', accent: '#5a6478', shape: 'round', feature: 'horns' } },
  { id: 'oc-ngoc', name: 'Ốc Ngọc', habitats: ['pond', 'garden'], theme: 'Nước', rarity: 'common',
    description: 'Vỏ ốc lấp lánh như ngọc trai, để lại vệt sáng trên đá.', line: 'Xoắn... xoắn... chào bạn!',
    art: { body: '#f3d9e8', accent: '#b56fa0', shape: 'flat', feature: 'spiral' } },
  { id: 've-sau-tre', name: 'Ve Sầu Tre', habitats: ['tree'], theme: 'Cây', rarity: 'common',
    description: 'Hát vào mùa hè, thân màu tre non.', line: 'Re re re! Hè rồi!',
    art: { body: '#b5c96a', accent: '#5d7a2a', shape: 'tall', feature: 'wings' } },
  { id: 'chuon-chuon-ngo', name: 'Chuồn Chuồn Ngô', habitats: ['garden', 'pond'], theme: 'Gió', rarity: 'common',
    description: 'Bay thấp là mưa, bay cao là nắng, bay vừa thì... chơi với bạn.', line: 'Vù! Hôm nay nắng đẹp!',
    art: { body: '#5ab4c9', accent: '#246b7d', shape: 'tall', feature: 'dragonfly' } },
  { id: 'cu-mai-ngoi', name: 'Cú Mái Ngói', habitats: ['pavilion'], theme: 'Lễ hội', rarity: 'rare',
    description: 'Đậu trên mái ngói cổ, thuộc lòng mọi câu chuyện của khu phố.', line: 'Hú... ta kể bạn nghe chuyện này.',
    art: { body: '#a0704a', accent: '#5c3b22', shape: 'round', feature: 'owl' } },
  { id: 'tho-hoa-giay', name: 'Thỏ Hoa Giấy', habitats: ['garden', 'plaza'], theme: 'Cây', rarity: 'common',
    description: 'Tai mỏng như cánh hoa giấy, đổi màu theo mùa.', line: 'Hít hít... thơm mùi hoa!',
    art: { body: '#f7c6d9', accent: '#e05a8a', shape: 'round', feature: 'rabbit' } },
];
const items: Item[] = [
  { id: 'la-bang', name: 'Lá bàng đỏ', description: 'Một chiếc lá bàng chuyển đỏ.' },
  { id: 'hat-sen', name: 'Hạt sen', description: 'Hạt sen tròn, dùng trang trí góc vườn sau này.' },
  { id: 'long-den', name: 'Lồng đèn giấy', description: 'Lồng đèn nhỏ ai đó để quên.' },
  { id: 'vo-oc', name: 'Vỏ ốc xoắn', description: 'Vỏ ốc rỗng còn ánh xà cừ.' },
  { id: 'hoa-giay', name: 'Cánh hoa giấy', description: 'Cánh hoa giấy hồng nhạt.' },
  { id: 'soi-cuoi', name: 'Sỏi cuội', description: 'Viên sỏi nhẵn từ lối đi.' },
];

const lake = [[110, -135], [190, -135], [195, -110], [190, -85], [110, -85], [105, -110]].map(([x, y]) => round(fromXY(origin, x, y)));
const sw = fromXY(origin, -300, -230), ne = fromXY(origin, 300, 230);
const pack: AreaPack = {
  id: 'sample-park-q1', name: 'Công viên mẫu (Quận 1)', version: '1.0.0', updated: '2026-11-02', sample: true,
  origin,
  bounds: { south: +sw.lat.toFixed(6), west: +sw.lng.toFixed(6), north: +ne.lat.toFixed(6), east: +ne.lng.toFixed(6) },
  nodes: Object.keys(xy).map((id) => ({ id, ...round(ll(id)) })),
  edges,
  forbidden: [{ id: 'lake', name: 'Mặt hồ', polygon: lake }],
  hubs, pois, routes,
  themes: ['Nước', 'Gió', 'Cây', 'Lễ hội'],
  creatures, items,
};
writeFileSync(path.join(__dirname, '../src/data/area-pack.json'), JSON.stringify(pack, null, 1));
for (const r of routes) console.log(r.id.padEnd(20), Math.round(pathLengthM(r.nodes.map(ll))), 'm');
