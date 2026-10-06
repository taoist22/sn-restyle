import {Element, PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {FILL_COLORS, fillGeometry, hasFill, perfectFromGeometry, type FillChoice} from './fillShapes';
import type {LassoInfo, RestyleOptions} from './types';

/** SDK side of the fill: insertion, redraw, and planning from the lasso. Geometry is in fillShapes. */
/** Insert the fill, then save and reload so the host redraws the page. */
export async function insertFill(geometry: object): Promise<void> {
  const inserted: any = await PluginCommAPI.insertGeometry(geometry as any);
  if (!inserted?.success || inserted.result === false) {throw new Error('Could not insert the fill.');}
  await redraw();
}

export async function redraw(): Promise<void> {
  const saved: any = await PluginNoteAPI.saveCurrentNote();
  if (saved?.success && saved.result !== false) {await PluginCommAPI.reloadFile();}
}

/**
 * Fill for the one circle or rectangle in the lasso, computed before any style change so the
 * inset uses the outline width the shape will have. Throws if the selection cannot be filled.
 */
export async function planFill(info: LassoInfo, options: RestyleOptions): Promise<object> {
  if (!hasFill(options)) {throw new Error('No fill chosen.');}
  if (info.strokeCount !== 0 || info.geometryCount !== 1 || info.otherCount !== 0) {throw new Error('Select one circle or rectangle to fill.');}
  const res: any = await PluginCommAPI.getLassoElements();
  const elements: any[] = res?.success && Array.isArray(res.result) ? res.result : [];
  const el = elements.find(e => e?.type === Element.TYPE_GEO && e.geometry);
  if (elements.length !== 1 || !el) {throw new Error('The selection changed. Select the shape again.');}
  const shape = perfectFromGeometry(el.geometry);
  if (!shape) {throw new Error('Fill works on circles and rectangles.');}
  const width = options.thickness ?? el.geometry.penWidth;
  const geometry = fillGeometry(shape, width, FILL_COLORS[options.fill as Exclude<FillChoice, 'none'>]);
  if (!geometry) {throw new Error('The shape is too small to fill.');}
  return geometry;
}
