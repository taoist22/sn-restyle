/**
 * Restyle's own single-stroke shape fitting. Pure logic: no SDK, no Snap code.
 *
 * Open strokes are read as straight sub-paths: the shaft is the longest near-straight
 * part of the stroke, and whatever is drawn before or after it is judged on its own
 * (head, second leg, or nothing). The arrow tip is where the shaft ends, so a second
 * pass over the tip cannot move it. Closed strokes are fitted as circle and rectangle
 * and the better fit wins.
 */
export type P = {x: number; y: number};
export type Shape =
  | {kind: 'rect'; corners: [P, P, P, P]}
  | {kind: 'circle'; cx: number; cy: number; r: number}
  | {kind: 'arrow'; tail: P; tip: P}
  | {kind: 'axes'; origin: P; xEnd: P; yEnd: P}
  | {kind: 'line'; a: P; b: P}
  | {kind: 'poly'; name: PolyName; points: P[]}
  | {kind: 'elbow'; start: P; corner: P; tip: P};
export type PolyName = 'triangle' | 'diamond' | 'parallelogram' | 'roundedRect';
export type FitKind = 'rectangle' | 'circle' | 'arrow' | 'axes' | 'line' | 'elbow' | PolyName;
export type FitChoice = 'auto' | FitKind;
export type Verdict = {shape: Shape | null; notes: string[]};

