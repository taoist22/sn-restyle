// Adapted from Charles Cheval supernote-snap, MIT. See LICENSE.
export type P = {x: number; y: number};
type SymbolShape = {kind: 'axes'; origin: P; xEnd: P; yEnd: P};
type Result = {shape: SymbolShape | null; reason: string};
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Largest distance of `pts` to the line a-b. */
function maxDeviation(pts: P[], a: P, b: P): number {
  const len = Math.max(1e-9, dist(a, b));
  return Math.max(...pts.map(p => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len));
}

/**
 * Two straight legs at a right angle, one vertical and one horizontal, drawn
 * in one stroke. The corner is the origin; each leg becomes an axis in the
 * direction it was drawn.
 */
export function recognizeAxes(path: P[], minSize: number, k: number, snapDegrees = 8): Result {
  const s = path[0];
  const e = path[path.length - 1];
  let c = 0;
  let best = -1;
  for (let i = 1; i < path.length - 1; i++) {
    const d = maxDeviation([path[i]], s, e);
    if (d > best) {
      best = d;
      c = i;
    }
  }
  const o = path[c];
  const legs = [s, e].map(end => ({end, len: dist(o, end)}));
  if (legs.some(l => l.len < 1.5 * minSize)) {
    return {shape: null, reason: 'axes: legs too short'};
  }
  const tol = 0.05 * k;
  if (
    maxDeviation(path.slice(0, c + 1), s, o) > tol * legs[0].len ||
    maxDeviation(path.slice(c), o, e) > tol * legs[1].len
  ) {
    return {shape: null, reason: 'axes: legs not straight'};
  }
  // Any orientation: the legs must be perpendicular; the pair is then turned as
  // one orthogonal frame, snapped to the page axes when it is nearly upright.
  const t0 = Math.atan2(s.y - o.y, s.x - o.x);
  const t1 = Math.atan2(e.y - o.y, e.x - o.x);
  let diff = t1 - t0;
  while (diff > Math.PI) {
    diff -= 2 * Math.PI;
  }
  while (diff <= -Math.PI) {
    diff += 2 * Math.PI;
  }
  if (Math.abs(Math.abs(deg(diff)) - 90) > 12 * k) {
    return {shape: null, reason: `axes: legs not perpendicular (${Math.round(Math.abs(deg(diff)))}°)`};
  }
  const turn = diff > 0 ? Math.PI / 2 : -Math.PI / 2;
  let frame = t0 + (diff - turn) / 2; // leg 0 direction, leg 1 at frame + turn
  const tilt = deg(frame) - Math.round(deg(frame) / 90) * 90;
  if (Math.abs(tilt) <= snapDegrees) {
    frame -= (tilt * Math.PI) / 180;
  }
  const along = (a: number, len: number) => {
    // Exact zeros on the page axes, so that upright axes are exactly upright.
    const cs = Math.abs(Math.cos(a)) < 1e-9 ? 0 : Math.cos(a);
    const sn = Math.abs(Math.sin(a)) < 1e-9 ? 0 : Math.sin(a);
    return {x: o.x + len * cs, y: o.y + len * sn};
  };
  const end0 = along(frame, legs[0].len);
  const end1 = along(frame + turn, legs[1].len);
  // x axis: the leg closer to horizontal.
  const flat = (p: P) => Math.abs(p.x - o.x) >= Math.abs(p.y - o.y);
  const [xEnd, yEnd] = flat(end0) && !flat(end1) ? [end0, end1] : flat(end1) ? [end1, end0] : [end0, end1];
  return {shape: {kind: 'axes', origin: o, xEnd, yEnd}, reason: 'axes'};
}

/**
 * One axis as a single polyline: from the origin to the end, with a tick every
 * `spacing` px (out and back across the axis), ending before the arrow head.
 */
export function axisPoints(origin: P, end: P, spacing: number, tick: number, headRoom: number): P[] {
  const len = dist(origin, end);
  const u = {x: (end.x - origin.x) / len, y: (end.y - origin.y) / len};
  const n = {x: -u.y, y: u.x};
  const at = (d: number, off = 0) => ({x: origin.x + d * u.x + off * n.x, y: origin.y + d * u.y + off * n.y});
  const pts = [origin];
  for (let d = spacing; d <= len - headRoom - spacing / 2; d += spacing) {
    pts.push(at(d), at(d, tick), at(d, -tick), at(d));
  }
  pts.push(end);
  return pts;
}
