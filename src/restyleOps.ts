import {PluginCommAPI, PluginFileAPI, PluginManager, PluginNoteAPI, PointUtils} from 'sn-plugin-lib';
import {PEN_COLOR_VALUES, THICKNESS_MIN, type ElementSnapshot, type LassoInfo, type RestyleOptions} from './types';

type Res<T> = {success: boolean; result?: T; error?: {message?: string}} | null | undefined;
type Rect  = {left: number; top: number; right: number; bottom: number};
type Point = {x: number; y: number};
type Size  = {width: number; height: number};

async function getContext(): Promise<{filePath: string; pageNum: number}> {
  const pathRes = (await PluginCommAPI.getCurrentFilePath()) as Res<string>;
  const pageRes = (await PluginCommAPI.getCurrentPageNum()) as Res<number>;
  if (!pathRes?.success || !pathRes.result) throw new Error('Cannot read file path');
  if (!pageRes?.success || pageRes.result == null) throw new Error('Cannot read page number');
  return {filePath: pathRes.result, pageNum: pageRes.result};
}

async function getAllPageElements(pageNum: number, filePath: string): Promise<any[]> {
  const res = (await (PluginFileAPI as any).getElements(pageNum, filePath)) as Res<any[]>;
  return res?.result ?? [];
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
    const dt = (await (PluginManager as any).getDeviceType()) as unknown;
    let deviceType: number | null = null;
    if (typeof dt === 'number') deviceType = dt;
    else if (dt && typeof (dt as any).result === 'number') deviceType = (dt as any).result;
    if (deviceType == null) return false;

    const native = DEVICE_NATIVE[deviceType];
    if (!native) return false; // unknown device — don't block

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
  if (!lassoRes?.success) throw new Error('Cannot read lasso elements');

  const lassoElements: any[] = lassoRes.result ?? [];
  const allReadElements: any[] = [...lassoElements];

  try {
    const strokes = lassoElements.filter(el => el?.type === 0);
    const geos    = lassoElements.filter(el => el?.type === 700);

    if (strokes.length === 0 && geos.length === 0) {
      throw new Error('No strokes or geometry in selection');
    }

    const elementNums = [...strokes, ...geos]
      .map(el => el?.numInPage)
      .filter((n): n is number => n != null);

    const thicknesses = strokes.map(el => el?.thickness ?? 100).filter((t: number) => t > 0);
    const avgThickness = thicknesses.length > 0
      ? Math.round(thicknesses.reduce((a: number, b: number) => a + b, 0) / thicknesses.length)
      : 100;

    // Detect freehand marker strokes — firmware caps their renderable width, so we
    // disable thickness changes for them (color-only, matching OS behavior). Geometry
    // drawn with the marker pen is unaffected.
    const hasMarkerStroke = strokes.some(el => el?.stroke?.penType === 11);

    // Cross-device note check (note canvas size vs this device's native size).
    const crossDevice = await detectCrossDevice(ctx.filePath, ctx.pageNum);

    return {
      ...ctx,
      strokeCount:   strokes.length,
      geometryCount: geos.length,
      avgThickness,
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
  if (options.color === null && options.thickness === null) return [];

  const {filePath, pageNum, elementNums} = info;

  // Flush strokes to file, then CLEAR the lasso before reading/modifying.
  // modifyElements while a lasso is active corrupts stroke positions on notes
  // containing H (title) elements; reloadFile drops the lasso/floating state so
  // the write happens against clean coordinates. (Confirmed on-device 2026-06-04.)
  await PluginNoteAPI.saveCurrentNote();
  await PluginCommAPI.reloadFile();
  const allFileElements = await getAllPageElements(pageNum, filePath);

  try {
    const targets = allFileElements.filter(
      el => el?.numInPage != null &&
            elementNums.includes(el.numInPage) &&
            (el.type === 0 || el.type === 700),
    );

    if (targets.length === 0) {
      // Lasso already cleared above; nothing further to do.
      return [];
    }

    // Capture snapshot of original values before modifying — used for undo
    const snapshot: ElementSnapshot[] = targets.map(el => ({
      numInPage:         el.numInPage,
      type:              el.type,
      originalPenColor:  el.type === 0 ? (el.stroke?.penColor ?? null) : (el.geometry?.penColor ?? null),
      originalThickness: el.type === 0 ? (el.thickness ?? null) : null,
      originalPenWidth:  el.type === 700 ? (el.geometry?.penWidth ?? null) : null,
    }));

    for (const el of targets) {
      if (options.color !== null) {
        if (el.type === 0   && el.stroke)   el.stroke.penColor   = PEN_COLOR_VALUES[options.color];
        if (el.type === 700 && el.geometry) el.geometry.penColor = PEN_COLOR_VALUES[options.color];
      }
      if (options.thickness !== null) {
        // Skip thickness for freehand marker strokes — see hasMarkerStroke note in getLassoInfo.
        if (el.type === 0 && el.stroke?.penType !== 11)  el.thickness         = Math.max(THICKNESS_MIN, options.thickness);
        if (el.type === 700 && el.geometry)              el.geometry.penWidth = Math.max(THICKNESS_MIN, options.thickness);
      }
    }

    await (PluginFileAPI as any).modifyElements(filePath, pageNum, targets);
    // Reload to render the change.
    await PluginCommAPI.reloadFile();

    return snapshot;
  } finally {
    await recycleAll(allFileElements);
    clearCacheSafely();
  }
}

// Reads the new positions of modified elements from the file and creates a
// lasso selection around them so the user can immediately drag to reposition.
async function relassoElements(
  elementNums: number[],
  pageNum: number,
  filePath: string,
): Promise<void> {
  try {
    const pageSize = await getPageSize(filePath, pageNum);
    const allElements = await getAllPageElements(pageNum, filePath);
    const targets = allElements.filter(
      el => el?.numInPage != null && elementNums.includes(el.numInPage),
    );

    if (targets.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const el of targets) {
      if (el.type === 0 && el.stroke) {
        const count: number = await el.stroke.points.size();
        if (count > 0) {
          const pt: Point | null = await el.stroke.points.get(0);
          if (pt) {
            const px = PointUtils.emrPoint2Android(pt, pageSize);
            minX = Math.min(minX, px.x); minY = Math.min(minY, px.y);
            maxX = Math.max(maxX, px.x); maxY = Math.max(maxY, px.y);
          }
        }
      } else if (el.type === 700 && el.geometry) {
        const geo = el.geometry;
        if (geo.ellipseCenterPoint) {
          const c: Point = geo.ellipseCenterPoint;
          minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
          maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y);
        } else if (geo.points?.[0]) {
          for (const p of geo.points as Point[]) {
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
          }
        }
      }
    }

    if (minX === Infinity) return;

    const PAD = 200;
    const rect: Rect = {
      left:   Math.max(0, minX - PAD),
      top:    Math.max(0, minY - PAD),
      right:  maxX + PAD,
      bottom: maxY + PAD,
    };

    await (PluginCommAPI as any).lassoElements(rect);
  } catch {
    // Re-lasso is a convenience; if it fails, the apply still succeeded
  }
}

export async function undoRestyle(
  filePath: string,
  pageNum: number,
  snapshots: ElementSnapshot[],
): Promise<void> {
  if (snapshots.length === 0) return;
  // Clear any active lasso before modifyElements (same H-element safety as
  // applyRestyle) — covers the case where the plugin was opened via the lasso
  // button while an undo was pending.
  await PluginNoteAPI.saveCurrentNote();
  await PluginCommAPI.reloadFile();
  const allElements = await getAllPageElements(pageNum, filePath);

  try {
    const snapMap = new Map(snapshots.map(s => [s.numInPage, s]));
    const targets = allElements.filter(el => el?.numInPage != null && snapMap.has(el.numInPage));
    for (const el of targets) {
      const snap = snapMap.get(el.numInPage)!;
      if (el.type === 0) {
        if (snap.originalPenColor  !== null && el.stroke)   el.stroke.penColor = snap.originalPenColor;
        if (snap.originalThickness !== null)                el.thickness        = snap.originalThickness;
      }
      if (el.type === 700) {
        if (snap.originalPenColor !== null && el.geometry)  el.geometry.penColor = snap.originalPenColor;
        if (snap.originalPenWidth !== null && el.geometry)  el.geometry.penWidth = snap.originalPenWidth;
      }
    }
    await (PluginFileAPI as any).modifyElements(filePath, pageNum, targets);
    await PluginCommAPI.reloadFile();
  } finally {
    await recycleAll(allElements);
    clearCacheSafely();
  }
}
