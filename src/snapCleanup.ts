import {Element, PluginCommAPI, PluginFileAPI, PluginNoteAPI, PointUtils} from 'sn-plugin-lib';
import {readRecognitionData} from './recognitionData';
import {FILL_COLORS, fillGeometry, hasFill, perfectFromShape, type FillChoice} from './fillShapes';
import {DEFAULT_AXES, axesLayout, axesPieces, validateAxes, type AxisArrows} from './axesBuild';
import {recognizeStroke} from './snapRecognize';
import type {P, Shape} from './shapeFit';
import {arrowParts} from './arrowHead';
import {axisPoints} from './vendor/snap/symbols';
import {PEN_COLOR_VALUES, type LassoInfo, type RestyleOptions} from './types';

/**
 * Snap's replace flow, applied to one lasso-selected stroke (supernote-snap src/snapper.ts):
 *   read points -> recognize -> delete the stroke by element number ->
 *   insertGeometry -> restore the stroke if the insert failed.
 * No journal, no verification pass, no rollback once the stroke is gone.
 */
const HEAD_SCALE = 0.7;
const PX_PER_MM = 300 / 25.4;
const LOOK = {arrowHeadPct: 100, axesHeadPct: 100, axesTicks: true, axesTickWidthPct: 50, axesTickMm: 5};

function ok<T>(res: any): T | null {return res?.success ? (res.result as T) : null;}

type Size = {width: number; height: number};
const validSize = (s: any): s is Size => s && s.width > 1 && s.height > 1;

async function pageSize(filePath: string, page: number): Promise<Size | null> {
  let size = ok<Size>(await PluginCommAPI.getPageDisplaySize());
  if (!validSize(size)) {size = ok<Size>(await PluginFileAPI.getPageSize(filePath, page));}
  return validSize(size) ? {width: Math.round(size.width), height: Math.round(size.height)} : null;
}

type PointSet = {label: string; points: P[]; toPixel: (p: P) => P};
const identity = (p: P) => p;

/** Same three sources, same order as Snap. Native records may spell x/y either way. */
async function pointSets(el: any, filePath: string, page: number): Promise<{sets: PointSet[]; skipped: string[]}> {
  const sets: PointSet[] = [];
  const skipped: string[] = [];
  const stroke = el.stroke;
  // The SDK's stroke.recognPoints drops native records (it expects X/Y, the host sends x/y),
  // so read them through the accessor that keeps the native spelling.
  try {
    const data = await readRecognitionData(el.uuid);
    const points = data.map((d: any) => ({x: d.x, y: d.y}));
    if (points.length >= 8) {sets.push({label: 'recogn', points, toPixel: identity});} else {skipped.push(`recogn size ${points.length}`);}
  } catch (e: any) {skipped.push(`recogn error ${e?.message ?? e}`);}
  try {
    const ps = await pageSize(filePath, page);
    const size = await stroke.points.size();
    const emr = await stroke.points.getRange(0, size);
    if (ps && Array.isArray(emr) && emr.length >= 8) {
      sets.push({label: 'emr', points: emr.map((p: P) => PointUtils.emrPoint2Android(p, ps)), toPixel: identity});
      const k = (Math.max(ps.width, ps.height) - 1) / PointUtils.getRealMaxX(ps);
      sets.push({label: 'emr raw', points: emr.map((p: P) => ({x: p.x * k, y: p.y * k})), toPixel: q => PointUtils.emrPoint2Android({x: q.x / k, y: q.y / k}, ps)});
    }
  } catch (e: any) {skipped.push(`emr error ${e?.message ?? e}`);}
  return {sets, skipped};
}

