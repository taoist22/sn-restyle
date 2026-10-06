import {recognizeAxes} from './vendor/supernote-snap/axes';
import {resample as snapResample, fitCircle, fitRect, recognize as snapRecognize, recognizeArrow, snapDirection, arrowPoints} from './vendor/supernote-snap/recognize';
/** Pure, lasso-driven geometry fitting. No SDK objects or pen event listeners. */
export type Point = {x: number; y: number};
export type ShapeKind = 'line' | 'rectangle' | 'square' | 'circle' | 'arrow' | 'doubleArrow' | 'triangle' | 'diamond' | 'axes';
export type ShapeChoice = 'keep' | 'auto' | ShapeKind;
export type StrokePath = {id: string; points: Point[]};
export type ShapeFit = {kind: ShapeKind; points: Point[]; center?: Point; radius?: number; axes?: {origin: Point; xEnd: Point; yEnd: Point}; score: number; styleSourceId: string};
export const SHAPE_CHOICES: {value: ShapeChoice; label: string}[] = [
  {value: 'keep', label: 'Keep drawing'}, {value: 'auto', label: 'Auto'},
  {value: 'line', label: 'Line'}, {value: 'rectangle', label: 'Rectangle'},
  {value: 'square', label: 'Square'}, {value: 'circle', label: 'Circle'},
  {value: 'arrow', label: 'Arrow'}, {value: 'doubleArrow', label: 'Double arrow'},
  {value: 'axes', label: 'Axes'}, {value: 'triangle', label: 'Triangle'}, {value: 'diamond', label: 'Diamond'},
];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const minus = (a: Point, b: Point): Point => ({x: a.x - b.x, y: a.y - b.y});
const length = (p: Point[]) => p.slice(1).reduce((s, q, i) => s + distance(q, p[i]), 0);
export function resample(points: Point[], count = 64): Point[] {
  const p = points.filter((q, i) => !i || distance(q, points[i - 1]) > 0.001);
  if (p.length < 2) {return p;}
  const total = length(p);
  const out: Point[] = [p[0]];
  let segment = 1, travelled = 0;
  for (let i = 1; i < count - 1; i++) {
    const target = total * i / (count - 1);
    while (segment < p.length - 1 && travelled + distance(p[segment - 1], p[segment]) < target) {
      travelled += distance(p[segment - 1], p[segment]); segment++;
    }
    const a = p[segment - 1], b = p[segment];
    const f = (target - travelled) / distance(a, b);
    out.push({x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y)});
  }
  out.push(p[p.length - 1]); return out;
}
function lineFit(points: Point[]) {
  const c = {x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length};
  let xx = 0, yy = 0, xy = 0;
  for (const p of points) {const q = minus(p, c); xx += q.x * q.x; yy += q.y * q.y; xy += q.x * q.y;}
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const u = {x: Math.cos(angle), y: Math.sin(angle)};
  const t = points.map(p => dot(minus(p, c), u));
  const lo = Math.min(...t), hi = Math.max(...t), span = hi - lo;
  const a = {x: c.x + lo * u.x, y: c.y + lo * u.y}, b = {x: c.x + hi * u.x, y: c.y + hi * u.y};
  const err = Math.sqrt(points.reduce((s, p) => s + (minus(p, c).x * u.y - minus(p, c).y * u.x) ** 2, 0) / points.length) / Math.max(1, span);
  return {a, b, span, err};
}
function snapLine(a: Point, b: Point): [Point, Point] {
  const d = minus(b, a), tolerance = Math.sin(6 * Math.PI / 180) * distance(a, b);
  if (Math.abs(d.y) < tolerance) {return [a, {x: b.x, y: a.y}];}
  if (Math.abs(d.x) < tolerance) {return [a, {x: a.x, y: b.y}];}
  return [a, b];
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const v = minus(b, a), q = minus(p, a);
  const f = Math.max(0, Math.min(1, dot(q, v) / Math.max(0.001, dot(v, v))));
  return distance(p, {x: a.x + f * v.x, y: a.y + f * v.y});
}
function contour(paths: StrokePath[], gap: number): Point[] | null {
  let out = [...paths[0].points]; const remaining = paths.slice(1);
  while (remaining.length) {
    const matches = remaining.flatMap((s, i) => [
      {i, reverse: false, d: distance(out[out.length - 1], s.points[0])},
      {i, reverse: true, d: distance(out[out.length - 1], s.points[s.points.length - 1])},
    ]).sort((a, b) => a.d - b.d);
    const best = matches[0]; if (best.d > gap) {return null;}
    const next = remaining.splice(best.i, 1)[0].points;
    out.push(...(best.reverse ? [...next].reverse() : next));
  }
  if (distance(out[0], out[out.length - 1]) > gap) {return null;}
  out.push(out[0]); return out;
}
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (p: Point[]) => {const out: Point[] = []; for (const q of p) {while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) {out.pop();} out.push(q);} return out;};
  const a = half(sorted), b = half([...sorted].reverse()); return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function polygonVertices(points: Point[], sides: number): Point[] {
  const out = hull(points);
  while (out.length > sides) {
    let index = 0, least = Infinity;
    out.forEach((p, i) => {const err = segmentDistance(p, out[(i + out.length - 1) % out.length], out[(i + 1) % out.length]); if (err < least) {least = err; index = i;}});
    out.splice(index, 1);
  }
  return out;
}
function buildArrow(tail: Point, tip: Point, source: string, double = false): ShapeFit {
  const head = Math.min(distance(tail, tip) * 0.28, 32);
  const points = arrowPoints(tail, tip, head);
  if (double) {points.push(tail, ...arrowPoints(tip, tail, head).slice(1));}
  return {kind: double ? 'doubleArrow' : 'arrow', points, score: 1, styleSourceId: source};
}
function snapArrow(paths: StrokePath[], explicit: boolean, double: boolean): ShapeFit | null {
  if (paths.length === 1 && !double) {
    const path = snapResample(paths[0].points, 128);
    for (const points of [path, [...path].reverse()]) {
      const found = recognizeArrow(points, 8, 1.4, 6).shape;
      if (found?.kind === 'arrow') {return buildArrow(found.tail, found.tip, paths[0].id);}
    }
    if (!explicit) {return null;}
    // A requested arrow needs measurements, not an Auto classification pass.
    const tail = path[0];
    const tip = path.reduce((best, q) => distance(tail, q) > distance(tail, best) ? q : best, tail);
    return buildArrow(tail, snapDirection(tail, tip, 6), paths[0].id);
  }
  // Snap expects shaft followed by head. Adapt selected strokes into that order,
  // returning to the tip between arms; do not concatenate arbitrary stroke order.
  const ranked = [...paths].map(path => ({path, fit: lineFit(path.points)}))
    .sort((a, b) => b.fit.span / (1 + 8 * b.fit.err) - a.fit.span / (1 + 8 * a.fit.err));
  const {path: shaft, fit} = ranked[0];
  if (fit.span < 8 || fit.err > (explicit ? 0.2 : 0.09)) {return null;}
  const rest = paths.filter(path => path.id !== shaft.id);
  const eligible = (tip: Point, path: StrokePath) =>
    Math.min(...path.points.map(q => distance(q, tip))) <= fit.span * 0.3 &&
    Math.max(...path.points.map(q => distance(q, tip))) <= fit.span * 0.8;
  if (rest.some(path => !eligible(fit.a, path) && !eligible(fit.b, path))) {return null;}
  const attempts = [fit.a, fit.b].map(tip => {
    const tail = tip === fit.a ? fit.b : fit.a;
    const heads = rest.filter(path => eligible(tip, path));
    const raw = distance(shaft.points[0], tail) < distance(shaft.points[shaft.points.length - 1], tail) ? shaft.points : [...shaft.points].reverse();
    const combined = [...raw, tip];
    for (const head of heads) {
      const points = head.points;
      const ordered = distance(points[0], tip) <= distance(points[points.length - 1], tip) ? points : [...points].reverse();
      combined.push(...ordered, ...ordered.slice().reverse(), tip);
    }
    const found = recognizeArrow(snapResample(combined, 128), 8, 1.4, 6).shape;
    const headDistance = heads.reduce((sum, head) => sum + Math.min(...head.points.map(q => distance(q, tip))), 0);
    return {tip, tail, heads, found, headDistance};
  });
  if (!explicit) {
    const found = attempts.filter(attempt => attempt.found?.kind === 'arrow');
    if (found.length !== (double ? 2 : 1)) {return null;}
    const selected = found[0];
    if (!double && selected.heads.length !== rest.length) {return null;}
    return buildArrow(selected.tail, snapDirection(selected.tail, selected.tip, 6), shaft.id, double);
  }
  const selected = attempts.sort((a, b) => b.heads.length - a.heads.length || a.headDistance - b.headDistance)[0];
  if (!double && selected.heads.length !== rest.length) {return null;}
  return buildArrow(selected.tail, snapDirection(selected.tail, selected.tip, 6), shaft.id, double);
}
function axesFit(paths: StrokePath[], source: string): ShapeFit | null {
  if (paths.length < 1 || paths.length > 2) {return null;}
  const attempts: Point[][] = [];
  if (paths.length === 1) {attempts.push(paths[0].points);}
  else {
    for (const a of [paths[0].points, [...paths[0].points].reverse()]) {
      for (const b of [paths[1].points, [...paths[1].points].reverse()]) {
        const span = Math.min(length(a), length(b));
        if (distance(a[a.length - 1], b[0]) <= Math.max(4, span * 0.1)) {attempts.push([...a, ...b]);}
      }
    }
  }
  for (const attempt of attempts) {
    const found = recognizeAxes(snapResample(attempt, 128), 8, 1.4, 8).shape;
    if (found) {return {kind: 'axes', axes: found, points: [found.origin, found.xEnd, found.yEnd], score: 1, styleSourceId: source};}
  }
  return null;
}
export function recognizeSelection(input: StrokePath[], choice: Exclude<ShapeChoice, 'keep'>): ShapeFit {
  if (!input.length || input.length > 20 || input.reduce((n, s) => n + s.points.length, 0) > 10000) {throw new Error('Select one drawing with at most 20 strokes and 10,000 points.');}
  if (input.some(s => s.points.length < 2 || s.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) {throw new Error('The selection contains an invalid or empty stroke.');}
  const paths = input.map(path => ({...path, points: snapResample(path.points, 128)}));
  const all = paths.flatMap(path => path.points);
  const extent = Math.hypot(Math.max(...all.map(q => q.x)) - Math.min(...all.map(q => q.x)), Math.max(...all.map(q => q.y)) - Math.min(...all.map(q => q.y)));
  if (extent < 8) {throw new Error('Select a larger drawing.');}
  const source = [...paths].sort((a, b) => length(b.points) - length(a.points))[0].id;
  if (choice === 'axes' || choice === 'auto') {
    const axes = axesFit(paths, source);
    if (axes) {return axes;}
    if (choice === 'axes') {throw new Error('Snap Axes: select an L or two connected perpendicular strokes.');}
  }
  if (choice === 'arrow' || choice === 'doubleArrow') {
    const arrow = snapArrow(paths, true, choice === 'doubleArrow');
    if (!arrow) {throw new Error(`Snap ${choice}: selected strokes do not form one connected drawing (${paths.length} strokes). Nothing was replaced.`);}
    return arrow;
  }
  if (choice === 'auto') {
    const arrow = snapArrow(paths, false, false), double = snapArrow(paths, false, true);
    if (double) {return double;} if (arrow) {return arrow;}
  }
  if (choice === 'line' || choice === 'auto') {
    const line = lineFit(all);
    const intervals = paths.map(path => {
      const ts = path.points.map(q => dot(minus(q, line.a), minus(line.b, line.a)) / Math.max(1, line.span));
      return [Math.min(...ts), Math.max(...ts)];
    }).sort((a, b) => a[0] - b[0]);
    let end = intervals[0][1], connected = true;
    for (const interval of intervals.slice(1)) {if (interval[0] - end > extent * 0.15) {connected = false;} end = Math.max(end, interval[1]);}
    if (connected && (choice === 'line' || line.err < 0.025)) {
      return {kind: 'line', points: snapLine(line.a, line.b), score: 1, styleSourceId: source};
    }
    if (choice === 'line') {throw new Error('Snap Line: selected fragments are disconnected.');}
  }
  const loop = contour(paths, extent * 0.25) ?? contour([{...paths[0], points: [...paths[0].points].reverse()}, ...paths.slice(1)], extent * 0.25);
  if (choice === 'auto') {
    if (loop) {
      const found = snapRecognize(loop, {tolerance: 5, minSize: 8, rect: true, circle: true, arrow: false, arrowSnapDegrees: 6, rectSnapDegrees: 12, axes: false, brace: false, sqrt: false});
      if (found.shape?.kind === 'rect') {return {kind: 'rectangle', points: [...found.shape.corners, found.shape.corners[0]], score: 1, styleSourceId: source};}
      if (found.shape?.kind === 'circle') {return {kind: 'circle', points: [], center: {x: found.shape.cx, y: found.shape.cy}, radius: found.shape.r, score: 1, styleSourceId: source};}
      throw new Error(`Snap Auto: ${found.reason}. Choose an explicit shape to fit it.`);
    }
    throw new Error(`Snap Auto: no arrow head or closed outline in ${paths.length} strokes. Choose an explicit shape to fit it.`);
  }
  const points = snapResample(loop ?? all, 128);
  if (choice === 'circle') {
    const circle = fitCircle(points);
    if (!Number.isFinite(circle.r) || circle.r < 2) {throw new Error('Snap Circle: cannot determine a usable radius.');}
    return {kind: 'circle', points: [], center: {x: circle.cx, y: circle.cy}, radius: circle.r, score: 1, styleSourceId: source};
  }
  if (choice === 'rectangle' || choice === 'square') {
    const rect = fitRect(points);
    let corners: Point[] = rect.corners;
    if (Math.min(rect.w, rect.h) < 3) {throw new Error('Snap rectangle: select an outline with width and height.');}
    if (choice === 'square') {
      const center = {x: corners.reduce((sum, q) => sum + q.x, 0) / 4, y: corners.reduce((sum, q) => sum + q.y, 0) / 4};
      const u = minus(corners[1], corners[0]), v = minus(corners[3], corners[0]), side = (rect.w + rect.h) / 2;
      corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({x: center.x + side / 2 * (x * u.x / rect.w + y * v.x / rect.h), y: center.y + side / 2 * (x * u.y / rect.w + y * v.y / rect.h)}));
    }
    return {kind: choice, points: [...corners, corners[0]], score: 1, styleSourceId: source};
  }
  const vertices = polygonVertices(points, choice === 'triangle' ? 3 : 4);
  if (vertices.length < (choice === 'triangle' ? 3 : 4)) {throw new Error(`Cannot fit ${choice}: select an outline with area.`);}
  return {kind: choice, points: [...vertices, vertices[0]], score: 1, styleSourceId: source};
}
