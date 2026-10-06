/**
 * LEGACY. Shape cleanup is now src/snapCleanup.ts (delete, insert, restore on failure). This file is the
 * old insert-verify-delete flow from 0.6.x builds. Its forward path (applyCleanup) is no longer called; it
 * stays so a recovery record written by an earlier build can still be restored (readCleanupRecord,
 * recoverCleanup, forgetCleanup, used by App.tsx). Remove it once no such record can exist.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {readElementData} from './elementData';
import {geometryReadbackProblem} from './geometryReadback';
import {readRecognitionData} from './recognitionData';
import {Element, PluginCommAPI, PluginFileAPI, PluginNoteAPI, PointUtils} from 'sn-plugin-lib';
import {axisPoints} from './vendor/supernote-snap/axes';
import {arrowPoints} from './vendor/supernote-snap/recognize';
import {recognizeSelection, type ShapeFit} from './shapeRecognition';
import {assertContext, assertSelection, assertUnmoved, exactTargets, identityOf, fingerprintElement, type Context, type TargetIdentity} from './selectionSafety';
import {PEN_COLOR_VALUES, type LassoInfo, type RestyleOptions} from './types';

const JOURNAL_KEY = 'restyle_cleanup_recovery_v1';
const ARCHIVE_KEY = 'restyle_cleanup_previous_recovery_v1';
type SavedElement = {identity: TargetIdentity; fields: Record<string, any>; strokeFields: Record<string, any>; data: Record<string, any[]>};
export type CleanupRecord = Context & {kind: 'cleanup'; phase: 'prepared' | 'created' | 'committed' | 'restoring'; originals: SavedElement[]; outputs: {identity: TargetIdentity; geometry: any}[]; createdUUIDs: string[]; restoredUUIDs: Record<string, string>; restoredNumbers?: Record<string, number>; plannedGeometry?: any; plannedGeometries?: any[]; baselineGeometryNumbers?: number[]; retainedStrokeFingerprints?: string[]; displaySize?: {width: number; height: number}};
const strokeKeys = ['points', 'pressures', 'eraseLineTrailNums', 'flagDraw', 'markPenDirection', 'recognPoints'];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function result<T>(res: any, message: string): T {
  if (!res?.success || res.result == null || res.result === false) {throw new Error(res?.error?.message || message);}
  return res.result as T;
}
async function snapshot(el: any): Promise<SavedElement> {
  const data: Record<string, any[]> = {};
  data.angles = await readElementData(el.angles, 'angles'); data.contoursSrc = await readElementData(el.contoursSrc, 'contours');
  for (const key of strokeKeys) {data[key] = key === 'recognPoints' ? await readRecognitionData(el.uuid) : await readElementData(el.stroke?.[key], key);}
  if (data.points.length < 2 || data.flagDraw.some(f => f === false) || data.eraseLineTrailNums.length) {throw new Error('Cleanup does not yet support dots or partially erased strokes.');}
  if (data.flagDraw.length && data.flagDraw.length !== data.points.length) {throw new Error('Cannot verify visible ink for this stroke.');}
  const fields: Record<string, any> = {}, strokeFields: Record<string, any> = {};
  for (const key of ['thickness', 'maxX', 'maxY', 'userData', 'status', 'recognizeResult']) {if (el[key] != null) {fields[key] = clone(el[key]);}}
  for (const [key, value] of Object.entries(el.stroke ?? {})) {if (!strokeKeys.includes(key)) {strokeFields[key] = clone(value);}}
  return {identity: {...identityOf(el), fingerprint: await fingerprintElement(el)}, fields, strokeFields, data};
}
async function journal(record: CleanupRecord): Promise<void> {
  const raw = JSON.stringify(record);
  if (raw.length > 4000000) {throw new Error('This selection is too large for safe recovery.');}
  await AsyncStorage.setItem(JOURNAL_KEY, raw);
  if (await AsyncStorage.getItem(JOURNAL_KEY) !== raw) {throw new Error('Could not verify the recovery record.');}
}
export async function readCleanupRecord(): Promise<CleanupRecord | null> {
  const raw = await AsyncStorage.getItem(JOURNAL_KEY);
  if (!raw) {return null;}
  const record = JSON.parse(raw);
  if (record.kind !== 'cleanup' || !Array.isArray(record.originals) || !Array.isArray(record.createdUUIDs) || !record.restoredUUIDs) {throw new Error('The cleanup recovery record is invalid. Do not edit this note until it is recovered.');}
  return record;
}
export async function forgetCleanup(): Promise<void> {
  const raw = await AsyncStorage.getItem(JOURNAL_KEY);
  if (raw) {
    await AsyncStorage.setItem(ARCHIVE_KEY, raw);
    if (await AsyncStorage.getItem(ARCHIVE_KEY) !== raw) {throw new Error('Could not retain the previous recovery backup.');}
  }
  await AsyncStorage.removeItem(JOURNAL_KEY);
}
async function page(context: Context): Promise<any[]> {
  const values = result<any[]>(await PluginFileAPI.getElements(context.pageNum, context.filePath), 'Cannot verify page elements.');
  const seen = new Set<string>();
  return values.filter(e => {if (seen.has(e.uuid)) {return false;} seen.add(e.uuid); return true;});
}
async function flush(context: Context, live: () => void): Promise<void> {
  await assertContext(context, live);
  result(await PluginNoteAPI.saveCurrentNote(), 'Could not save the note.');
  await assertContext(context, live);
  result(await PluginCommAPI.reloadFile(), 'Could not reload the note.');
  await assertContext(context, live);
}
async function saveLive(context: Context, live: () => void): Promise<void> {
  await assertContext(context, live);
  result(await PluginNoteAPI.saveCurrentNote(), 'Could not save the live note. Recovery data was retained.');
  await assertContext(context, live);
  result(await PluginCommAPI.reloadFile(), 'Could not refresh the saved note. Recovery data was retained.');
  await assertContext(context, live);
}
async function deleteLive(context: Context, elements: any[], live: () => void): Promise<void> {
  const layers = [...new Set(elements.map(e => e.layerNum))];
  for (const layer of layers) {
    await assertContext(context, live);
    result(await PluginCommAPI.deletePageElements(elements.filter(e => e.layerNum === layer).map(e => e.numInPage), context.pageNum, layer), 'Live-note deletion failed. Recovery data was retained.');
  }
  await saveLive(context, live);
}
const canonical = (value: any): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function sameSavedGeometry(a: any, b: any): boolean {return canonical(a) === canonical(b);}
const distanceForHead = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);
function payload(fit: ShapeFit, style: {penColor: number; penType: number; penWidth: number}) {
  let points = fit.points;
  if (fit.kind === 'arrow' || fit.kind === 'doubleArrow') {
    const head = Math.min(distanceForHead(points[0], points[1]) * 0.35, Math.min(130, 24 + 3.2 * style.penWidth / 100) * 0.7);
    const fill = Math.max(2, 0.4 * style.penWidth / 100);
    points = arrowPoints(fit.points[0], fit.points[1], head, fill);
    if (fit.kind === 'doubleArrow') {points.push(fit.points[0], ...arrowPoints(fit.points[1], fit.points[0], head, fill).slice(1));}
  }
  const g = {type: fit.kind === 'circle' ? 'GEO_circle' : fit.kind === 'line' ? 'straightLine' : 'GEO_polygon', ...style, showLassoAfterInsert: false,
    points: points.map(p => ({x: Math.round(p.x), y: Math.round(p.y)})),
    ellipseCenterPoint: fit.center ? {x: Math.round(fit.center.x), y: Math.round(fit.center.y)} : null,
    ellipseMajorAxisRadius: fit.radius ? Math.round(fit.radius) : 0, ellipseMinorAxisRadius: fit.radius ? Math.round(fit.radius) : 0, ellipseAngle: 0};
  if (g.penWidth < 100 || !Number.isFinite(g.penWidth)) {throw new Error('Invalid geometry width.');}
  return g;
}
function payloads(fit: ShapeFit, style: {penColor: number; penType: number; penWidth: number}) {
  if (fit.kind !== 'axes') {return [payload(fit, style)];}
  if (!fit.axes) {throw new Error('Missing coordinate axes measurements.');}
  const {origin, xEnd, yEnd} = fit.axes;
  const out = [];
  for (const end of [xEnd, yEnd]) {
    const head = Math.min(distanceForHead(origin, end) * 0.35, Math.min(130, 24 + 3.2 * style.penWidth / 100) * 0.7);
    const fill = Math.max(2, 0.4 * style.penWidth / 100);
    const make = (points: {x: number; y: number}[], penWidth: number) => payload({...fit, points}, {...style, penWidth});
    out.push(make(arrowPoints(origin, end, head, fill), style.penWidth));
    // Snap defaults: 5 mm at 300 dpi, half-width ticks, separate native geometry.
    const ticks = axisPoints(origin, end, 5 * 300 / 25.4, Math.max(8, 2 * style.penWidth / 100), head).slice(0, -1);
    if (ticks.length > 1) {out.push(make(ticks, Math.max(100, Math.round(style.penWidth * 0.5))));}
  }
  return out;
}
function geometryMatches(actual: any, expected: any): boolean {
  return geometryReadbackProblem(actual, expected) === null;
}
async function reload(context: Context, live: () => void) {
  await assertContext(context, live); result(await PluginCommAPI.reloadFile(), 'Operation saved, but refresh failed. Reopen the note.');
}
/** Mutate the open page through live APIs; save before inspecting file snapshots. */
export async function applyCleanup(info: LassoInfo, options: RestyleOptions, live: () => void): Promise<CleanupRecord> {
  if (!options.shape || options.shape === 'keep') {throw new Error('Choose a shape.');}
  if (info.crossDevice || info.geometryCount || info.otherCount || info.strokeCount < 1 || info.strokeCount > 20) {throw new Error('Select only the strokes of one drawing on its original device.');}
  if (info.hasMarkerStroke && options.thickness !== null) {throw new Error('Marker width changes are disabled.');}
  const pending = await readCleanupRecord();
  if (pending && pending.phase !== 'committed') {throw new Error('Recover the previous cleanup before starting another operation.');}
  await assertContext(info, live); await assertUnmoved(); await assertSelection(info.identities);
  await flush(info, live);
  let all: any[] = await page(info);
  const targets = await exactTargets(all, info.identities);
  if (new Set(targets.map(e => e.layerNum)).size !== 1) {throw new Error('Select strokes on one layer.');}
  const originals: SavedElement[] = [];
  for (const el of targets) {originals.push(await snapshot(el));}
  const size = result<{width: number; height: number}>(await PluginCommAPI.getPageDisplaySize(), 'Cannot read the live page dimensions.');
  const fileSize = result<{width: number; height: number}>(await PluginFileAPI.getPageSize(info.filePath, info.pageNum), 'Cannot read the saved page dimensions.');
  if (!(size.width > 1 && size.height > 1) || Math.abs(size.width - fileSize.width) > 1 || Math.abs(size.height - fileSize.height) > 1) {throw new Error('Return the page to its normal size before cleaning a shape.');}
  const paths = originals.map(o => ({id: o.identity.uuid, points: o.data.recognPoints.length >= 2 ? o.data.recognPoints.map(p => ({x: p.x, y: p.y})) : o.data.points.map(p => PointUtils.emrPoint2Android(p, size))}));
  const started = Date.now(); const fit = recognizeSelection(paths, options.shape as Parameters<typeof recognizeSelection>[1]);
  console.info('[Restyle] recognition', fit.kind, Date.now() - started, 'ms');
  const source = originals.find(o => o.identity.uuid === fit.styleSourceId) ?? originals[0];
  const geometries = payloads(fit, {penColor: options.color === null ? source.strokeFields.penColor : PEN_COLOR_VALUES[options.color], penType: source.strokeFields.penType, penWidth: options.thickness ?? source.fields.thickness});
  if (geometries.some(geo => geo.points.some(p => p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height)) || (fit.center && fit.radius && (fit.center.x - fit.radius < 0 || fit.center.y - fit.radius < 0 || fit.center.x + fit.radius > size.width || fit.center.y + fit.radius > size.height))) {throw new Error('The fitted shape would extend outside the page.');}
  const record: CleanupRecord = {kind: 'cleanup', filePath: info.filePath, pageNum: info.pageNum, phase: 'prepared', displaySize: size, originals, outputs: [], createdUUIDs: [], restoredUUIDs: {}, plannedGeometry: clone(geometries[0]), plannedGeometries: clone(geometries), baselineGeometryNumbers: all.filter(e => e.type === Element.TYPE_GEO).map(e => e.numInPage)};
  record.retainedStrokeFingerprints = [];
  const selectedUUIDs = new Set(targets.map(e => e.uuid));
  const originalFingerprints = new Set(originals.map(o => o.identity.fingerprint));
  for (const el of all.filter(e => e.type === Element.TYPE_STROKE && !selectedUUIDs.has(e.uuid))) {
    const fingerprint = await fingerprintElement(el);
    if (originalFingerprints.has(fingerprint)) {record.retainedStrokeFingerprints.push(fingerprint);}
  }
  await journal(record);
  try {
    for (const geo of geometries) {
      await assertContext(info, live);
      result(await PluginCommAPI.insertGeometry(geo), 'Snap native geometry insertion failed.');
      await assertContext(info, live);
      result(await PluginNoteAPI.saveCurrentNote(), 'Could not save inserted geometry. Original ink was kept.');
      all = await page(info);
      const knownNumbers = new Set([...(record.baselineGeometryNumbers ?? []), ...record.outputs.map(o => o.identity.numInPage)]);
      const candidates = all.filter(e => e.type === Element.TYPE_GEO && !knownNumbers.has(e.numInPage));
      if (candidates.length !== 1) {throw new Error('Cannot uniquely verify the native shape. Original ink was kept.');}
      const output = candidates[0];
      record.createdUUIDs.push(output.uuid);
      record.outputs.push({identity: {...identityOf(output), fingerprint: await fingerprintElement(output)}, geometry: clone(output.geometry)});
      await journal(record);
      const readbackProblem = geometryReadbackProblem(output.geometry, geo);
      if (readbackProblem) {throw new Error(`Native geometry readback differed: ${readbackProblem}. Original ink was kept.`);}
      if (output.layerNum !== targets[0].layerNum) {throw new Error('Native insertion used a different layer. Original ink was kept.');}
    }
    record.phase = 'created'; await journal(record);
    const originalTargets = await exactTargets(all, originals.map(o => o.identity));
    // A read-back UUID is insufficient if another edit changed the stroke content.
    for (let i = 0; i < originalTargets.length; i++) {
      if (JSON.stringify((await snapshot(originalTargets[i])).data) !== JSON.stringify(originals[i].data)) {throw new Error('Original ink changed before replacement.');}
    }
    await assertContext(info, live);
    const expectedStrokeCount = all.filter(e => e.type === Element.TYPE_STROKE).length - originalTargets.length;
    const expectedGeometryCount = all.filter(e => e.type === Element.TYPE_GEO).length;
    await deleteLive(info, originalTargets, live);
    all = await page(info);
    const savedOutputs: any[] = [];
    for (const expected of record.outputs) {
      const matches = all.filter(e => e.type === Element.TYPE_GEO && e.layerNum === expected.identity.layerNum && sameSavedGeometry(e.geometry, expected.geometry));
      if (matches.length !== 1 || savedOutputs.some(e => e.uuid === matches[0].uuid)) {throw new Error('Saved replacement could not be verified. Recovery data was retained.');}
      savedOutputs.push(matches[0]);
    }
    if (all.filter(e => e.type === Element.TYPE_STROKE).length !== expectedStrokeCount || all.filter(e => e.type === Element.TYPE_GEO).length !== expectedGeometryCount) {throw new Error('Saved replacement could not be verified. Recovery data was retained.');}
    record.createdUUIDs = savedOutputs.map(e => e.uuid);
    record.outputs = [];
    for (const output of savedOutputs) {record.outputs.push({identity: {...identityOf(output), fingerprint: await fingerprintElement(output)}, geometry: clone(output.geometry)});}
    record.phase = 'committed'; await journal(record);
    await reload(info, live);
    return record;
  } catch (error) {
    // Recovery is explicit if context/lifecycle changed; never edit the newly opened page.
    try {await recoverCleanup(record, live, false);} catch (recoveryError) {
      console.error('[Restyle] cleanup recovery needed', recoveryError);
      throw new Error('Cleanup needs recovery. Originals are backed up. Reopen Restyle on this page and choose Restore drawing.');
    }
    throw error;
  }
  // Do not clear native element cache here: live inserted elements may still
  // be owned by the host, as documented by Palette's replacement path.
}
/** Restore missing originals first; delete only verified, unchanged outputs afterward. */
export async function recoverCleanup(record: CleanupRecord, live: () => void, saveFirst = true): Promise<void> {
  await assertContext(record, live);
  if (saveFirst) {await flush(record, live);} else {await saveLive(record, live);}
  record.phase = 'restoring'; await journal(record);
  let all = await page(record);
  for (const planned of record.plannedGeometries ?? (record.plannedGeometry ? [record.plannedGeometry] : [])) {
    if (record.outputs.some(o => geometryMatches(o.geometry, planned))) {continue;}
    const candidates = all.filter(e => e.type === Element.TYPE_GEO && !(record.baselineGeometryNumbers ?? []).includes(e.numInPage) && !record.outputs.some(o => sameSavedGeometry(o.geometry, e.geometry)) && geometryMatches(e.geometry, planned));
    if (candidates.length > 1) {throw new Error('Native shape recovery is ambiguous. Original ink was kept.');}
    if (candidates.length === 1) {
      const output = candidates[0]; record.createdUUIDs.push(output.uuid);
      record.outputs.push({identity: {...identityOf(output), fingerprint: await fingerprintElement(output)}, geometry: clone(output.geometry)});
      await journal(record);
    }
  }
  const keyOf = (e: any) => `${e.layerNum}:${e.numInPage}`;
  async function reserveNeighbors(elements: any[]): Promise<Set<string>> {
    const reserved = new Set<string>();
    for (const fingerprint of record.retainedStrokeFingerprints ?? []) {
      for (const el of elements.filter(e => e.type === Element.TYPE_STROKE && !reserved.has(keyOf(e)))) {
        if (await fingerprintElement(el) === fingerprint) {reserved.add(keyOf(el)); break;}
      }
    }
    return reserved;
  }
  // Reserve identical neighboring ink before looking for missing selected ink.
  // Use page positions during restoration: file-reader UUIDs may change on each read.
  const claimed = await reserveNeighbors(all);
  for (const original of record.originals) {
    const known = [original.identity.uuid, record.restoredUUIDs[original.identity.uuid]].filter(Boolean);
    let present = all.find(e => known.includes(e.uuid) && !claimed.has(keyOf(e)));
    if (!present) {
      const matches = [];
      for (const e of all.filter(candidate => candidate.type === 0 && candidate.layerNum === original.identity.layerNum && !claimed.has(keyOf(candidate)))) {
        if (await fingerprintElement(e) === original.identity.fingerprint) {
          const candidate = await snapshot(e);
          if (JSON.stringify(candidate.data) === JSON.stringify(original.data) && candidate.fields.thickness === original.fields.thickness && candidate.strokeFields.penColor === original.strokeFields.penColor) {matches.push(e);}
        }
      }
      if (matches.length > 1) {throw new Error('Original stroke identity is ambiguous. Recovery stopped.');}
      present = matches[0];
    }
    if (present) {
      const restored = await snapshot(present);
      if (JSON.stringify(restored.data) !== JSON.stringify(original.data) || restored.fields.thickness !== original.fields.thickness || restored.strokeFields.penColor !== original.strokeFields.penColor) {throw new Error('Original ink has changed. Recovery stopped to preserve your edits.');}
      claimed.add(keyOf(present));
      continue;
    }
    const el: any = result(await PluginCommAPI.createElement(Element.TYPE_STROKE), 'Cannot recreate original stroke.');
    Object.assign(el, clone(original.fields)); Object.assign(el.stroke, clone(original.strokeFields));
    el.pageNum = record.pageNum; el.layerNum = original.identity.layerNum;
    for (const key of ['angles', 'contoursSrc', ...strokeKeys]) {
      const accessor = ['angles', 'contoursSrc'].includes(key) ? el[key] : el.stroke[key], values = original.data[key];
      if (values.length && !await accessor.setRange(0, values.length - 1, values)) {throw new Error('Cannot restore original stroke data.');}
    }
    record.restoredUUIDs[original.identity.uuid] = el.uuid; await journal(record);
    await assertContext(record, live);
    const display = result<{width: number; height: number}>(await PluginCommAPI.getPageDisplaySize(), 'Cannot verify the live page size for restoration.');
    const expectedSize = record.displaySize ?? result<{width: number; height: number}>(await PluginFileAPI.getPageSize(record.filePath, record.pageNum), 'Cannot verify the saved page size for restoration.');
    if (!(display.width > 1 && display.height > 1) || Math.abs(display.width - expectedSize.width) > 1 || Math.abs(display.height - expectedSize.height) > 1) {throw new Error('Return the page to its original display size before restoring the drawing. Recovery data was retained.');}
    result(await PluginCommAPI.insertPageElements([el], record.pageNum, original.identity.layerNum), 'Could not restore original ink in the live note.');
    await saveLive(record, live);
    all = await page(record);
    const restoredCandidates = [];
    for (const candidate of all.filter(e => e.type === Element.TYPE_STROKE && e.layerNum === original.identity.layerNum && !claimed.has(keyOf(e)))) {
      if (await fingerprintElement(candidate) === original.identity.fingerprint) {restoredCandidates.push(candidate);}
    }
    const readback = restoredCandidates.length === 1 ? restoredCandidates[0] : null;
    if (!readback || JSON.stringify((await snapshot(readback)).data) !== JSON.stringify(original.data)) {throw new Error('Restored ink could not be verified.');}
    record.restoredUUIDs[original.identity.uuid] = readback.uuid; claimed.add(keyOf(readback));
    record.restoredNumbers = {...record.restoredNumbers, [original.identity.uuid]: readback.numInPage}; await journal(record);
  }
  all = await page(record);
  const outputs = all.filter(e => record.createdUUIDs.includes(e.uuid));
  for (const expected of record.outputs) {
    if (outputs.some(e => e.uuid === expected.identity.uuid)) {continue;}
    const matches = all.filter(e => e.type === 700 && e.layerNum === expected.identity.layerNum && sameSavedGeometry(e.geometry, expected.geometry));
    if (matches.length > 1) {throw new Error('Output geometry identity is ambiguous. Originals were restored.');}
    if (matches.length === 1) {outputs.push(matches[0]);}
  }
  for (const e of outputs) {
    const expected = record.outputs.find(o => o.identity.uuid === e.uuid || (o.identity.layerNum === e.layerNum && sameSavedGeometry(o.geometry, e.geometry)));
    if (!expected || !sameSavedGeometry(e.geometry, expected.geometry)) {throw new Error('Output geometry changed or could not be verified. Originals were restored; keep both copies.');}
  }
  if (outputs.length) {
    await assertContext(record, live);
    const expectedGeometryCount = all.filter(e => e.type === Element.TYPE_GEO).length - outputs.length;
    await deleteLive(record, outputs, live);
    all = await page(record);
    if (all.filter(e => e.type === Element.TYPE_GEO).length !== expectedGeometryCount) {throw new Error('Output removal could not be verified. Recovery data was retained.');}
  }
  // Verify restored ink again after removing geometry and any element renumbering.
  all = await page(record);
  const verified = await reserveNeighbors(all);
  for (const original of record.originals) {
    const matches = [];
    for (const candidate of all.filter(e => e.type === Element.TYPE_STROKE && e.layerNum === original.identity.layerNum && !verified.has(keyOf(e)))) {
      if (await fingerprintElement(candidate) === original.identity.fingerprint && canonical((await snapshot(candidate)).data) === canonical(original.data)) {matches.push(candidate);}
    }
    if (matches.length !== 1) {throw new Error('Restored original ink could not be verified. Recovery data was retained.');}
    verified.add(keyOf(matches[0]));
  }
  await reload(record, live);
  await forgetCleanup();
  // Live inserted stroke objects must not be recycled while owned by the host.
}