function shapeToPixels(shape: Shape, toPixel: (p: P) => P): Shape {
  if (shape.kind === 'rect') {const [a, b, c, d] = shape.corners.map(toPixel); return {kind: 'rect', corners: [a, b, c, d]};}
  if (shape.kind === 'arrow') {return {kind: 'arrow', tail: toPixel(shape.tail), tip: toPixel(shape.tip)};}
  if (shape.kind === 'line') {return {kind: 'line', a: toPixel(shape.a), b: toPixel(shape.b)};}
  if (shape.kind === 'poly') {return {kind: 'poly', name: shape.name, points: shape.points.map(toPixel)};}
  if (shape.kind === 'elbow') {return {kind: 'elbow', start: toPixel(shape.start), corner: toPixel(shape.corner), tip: toPixel(shape.tip)};}
  if (shape.kind === 'axes') {return {kind: 'axes', origin: toPixel(shape.origin), xEnd: toPixel(shape.xEnd), yEnd: toPixel(shape.yEnd)};}
  const center = toPixel({x: shape.cx, y: shape.cy});
  const rx = toPixel({x: shape.cx + shape.r, y: shape.cy}), ry = toPixel({x: shape.cx, y: shape.cy + shape.r});
  return {kind: 'circle', cx: center.x, cy: center.y, r: (Math.hypot(rx.x - center.x, rx.y - center.y) + Math.hypot(ry.x - center.x, ry.y - center.y)) / 2};
}

const arrowHeadLength = (penWidth: number) => Math.round(Math.min(130, 24 + (3.2 * penWidth) / 100));

type Pen = {type: number; color: number; width: number};

/** The head's inside as its own geometry: a fineliner line of the fill's width, in the arrow's color. */
const headFillGeometry = (fill: {points: P[]; widthPx: number}, color: number) => ({
  penColor: color, penType: 10, penWidth: fill.widthPx * 100, showLassoAfterInsert: false, type: 'GEO_polygon',
  points: fill.points.map(q => ({x: Math.round(q.x), y: Math.round(q.y)})),
  ellipseCenterPoint: null, ellipseMajorAxisRadius: 0, ellipseMinorAxisRadius: 0, ellipseAngle: 0,
});

/** Geometries to insert for a shape (axes need up to four). Copied from Snap. */
function geometriesFor(shape: Shape, pen: Pen, lasso: boolean, arrows: AxisArrows = 'none'): object[] {
  const base = {penColor: pen.color, penType: pen.type, penWidth: Math.max(100, pen.width)};
  const polyline = (pts: P[], select: boolean, width = base.penWidth) => ({
    ...base, penWidth: Math.max(100, Math.round(width)), showLassoAfterInsert: select, type: 'GEO_polygon',
    points: pts.map(p => ({x: Math.round(p.x), y: Math.round(p.y)})),
    ellipseCenterPoint: null, ellipseMajorAxisRadius: 0, ellipseMinorAxisRadius: 0, ellipseAngle: 0,
  });
  const head = arrowHeadLength(base.penWidth);
  // Head fill first, outline over it.
  const withHead = (parts: ReturnType<typeof arrowParts>, select: boolean): object[] => [
    ...(parts.fill ? [headFillGeometry(parts.fill, base.penColor)] : []),
    polyline(parts.outline, select && !parts.fill),
  ];
  switch (shape.kind) {
    case 'arrow': return withHead(arrowParts(shape.tail, shape.tip, (head * HEAD_SCALE * LOOK.arrowHeadPct) / 100, base.penWidth / 100), lasso);
    case 'line':
      return [{...base, showLassoAfterInsert: lasso, type: 'straightLine', points: [shape.a, shape.b].map(q => ({x: Math.round(q.x), y: Math.round(q.y)})), ellipseCenterPoint: null, ellipseMajorAxisRadius: 0, ellipseMinorAxisRadius: 0, ellipseAngle: 0}];
    case 'axes': {
      // An L the recognizer found: arrowheads only if chosen, ticks at the standard spacing.
      const axisHead = (head * HEAD_SCALE * LOOK.axesHeadPct) / 100;
      const tick = Math.max(8, (2 * base.penWidth) / 100);
      const tickWidth = (base.penWidth * LOOK.axesTickWidthPct) / 100;
      const out: object[] = [];
      for (const end of [shape.xEnd, shape.yEnd]) {
        const mid = {x: (shape.origin.x + end.x) / 2, y: (shape.origin.y + end.y) / 2};
        if (arrows === 'none') {out.push(polyline([shape.origin, mid, end], false));} else {out.push(...withHead(arrowParts(shape.origin, end, axisHead, base.penWidth / 100), false));}
        const ticks = axisPoints(shape.origin, end, LOOK.axesTickMm * PX_PER_MM, tick, arrows === 'none' ? 0 : axisHead).slice(0, -1);
        if (LOOK.axesTicks && ticks.length > 1) {out.push(polyline(ticks, false, tickWidth));}
      }
      return out;
    }
    case 'circle':
      return [{...base, showLassoAfterInsert: lasso, type: 'GEO_circle', points: [], ellipseCenterPoint: {x: Math.round(shape.cx), y: Math.round(shape.cy)}, ellipseMajorAxisRadius: Math.round(shape.r), ellipseMinorAxisRadius: Math.round(shape.r), ellipseAngle: 0}];
    case 'rect': return [polyline([...shape.corners, shape.corners[0]], lasso)];
    case 'poly': return [polyline([...shape.points, shape.points[0]], lasso)];
    case 'elbow': return withHead(arrowParts(shape.corner, shape.tip, (head * HEAD_SCALE * LOOK.arrowHeadPct) / 100, base.penWidth / 100, [shape.start]), lasso);
  }
}

