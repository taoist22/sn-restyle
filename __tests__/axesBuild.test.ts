import {DEFAULT_AXES, axesLayout, axesPieces, validateAxes} from '../src/axesBuild';

const page = {width: 1404, height: 1872};
const spec = {...DEFAULT_AXES, xMin: -3, xMax: 5, yMin: -2, yMax: 4};

describe('axes', () => {
  it('places the origin by the ranges and keeps everything on the page', () => {
    const l = axesLayout(spec, {x: 700, y: 900}, page);
    expect(l.origin.x - l.left).toBeCloseTo(3 * l.unit, 5);
    expect(l.right - l.origin.x).toBeCloseTo(5 * l.unit, 5);
    expect(l.origin.y - l.top).toBeCloseTo(4 * l.unit, 5);
    expect(l.bottom - l.origin.y).toBeCloseTo(2 * l.unit, 5);
    expect(l.left).toBeGreaterThanOrEqual(40); expect(l.right).toBeLessThanOrEqual(1404 - 40);
  });
  it('ticks on both sides of the origin, none at the origin', () => {
    const l = axesLayout(spec, {x: 700, y: 900}, page);
    expect(l.xTicks.length).toBe(8); // -3..5 without 0
    expect(l.yTicks.length).toBe(6); // -2..4 without 0
    expect(l.xTicks.some(p => Math.abs(p.x - l.origin.x) < 1)).toBe(false);
    expect(l.xTicks.some(p => p.x < l.origin.x)).toBe(true);
  });
  it('a larger step gives fewer ticks, at multiples of the step', () => {
    const l = axesLayout({...spec, step: 2}, {x: 700, y: 900}, page);
    expect(l.xTicks.length).toBe(3); // -2, 2, 4
  });
  it('shifts an off-page centre back inside the margins', () => {
    const l = axesLayout(spec, {x: 5, y: 5}, page);
    expect(l.left).toBeGreaterThanOrEqual(40 - 1e-6); expect(l.top).toBeGreaterThanOrEqual(40 - 1e-6);
  });
  it('shrinks to fit a small page', () => {
    const l = axesLayout({...DEFAULT_AXES, xMin: -10, xMax: 10, yMin: -10, yMax: 10}, {x: 200, y: 200}, {width: 300, height: 300});
    expect(l.right - l.left).toBeLessThanOrEqual(220 + 1e-6);
  });
  it('draws no arrowheads by default, and heads only where asked', () => {
    const l = axesLayout(spec, {x: 700, y: 900}, page);
    const plain = axesPieces(l, 'none', 28, 2, 10);
    expect(plain.length).toBe(4); // two axes, two tick paths
    expect(plain[0].points.length).toBe(3);
    expect(plain[2].widthScale).toBe(0.5);
    // Each arrowed end is an outline (full width) plus a separate head fill (its own width).
    const positive = axesPieces(l, 'positive', 28, 2, 10);
    expect(positive.filter(p => p.widthScale === 1).length).toBe(2);
    expect(positive.filter(p => p.widthPx).length).toBe(2);
    const both = axesPieces(l, 'both', 28, 2, 10);
    expect(both.filter(p => p.widthScale === 1).length).toBe(4);
    expect(both.filter(p => p.widthPx).length).toBe(4);
  });
  it('rejects ranges that cannot hold the origin', () => {
    expect(validateAxes(spec)).toBeNull();
    expect(validateAxes({...spec, xMin: 0, xMax: 0})).not.toBeNull();
    expect(validateAxes({...spec, yMin: 1})).not.toBeNull();
  });
});
