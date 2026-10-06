import {recognizeSelection, resample, type Point, type ShapeKind} from '../src/shapeRecognition';
const path = (points: Point[], id = 'ink') => ({id, points});
const p = (x: number, y: number) => ({x, y});
const line = (a: Point, b: Point) => Array.from({length: 25}, (_, i) => p(a.x + (b.x - a.x) * i / 24, a.y + (b.y - a.y) * i / 24));
const closed = (v: Point[]) => [...v, v[0]].slice(1).flatMap((b, i) => line(v[i], b));
const rect = [p(20, 20), p(220, 20), p(220, 120), p(20, 120)];
const arrow = [path(line(p(20, 100), p(220, 100)), 'shaft'), path(line(p(220, 100), p(180, 75)), 'top'), path(line(p(180, 125), p(220, 100)), 'bottom')];
it('resamples duplicate points without non-finite coordinates', () => {
  const out = resample([p(0, 0), p(0, 0), p(10, 0)], 10);
  expect(out).toHaveLength(10); expect(out[9]).toEqual(p(10, 0));
});
it.each<ShapeKind>(['line', 'rectangle', 'square', 'circle', 'triangle', 'diamond'])('fits explicit %s', kind => {
  const input = kind === 'line' ? line(p(20, 20), p(220, 25)) : kind === 'circle'
    ? Array.from({length: 129}, (_, i) => p(120 + 70 * Math.cos(i * Math.PI / 64), 120 + 70 * Math.sin(i * Math.PI / 64)))
    : closed(kind === 'triangle' ? [p(120, 20), p(220, 180), p(20, 180)] : kind === 'diamond' ? [p(120, 20), p(220, 120), p(120, 220), p(20, 120)] : kind === 'square' ? [p(20, 20), p(120, 20), p(120, 120), p(20, 120)] : rect);
  expect(recognizeSelection([path(input)], kind).kind).toBe(kind);
});
it('fits a rectangle from reversed, unordered side strokes', () => {
  const sides = rect.map((a, i) => path(line(a, rect[(i + 1) % 4]), String(i)));
  expect(recognizeSelection([sides[2], {...sides[0], points: [...sides[0].points].reverse()}, sides[3], sides[1]], 'rectangle').kind).toBe('rectangle');
});
it('handles three-stroke arrows in any draw direction/order', () => {
  const fit = recognizeSelection([arrow[2], {...arrow[0], points: [...arrow[0].points].reverse()}, arrow[1]], 'arrow');
  expect(fit.styleSourceId).toBe('shaft'); expect(fit.points[1]).toEqual(p(220, 100));
});
it('handles a shaft and one V head', () => {
  const v = [...line(p(180, 75), p(220, 100)), ...line(p(220, 100), p(180, 125))];
  expect(recognizeSelection([arrow[0], path(v, 'head')], 'arrow').kind).toBe('arrow');
});
it('handles a continuous shaft and head path', () => {
  const points = [...arrow[0].points, ...line(p(220, 100), p(180, 75)), ...line(p(180, 75), p(220, 100)), ...line(p(220, 100), p(180, 125))];
  expect(recognizeSelection([path(points)], 'arrow').kind).toBe('arrow');
});
it('handles two arrowheads', () => {
  const fit = recognizeSelection([...arrow, path(line(p(20, 100), p(60, 75)), 'leftTop'), path(line(p(20, 100), p(60, 125)), 'leftBottom')], 'doubleArrow');
  expect(fit.kind).toBe('doubleArrow');
});
it('preserves arbitrary diagonal direction', () => {
  const rotate = (q: Point) => p(300 + q.x * 0.8 - q.y * 0.6, 100 + q.x * 0.6 + q.y * 0.8);
  const fit = recognizeSelection(arrow.map(s => ({...s, points: s.points.map(rotate)})), 'arrow');
  expect(Math.abs(fit.points[1].y - fit.points[0].y)).toBeGreaterThan(100);
});
it('rejects arrows with an unrelated extra stroke', () => {
  expect(() => recognizeSelection([...arrow, path(line(p(400, 0), p(420, 20)), 'extra')], 'arrow')).toThrow();
});
it('does not join separated line fragments', () => {
  expect(() => recognizeSelection([path(line(p(0, 0), p(50, 0)), 'a'), path(line(p(200, 0), p(250, 0)), 'b')], 'line')).toThrow();
});
it('rejects empty, dot, non-finite and oversized input', () => {
  for (const input of [[], [path([p(0, 0)])], [path([p(NaN, 0), p(1, 1)])], Array.from({length: 21}, (_, i) => path(line(p(0, i), p(100, i)), String(i)))]) {
    expect(() => recognizeSelection(input, 'auto')).toThrow();
  }
});
it('Auto finds a clear arrow without closing its head into a shape', () => {
  expect(recognizeSelection(arrow, 'auto').kind).toBe('arrow');
});

