export type PenColor = 'black' | 'darkGray' | 'lightGray' | 'ghost';

export const PEN_COLOR_VALUES: Record<PenColor, number> = {
  black:     0x00,
  darkGray:  0x9D,
  lightGray: 0xC9,
  ghost:     0xFE,
};

export const PEN_COLOR_LABELS: Record<PenColor, string> = {
  black:     'Black',
  darkGray:  'Dark Gray',
  lightGray: 'Light Gray',
  ghost:     'Ghost',
};

// Raw SDK thickness units. Assumed to be 100-based (100 = 1.0 pen width).
// Verify on-device — adjust THICKNESS_SCALE and THICKNESS_STEP if wrong.
export const THICKNESS_SCALE = 100;
export const THICKNESS_STEP  = 10;   // one step = 0.1 in display terms
export const THICKNESS_MIN   = 10;   // guard against zero/negative

export interface LassoInfo {
  filePath: string;
  pageNum: number;
  strokeCount: number;
  geometryCount: number;
  avgThickness: number;      // raw SDK value, used as stepper starting point
  elementNums: number[];     // numInPage values from lasso, for file-level lookup
  hasMarkerStroke: boolean;  // true if selection contains any freehand marker stroke (type=0, penType=11) — thickness control disabled
  crossDevice: boolean;      // true if the note's canvas size ≠ this device's native size (created on a different Supernote model) — restyle disabled to avoid position corruption
}

export interface ElementSnapshot {
  numInPage: number;
  type: number;
  originalPenColor: number | null;
  originalThickness: number | null;  // strokes only: element.thickness
  originalPenWidth: number | null;   // geometry only: geometry.penWidth
}

export interface Preset {
  color: PenColor;
  thickness: number;  // raw SDK value
}

export interface RestyleOptions {
  color: PenColor | null;    // null = no color change
  thickness: number | null;  // null = no thickness change; raw SDK value
}

export type AppScreen =
  | {kind: 'detecting'}
  | {kind: 'panel'; info: LassoInfo}
  | {kind: 'undo'; snapshot: ElementSnapshot[]; filePath: string; pageNum: number}
  | {kind: 'working'; message: string}
  | {kind: 'error'; message: string};
