import {assertContext, assertSelection, assertUnmoved, exactTargets, identityOf, fingerprintElement} from './selectionSafety';
import {Element, PluginCommAPI, PluginFileAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
import {PEN_COLOR_VALUES, THICKNESS_MIN, type ElementSnapshot, type LassoInfo, type RestyleOptions} from './types';

type Res<T> = {success: boolean; result?: T; error?: {message?: string}} | null | undefined;
export class StyleRecoveryError extends Error {
  constructor(message: string, public snapshots: ElementSnapshot[]) {super(message); this.name = 'StyleRecoveryError';}
}
type Size  = {width: number; height: number};

function errorMessage<T>(res: Res<T>, fallback: string): string {
  return res?.error?.message || fallback;
}

async function saveCurrentNote(): Promise<void> {
  const res = (await PluginNoteAPI.saveCurrentNote()) as Res<boolean>;
  if (!res?.success || res.result !== true) {throw new Error(errorMessage(res, 'Could not save the current note'));}
}

async function reloadCurrentFile(): Promise<void> {
  const res = (await PluginCommAPI.reloadFile()) as Res<boolean>;
  if (!res?.success || res.result !== true) {throw new Error(errorMessage(res, 'Could not reload the current note'));}
}

export async function getContext(): Promise<{filePath: string; pageNum: number}> {
  const pathRes = (await PluginCommAPI.getCurrentFilePath()) as Res<string>;
  const pageRes = (await PluginCommAPI.getCurrentPageNum()) as Res<number>;
  if (!pathRes?.success || !pathRes.result) {throw new Error('Cannot read file path');}
  if (!pageRes?.success || pageRes.result == null) {throw new Error('Cannot read page number');}
  return {filePath: pathRes.result, pageNum: pageRes.result};
}

async function getAllPageElements(pageNum: number, filePath: string): Promise<any[]> {
  const res = (await (PluginFileAPI as any).getElements(pageNum, filePath)) as Res<any[]>;
  if (!res?.success) {throw new Error(errorMessage(res, 'Cannot read page elements'));}

  // Firmware has occasionally returned the same element more than once. Keep
  // one native object per UUID/element number so style writes are deterministic.
  const seen = new Set<string>();
  return (res.result ?? []).filter(el => {
    const key = String(el?.uuid ?? `num:${el?.numInPage}`);
    if (seen.has(key)) {return false;}
    seen.add(key);
    return true;
  });
}

async function getPageSize(filePath: string, pageNum: number): Promise<Size> {
  const res = (await (PluginFileAPI as any).getPageSize(filePath, pageNum)) as Res<Size>;
  if (!res?.success || !res.result || res.result.width < 1 || res.result.height < 1) {throw new Error('Cannot verify page dimensions.');}
  return res.result;
}

async function recycleAll(elements: any[]): Promise<void> {
  for (const el of elements) {
    try { await el?.recycle?.(); } catch { /* tolerate cleanup failures */ }
  }
}

function clearCacheSafely(): void {
  try { (PluginCommAPI as any).clearElementCache?.(); } catch { /* not critical */ }
}

// Native portrait canvas [width, height] by device type. A note carries its
// CREATOR device's canvas size, so a mismatch with the current device's native
// size means the note was made on a different Supernote model. modifyElements on
// such cross-device notes corrupts stroke positions (canvas-vs-device coordinate
// gap), so we detect and disable rather than silently move strokes.
const DEVICE_NATIVE: Record<number, [number, number]> = {
  3: [1404, 1872], // A5X
  4: [1404, 1872], // Nomad (A6X2)
  5: [1920, 2560], // Manta (A5X2)
};

function normSize(w: number, h: number): [number, number] {
  return w <= h ? [w, h] : [h, w]; // orientation-independent
}

async function detectCrossDevice(filePath: string, pageNum: number): Promise<boolean> {
  try {
    const deviceType = await PluginManager.getDeviceType();
    const native = DEVICE_NATIVE[deviceType];
    if (!native) {throw new Error('This device has not been verified for Restyle.');}

    // Do not compare getFileMachineType() and getDeviceType() directly. Some
    // firmware generations report different enum families for those calls.
    // The page dimensions are the value that matters to coordinate safety.
    const canvas = await getPageSize(filePath, pageNum);
    const [cw, ch] = normSize(canvas.width, canvas.height);
    const [nw, nh] = normSize(native[0], native[1]);
    return cw !== nw || ch !== nh;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Cannot verify the note device.');
  }
}

export async function getLassoInfo(): Promise<LassoInfo> {
  const ctx = await getContext();
  await assertContext(ctx);
  clearCacheSafely();

  const lassoRes = (await PluginCommAPI.getLassoElements()) as Res<any[]>;
  if (!lassoRes?.success) {throw new Error('Cannot read lasso elements');}

  const lassoElements: any[] = lassoRes.result ?? [];
  const allReadElements = [...lassoElements];

  try {
    const strokes = lassoElements.filter(el => el?.type === Element.TYPE_STROKE);
    const geos    = lassoElements.filter(el => el?.type === Element.TYPE_GEO);

    if (strokes.length === 0 && geos.length === 0) {
      throw new Error('No strokes or geometry in selection');
    }
    // One shape is styled through the native lasso API, which needs no settled position.
    // File-based paths read saved coordinates, so a moved selection must be committed first.
    if (!(strokes.length === 0 && geos.length === 1 && lassoElements.length === 1)) {await assertUnmoved();}

    const elementNums = [...strokes, ...geos]
      .map(el => el?.numInPage)
      .filter((n): n is number => n != null);

    const strokeWidths = strokes.map(el => el?.thickness).filter((t): t is number => t > 0);
    const geometryWidths = geos.map(el => el?.geometry?.penWidth).filter((t): t is number => t > 0);
    const widths = [...strokeWidths, ...geometryWidths];
    const avgThickness = widths.length > 0
      ? Math.round(widths.reduce((a, b) => a + b, 0) / widths.length)
      : 100;
    const avgGeometryWidth = geometryWidths.length > 0
      ? Math.round(geometryWidths.reduce((a, b) => a + b, 0) / geometryWidths.length)
      : 100;
    const hasMixedThickness = new Set(widths).size > 1;

    // Detect freehand marker strokes — firmware caps their renderable width, so we
    // disable thickness changes for them (color-only, matching OS behavior). Geometry
    // drawn with the marker pen is unaffected.
    const hasMarkerStroke = strokes.some(el => el?.stroke?.penType === 11);

    // Cross-device note check (note canvas size vs this device's native size).
    const crossDevice = await detectCrossDevice(ctx.filePath, ctx.pageNum);

    const identities = [];
    for (const el of [...strokes, ...geos]) {identities.push({...identityOf(el), fingerprint: await fingerprintElement(el)});}
    return {
      ...ctx,
      identities,
      otherCount: lassoElements.length - strokes.length - geos.length,
      strokeCount:   strokes.length,
      geometryCount: geos.length,
      avgThickness,
      avgGeometryWidth,
      hasMixedThickness,
      elementNums,
      hasMarkerStroke,
      crossDevice,
    };
  } finally {
    // Preserve Restyle’s established leak-prevention behavior pending device tests.
    await recycleAll(allReadElements);
    clearCacheSafely();
  }
}

export async function applyRestyle(info: LassoInfo, options: RestyleOptions, live: () => void = () => {}): Promise<ElementSnapshot[]> {
  if (options.color === null && options.thickness === null) {return [];}

  const {filePath, pageNum} = info;
  if (info.crossDevice) {throw new Error('Restyle is disabled on cross-device notes.');}
  if (info.hasMarkerStroke && options.thickness !== null) {throw new Error('Marker strokes support color changes only.');}
  const singleShape = info.strokeCount === 0 && info.geometryCount === 1 && info.otherCount === 0;
  await assertContext(info, live); if (!singleShape) {await assertUnmoved();} await assertSelection(info.identities);

  // The lasso API changes one geometry without rewriting the page coordinates.
  if (info.strokeCount === 0 && info.geometryCount === 1 && info.otherCount === 0) {
    const res: any = await PluginCommAPI.getLassoGeometries();
    if (!res?.success || res.result?.length !== 1) {throw new Error('Cannot read the selected geometry.');}
    const geo = res.result[0], id = info.identities[0];
    const before: ElementSnapshot = {uuid: id.uuid, layerNum: id.layerNum, numInPage: id.numInPage, type: id.type, fingerprint: id.fingerprint, originalPenColor: geo.penColor, originalPenWidth: geo.penWidth, originalThickness: null};
    const next = {...geo, showLassoAfterInsert: true};
    if (options.color !== null) {next.penColor = PEN_COLOR_VALUES[options.color];}
    if (options.thickness !== null) {next.penWidth = Math.max(THICKNESS_MIN, options.thickness);}
    await assertContext(info, live);
    let written: any;
    try {written = await PluginCommAPI.modifyLassoGeometry(next);}
    catch (error) {throw new StyleRecoveryError(error instanceof Error ? error.message : 'Shape styling failed.', [before]);}
    if (!written?.success || written.result !== true) {throw new StyleRecoveryError(errorMessage(written, 'Shape styling failed.'), [before]);}
    // Follow Palette's single-shape path: the native boolean is authoritative.
    // A second lasso read can be empty or stale after the host replaces its selection.
    return [before];
  }

  // Flush strokes to file, then CLEAR the lasso before reading/modifying.
  // modifyElements while a lasso is active corrupts stroke positions on notes
  // containing H (title) elements; reloadFile drops the lasso/floating state so
  // the write happens against clean coordinates. (Confirmed on-device 2026-06-04.)
  await assertContext({filePath, pageNum}, live);
  await saveCurrentNote();
  await assertContext({filePath, pageNum}, live);
  await reloadCurrentFile();
  await assertContext({filePath, pageNum}, live);
  const allFileElements = await getAllPageElements(pageNum, filePath);

  try {
    const targets = await exactTargets(allFileElements, info.identities);

    // Capture snapshot of original values before modifying — used for undo
    const snapshot: ElementSnapshot[] = targets.map(el => ({
      uuid:              el.uuid,
      layerNum:          el.layerNum,
      fingerprint:       info.identities.find(id => id.numInPage === el.numInPage)?.fingerprint,
      numInPage:         el.numInPage,
      type:              el.type,
      originalPenColor:  el.type === Element.TYPE_STROKE ? (el.stroke?.penColor ?? null) : (el.geometry?.penColor ?? null),
      originalThickness: el.type === Element.TYPE_STROKE ? (el.thickness ?? null) : null,
      originalPenWidth:  el.type === Element.TYPE_GEO ? (el.geometry?.penWidth ?? null) : null,
    }));

    for (const el of targets) {
      if (options.color !== null) {
        if (el.type === Element.TYPE_STROKE && el.stroke) {el.stroke.penColor = PEN_COLOR_VALUES[options.color];}
        if (el.type === Element.TYPE_GEO && el.geometry) {el.geometry.penColor = PEN_COLOR_VALUES[options.color];}
      }
      if (options.thickness !== null) {
        // Skip thickness for freehand marker strokes — see hasMarkerStroke note in getLassoInfo.
        if (el.type === Element.TYPE_STROKE && el.stroke?.penType !== 11) {el.thickness = Math.max(THICKNESS_MIN, options.thickness);}
        if (el.type === Element.TYPE_GEO && el.geometry) {el.geometry.penWidth = Math.max(THICKNESS_MIN, options.thickness);}
      }
    }

    await assertContext({filePath, pageNum}, live);
    let modifyRes: Res<number[]>;
    try {modifyRes = await PluginFileAPI.modifyElements(filePath, pageNum, targets) as Res<number[]>;}
    catch (error) {throw new StyleRecoveryError(error instanceof Error ? error.message : 'The style write could not be verified.', snapshot);}
    if (!modifyRes?.success || !Array.isArray(modifyRes.result) || !targets.every(e => modifyRes?.result?.includes(e.numInPage))) {
      // Restore the whole captured style set if only a subset was written.
      for (const el of targets) {
        const before = snapshot.find(v => v.uuid === el.uuid)!;
        if (el.stroke) {el.stroke.penColor = before.originalPenColor; el.thickness = before.originalThickness;}
        if (el.geometry) {el.geometry.penColor = before.originalPenColor; el.geometry.penWidth = before.originalPenWidth;}
      }
      await assertContext({filePath, pageNum}, live);
      const restored = await PluginFileAPI.modifyElements(filePath, pageNum, targets) as Res<number[]>;
      await reloadCurrentFile();
      throw new StyleRecoveryError(restored?.success && targets.every(e => restored.result?.includes(e.numInPage)) ? 'The style change was incomplete; original styles were restored.' : 'The style change was incomplete. Reopen Restyle to restore original styles.', snapshot);
    }
    // modifyElements already reported every target as written. Do not compare values
    // read back: the firmware may re-encode width or shade, and a false mismatch would
    // offer to undo a change that worked.
    try {
      await assertContext({filePath, pageNum}, live);
      await reloadCurrentFile();
    } catch (error) {throw new StyleRecoveryError(error instanceof Error ? error.message : 'Could not refresh the note after styling.', snapshot);}
    return snapshot;
  } finally {
    await recycleAll(allFileElements);
    clearCacheSafely();
  }
}

export async function undoRestyle(
  filePath: string,
  pageNum: number,
  snapshots: ElementSnapshot[],
  live: () => void = () => {},
): Promise<void> {
  if (snapshots.length === 0) {return;}
  // Clear any active lasso before modifyElements (same H-element safety as
  // applyRestyle) — covers the case where the plugin was opened via the lasso
  // button while an undo was pending.
  await assertContext({filePath, pageNum}, live);
  await saveCurrentNote();
  await assertContext({filePath, pageNum}, live);
  await reloadCurrentFile();
  await assertContext({filePath, pageNum}, live);
  const allElements = await getAllPageElements(pageNum, filePath);

  try {
    const snapMap = new Map(snapshots.map(s => [s.uuid, s]));
    const targets = await exactTargets(allElements, snapshots);
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      const snap = snapMap.get(el.uuid) ?? snapshots[i];
      if (el.type === Element.TYPE_STROKE) {
        if (snap.originalPenColor  !== null && el.stroke)   {el.stroke.penColor = snap.originalPenColor;}
        if (snap.originalThickness !== null)                {el.thickness        = snap.originalThickness;}
      }
      if (el.type === Element.TYPE_GEO) {
        if (snap.originalPenColor !== null && el.geometry)  {el.geometry.penColor = snap.originalPenColor;}
        if (snap.originalPenWidth !== null && el.geometry)  {el.geometry.penWidth = snap.originalPenWidth;}
      }
    }
    await assertContext({filePath, pageNum}, live);
    const modifyRes = (await PluginFileAPI.modifyElements(filePath, pageNum, targets)) as Res<number[]>;
    if (!modifyRes?.success || !targets.every(e => modifyRes.result?.includes(e.numInPage))) {throw new Error(errorMessage(modifyRes, 'Undo was incomplete; keep the recovery record and retry.'));}
    await assertContext({filePath, pageNum}, live);
    await reloadCurrentFile();
  } finally {
    await recycleAll(allElements);
    clearCacheSafely();
  }
}
