import {arrowParts} from './arrowHead';

/**
 * Coordinate axes from a range and a tick step. Pure geometry, no SDK. The axes cross at the
 * origin, with both sides drawn when the range includes negatives. Size is chosen from the
 * ranges and fitted to the page; no labels (the user writes those as text boxes).
 */
export type P = {x: number; y: number};
export type AxisArrows = 'none' | 'positive' | 'both';
export type AxesSpec = {xMin: number; xMax: number; yMin: number; yMax: number; step: number; arrows: AxisArrows};

export const DEFAULT_AXES: AxesSpec = {xMin: 0, xMax: 0, yMin: 0, yMax: 0, step: 1, arrows: 'none'};
export const AXES_LIMITS = {min: -10, max: 10, steps: [1, 2, 5]};

/** Target size of the whole set of axes, and the allowed spacing between ticks (px). */
const TARGET_SPAN = 600;
const MIN_SPACING = 40;
const MAX_SPACING = 120;
const PAGE_MARGIN = 40;

export function validateAxes(spec: AxesSpec): string | null {
  if (spec.xMax - spec.xMin <= 0 || spec.yMax - spec.yMin <= 0) {return 'Give each axis a range: the high end must be above the low end.';}
  if (spec.xMin > 0 || spec.xMax < 0 || spec.yMin > 0 || spec.yMax < 0) {return 'Each range must include 0, where the axes cross.';}
  return null;
}

export type AxesLayout = {origin: P; left: number; right: number; top: number; bottom: number; unit: number; xTicks: P[]; yTicks: P[]};

export function axesLayout(spec: AxesSpec, center: P, page: {width: number; height: number}): AxesLayout {
  const ux = spec.xMax - spec.xMin, uy = spec.yMax - spec.yMin;
  let unit = Math.min(MAX_SPACING / spec.step, Math.max(MIN_SPACING / spec.step, TARGET_SPAN / Math.max(ux, uy)));
  unit = Math.min(unit, (page.width - 2 * PAGE_MARGIN) / ux, (page.height - 2 * PAGE_MARGIN) / uy);
  const w = ux * unit, h = uy * unit;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const cx = clamp(center.x, PAGE_MARGIN + w / 2, page.width - PAGE_MARGIN - w / 2);
  const cy = clamp(center.y, PAGE_MARGIN + h / 2, page.height - PAGE_MARGIN - h / 2);
  const left = cx - w / 2, top = cy - h / 2;
  const origin = {x: left + -spec.xMin * unit, y: top + spec.yMax * unit};
  const ticks = (min: number, max: number, at: (v: number) => P) => {
    const out: P[] = [];
    for (let k = Math.ceil(min / spec.step); k <= Math.floor(max / spec.step); k++) {
      if (k !== 0) {out.push(at(k * spec.step));}
    }
    return out;
  };
  return {
    origin, left, right: left + w, top, bottom: top + h, unit,
    xTicks: ticks(spec.xMin, spec.xMax, v => ({x: origin.x + v * unit, y: origin.y})),
    yTicks: ticks(spec.yMin, spec.yMax, v => ({x: origin.x, y: origin.y - v * unit})),
  };
}

/** One tick polyline: out, back across, return to the axis, then along the axis (hidden under the thicker line). */
export function tickPath(axisPoints: P[], normal: P, half: number): P[] {
  const out: P[] = [];
  for (const p of axisPoints) {
    out.push(p, {x: p.x + normal.x * half, y: p.y + normal.y * half}, {x: p.x - normal.x * half, y: p.y - normal.y * half}, p);
  }
  return out;
}

/** widthScale scales the pen width; a head fill instead has its own width in px and is drawn with the fineliner. */
export type Piece = {points: P[]; widthScale: number; widthPx?: number};

/** The pieces to draw: each axis (with optional arrowheads), then the ticks of each axis, thinner. */
export function axesPieces(layout: AxesLayout, arrows: AxisArrows, head: number, inkPx: number, tick: number): Piece[] {
  const {origin, left, right, top, bottom} = layout;
  const line = (a: P, b: P, headAtB: boolean, headAtA: boolean): Piece[] => {
    if (!headAtB && !headAtA) {return [{points: [a, {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, b], widthScale: 1}];}
    const out: Piece[] = [];
    const add = (from: P, to: P) => {
      const parts = arrowParts(from, to, head, inkPx);
      if (parts.fill) {out.push({points: parts.fill.points, widthScale: 0, widthPx: parts.fill.widthPx});}
      out.push({points: parts.outline, widthScale: 1});
    };
    if (headAtB) {add(a, b);}
    if (headAtA) {add(b, a);}
    return out;
  };
  const x0 = {x: left, y: origin.y}, x1 = {x: right, y: origin.y};
  const y0 = {x: origin.x, y: bottom}, y1 = {x: origin.x, y: top};
  const both = arrows === 'both', any = arrows !== 'none';
  const pieces = [...line(x0, x1, any, both), ...line(y0, y1, any, both)];
  // Keep ticks clear of arrowheads.
  const clear = (p: P, ends: P[]) => !ends.some(e => Math.hypot(p.x - e.x, p.y - e.y) < head * 1.3);
  const xEnds = any ? (both ? [x0, x1] : [x1]) : [], yEnds = any ? (both ? [y0, y1] : [y1]) : [];
  const xTicks = layout.xTicks.filter(p => clear(p, xEnds)), yTicks = layout.yTicks.filter(p => clear(p, yEnds));
  if (xTicks.length) {pieces.push({points: tickPath(xTicks, {x: 0, y: 1}, tick), widthScale: 0.5});}
  if (yTicks.length) {pieces.push({points: tickPath(yTicks, {x: 1, y: 0}, tick), widthScale: 0.5});}
  return pieces;
}