/** Axis snapping and size limits. Sizes are pixels at the device's native resolution. */
const SNAP_DEGREES = 8;
const MIN_EXTENT = 10;
const MIN_AUTO_EXTENT = 20;

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (n: number) => `${Math.round(n * 100)}%`;

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {return dist(p, a);}
  const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, {x: a.x + f * dx, y: a.y + f * dy});
}
const pathLength = (p: P[]) => p.slice(1).reduce((s, q, i) => s + dist(q, p[i]), 0);
const extentOf = (p: P[]) => {
  const xs = p.map(q => q.x), ys = p.map(q => q.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

/** Drop repeated points, then space the rest evenly along the path. */
export function cleanStroke(raw: P[]): P[] {
  const p = raw.filter((q, i) => i === 0 || dist(q, raw[i - 1]) >= 0.5);
  if (p.length < 2) {return p;}
  const total = pathLength(p);
  const count = Math.max(24, Math.min(160, Math.round(total / 2)));
  const out: P[] = [p[0]];
  let seg = 1, travelled = 0;
  for (let k = 1; k < count - 1; k++) {
    const target = total * k / (count - 1);
    while (seg < p.length - 1 && travelled + dist(p[seg - 1], p[seg]) < target) {travelled += dist(p[seg - 1], p[seg]); seg++;}
    const a = p[seg - 1], b = p[seg], f = (target - travelled) / Math.max(1e-9, dist(a, b));
    out.push({x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y)});
  }
  out.push(p[p.length - 1]);
  return out;
}

type Straight = {i: number; j: number; chord: number; dev: number};
/**
 * The longest near-straight stretch p[i..j]: chord length minus a penalty for sideways
 * bulge, so a stretch that swallows the start of a head loses to the clean shaft.
 */
function bestStraight(p: P[], from: number, to: number, maxBulge: number, minChord = 0): Straight | null {
  const score = (i: number, j: number): Straight | null => {
    const chord = dist(p[i], p[j]);
    if (j - i < 3 || chord < Math.max(1, minChord)) {return null;}
    let dev = 0;
    for (let k = i + 1; k < j; k++) {dev = Math.max(dev, segDist(p[k], p[i], p[j]));}
    return dev > maxBulge * chord ? null : {i, j, chord, dev};
  };
  const value = (s: Straight) => s.chord - 4 * s.dev;
  // Coarse pass on a thinned grid, then exact search around the winner.
  const step = Math.max(1, Math.round((to - from) / 50));
  let best: Straight | null = null;
  for (let i = from; i < to; i += step) {
    for (let j = i + 3; j <= to; j += step) {
      const s = score(i, j);
      if (s && (!best || value(s) > value(best))) {best = s;}
    }
  }
  if (!best || step === 1) {return best;}
  const coarse = best;
  for (let i = Math.max(from, coarse.i - step); i <= coarse.i + step; i++) {
    for (let j = Math.min(to, coarse.j + step); j >= coarse.j - step; j--) {
      const s = score(i, j);
      if (s && value(s) > value(best)) {best = s;}
    }
  }
  return best;
}

/** Turns a direction within SNAP_DEGREES of horizontal/vertical into exactly that. */
function snapEnd(from: P, to: P): P {
  const dx = to.x - from.x, dy = to.y - from.y;
  const deg = Math.atan2(dy, dx) * 180 / Math.PI, off = Math.abs(deg - Math.round(deg / 90) * 90);
  if (off > SNAP_DEGREES) {return to;}
  return Math.abs(dx) >= Math.abs(dy) ? {x: to.x, y: from.y} : {x: from.x, y: to.y};
}

type Result = {shape: Shape | null; why: string};

function fitArrow(p: P[], force: boolean): Result {
  const n = p.length;
  const s = bestStraight(p, 0, n - 1, 0.10);
  if (!s) {
    if (!force) {return {shape: null, why: 'arrow: no straight shaft'};}
    const tail = p[0], tip = p.reduce((b, q) => dist(q, tail) > dist(b, tail) ? q : b, tail);
    return {shape: {kind: 'arrow', tail, tip: snapEnd(tail, tip)}, why: 'arrow: forced'};
  }
  const before = p.slice(0, s.i), after = p.slice(s.j + 1);
  const headAfter = pathLength(after) >= pathLength(before);
  const tip = headAfter ? p[s.j] : p[s.i], tail = headAfter ? p[s.i] : p[s.j];
  const head = headAfter ? after : before, other = headAfter ? before : after;
  const shape: Shape = {kind: 'arrow', tail, tip: snapEnd(tail, tip)};
  const fail = (why: string): Result => force ? {shape, why: `arrow: forced (${why})`} : {shape: null, why: `arrow: ${why}`};
  if (head.length < 2) {return fail('no head');}
  const hook = other.length ? Math.max(...other.map(q => dist(q, tail))) : 0;
  if (hook > 0.12 * s.chord) {return fail('extra stroke before the shaft');}
  const u = {x: (tip.x - tail.x) / s.chord, y: (tip.y - tail.y) / s.chord};
  const lateral = (q: P) => (q.x - tip.x) * -u.y + (q.y - tip.y) * u.x;
  const along = (q: P) => (q.x - tip.x) * u.x + (q.y - tip.y) * u.y;
  const span = Math.max(...head.map(q => dist(q, tip)));
  const left = Math.max(...head.map(lateral)), right = -Math.min(...head.map(lateral));
  const back = -Math.min(...head.map(along));
  if (span < Math.max(8, 0.07 * s.chord)) {return fail(`head too small (${Math.round(span)} px)`);}
  if (span > 0.65 * s.chord) {return fail('head too big for the shaft');}
  if (back < 0.2 * span) {return fail('head does not point back');}
  if (Math.min(left, right) < 0.2 * span) {return fail(`head on one side (${Math.round(Math.max(0, left))}/${Math.round(Math.max(0, right))} px)`);}
  return {shape, why: 'arrow'};
}

function fitLine(p: P[], force: boolean): Result {
  const arc = pathLength(p);
  const s = bestStraight(p, 0, p.length - 1, 0.06);
  if (s && s.chord / arc >= 0.88) {
    return {shape: {kind: 'line', a: p[s.i], b: snapEnd(p[s.i], p[s.j])}, why: 'line'};
  }
  if (!force) {return {shape: null, why: `line: not straight (${s ? `covers ${pct(s.chord / arc)}` : 'no straight part'})`};}
  // Forced: principal axis through the points.
  const c = {x: p.reduce((t, q) => t + q.x, 0) / p.length, y: p.reduce((t, q) => t + q.y, 0) / p.length};
  let xx = 0, yy = 0, xy = 0;
  for (const q of p) {xx += (q.x - c.x) ** 2; yy += (q.y - c.y) ** 2; xy += (q.x - c.x) * (q.y - c.y);}
  const angle = Math.atan2(2 * xy, xx - yy) / 2, u = {x: Math.cos(angle), y: Math.sin(angle)};
  const t = p.map(q => (q.x - c.x) * u.x + (q.y - c.y) * u.y);
  const a = {x: c.x + Math.min(...t) * u.x, y: c.y + Math.min(...t) * u.y}, b = {x: c.x + Math.max(...t) * u.x, y: c.y + Math.max(...t) * u.y};
  return {shape: {kind: 'line', a, b: snapEnd(a, b)}, why: 'line: forced'};
}

function fitAxes(p: P[], force: boolean): Result {
  const n = p.length;
  const s = bestStraight(p, 0, n - 1, 0.10);
  const fail = (why: string): Result => ({shape: null, why: `axes: ${why}`});
  const build = (corner: P, far1: P, far2: P): Shape => {
    const lean = (q: P) => Math.abs(q.x - corner.x) / Math.max(1e-9, Math.abs(q.x - corner.x) + Math.abs(q.y - corner.y));
    const [x, y] = lean(far1) >= lean(far2) ? [far1, far2] : [far2, far1];
    return {kind: 'axes', origin: corner, xEnd: snapEnd(corner, x), yEnd: snapEnd(corner, y)};
  };
  if (!s) {return force ? {shape: build(p[Math.floor(n / 2)], p[0], p[n - 1]), why: 'axes: forced'} : fail('no straight leg');}
  const legs: {corner: P; far1: P; far2: P; len: number; gap: number}[] = [];
  if (s.j < n - 4) {
    const after = bestStraight(p, s.j, n - 1, 0.10, 0.2 * s.chord);
    if (after) {legs.push({corner: p[s.j], far1: p[s.i], far2: p[after.j], len: after.chord, gap: dist(p[after.i], p[s.j])});}
  }
  if (s.i > 3) {
    const prior = bestStraight(p, 0, s.i, 0.10, 0.2 * s.chord);
    if (prior) {legs.push({corner: p[s.i], far1: p[s.j], far2: p[prior.i], len: prior.chord, gap: dist(p[prior.j], p[s.i])});}
  }
  legs.sort((a, b) => b.len - a.len);
  const leg = legs[0];
  if (!leg) {return force ? {shape: build(p.reduce((b, q) => segDist(q, p[0], p[n - 1]) > segDist(b, p[0], p[n - 1]) ? q : b, p[1]), p[0], p[n - 1]), why: 'axes: forced'} : fail('no second leg');}
  const u1 = {x: leg.far1.x - leg.corner.x, y: leg.far1.y - leg.corner.y}, u2 = {x: leg.far2.x - leg.corner.x, y: leg.far2.y - leg.corner.y};
  const cos = (u1.x * u2.x + u1.y * u2.y) / Math.max(1e-9, Math.hypot(u1.x, u1.y) * Math.hypot(u2.x, u2.y));
  const shape = build(leg.corner, leg.far1, leg.far2);
  const bad = leg.len < 0.3 * s.chord ? 'second leg too short' : leg.gap > 0.15 * s.chord ? 'legs do not meet' : Math.abs(cos) > 0.4 ? `legs not square (${Math.round(Math.acos(cos) * 180 / Math.PI)}°)` : null;
  if (bad) {return force ? {shape, why: `axes: forced (${bad})`} : fail(bad);}
  return {shape, why: 'axes'};
}


/** Two straight legs at a right angle, the second ending at the tip; any drawn head is ignored (one is generated). */
function fitElbow(p: P[], force: boolean): Result {
  const n = p.length;
  const s = bestStraight(p, 0, n - 1, 0.10);
  const build = (start: P, corner: P, tip: P): Shape => ({kind: 'elbow', start: snapEnd(corner, start), corner, tip: snapEnd(corner, tip)});
  const fail = (why: string): Result => ({shape: null, why: `elbow: ${why}`});
  const farthest = () => p.reduce((b, q) => segDist(q, p[0], p[n - 1]) > segDist(b, p[0], p[n - 1]) ? q : b, p[1]);
  if (!s) {return force ? {shape: build(p[0], farthest(), p[n - 1]), why: 'elbow: forced'} : fail('no straight leg');}
  const options: {start: P; corner: P; tip: P; len: number; gap: number}[] = [];
  if (s.j < n - 4) {
    const after = bestStraight(p, s.j, n - 1, 0.10, 0.2 * s.chord);
    if (after) {options.push({start: p[s.i], corner: p[s.j], tip: p[after.j], len: after.chord, gap: dist(p[after.i], p[s.j])});}
  }
  if (s.i > 3) {
    const prior = bestStraight(p, 0, s.i, 0.10, 0.2 * s.chord);
    if (prior) {options.push({start: p[prior.i], corner: p[s.i], tip: p[s.j], len: prior.chord, gap: dist(p[prior.j], p[s.i])});}
  }
  options.sort((a, b) => b.len - a.len);
  const o = options[0];
  if (!o) {return force ? {shape: build(p[0], farthest(), p[n - 1]), why: 'elbow: forced'} : fail('no second leg');}
  const u = {x: o.start.x - o.corner.x, y: o.start.y - o.corner.y}, v = {x: o.tip.x - o.corner.x, y: o.tip.y - o.corner.y};
  const cos = (u.x * v.x + u.y * v.y) / Math.max(1e-9, Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  const shape = build(o.start, o.corner, o.tip);
  const bad = o.len < 0.3 * s.chord ? 'second leg too short' : o.gap > 0.15 * s.chord ? 'legs do not meet' : Math.abs(cos) > 0.4 ? `legs not square (${Math.round(Math.acos(cos) * 180 / Math.PI)}°)` : null;
  if (bad) {return force ? {shape, why: `elbow: forced (${bad})`} : fail(bad);}
  return {shape, why: 'elbow'};
}

function fitCircleTo(pts: P[]): {cx: number; cy: number; r: number; err: number} | null {
  const n = pts.length;
  const mx = pts.reduce((t, q) => t + q.x, 0) / n, my = pts.reduce((t, q) => t + q.y, 0) / n;
  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const q of pts) {
    const u = q.x - mx, v = q.y - my;
    Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u ** 3; Svvv += v ** 3; Suvv += u * v * v; Svuu += v * u * u;
  }
  const det = 2 * (Suu * Svv - Suv * Suv);
  if (Math.abs(det) < 1e-9) {return null;}
  const uc = (Svv * (Suuu + Suvv) - Suv * (Svvv + Svuu)) / det, vc = (Suu * (Svvv + Svuu) - Suv * (Suuu + Suvv)) / det;
  const cx = mx + uc, cy = my + vc, r = Math.sqrt(Math.max(0, uc * uc + vc * vc + (Suu + Svv) / n));
  if (!Number.isFinite(r) || r < 2) {return null;}
  const err = Math.sqrt(pts.reduce((t, q) => t + (Math.hypot(q.x - cx, q.y - cy) - r) ** 2, 0) / n) / r;
  return {cx, cy, r, err};
}

function fitRectTo(pts: P[]): {corners: [P, P, P, P]; w: number; h: number; err: number; cornerGap: number} {
  const frame = (deg: number) => {
    const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    const r = pts.map(q => ({x: q.x * c + q.y * s, y: -q.x * s + q.y * c}));
    const x0 = Math.min(...r.map(q => q.x)), x1 = Math.max(...r.map(q => q.x)), y0 = Math.min(...r.map(q => q.y)), y1 = Math.max(...r.map(q => q.y));
    return {t, c, s, r, x0, x1, y0, y1, area: (x1 - x0) * (y1 - y0)};
  };
  let best = frame(0);
  for (let d = 1; d < 90; d++) {const f = frame(d); if (f.area < best.area) {best = f;}}
  const deg0 = Math.round(best.t * 180 / Math.PI);
  for (let d = deg0 - 1; d <= deg0 + 1; d += 0.25) {const f = frame(d); if (f.area < best.area) {best = f;}}
  let f = best;
  const tilt = ((f.t * 180 / Math.PI + 45) % 90 + 90) % 90 - 45;
  if (Math.abs(tilt) < SNAP_DEGREES) {f = frame(0);}
  const {c, s, x0, x1, y0, y1} = f;
  const back = (x: number, y: number): P => ({x: x * c - y * s, y: x * s + y * c});
  const w = x1 - x0, h = y1 - y0;
  const err = Math.sqrt(f.r.reduce((t, q) => t + Math.min(q.x - x0, x1 - q.x, q.y - y0, y1 - q.y) ** 2, 0) / f.r.length) / Math.max(1, Math.sqrt(w * h) / 2); // same scale as the circle: error relative to the half-size
  const corners: [P, P, P, P] = [back(x0, y0), back(x1, y0), back(x1, y1), back(x0, y1)];
  // A drawn box passes close to all four corners; a circle or oval stays about 0.2 of a side away.
  const cornerGap = Math.max(...corners.map(corner => Math.min(...pts.map(q => dist(q, corner))))) / Math.max(1, Math.min(w, h));
  return {corners, w, h, err, cornerGap};
}


const cross = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function hull(points: P[]): P[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: P[]) => {const out: P[] = []; for (const q of list) {while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) {out.pop();} out.push(q);} return out;};
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
/** Drop the hull vertex that adds least area, until `count` remain. */
function reduceTo(poly: P[], count: number): P[] {
  const out = [...poly];
  while (out.length > count) {
    let index = 0, least = Infinity;
    out.forEach((q, i) => {const area = Math.abs(cross(out[(i + out.length - 1) % out.length], q, out[(i + 1) % out.length])); if (area < least) {least = area; index = i;}});
    out.splice(index, 1);
  }
  return out;
}
const areaOf = (poly: P[]) => Math.abs(poly.reduce((t, q, i) => t + (q.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * q.y), 0)) / 2;
/** How well a polygon matches a loop: boundary error relative to half its size, and how far the stroke stays from its corners. */
function polyScore(loop: P[], poly: P[]): {err: number; cornerGap: number} {
  const size = Math.max(1, Math.sqrt(areaOf(poly)));
  const edge = (q: P) => Math.min(...poly.map((a, i) => segDist(q, a, poly[(i + 1) % poly.length])));
  const err = Math.sqrt(loop.reduce((t, q) => t + edge(q) ** 2, 0) / loop.length) / (size / 2);
  const cornerGap = Math.max(...poly.map(v => Math.min(...loop.map(q => dist(q, v))))) / size;
  return {err, cornerGap};
}
const minAngle = (poly: P[]) => Math.min(...poly.map((q, i) => {
  const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
  const u = {x: a.x - q.x, y: a.y - q.y}, v = {x: b.x - q.x, y: b.y - q.y};
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / Math.max(1e-9, Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180 / Math.PI;
}));

/** A convex polygon fitted to the loop; `regular` may straighten it. Auto accepts only a good, clearly cornered fit. */
function fitPolygon(loop: P[], name: PolyName, force: boolean): Result {
  const h = hull(loop);
  const need = name === 'triangle' ? 3 : 4;
  if (h.length < need) {return {shape: null, why: `${name}: outline has no area`};}
  let points: P[];
  if (name === 'triangle') {points = reduceTo(h, 3);}
  else if (name === 'diamond') {
    const xs = loop.map(q => q.x), ys = loop.map(q => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    points = [{x: (x0 + x1) / 2, y: y0}, {x: x1, y: (y0 + y1) / 2}, {x: (x0 + x1) / 2, y: y1}, {x: x0, y: (y0 + y1) / 2}];
  } else if (name === 'parallelogram') {
    const four = reduceTo(h, 4).sort((a, b) => a.y - b.y);
    const top = [four[0], four[1]].sort((a, b) => a.x - b.x), bottom = [four[2], four[3]].sort((a, b) => a.x - b.x);
    const yTop = (top[0].y + top[1].y) / 2, yBottom = (bottom[0].y + bottom[1].y) / 2;
    const width = ((top[1].x - top[0].x) + (bottom[1].x - bottom[0].x)) / 2;
    const cTop = (top[0].x + top[1].x) / 2, cBottom = (bottom[0].x + bottom[1].x) / 2;
    points = [{x: cTop - width / 2, y: yTop}, {x: cTop + width / 2, y: yTop}, {x: cBottom + width / 2, y: yBottom}, {x: cBottom - width / 2, y: yBottom}];
  } else {
    const rect = fitRectTo(loop), r = Math.min(rect.w, rect.h) * 0.25;
    const corners = rect.corners;
    points = [];
    corners.forEach((c, i) => {
      const prev = corners[(i + 3) % 4], next = corners[(i + 1) % 4];
      const toward = (o: P): P => {const d = Math.max(1e-9, dist(c, o)); return {x: c.x + (o.x - c.x) / d * r, y: c.y + (o.y - c.y) / d * r};};
      const a = toward(prev), b = toward(next);
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, u = 1 - t;
        points.push({x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y});
      }
    });
  }
  const shape: Shape = {kind: 'poly', name, points};
  const {err, cornerGap} = polyScore(loop, name === 'roundedRect' ? fitRectTo(loop).corners : points);
  const why = `${name} ${pct(err)}, corners ${pct(cornerGap)}`;
  const good = err <= 0.10 && cornerGap <= 0.14 && minAngle(name === 'roundedRect' ? fitRectTo(loop).corners : points) >= 20;
  return good || force ? {shape, why} : {shape: null, why};
}

/** The loop part of a stroke (cuts overshoot past the start), or null if it is not closed. */
function closedLoop(p: P[]): P[] | null {
  const n = p.length, diag = extentOf(p);
  let end = n - 1;
  for (let k = Math.floor(n / 2); k < n; k++) {if (dist(p[k], p[0]) < dist(p[end], p[0])) {end = k;}}
  return dist(p[end], p[0]) <= 0.3 * diag ? p.slice(0, end + 1) : null;
}

function fitClosed(p: P[], choice: 'auto' | 'circle' | 'rectangle', force: boolean): Result {
  const loop = closedLoop(p) ?? (force ? p : null);
  if (!loop) {return {shape: null, why: 'closed: stroke does not return to its start'};}
  const circle = fitCircleTo(loop), rect = fitRectTo(loop);
  const boxy = Math.min(rect.w, rect.h) >= 6 && rect.err <= 0.10 && rect.cornerGap <= 0.13;
  const aspect = Math.max(rect.w, rect.h) / Math.max(1, Math.min(rect.w, rect.h));
  const rectOk = boxy && (!circle || rect.err < circle.err);
  const circleOk = !!circle && circle.err <= 0.16 && aspect <= 1.6 && !rectOk;
  const why = `circle ${circle ? pct(circle.err) : 'n/a'}, rectangle ${pct(rect.err)}, corners ${pct(rect.cornerGap)}, aspect ${aspect.toFixed(2)}`;
  const asCircle = (): Shape => ({kind: 'circle', cx: circle!.cx, cy: circle!.cy, r: circle!.r});
  const asRect = (): Shape => ({kind: 'rect', corners: rect.corners});
  if (choice === 'circle') {return circle && (circleOk || force) ? {shape: asCircle(), why} : {shape: null, why: `circle: ${why}`};}
  if (choice === 'rectangle') {return boxy || (force && Math.min(rect.w, rect.h) >= 3) ? {shape: asRect(), why} : {shape: null, why: `rectangle: ${why}`};}
  if (circleOk) {return {shape: asCircle(), why};}
  if (rectOk) {return {shape: asRect(), why};}
  return {shape: null, why: `closed shape fits neither (${why})`};
}

/**
 * Fit one stroke. 'auto' takes whichever shape fits; a named shape only tries that one.
 * With force, a named shape is fitted even when it fits poorly (a button press is intent).
 */
export function fitShape(raw: P[], choice: FitChoice, force = false): Verdict {
  const p = cleanStroke(raw);
  if (p.length < 8 || raw.some(q => !Number.isFinite(q.x) || !Number.isFinite(q.y))) {return {shape: null, notes: ['stroke too short or invalid']};}
  const extent = extentOf(p);
  if (extent < MIN_EXTENT || (choice === 'auto' && extent < MIN_AUTO_EXTENT)) {return {shape: null, notes: [`too small (${Math.round(extent)} px)`]};}
  const notes: string[] = [];
  const take = (r: Result): Shape | null => {notes.push(r.why); return r.shape;};
  if (choice === 'auto') {
    const loop = closedLoop(p);
    if (loop) {
      const basic = take(fitClosed(p, 'auto', false));
      if (basic) {return {shape: basic, notes};}
      // Flowchart shapes: only a clearly cornered, good fit is taken in Auto.
      for (const name of ['triangle', 'diamond'] as PolyName[]) {
        const shape = take(fitPolygon(loop, name, false));
        if (shape) {return {shape, notes};}
      }
      return {shape: null, notes};
    }
    for (const fit of [fitArrow, fitAxes, fitLine]) {
      const shape = take(fit(p, false));
      if (shape) {return {shape, notes};}
    }
    return {shape: null, notes};
  }
  if (choice === 'circle' || choice === 'rectangle') {return {shape: take(fitClosed(p, choice, force)), notes};}
  if (choice === 'triangle' || choice === 'diamond' || choice === 'parallelogram' || choice === 'roundedRect') {
    const loop = closedLoop(p) ?? (force ? p : null);
    return {shape: loop ? take(fitPolygon(loop, choice, force)) : (notes.push(`${choice}: stroke does not return to its start`), null), notes};
  }
  const fit = choice === 'arrow' ? fitArrow : choice === 'axes' ? fitAxes : choice === 'elbow' ? fitElbow : fitLine;
  return {shape: take(fit(p, force)), notes};
}
