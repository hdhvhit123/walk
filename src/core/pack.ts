import { distanceM, pathLengthM, pointInPolygon, type LatLng } from './geo';

export type Habitat = 'plaza' | 'pond' | 'tree' | 'garden' | 'pavilion';

export interface PackNode extends LatLng { id: string }
export interface Hub extends LatLng { id: string; name: string; node: string }
export interface Poi extends LatLng {
  id: string; name: string; node: string; type: Habitat; radiusM: number;
  /** [openHour, closeHour) local time; null = always open */
  hours: [number, number] | null;
  status: 'active' | 'closed';
  note?: string;
}
export interface Waypoint extends LatLng { id: string; itemId: string }
export interface Route { id: string; hub: string; poi: string; nodes: string[]; waypoints: Waypoint[] }
export interface Creature {
  id: string; name: string; habitats: Habitat[]; theme: string;
  rarity: 'common' | 'rare'; description: string; line: string;
  art: { body: string; accent: string; shape: 'round' | 'tall' | 'flat'; feature: string };
}
export interface Item { id: string; name: string; description: string }

export interface AreaPack {
  id: string; name: string; version: string; updated: string;
  sample: boolean;
  origin: LatLng;
  bounds: { south: number; west: number; north: number; east: number };
  nodes: PackNode[];
  edges: [string, string][];
  forbidden: { id: string; name: string; polygon: LatLng[] }[];
  hubs: Hub[];
  pois: Poi[];
  routes: Route[];
  themes: string[];
  creatures: Creature[];
  items: Item[];
}

export function nodeMap(pack: AreaPack): Map<string, PackNode> {
  return new Map(pack.nodes.map((n) => [n.id, n]));
}

export function routePath(pack: AreaPack, route: Route): LatLng[] {
  const nodes = nodeMap(pack);
  return route.nodes.map((id) => {
    const n = nodes.get(id);
    if (!n) throw new Error(`Unknown node ${id} in route ${route.id}`);
    return { lat: n.lat, lng: n.lng };
  });
}

export function routeLengthM(pack: AreaPack, route: Route): number {
  return pathLengthM(routePath(pack, route));
}

/** Validates the structural rules a pack must satisfy before it can be used. */
export function validatePack(pack: AreaPack): string[] {
  const errors: string[] = [];
  const nodes = nodeMap(pack);
  const edgeSet = new Set(pack.edges.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const hubs = new Map(pack.hubs.map((h) => [h.id, h]));
  const pois = new Map(pack.pois.map((p) => [p.id, p]));
  const items = new Set(pack.items.map((i) => i.id));

  for (const [a, b] of pack.edges) {
    if (!nodes.has(a) || !nodes.has(b)) errors.push(`edge ${a}-${b} references unknown node`);
  }
  const inBounds = (p: LatLng) =>
    p.lat >= pack.bounds.south && p.lat <= pack.bounds.north && p.lng >= pack.bounds.west && p.lng <= pack.bounds.east;
  for (const p of pack.pois) {
    if (!nodes.has(p.node)) errors.push(`poi ${p.id} references unknown node`);
    if (!inBounds(p)) errors.push(`poi ${p.id} outside bounds`);
    for (const f of pack.forbidden) if (pointInPolygon(p, f.polygon)) errors.push(`poi ${p.id} inside forbidden zone ${f.id}`);
    if (!pack.creatures.some((c) => c.habitats.includes(p.type))) errors.push(`poi ${p.id} has no creature for habitat ${p.type}`);
  }
  for (const n of pack.nodes) {
    for (const f of pack.forbidden) if (pointInPolygon(n, f.polygon)) errors.push(`node ${n.id} inside forbidden zone ${f.id}`);
  }
  for (const r of pack.routes) {
    const hub = hubs.get(r.hub), poi = pois.get(r.poi);
    if (!hub) { errors.push(`route ${r.id} unknown hub`); continue; }
    if (!poi) { errors.push(`route ${r.id} unknown poi`); continue; }
    if (r.nodes[0] !== hub.node) errors.push(`route ${r.id} does not start at hub node`);
    if (r.nodes[r.nodes.length - 1] !== poi.node) errors.push(`route ${r.id} does not end at poi node`);
    for (let i = 1; i < r.nodes.length; i++) {
      if (!edgeSet.has(`${r.nodes[i - 1]}|${r.nodes[i]}`)) errors.push(`route ${r.id} uses missing edge ${r.nodes[i - 1]}-${r.nodes[i]}`);
    }
    const end = nodes.get(r.nodes[r.nodes.length - 1]);
    if (end && distanceM(end, poi) > poi.radiusM) errors.push(`route ${r.id} ends outside poi radius`);
    for (const w of r.waypoints) if (!items.has(w.itemId)) errors.push(`route ${r.id} waypoint ${w.id} unknown item`);
  }
  return errors;
}
