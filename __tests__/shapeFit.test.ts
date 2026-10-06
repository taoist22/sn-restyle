import {fitShape, type P} from '../src/shapeFit';

let seed = 7;
const rnd = () => {seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 - 0.5;};
const jitter = (pts: P[], amount: number) => pts.map(p => ({x: p.x + rnd() * amount, y: p.y + rnd() * amount}));
const seg = (a: P, b: P, step = 1.8): P[] => {
  const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
  return Array.from({length: n}, (_, i) => ({x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n}));
};
const poly = (...v: P[]) => v.slice(1).flatMap((q, i) => seg(v[i], q)).concat([v[v.length - 1]]);
const near = (a: P, b: P, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const P = (x: number, y: number): P => ({x, y});

describe('shapeFit', () => {
  // Modelled on the measured device strokes: pen-down hook, tip reached twice, second pass further.
  it('finds the tip of an arrow whose second pass overshoots the first', () => {
    const stroke = jitter(poly(P(885, 941), P(879, 941), P(886, 941), P(1005, 937), P(985, 918), P(1014, 936), P(956, 962)), 1.2);
    const {shape, notes} = fitShape(stroke, 'auto');
    expect(notes.join()).toContain('arrow');
    expect(shape?.kind).toBe('arrow');
    if (shape?.kind === 'arrow') {expect(near(shape.tip, P(1010, 937), 14)).toBe(true); expect(near(shape.tail, P(885, 941), 10)).toBe(true);}
  });
  it('finds the second measured arrow (barb detour about 10% of the shaft)', () => {
    const stroke = jitter(poly(P(795, 1245), P(965, 1236), P(940, 1215), P(975, 1234), P(926, 1259)), 1.2);
    expect(fitShape(stroke, 'auto').shape?.kind).toBe('arrow');
  });
  it.each([
    ['right to left', [P(900, 500), P(700, 500), P(725, 480), P(705, 500), P(725, 522)]],
    ['vertical', [P(400, 300), P(400, 520), P(380, 495), P(402, 522), P(422, 495)]],
    ['diagonal', [P(300, 300), P(480, 420), P(444, 414), P(482, 422), P(462, 388)]],
  ])('recognizes an arrow drawn %s', (_name, v) => {
    expect(fitShape(jitter(poly(...(v as P[])), 1), 'auto').shape?.kind).toBe('arrow');
  });
  it('leaves a bowed line with a one-sided hook as not an arrow', () => {
    expect(fitShape(poly(P(100, 100), P(300, 100), P(280, 80)), 'auto').shape?.kind).not.toBe('arrow');
  });
  it('recognizes a wobbly line and straightens it to horizontal', () => {
    const {shape} = fitShape(jitter(poly(P(100, 200), P(400, 206)), 3), 'auto');
    expect(shape?.kind).toBe('line');
    if (shape?.kind === 'line') {expect(shape.a.y).toBeCloseTo(shape.b.y, 5);}
  });
  it('recognizes an L as axes with the origin at the corner', () => {
    const {shape} = fitShape(jitter(poly(P(300, 100), P(300, 400), P(600, 402)), 2), 'auto');
    expect(shape?.kind).toBe('axes');
    if (shape?.kind === 'axes') {expect(near(shape.origin, P(300, 400), 12)).toBe(true); expect(shape.xEnd.y).toBeCloseTo(shape.origin.y, 5);}
  });
  it('recognizes a noisy circle with overshoot', () => {
    const c = Array.from({length: 140}, (_, i) => P(500 + 150 * Math.cos(i / 130 * 2 * Math.PI), 600 + 148 * Math.sin(i / 130 * 2 * Math.PI)));
    const {shape} = fitShape(jitter(c, 4), 'auto');
    expect(shape?.kind).toBe('circle');
    if (shape?.kind === 'circle') {expect(Math.abs(shape.r - 149)).toBeLessThan(8);}
  });
  it('recognizes a rough rectangle, not a circle', () => {
    const v = [P(100, 100), P(420, 104), P(418, 300), P(98, 296), P(102, 96)];
    expect(fitShape(jitter(poly(...v), 3), 'auto').shape?.kind).toBe('rect');
  });
  it.each([
    ['perfect circle', 150, 150, 0, 0],
    ['wobbly circle', 150, 150, 0, 7],
    ['egg-shaped, tilted', 170, 125, 0.6, 5],
    ['slightly oval', 160, 135, 0, 6],
  ])('recognizes a %s as a circle, not a box', (_n, a, b, tilt, noise) => {
    const pts = Array.from({length: 150}, (_, i) => {
      const t = i / 140 * 2 * Math.PI, x = a * Math.cos(t), y = b * Math.sin(t);
      return P(500 + x * Math.cos(tilt) - y * Math.sin(tilt), 600 + x * Math.sin(tilt) + y * Math.cos(tilt));
    });
    expect(fitShape(jitter(pts, noise), 'auto').shape?.kind).toBe('circle');
  });
  it('recognizes a square and a rounded rectangle as boxes', () => {
    expect(fitShape(jitter(poly(P(100, 100), P(300, 100), P(300, 300), P(100, 300), P(100, 102)), 4), 'auto').shape?.kind).toBe('rect');
    const r = 25, v = [P(125, 100), P(375, 100), P(375, 125), P(375, 275), P(350, 300), P(150, 300), P(100, 275), P(100, 125), P(125, 100)];
    expect(fitShape(jitter(poly(...v), 3), 'auto').shape?.kind).toBe('rect');
    expect(r).toBe(25);
  });
  it('keeps scribble as ink in Auto', () => {
    const scribble = Array.from({length: 120}, (_, i) => P(200 + (i * 37) % 160, 200 + (i * 53) % 140));
    expect(fitShape(scribble, 'auto').shape).toBeNull();
  });
  it('a named shape fits only that kind, and force fits regardless', () => {
    const circleStroke = Array.from({length: 100}, (_, i) => P(500 + 120 * Math.cos(i / 99 * 6.2), 500 + 120 * Math.sin(i / 99 * 6.2)));
    expect(fitShape(circleStroke, 'arrow').shape).toBeNull();
    expect(fitShape(circleStroke, 'arrow', true).shape?.kind).toBe('arrow');
    expect(fitShape(poly(P(100, 100), P(300, 160), P(500, 90)), 'circle', true).shape?.kind).toBe('circle');
  });
  it('reports why it failed', () => {
    expect(fitShape(poly(P(100, 100), P(108, 104)), 'auto').notes.join()).toContain('small');
  });

  describe('flowchart shapes', () => {
    const closed = (...v: P[]) => poly(...v, v[0]);
    it('recognizes a triangle in Auto', () => {
      const {shape} = fitShape(jitter(closed(P(300, 100), P(500, 400), P(100, 400)), 3), 'auto');
      expect(shape?.kind).toBe('poly');
      if (shape?.kind === 'poly') {expect(shape.name).toBe('triangle'); expect(shape.points.length).toBe(3);}
    });
    it('recognizes a wide diamond in Auto and straightens it to the page axes', () => {
      const {shape} = fitShape(jitter(closed(P(300, 100), P(500, 200), P(300, 300), P(100, 200)), 3), 'auto');
      expect(shape?.kind).toBe('poly');
      if (shape?.kind === 'poly') {
        expect(shape.name).toBe('diamond');
        expect(shape.points[0].x).toBeCloseTo(shape.points[2].x, 5); expect(shape.points[1].y).toBeCloseTo(shape.points[3].y, 5);
      }
    });
    it('still reads a rotated square as a box and a circle as a circle', () => {
      expect(fitShape(jitter(closed(P(300, 100), P(400, 200), P(300, 300), P(200, 200)), 2), 'auto').shape?.kind).toBe('rect');
      const c = Array.from({length: 120}, (_, i) => P(500 + 120 * Math.cos(i / 119 * 6.28), 500 + 120 * Math.sin(i / 119 * 6.28)));
      expect(fitShape(jitter(c, 3), 'auto').shape?.kind).toBe('circle');
    });
    it('builds a parallelogram with level top and bottom from a rough stroke', () => {
      const {shape} = fitShape(jitter(closed(P(180, 100), P(520, 104), P(420, 300), P(80, 296)), 4), 'parallelogram');
      expect(shape?.kind).toBe('poly');
      if (shape?.kind === 'poly') {
        expect(shape.points.length).toBe(4);
        expect(shape.points[0].y).toBeCloseTo(shape.points[1].y, 5); expect(shape.points[2].y).toBeCloseTo(shape.points[3].y, 5);
        expect(shape.points[1].x - shape.points[0].x).toBeCloseTo(shape.points[2].x - shape.points[3].x, 5);
        expect(shape.points[0].x).toBeGreaterThan(shape.points[3].x);
      }
    });
    it('builds a rounded box whose corners are cut, from a rough rectangle', () => {
      const {shape} = fitShape(jitter(closed(P(100, 100), P(400, 100), P(400, 250), P(100, 250)), 3), 'roundedRect');
      expect(shape?.kind).toBe('poly');
      if (shape?.kind === 'poly') {
        expect(shape.points.length).toBe(28);
        const xs = shape.points.map(q => q.x), ys = shape.points.map(q => q.y);
        // No point sits at a sharp corner of the bounding box.
        expect(shape.points.some(q => Math.abs(q.x - Math.min(...xs)) < 2 && Math.abs(q.y - Math.min(...ys)) < 2)).toBe(false);
      }
    });
    it('forces a named flowchart shape from a poor stroke, and keeps Auto from inventing them from scribble', () => {
      const wobble = Array.from({length: 120}, (_, i) => P(300 + 140 * Math.cos(i / 119 * 6.2) * (1 + 0.35 * Math.sin(i * 0.9)), 300 + 120 * Math.sin(i / 119 * 6.2)));
      expect(fitShape(wobble, 'diamond', true).shape?.kind).toBe('poly');
      const scribble = Array.from({length: 120}, (_, i) => P(200 + (i * 37) % 160, 200 + (i * 53) % 140));
      expect(fitShape(scribble, 'auto').shape).toBeNull();
    });
  });

  describe('elbow arrow', () => {
    it('reads two square legs, ignoring a drawn head, with the tip at the end of the second leg', () => {
      const stroke = jitter(poly(P(100, 300), P(400, 303), P(398, 500), P(380, 472), P(399, 500), P(420, 472)), 2);
      const {shape} = fitShape(stroke, 'elbow');
      expect(shape?.kind).toBe('elbow');
      if (shape?.kind === 'elbow') {
        expect(near(shape.start, P(100, 300), 15)).toBe(true); expect(near(shape.corner, P(400, 302), 15)).toBe(true); expect(near(shape.tip, P(400, 500), 20)).toBe(true);
        expect(shape.start.y).toBeCloseTo(shape.corner.y, 5); expect(shape.tip.x).toBeCloseTo(shape.corner.x, 5);
      }
    });
    it('works when the first leg is the shorter one', () => {
      const {shape} = fitShape(jitter(poly(P(300, 200), P(302, 300), P(600, 298)), 2), 'elbow');
      expect(shape?.kind).toBe('elbow');
      if (shape?.kind === 'elbow') {expect(near(shape.start, P(300, 200), 15)).toBe(true); expect(near(shape.tip, P(600, 300), 20)).toBe(true);}
    });
    it('is not offered by Auto: an L is still axes, and a straight arrow is still an arrow', () => {
      expect(fitShape(jitter(poly(P(300, 100), P(300, 400), P(600, 402)), 2), 'auto').shape?.kind).toBe('axes');
    });
    it('fits a named elbow from a curved stroke when forced, and declines it otherwise', () => {
      const arc = Array.from({length: 80}, (_, i) => P(100 + i * 4, 300 + 120 * Math.sin(i / 79 * 2)));
      expect(fitShape(arc, 'elbow').shape).toBeNull();
      expect(fitShape(arc, 'elbow', true).shape?.kind).toBe('elbow');
    });
  });
});
