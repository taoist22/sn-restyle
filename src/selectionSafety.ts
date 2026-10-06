import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {readElementData} from './elementData';
export type Context = {filePath: string; pageNum: number};
export type TargetIdentity = {uuid: string; numInPage: number; type: number; layerNum: number; fingerprint?: string};
export async function assertContext(context: Context, live: () => void = () => {}): Promise<void> {
  live();
  const path: any = await PluginCommAPI.getCurrentFilePath(), page: any = await PluginCommAPI.getCurrentPageNum();
  live();
  if (!path?.success || path.result !== context.filePath || !page?.success || page.result !== context.pageNum) {throw new Error('The note or page changed. Select the drawing again.');}
  if (!context.filePath.toLowerCase().endsWith('.note')) {throw new Error('Restyle currently supports notes only.');}
}
export function identityOf(el: any): TargetIdentity {
  if (!el.uuid || !Number.isInteger(el.numInPage) || el.numInPage < 1 || !Number.isInteger(el.layerNum) || el.layerNum < 0 || el.layerNum > 3) {throw new Error('The selected element has no reliable identity. Select it again.');}
  return {uuid: el.uuid, numInPage: el.numInPage, type: el.type, layerNum: el.layerNum};
}
export async function fingerprintElement(el: any): Promise<string> {
  if (el.type === 0 && el.stroke?.points) {
    const n = await el.stroke.points.size();
    if (n < 1 || n > 100000) {throw new Error('Cannot fingerprint the selected stroke safely.');}
    const points = await readElementData(el.stroke.points, 'points', 100000);
    if (points.length !== n) {throw new Error('The selected stroke data is incomplete.');}
    return JSON.stringify({type: el.type, layer: el.layerNum, points});
  }
  if (el.type === 700 && el.geometry) {
    const {type, points, ellipseCenterPoint, ellipseMajorAxisRadius, ellipseMinorAxisRadius, ellipseAngle} = el.geometry;
    return JSON.stringify({type: el.type, layer: el.layerNum, geometry: {type, points, ellipseCenterPoint, ellipseMajorAxisRadius, ellipseMinorAxisRadius, ellipseAngle}});
  }
  throw new Error('Unsupported selection element.');
}
export async function exactTargets(elements: any[], ids: TargetIdentity[]): Promise<any[]> {
  const targets = [];
  for (const id of ids) {
    const byUUID = elements.find(e => e.uuid === id.uuid && e.type === id.type && e.layerNum === id.layerNum);
    // Saving titled notes can recreate UUIDs. Accept a changed UUID only at the
    // captured element number and with a byte-identical content fingerprint.
    const candidate = byUUID ?? (id.fingerprint ? elements.find(e => e.numInPage === id.numInPage && e.type === id.type && e.layerNum === id.layerNum) : undefined);
    if (!candidate || (id.fingerprint && await fingerprintElement(candidate) !== id.fingerprint)) {throw new Error('The drawing changed after selection. Select it again.');}
    targets.push(candidate);
  }
  if (new Set(targets.map(e => e.uuid)).size !== ids.length) {throw new Error('The selection is ambiguous. Select it again.');}
  return targets;
}
export async function assertUnmoved(): Promise<void> {
  const rect = await PluginCommAPI.getLassoRect();
  const dir = await PluginManager.getPluginDirPath();
  const preview: any = dir ? await PluginCommAPI.generateLassoPreview(`${dir}/restyle-selection.png`) : null;
  if (!rect?.success || !preview?.success || !rect.result || !preview.result?.rect) {throw new Error('Cannot verify the selection position. Deselect, lasso it again, and retry.');}
  const a = rect.result, b = preview.result.rect;
  if (Math.abs(preview.result.rotateDegree ?? 0) > 0.5 || ['left', 'top', 'right', 'bottom'].some(k => Math.abs((a as any)[k] - b[k]) > 4)) {throw new Error('Finish moving or resizing, then deselect and lasso the drawing again.');}
}
export async function assertSelection(ids: TargetIdentity[]): Promise<void> {
  PluginCommAPI.clearElementCache();
  const res: any = await PluginCommAPI.getLassoElements();
  if (!res?.success || !Array.isArray(res.result)) {throw new Error('The selection is no longer available. Lasso it again.');}
  const editable = res.result.filter((e: any) => e.type === 0 || e.type === 700);
  if (editable.length !== ids.length) {throw new Error('Selection changed. Open Restyle again.');}
  await exactTargets(editable, ids);
}
