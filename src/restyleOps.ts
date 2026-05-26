import {PluginCommAPI, PluginFileAPI, PluginNoteAPI, PointUtils} from 'sn-plugin-lib';
import {PEN_COLOR_VALUES, THICKNESS_MIN, type LassoInfo, type RestyleOptions} from './types';

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

export async function getLassoInfo(): Promise<LassoInfo> {
  const ctx = await getContext();

  const lassoRes = (await PluginCommAPI.getLassoElements()) as Res<any[]>;
  if (!lassoRes?.success) throw new Error('Cannot read lasso elements');

  const elements: any[] = lassoRes.result ?? [];
  const strokes  = elements.filter(el => el?.type === 0);
  const geos     = elements.filter(el => el?.type === 700);

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

  return {
    ...ctx,
    strokeCount:   strokes.length,
    geometryCount: geos.length,
    avgThickness,
    elementNums,
  };
}

export async function applyRestyle(info: LassoInfo, options: RestyleOptions): Promise<void> {
  if (options.color === null && options.thickness === null) return;

  const {filePath, pageNum, elementNums} = info;

  // Save while lasso is still active — lasso is a UI overlay, not persisted to file
  await PluginNoteAPI.saveCurrentNote();

  // Fetch only the targeted elements by index — faster than loading all page elements
  const fetched = await Promise.all(
    elementNums.map(n => (PluginFileAPI as any).getElement(filePath, pageNum, n) as Promise<Res<any>>),
  );
  const targets = fetched
    .map(res => res?.result)
    .filter(el => el != null && (el.type === 0 || el.type === 700));

  if (targets.length === 0) {
    await PluginCommAPI.reloadFile();
    return;
  }

  for (const el of targets) {
    if (options.color !== null) {
      if (el.type === 0   && el.stroke)   el.stroke.penColor   = PEN_COLOR_VALUES[options.color];
      if (el.type === 700 && el.geometry) el.geometry.penColor = PEN_COLOR_VALUES[options.color];
    }
    if (options.thickness !== null) {
      if (el.type === 0)                   el.thickness         = Math.max(THICKNESS_MIN, options.thickness);
      if (el.type === 700 && el.geometry)  el.geometry.penWidth = Math.max(THICKNESS_MIN, options.thickness);
    }
  }

  await (PluginFileAPI as any).modifyElements(filePath, pageNum, targets);
  // Reload from file — lasso clears naturally, no explicit commit
  await PluginCommAPI.reloadFile();
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

// Undo implementation — kept for future use, uncomment along with snapshot logic above
// and the 'applied' AppScreen state in types.ts
//
// export async function undoRestyle(
//   filePath: string,
//   pageNum: number,
//   snapshots: any[],
// ): Promise<void> {
//   if (snapshots.length === 0) return;
//   await PluginNoteAPI.saveCurrentNote();
//   const allElements = await getAllPageElements(pageNum, filePath);
//   const snapMap = new Map(snapshots.map(s => [s.numInPage, s]));
//   const targets = allElements.filter(el => el?.numInPage != null && snapMap.has(el.numInPage));
//   for (const el of targets) {
//     const snap = snapMap.get(el.numInPage);
//     if (!snap) continue;
//     if (el.type === 0) {
//       if (snap.originalPenColor !== null && el.stroke)  el.stroke.penColor = snap.originalPenColor;
//       if (snap.originalThickness !== null)              el.thickness        = snap.originalThickness;
//     }
//     if (el.type === 700) {
//       if (snap.originalPenColor !== null && el.geometry) el.geometry.penColor = snap.originalPenColor;
//       if (snap.originalPenWidth !== null && el.geometry) el.geometry.penWidth = snap.originalPenWidth;
//     }
//   }
//   await (PluginFileAPI as any).modifyElements(filePath, pageNum, targets);
//   await PluginCommAPI.reloadFile();
// }
