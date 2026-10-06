// Verbatim copy of CharlesCheval/supernote-palette src/exactfill.ts (MIT, see LICENSE in this directory), fetched 2026-10-05.
import {P, ellipsePoints} from './patterns';

/**
 * Solid fill of a perfect shape (a closed convex polygon, a circle or an
 * ellipse), computed from its exact geometry instead of the grid: the grid's
 * cells (2–3 px) left the fill up to ~2 px short of the outline in places
 * (a white sliver along rectangles and circles, test.50).
 *
 * ONE path: horizontal rows `spacing` apart, back and forth, then the ring
 * around them. The ring's outer edge lies exactly on the inner edge of the
 * outline (offset inward by half the outline width plus half the line width);
 * the rows end on the ring's centre line, and the links between rows run
 * inside the filled area, unseen.
 */
export type PerfectShape =
  | {kind: 'polygon'; points: P[]}
  | {kind: 'ellipse'; c: P; rx: number; ry: number; angle: number};

export function exactFill(
  shape: PerfectShape,
  inkWidth: number,
  lineWidth: number,
  spacing: number,
): P[] | null {
  const inset = inkWidth / 2 + lineWidth / 2;
  const ring =
    shape.kind === 'polygon'
      ? insetPolygon(shape.points, inset)
      : insetEllipse(shape, inset);
  if (!ring || ring.length < 3) {
    return null;
  }
  const ys = ring.map(p => p.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  // Rows evenly spread between the ring's top and bottom (both covered by the
  // ring itself), at most `spacing` apart.
  const count = Math.max(0, Math.ceil((bottom - top) / spacing) - 1);
  const step = (bottom - top) / (count + 1);
  const path: P[] = [];
  for (let i = 1; i <= count; i++) {
    const span = crossing(ring, top + i * step);
    if (!span) {
      continue;
    }
    const [a, b] = i % 2 ? span : [span[1], span[0]];
    path.push(a, b);
  }
  // Around the ring, starting from its vertex nearest to where the rows end.
  const last = path[path.length - 1] ?? ring[0];
  let start = 0;
  let best = Infinity;
  ring.forEach((p, i) => {
    const d = (p.x - last.x) ** 2 + (p.y - last.y) ** 2;
    if (d < best) {
      best = d;
      start = i;
    }
  });
  for (let k = 0; k <= ring.length; k++) {
    path.push(ring[(start + k) % ring.length]);
  }
  return path;
}

/** The shape when it is a closed convex polygon (first point repeated), else null. */
export function convexClosed(points: P[]): P[] | null {
  if (points.length < 4) {
    return null;
  }
  const first = points[0];
  const end = points[points.length - 1];
  if (Math.hypot(first.x - end.x, first.y - end.y) > 2) {
    return null;
  }
  const pts = dedupe(points.slice(0, -1));
  if (pts.length < 3) {
    return null;
  }
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) {
      continue;
    }
    if (sign && Math.sign(cross) !== sign) {
      return null;
    }
    sign = Math.sign(cross);
  }
  return sign ? pts : null;
}

function dedupe(points: P[]): P[] {
  const out: P[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 0.5) {
      out.push(p);
    }
  }
  return out;
}

/** Each edge moved inward by `d`, consecutive edges intersected. */
function insetPolygon(pts: P[], d: number): P[] | null {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  // Inward normal: to the left of each edge for a counter-clockwise polygon
  // (in y-down screen coordinates the sign is reversed).
  const s = area > 0 ? 1 : -1;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / len) * s;
    const ny = ((b.x - a.x) / len) * s;
    return {
      p: {x: a.x + nx * d, y: a.y + ny * d},
      dir: {x: b.x - a.x, y: b.y - a.y},
    };
  });
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n];
    const l2 = lines[i];
    const den = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(den) < 1e-9) {
      out.push(l2.p);
      continue;
    }
    const t =
      ((l2.p.x - l1.p.x) * l2.dir.y - (l2.p.y - l1.p.y) * l2.dir.x) / den;
    out.push({x: l1.p.x + t * l1.dir.x, y: l1.p.y + t * l1.dir.y});
  }
  // Too thick an inset turns the polygon inside out: some inset vertex then
  // lies beyond one of the moved edges.
  for (const l of lines) {
    const len = Math.hypot(l.dir.x, l.dir.y);
    for (const q of out) {
      // Signed distance past the moved edge, inward positive.
      const along =
        ((q.x - l.p.x) * -l.dir.y + (q.y - l.p.y) * l.dir.x) * (s / len);
      if (along < -1e-6) {
        return null;
      }
    }
  }
  return out;
}

function insetEllipse(
  e: {c: P; rx: number; ry: number; angle: number},
  d: number,
): P[] | null {
  const rx = e.rx - d;
  const ry = e.ry - d;
  if (rx <= 1 || ry <= 1) {
    return null;
  }
  // Chords about 4 px long: they sag inward by well under a tenth of a pixel.
  const n = Math.max(48, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / 4));
  return ellipsePoints(e.c, rx, ry, e.angle, n).slice(0, -1);
}

/** Where the horizontal line at `y` enters and leaves a convex polygon. */
function crossing(ring: P[], y: number): [P, P] | null {
  const xs: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  if (xs.length < 2) {
    return null;
  }
  return [
    {x: Math.min(...xs), y},
    {x: Math.max(...xs), y},
  ];
}

/**
 * Typical width (px) of a stroke as its contour draws it: twice the median
 * distance from points of its centre line to the contour. Lets a stale
 * contour (the host keeps the old one after a width change) be told apart.
 */
export function contourWidth(loops: P[][], centre: P[]): number {
  const edge: P[] = [];
  for (const l of loops) {
    const step = Math.max(1, Math.floor(l.length / 600));
    for (let i = 0; i < l.length; i += step) {
      edge.push(l[i]);
    }
  }
  if (!edge.length || !centre.length) {
    return 0;
  }
  const step = Math.max(1, Math.floor(centre.length / 40));
  const half: number[] = [];
  for (let i = 0; i < centre.length; i += step) {
    const c = centre[i];
    let best = Infinity;
    for (const q of edge) {
      const d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2;
      if (d < best) {
        best = d;
      }
    }
    half.push(Math.sqrt(best));
  }
  half.sort((a, b) => a - b);
  return 2 * half[Math.floor(half.length / 2)];
}