/** Compact description of what a recognizer received, shown when nothing is recognized. */
function describePoints(points: P[]): string {
  const r = (n: number) => Math.round(n);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const steps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const sorted = [...steps].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
  const jumps = steps.filter(d => d > Math.max(20, median * 8)).length;
  const far = points.reduce((best, q, i) => Math.hypot(q.x - points[0].x, q.y - points[0].y) > best.d ? {i, d: Math.hypot(q.x - points[0].x, q.y - points[0].y)} : best, {i: 0, d: 0});
  const at = (i: number) => `${r(points[i].x)},${r(points[i].y)}`;
  const n = points.length;
  return `n${n} box ${r(Math.min(...xs))},${r(Math.min(...ys))}-${r(Math.max(...xs))},${r(Math.max(...ys))} start ${at(0)},${at(1)},${at(2)} end ${at(n - 3)},${at(n - 2)},${at(n - 1)} jumps ${jumps} maxstep ${r(Math.max(...steps))} median ${median.toFixed(1)} farthest #${far.i} ${at(far.i)}`;
}

/** Replace the one lasso-selected stroke with a clean native shape. Resolves with a short note. */
export async function applySnapCleanup(info: LassoInfo, options: RestyleOptions): Promise<string> {
  const choice = options.shape;
  if (!choice || choice === 'keep') {throw new Error('Choose a shape.');}
  if (info.crossDevice || info.geometryCount || info.otherCount || info.strokeCount !== 1) {throw new Error('Select exactly one stroke to turn into a shape.');}
  if (info.hasMarkerStroke && options.thickness !== null) {throw new Error('Marker width changes are disabled.');}
  const path = ok<string>(await PluginCommAPI.getCurrentFilePath()), page = ok<number>(await PluginCommAPI.getCurrentPageNum());
  if (path !== info.filePath || page !== info.pageNum) {throw new Error('The note or page changed. Select the stroke again.');}

  const lassoed = ok<any[]>(await PluginCommAPI.getLassoElements()) ?? [];
  const strokes = lassoed.filter(e => e?.type === Element.TYPE_STROKE && e.stroke);
  const el = strokes[0];
  try {
    if (lassoed.length !== 1 || !el || el.numInPage !== info.identities[0].numInPage) {throw new Error('The selection changed. Select the stroke again.');}

    const pen: Pen = {
      type: el.stroke.penType,
      color: options.color === null ? el.stroke.penColor : PEN_COLOR_VALUES[options.color],
      width: options.thickness ?? el.thickness ?? 100,
    };
    const {sets, skipped} = await pointSets(el, info.filePath, info.pageNum);
    if (!sets.length) {throw new Error(`Could not read the stroke points (${skipped.join('; ')}).`);}
    let geometries: object[];
    let fill: object | null = null;
    let lassoAfter = false;
    if (choice === 'axes') {
      // Axes come from the numbers in the panel, centred on the lassoed stroke; the stroke only marks the place.
      const spec = options.axes ?? DEFAULT_AXES;
      const bad = validateAxes(spec);
      if (bad) {throw new Error(bad);}
      const size = await pageSize(info.filePath, info.pageNum);
      if (!size) {throw new Error('Could not read the page size.');}
      const box = sets[0].points.map(sets[0].toPixel);
      const center = {x: (Math.min(...box.map(q => q.x)) + Math.max(...box.map(q => q.x))) / 2, y: (Math.min(...box.map(q => q.y)) + Math.max(...box.map(q => q.y))) / 2};
      const width = Math.max(100, pen.width);
      const head = arrowHeadLength(width) * HEAD_SCALE;
      const tick = Math.max(8, (2 * width) / 100);
      const pieces = axesPieces(axesLayout(spec, center, size), spec.arrows, head, width / 100, tick);
      geometries = pieces.map(piece => ({
        penColor: pen.color, penType: piece.widthPx ? 10 : pen.type, penWidth: piece.widthPx ? piece.widthPx * 100 : Math.max(100, Math.round(width * piece.widthScale)), showLassoAfterInsert: false, type: 'GEO_polygon',
        points: piece.points.map(q => ({x: Math.round(q.x), y: Math.round(q.y)})),
        ellipseCenterPoint: null, ellipseMajorAxisRadius: 0, ellipseMinorAxisRadius: 0, ellipseAngle: 0,
      }));
    } else {
      // Recognize: first point source that yields a shape wins, else force a named shape.
      let shape: Shape | null = null;
      const notes: string[] = [];
      for (const set of sets) {
        const r = recognizeStroke(set.points, choice);
        notes.push(`${set.label}: ${r.notes.join(', ')}`);
        if (r.shape) {shape = shapeToPixels(r.shape, set.toPixel); break;}
        if (r.notes.some(note => note.startsWith('too small'))) {break;}
      }
      // A button press is intent: fit the named shape even when it fits poorly.
      if (!shape && choice !== 'auto') {
        const forced = recognizeStroke(sets[0].points, choice, true);
        if (forced.shape) {shape = shapeToPixels(forced.shape, sets[0].toPixel);}
      }
      if (!shape) {throw new Error(`Not recognized as ${choice === 'auto' ? 'a shape' : choice} (${notes.join('; ')}). Data: ${sets.map(set => `${set.label} ${describePoints(set.points)}`).join(' | ')}${skipped.length ? ` | skipped: ${skipped.join('; ')}` : ''}. The stroke was kept.`);}
      // Shapes with an inside can take a fill. It goes in first, out to the outline's centre line, and the outline on top of it hides its edge.
      const perfect = hasFill(options) ? perfectFromShape(shape) : null;
      fill = perfect ? fillGeometry(perfect, 0, FILL_COLORS[options.fill as Exclude<FillChoice, 'none'>]) : null;
      // A lasso on multi-piece axes (or a shape followed by its fill) would select only one piece; those get a reload.
      lassoAfter = shape.kind !== 'axes' && shape.kind !== 'arrow' && shape.kind !== 'elbow' && !fill;
      geometries = geometriesFor(shape, pen, lassoAfter, options.axes?.arrows ?? 'none');
    }

    const deleted = ok<boolean>(await PluginCommAPI.deletePageElements([el.numInPage], info.pageNum, el.layerNum));
    if (!deleted) {throw new Error('Could not remove the stroke; nothing was changed.');}
    if (fill && !ok<boolean>(await PluginCommAPI.insertGeometry(fill as any))) {
      await PluginCommAPI.insertPageElements([el], info.pageNum, el.layerNum);
      throw new Error('The fill could not be inserted; the stroke was restored.');
    }
    let inserted = 0;
    for (const g of geometries) {
      if (!ok<boolean>(await PluginCommAPI.insertGeometry(g as any))) {break;}
      inserted++;
    }
    if (!inserted) {
      await PluginCommAPI.insertPageElements([el], info.pageNum, el.layerNum);
      throw new Error(`The shape could not be inserted; the stroke was restored.${fill ? ' The fill stayed on the page: select it and delete it.' : ''}`);
    }
    // Without a lasso the host keeps showing the deleted stroke; save + reload redraws the page.
    if (!lassoAfter) {
      const saved: any = await PluginNoteAPI.saveCurrentNote();
      if (saved?.success && saved.result !== false) {await PluginCommAPI.reloadFile();}
    }
    return inserted < geometries.length ? `inserted ${inserted} of ${geometries.length} pieces` : 'ok';
  } finally {
    try {if (el?.uuid) {PluginCommAPI.recycleElement(el.uuid);}} catch { /* best effort */ }
  }
}
