// Verbatim copy of CharlesCheval/supernote-palette src/patterns.ts (MIT, see LICENSE in this directory), fetched 2026-10-05.
/**
 * Dashes, hatching and fills computed from an element's outline, in page pixels.
 * Pure logic, unit-tested. Supernote has no dashed or filled style, so each
 * result is a set of polylines inserted as plain geometries.
 */

export type P = {x: number; y: number};

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: P, b: P, t: number): P => ({
  x: a.x + t * (b.x - a.x),
  y: a.y + t * (b.y - a.y),
});

export type DashStyle = 'dashed' | 'dotted' | 'dashdot' | 'long';

export const DASH_STYLES: DashStyle[] = ['dashed', 'long', 'dotted', 'dashdot'];

/**
 * On / off lengths (px) for a line `w` px wide: [on, off, on, off, …].
 * A dot is a 1 px dash: the line width makes it round.
 */
export function dashPattern(style: DashStyle, w: number): number[] {
  const u = Math.max(3, w);
  switch (style) {
    case 'dashed':
      return [Math.max(16, 4 * u), Math.max(12, 3 * u)];
    case 'long':
      return [Math.max(36, 9 * u), Math.max(14, 3.5 * u)];
    case 'dotted':
      return [1, Math.max(10, 3 * u)];
    case 'dashdot':
      // Centre line (trait d'axe): long, gap, dot, gap.
      return [
        Math.max(36, 9 * u),
        Math.max(10, 2.5 * u),
        1,
        Math.max(10, 2.5 * u),
      ];
  }
}

/** Cuts a polyline into dashes that follow it, curves included. */
export function dashPolyline(points: P[], pattern: number[]): P[][] {
  const dashes: P[][] = [];
  let k = 0; // pattern index
  let left = pattern[0]; // length left in the current on / off piece
  let current: P[] | null = [points[0]];
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    const b = points[i];
    let seg = dist(a, b);
    while (seg > 0) {
      const step = Math.min(seg, left);
      const p = lerp(a, b, step / seg);
      if (current) {
        current.push(p);
      }
      seg -= step;
      left -= step;
      a = p;
      if (left <= 1e-9) {
        if (current) {
          dashes.push(current);
          current = null;
        } else {
          current = [p];
        }
        k = (k + 1) % pattern.length;
        left = pattern[k];
      }
    }
  }
  if (current && current.length > 1) {
    dashes.push(current);
  }
  return dashes;
}

/**
 * Segments of parallel lines, `spacing` px apart at `angleDeg`, that lie inside
 * the polygon (even-odd rule, so holes and concave shapes work), kept `inset` px
 * away from the outline along each line and at both extremes.
 */
export function hatchSegments(
  polygon: P[],
  angleDeg: number,
  spacing: number,
  inset = 0,
  edgeToEdge = false,
): [P, P][] {
  const a = (angleDeg * Math.PI) / 180;
  const u = {x: Math.cos(a), y: Math.sin(a)}; // along the lines
  const n = {x: -u.y, y: u.x}; // across them
  const across = polygon.map(p => p.x * n.x + p.y * n.y);
  const {min: lo, max: hi} = range(across);
  const out: [P, P][] = [];
  // Hatching: lines centred in the shape. Fill (edge to edge): the first and last
  // lines sit exactly at the inset, the others evenly between, at most `spacing` apart.
  const firstRow = lo + (edgeToEdge ? inset : Math.max(inset, spacing / 2));
  const lastRow = hi - inset;
  const span = lastRow - firstRow;
  const step =
    edgeToEdge && span > 0
      ? span / Math.max(1, Math.ceil(span / spacing))
      : spacing;
  for (let c = firstRow; c <= lastRow + 1e-9; c += step) {
    const hits: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const cp = across[i];
      const cq = across[(i + 1) % polygon.length];
      if ((cp <= c && cq > c) || (cq <= c && cp > c)) {
        const t = (c - cp) / (cq - cp);
        const x = lerp(p, q, t);
        hits.push(x.x * u.x + x.y * u.y);
      }
    }
    hits.sort((x, y) => x - y);
    for (let j = 0; j + 1 < hits.length; j += 2) {
      const from = hits[j] + inset;
      const to = hits[j + 1] - inset;
      if (to - from < 1) {
        continue;
      }
      const at = (s: number): P => ({
        x: s * u.x + c * n.x,
        y: s * u.y + c * n.y,
      });
      out.push([at(from), at(to)]);
    }
  }
  return out;
}

/**
 * Solid fill: horizontal lines `spacing` px apart, closer than the line width so
 * they merge. Consecutive lines with a single segment are chained into one
 * zigzag polyline (few elements); a line crossing the shape more than once
 * (concave part, hole) starts new chains.
 */
export function fillPolylines(polygon: P[], spacing: number, inset = 0): P[][] {
  return chainRows(hatchSegments(polygon, 0, spacing, inset, true));
}

