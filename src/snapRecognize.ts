import {fitShape, type FitKind, type P, type Shape} from './shapeFit';

/** Single-stroke shape choices. */
export type ShapeChoice = 'keep' | 'auto' | FitKind;
export const SHAPE_CHOICES: {value: ShapeChoice; label: string; group: 'basic' | 'flow'}[] = [
  {value: 'keep', label: 'Keep drawing', group: 'basic'}, {value: 'auto', label: 'Auto', group: 'basic'},
  {value: 'line', label: 'Line', group: 'basic'}, {value: 'rectangle', label: 'Rectangle', group: 'basic'}, {value: 'circle', label: 'Circle', group: 'basic'},
  {value: 'arrow', label: 'Arrow', group: 'basic'}, {value: 'axes', label: 'Axes', group: 'basic'},
  {value: 'elbow', label: 'Elbow arrow', group: 'flow'}, {value: 'diamond', label: 'Diamond', group: 'flow'}, {value: 'roundedRect', label: 'Rounded box', group: 'flow'},
  {value: 'parallelogram', label: 'Parallelogram', group: 'flow'}, {value: 'triangle', label: 'Triangle', group: 'flow'},
];

/** Fit one stroke with Restyle's own recognizer; `force` fits a named shape even when it fits poorly. */
export function recognizeStroke(points: P[], choice: Exclude<ShapeChoice, 'keep'>, force = false): {shape: Shape | null; notes: string[]} {
  return fitShape(points, choice, force);
}
