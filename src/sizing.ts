/**
 * Supernote stores pen widths as integer SDK units. Device verification is
 * required before release; the current firmware convention is 1000 SDK units
 * per millimetre (minimum 100 = 0.1 mm).
 */
export const SDK_UNITS_PER_MM = 1000;
export const MIN_PEN_SIZE_MM = 0.1;
export const MAX_FINE_PEN_SIZE_MM = 2.0;
export const FINE_STEP_MM = 0.1;

// Matches the current native Ink Pen choices. Fine adjustment fills the
// deliberate 1.0 -> 1.5 gap and can reach any tenth in the full range.
export const NATIVE_PEN_SIZES_MM = [
  0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.5, 2.0,
] as const;

export const WIDE_SHAPE_MULTIPLIERS = [2, 4, 8, 12] as const;

export function sdkWidthToMillimetres(width: number): number {
  return width / SDK_UNITS_PER_MM;
}

export function millimetresToSdkWidth(mm: number): number {
  const clamped = Math.max(MIN_PEN_SIZE_MM, mm);
  return Math.round(clamped * SDK_UNITS_PER_MM);
}

export function roundPenMillimetres(mm: number): number {
  const clamped = Math.min(MAX_FINE_PEN_SIZE_MM, Math.max(MIN_PEN_SIZE_MM, mm));
  return Math.round(clamped / FINE_STEP_MM) / 10;
}

export function stepPenMillimetres(mm: number, direction: -1 | 1): number {
  return roundPenMillimetres(mm + direction * FINE_STEP_MM);
}

export function wideShapeWidth(baseWidth: number, multiplier: number): number {
  return Math.max(100, Math.round(baseWidth * multiplier));
}

export function formatPenSize(width: number): string {
  return `${sdkWidthToMillimetres(width).toFixed(1)} mm`;
}