/**
 * Chains horizontal fill segments into zigzag polylines: consecutive rows with a
 * single segment join up; a row with several segments starts new chains.
 */
export function chainRows(segments: [P, P][]): P[][] {
  const rows = new Map<number, [P, P][]>();
  for (const s of segments) {
    const key = Math.round(s[0].y * 1000);
    rows.set(key, [...(rows.get(key) ?? []), s]);
  }
  const chains: P[][] = [];
  let chain: P[] | null = null;
  let flip = false;
  for (const segs of [...rows.keys()]
    .sort((x, y) => x - y)
    .map(k => rows.get(k)!)) {
    if (segs.length !== 1) {
      if (chain) {
        chains.push(chain);
      }
      chain = null;
      chains.push(...segs.map(([p, q]) => [p, q]));
      continue;
    }
    const [p, q] = segs[0];
    const ordered = flip ? [q, p] : [p, q];
    flip = !flip;
    chain = chain ? [...chain, ...ordered] : ordered;
  }
  if (chain) {
    chains.push(chain);
  }
  return chains;
}

/**
 * Outline as a closed polygon, or null when it is too open to fill: the gap
 * between both ends must be under 20% of the outline size.
 */
export function closedOutline(points: P[]): P[] | null {
  if (points.length < 3) {
    return null;
  }
  const xs = range(points.map(p => p.x));
  const ys = range(points.map(p => p.y));
  const size = Math.max(xs.max - xs.min, ys.max - ys.min);
  if (size <= 0 || dist(points[0], points[points.length - 1]) > 0.2 * size) {
    return null;
  }
  return points;
}

/** Points along an ellipse (geometry in pixels, angle in degrees). */
export function ellipsePoints(
  c: P,
  rx: number,
  ry: number,
  angleDeg: number,
  n = 96,
): P[] {
  const a = (angleDeg * Math.PI) / 180;
  return Array.from({length: n + 1}, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return {
      x: c.x + x * Math.cos(a) - y * Math.sin(a),
      y: c.y + x * Math.sin(a) + y * Math.cos(a),
    };
  });
}

/**
 * Dashes as per-point draw flags, for a stroke that stays ONE element: point i
 * is drawn when its distance along the stroke falls in an "on" piece of the
 * pattern. On pieces shorter than the point spacing (dots) are widened to
 * `minOn` so that they cover at least two points.
 */
export function dashFlags(
  points: P[],
  pattern: number[],
  minOn: number,
): boolean[] {
  const piece = pattern.map((l, i) => (i % 2 === 0 ? Math.max(l, minOn) : l));
  const period = piece.reduce((a, b) => a + b, 0);
  let s = 0;
  return points.map((p, i) => {
    if (i > 0) {
      s += dist(points[i - 1], p);
    }
    let r = s % period;
    for (let k = 0; k < piece.length; k++) {
      if (r < piece[k]) {
        return k % 2 === 0;
      }
      r -= piece[k];
    }
    return true;
  });
}

/** Mean distance between consecutive points. */
export function meanSpacing(points: P[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
  }
  return points.length > 1 ? total / (points.length - 1) : 0;
}

/** Smallest and largest of many values, without spreading them into a call (stack-safe). */
export function range(values: Iterable<number>): {min: number; max: number} {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  return {min, max};
}

/**
 * The visible runs of a stroke: a partial eraser keeps ONE element and hides the
 * erased points through its draw flags (false = hidden). Runs shorter than two
 * points are dropped. Without flags, the whole stroke is one run.
 */
export function visibleRuns(
  points: P[],
  flags?: readonly boolean[] | null,
): P[][] {
  if (!flags || flags.length !== points.length) {
    return [points];
  }
  const runs: P[][] = [];
  let run: P[] = [];
  points.forEach((p, i) => {
    if (flags[i] !== false) {
      run.push(p);
    } else {
      if (run.length > 1) {
        runs.push(run);
      }
      run = [];
    }
  });
  if (run.length > 1) {
    runs.push(run);
  }
  return runs;
}

/**
 * A ShapeSnap arrow (or axis) is one polyline: tail, tip, both barbs, the tip
 * again, then rungs filling the head. Dashing it must leave the head solid:
 * only the shaft (tail → tip) is cut. Null when the polyline is not one.
 */
export function splitArrow(points: P[]): {shaft: P[]; head: P[]} | null {
  if (points.length < 5) {
    return null;
  }
  const [tail, tip, left, right, again] = points;
  const shaft = dist(tail, tip);
  const barbs = [dist(tip, left), dist(tip, right)];
  if (
    dist(tip, again) > 0.5 ||
    shaft <= 0 ||
    Math.abs(barbs[0] - barbs[1]) > 0.02 * Math.max(...barbs) + 0.5 ||
    barbs[0] <= 0 ||
    barbs[0] > shaft
  ) {
    return null;
  }
  return {shaft: [tail, tip], head: points.slice(1)};
}