function bow(a: Point, b: Point, amount: number): Point[] {
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  return line(a, b).map((q, i) => {
    const offset = amount * Math.sin(i * Math.PI / 24);
    return p(q.x - (b.y - a.y) * offset / span, q.y + (b.x - a.x) * offset / span);
  });
}
it('explicit Arrow fits a rough curved shaft and curved separate head arms', () => {
  const rough = [path(bow(p(20, 100), p(220, 100), 16), 'shaft'), path(bow(p(222, 102), p(180, 78), 12), 'upper'), path(bow(p(182, 127), p(218, 103), -10), 'lower')];
  expect(recognizeSelection(rough, 'arrow').styleSourceId).toBe('shaft');
  expect(recognizeSelection(rough, 'auto').kind).toBe('arrow');
});
it('explicit Arrow accepts an uneven, curved V drawn slightly beyond the shaft tip', () => {
  const v = [...bow(p(182, 78), p(232, 101), 9), ...bow(p(232, 101), p(202, 117), -5)];
  expect(recognizeSelection([arrow[0], path(v, 'head')], 'arrow').kind).toBe('arrow');
});
it('explicit Arrow accepts a retraced continuous rough arrow', () => {
  const shaft = bow(p(20, 100), p(220, 100), 12);
  const top = bow(p(220, 100), p(182, 80), 7);
  const bottom = bow(p(220, 100), p(184, 125), -8);
  expect(recognizeSelection([path([...shaft, ...top, ...top.slice().reverse(), ...bottom])], 'arrow').kind).toBe('arrow');
});
it('explicit Arrow adds a clean head even to a selected line, while Auto keeps it a line', () => {
  expect(recognizeSelection([arrow[0]], 'arrow').kind).toBe('arrow');
  expect(recognizeSelection([arrow[0]], 'auto').kind).toBe('line');
});
it('explicit Double arrow handles rough curved arms at both ends', () => {
  const rough = [arrow[0], path(bow(p(220, 100), p(180, 75), 10), 'rt'), path(bow(p(180, 125), p(220, 100), -10), 'rb'), path(bow(p(20, 100), p(60, 75), 10), 'lt'), path(bow(p(60, 125), p(20, 100), -10), 'lb')];
  expect(recognizeSelection(rough, 'doubleArrow').kind).toBe('doubleArrow');
});

it('fits coordinate axes from one L-shaped stroke in either direction and Auto', () => {
  const l = [...line(p(100, 30), p(100, 200)), ...line(p(100, 200), p(330, 200))];
  for (const points of [l, [...l].reverse()]) {
    for (const choice of ['axes', 'auto'] as const) {
      const result = recognizeSelection([path(points)], choice);
      expect(result.kind).toBe('axes'); expect(result.axes).toBeDefined();
      expect(result.axes!.xEnd.y).toBeCloseTo(result.axes!.origin.y);
      expect(result.axes!.yEnd.x).toBeCloseTo(result.axes!.origin.x);
    }
  }
});
it('fits two separate axes with reversed stroke directions and order', () => {
  const vertical = path(line(p(100, 30), p(100, 200)), 'y');
  const horizontal = path(line(p(330, 200), p(100, 200)), 'x');
  expect(recognizeSelection([horizontal, vertical], 'axes').kind).toBe('axes');
  expect(recognizeSelection([vertical, horizontal], 'auto').kind).toBe('axes');
});
it('rejects disconnected axes, parallel legs and extra strokes', () => {
  for (const paths of [
    [path(line(p(100, 30), p(100, 200))), path(line(p(200, 200), p(330, 200)), 'x')],
    [path(line(p(100, 30), p(100, 200))), path(line(p(110, 30), p(110, 200)), 'x')],
    [path(line(p(100, 30), p(100, 200))), path(line(p(100, 200), p(330, 200)), 'x'), path(line(p(100, 150), p(150, 150)), 'extra')],
  ]) {expect(() => recognizeSelection(paths, 'axes')).toThrow('Snap Axes');}
});
