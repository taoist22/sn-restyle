import {exactFill} from './vendor/palette/exactfill';
import {arrowPoints} from './vendor/snap/recognize';

/**
 * An arrow drawn as two pieces: an outline polyline (shaft plus the triangle of the head), and a
 * separate fill for the head's inside, built like the gray fills: fewer, wider rows that overlap.
 * A single dense zigzag of 1 px rows showed as stripes on the device.
 */
export type P = {x: number; y: number};
export type HeadFill = {points: P[]; widthPx: number};

/**
 * The widest line (up to 8 px, as in the gray fills) that still spreads across the head: after
 * keeping clear of the outline, the head must be at least 1.5 line-widths across at its centre,
 * or the fill would only be a dot in the middle.
 */
export function headFill(triangle: P[], inkPx: number): HeadFill | null {
  const [a, b, c] = triangle;
  const sides = [Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(b.x - c.x, b.y - c.y), Math.hypot(c.x - a.x, c.y - a.y)];
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  const inradius = (2 * area) / Math.max(1e-9, sides[0] + sides[1] + sides[2]);
  for (const widthPx of [8, 6, 4, 3, 2]) {
    if (inradius - inkPx / 2 < 1.5 * widthPx) {continue;}
    const path = exactFill({kind: 'polygon', points: triangle}, inkPx, widthPx, Math.max(1.5, 0.62 * widthPx));
    if (path && path.length >= 4) {return {points: path, widthPx};}
  }
  return null;
}

export type ArrowParts = {outline: P[]; fill: HeadFill | null};

/** Tail to tip with the head's outline; `lead` points are kept in front (the first leg of an elbow). */
export function arrowParts(tail: P, tip: P, head: number, _inkPx: number, lead: P[] = []): ArrowParts {
  const pts = arrowPoints(tail, tip, head, 0); // tail, tip, left, right, tip
  // The fill is drawn first and runs out to the outline's centre line (ink 0); the outline on top hides its edge,
  // so no seam can show whatever width the device really draws.
  return {outline: [...lead, ...pts], fill: headFill([pts[1], pts[2], pts[3]], 0)};
}
