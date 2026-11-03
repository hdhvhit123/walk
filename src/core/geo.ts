export interface LatLng { lat: number; lng: number }

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthM(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distanceM(pts[i - 1], pts[i]);
  return d;
}

/** Local equirectangular projection in metres around an origin (fine at park scale). */
export function toXY(origin: LatLng, p: LatLng): { x: number; y: number } {
  return {
    x: rad(p.lng - origin.lng) * R * Math.cos(rad(origin.lat)),
    y: rad(p.lat - origin.lat) * R,
  };
}

export function fromXY(origin: LatLng, x: number, y: number): LatLng {
  return {
    lat: origin.lat + (y / R) * (180 / Math.PI),
    lng: origin.lng + (x / (R * Math.cos(rad(origin.lat)))) * (180 / Math.PI),
  };
}

/**
 * Project p onto a polyline. Returns distance along the line (m) of the
 * nearest point and the perpendicular offset (m).
 */
export function projectOnPath(path: LatLng[], p: LatLng): { along: number; offset: number } {
  const o = path[0];
  const P = toXY(o, p);
  let best = { along: 0, offset: Infinity };
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const A = toXY(o, path[i - 1]);
    const B = toXY(o, path[i]);
    const dx = B.x - A.x, dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
    const qx = A.x + t * dx, qy = A.y + t * dy;
    const off = Math.hypot(P.x - qx, P.y - qy);
    const segLen = Math.sqrt(len2);
    if (off < best.offset) best = { along: acc + t * segLen, offset: off };
    acc += segLen;
  }
  return best;
}

/** Point at a distance along a polyline. */
export function pointAlong(path: LatLng[], d: number): LatLng {
  if (d <= 0) return path[0];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = distanceM(path[i - 1], path[i]);
    if (acc + seg >= d) {
      const t = seg === 0 ? 0 : (d - acc) / seg;
      return {
        lat: path[i - 1].lat + t * (path[i].lat - path[i - 1].lat),
        lng: path[i - 1].lng + t * (path[i].lng - path[i - 1].lng),
      };
    }
    acc += seg;
  }
  return path[path.length - 1];
}

/** Ray-casting point-in-polygon on lat/lng (adequate for small polygons). */
export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) &&
        p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}
