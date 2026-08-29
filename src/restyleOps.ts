import {Element, PluginCommAPI, PluginFileAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
import {PEN_COLOR_VALUES, THICKNESS_MIN, type ElementSnapshot, type LassoInfo, type RestyleOptions} from './types';

type Res<T> = {success: boolean; result?: T; error?: {message?: string}} | null | undefined;
type Size  = {width: number; height: number};

function errorMessage<T>(res: Res<T>, fallback: string): string {
  return res?.error?.message || fallback;
}

async function saveCurrentNote(): Promise<void> {
  const res = (await PluginNoteAPI.saveCurrentNote()) as Res<boolean>;
  if (!res?.success) {throw new Error(errorMessage(res, 'Could not save the current note'));}
}

async function reloadCurrentFile(): Promise<void> {
  const res = (await PluginCommAPI.reloadFile()) as Res<boolean>;
  if (!res?.success) {throw new Error(errorMessage(res, 'Could not reload the current note'));}
}

async function getContext(): Promise<{filePath: string; pageNum: number}> {
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
  return res?.result ?? {width: 1404, height: 1872};
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
    if (deviceType == null) {return false;}

    const machineRes = (await PluginFileAPI.getFileMachineType(filePath)) as Res<number>;
    if (machineRes?.success && typeof machineRes.result === 'number') {
      return machineRes.result !== deviceType;
    }

    // Older firmware fallback: compare canvas sizes when machine metadata is
    // unavailable. This retains the v0.4.0 guard without guessing on failure.
    const native = DEVICE_NATIVE[deviceType];
    if (!native) {return false;} // unknown device — don't block

    const canvas = await getPageSize(filePath, pageNum);
    const [cw, ch] = normSize(canvas.width, canvas.height);
    const [nw, nh] = normSize(native[0], native[1]);
    return cw !== nw || ch !== nh;
  } catch {
    return false; // can't determine — don't block
  }
}

export async function getLassoInfo(): Promise<LassoInfo> {
  const ctx = await getContext();

  const lassoRes = (await PluginCommAPI.getLassoElements()) as Res<any[]>;
  if (!lassoRes?.success) {throw new Error('Cannot read lasso elements');}

  const lassoElements: any[] = lassoRes.result ?? [];
  const allReadElements: any[] = [...lassoElements];

  try {
    const strokes = lassoElements.filter(el => el?.type === Element.TYPE_STROKE);
    const geos    = lassoElements.filter(el => el?.type === Element.TYPE_GEO);

    if (strokes.length === 0 && geos.length === 0) {
      throw new Error('No strokes or geometry in selection');
    }

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

    const penRes = (await PluginCommAPI.getPenInfo()) as Res<{width?: number}>;
    const currentPenWidth = penRes?.success && typeof penRes.result?.width === 'number'
      ? penRes.result.width
      : null;

    // Cross-device note check (note canvas size vs this device's native size).
    const crossDevice = await detectCrossDevice(ctx.filePath, ctx.pageNum);

    return {
      ...ctx,
      strokeCount:   strokes.length,
      geometryCount: geos.length,
      avgThickness,
      avgGeometryWidth,
      hasMixedThickness,
      currentPenWidth,
      elementNums,
      hasMarkerStroke,
      crossDevice,
    };
  } finally {
    await recycleAll(allReadElements);
    clearCacheSafely();
  }
}

export async function applyRestyle(info: LassoInfo, options: RestyleOptions): Promise<ElementSnapshot[]> {
  if (options.color === null && options.thickness === null) {return [];}

  const {filePath, pageNum, elementNums} = info;

  // Flush strokes to file, then CLEAR the lasso before reading/modifying.
  // modifyElements while a lasso is active corrupts stroke positions on notes
  // containing H (title) elements; reloadFile drops the lasso/floating state so
  // the write happens against clean coordinates. (Confirmed on-device 2026-06-04.)
  await saveCurrentNote();
  await reloadCurrentFile();
  const allFileElements = await getAllPageElements(pageNum, filePath);

  try {
    const targets = allFileElements.filter(
      el => el?.numInPage != null &&
            elementNums.includes(el.numInPage) &&
            (el.type === Element.TYPE_STROKE || el.type === Element.TYPE_GEO),
    );

    if (targets.length === 0) {
      // Lasso already cleared above; nothing further to do.
      return [];
    }

    // Capture snapshot of original values before modifying — used for undo
    const snapshot: ElementSnapshot[] = targets.map(el => ({
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

    const modifyRes = (await PluginFileAPI.modifyElements(filePath, pageNum, targets)) as Res<number[]>;
    if (!modifyRes?.success) {throw new Error(errorMessage(modifyRes, 'Restyle write failed'));}
    // Reload to render the change.
    await reloadCurrentFile();

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
): Promise<void> {
  if (snapshots.length === 0) {return;}
  // Clear any active lasso before modifyElements (same H-element safety as
  // applyRestyle) — covers the case where the plugin was opened via the lasso
  // button while an undo was pending.
  await saveCurrentNote();
  await reloadCurrentFile();
  const allElements = await getAllPageElements(pageNum, filePath);

  try {
    const snapMap = new Map(snapshots.map(s => [s.numInPage, s]));
    const targets = allElements.filter(el => el?.numInPage != null && snapMap.has(el.numInPage));
    for (const el of targets) {
      const snap = snapMap.get(el.numInPage)!;
      if (el.type === Element.TYPE_STROKE) {
        if (snap.originalPenColor  !== null && el.stroke)   {el.stroke.penColor = snap.originalPenColor;}
        if (snap.originalThickness !== null)                {el.thickness        = snap.originalThickness;}
      }
      if (el.type === Element.TYPE_GEO) {
        if (snap.originalPenColor !== null && el.geometry)  {el.geometry.penColor = snap.originalPenColor;}
        if (snap.originalPenWidth !== null && el.geometry)  {el.geometry.penWidth = snap.originalPenWidth;}
      }
    }
    const modifyRes = (await PluginFileAPI.modifyElements(filePath, pageNum, targets)) as Res<number[]>;
    if (!modifyRes?.success) {throw new Error(errorMessage(modifyRes, 'Undo write failed'));}
    await reloadCurrentFile();
  } finally {
    await recycleAll(allElements);
    clearCacheSafely();
  }
}
