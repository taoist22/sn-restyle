import {convexClosed, exactFill, type PerfectShape} from './vendor/palette/exactfill';
import type {Shape} from './shapeFit';
import type {RestyleOptions} from './types';

/**
 * Gray fill inside a lone circle or rectangle. Supernote has no fill style, so the fill is
 * one plain polyline (rows plus a ring, Palette's method) inserted inside the outline.
 */
export type FillChoice = 'none' | 'light' | 'dark' | 'white';
export const FILL_COLORS: Record<Exclude<FillChoice, 'none'>, number> = {light: 0xC9, dark: 0x9D, white: 0xFE};
export const FILL_LABELS: Record<FillChoice, string> = {none: 'None', light: 'Light gray', dark: 'Dark gray', white: 'White'};

/** Palette's solid-fill constants: 8 px lines, 5 px apart (they merge), drawn with the fineliner. */
const FILL_WIDTH_PX = 8;
const FILL_SPACING_PX = 5;
const FINELINER = 10;

export const hasFill = (options: RestyleOptions): boolean => !!options.fill && options.fill !== 'none';

/** A shape just fitted by Restyle: its outline is exactly what insertGeometry receives. */
export function perfectFromShape(shape: Shape): PerfectShape | null {
  if (shape.kind === 'circle') {return {kind: 'ellipse', c: {x: shape.cx, y: shape.cy}, rx: shape.r, ry: shape.r, angle: 0};}
  if (shape.kind === 'rect') {return {kind: 'polygon', points: [...shape.corners]};}
  if (shape.kind === 'poly') {return {kind: 'polygon', points: [...shape.points]};}
  return null;
}

/** A geometry read back from the page. Read back, circle and ellipse radii hold twice the drawn radius. */
export function perfectFromGeometry(g: any): PerfectShape | null {
  if (!g) {return null;}
  if ((g.type === 'GEO_circle' || g.type === 'GEO_ellipse') && g.ellipseCenterPoint) {
    return {kind: 'ellipse', c: g.ellipseCenterPoint, rx: g.ellipseMajorAxisRadius / 2, ry: g.ellipseMinorAxisRadius / 2, angle: g.ellipseAngle ?? 0};
  }
  const points = Array.isArray(g.points) ? convexClosed(g.points) : null;
  return points ? {kind: 'polygon', points} : null;
}

/** The fill as a geometry to insert, or null when the outline is too thin or small to hold one. */
export function fillGeometry(shape: PerfectShape, outlineWidth: number, color: number): object | null {
  const path = exactFill(shape, outlineWidth / 100, FILL_WIDTH_PX, FILL_SPACING_PX);
  if (!path || path.length < 3) {return null;}
  return {
    showLassoAfterInsert: false, penType: FINELINER, penColor: color, penWidth: FILL_WIDTH_PX * 100, type: 'GEO_polygon',
    points: path.map(p => ({x: Math.round(p.x), y: Math.round(p.y)})),
    ellipseCenterPoint: null, ellipseMajorAxisRadius: 0, ellipseMinorAxisRadius: 0, ellipseAngle: 0,
  };
}
