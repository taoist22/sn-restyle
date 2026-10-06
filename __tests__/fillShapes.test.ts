import {FILL_COLORS, fillGeometry, perfectFromGeometry, perfectFromShape} from '../src/fillShapes';

const pts = (g: any) => g.points as {x: number; y: number}[];

describe('fill', () => {
  it('fills a circle inside its outline, in the chosen gray', () => {
    const shape = perfectFromShape({kind: 'circle', cx: 500, cy: 600, r: 100})!;
    const g: any = fillGeometry(shape, 600, 0xC9);
    expect(g.penColor).toBe(0xC9);
    expect(g.penWidth).toBe(800);
    // Outline is 6 px wide, fill lines 8 px: every fill point stays inside r - 3 - 4 (plus rounding).
    for (const p of pts(g)) {expect(Math.hypot(p.x - 500, p.y - 600)).toBeLessThanOrEqual(100 - 7 + 1);}
    expect(pts(g).length).toBeGreaterThan(40);
  });
  it('fills a rectangle inside its outline', () => {
    const corners: [any, any, any, any] = [{x: 100, y: 100}, {x: 400, y: 100}, {x: 400, y: 300}, {x: 100, y: 300}];
    const g: any = fillGeometry(perfectFromShape({kind: 'rect', corners})!, 400, 0x9D);
    expect(g.penColor).toBe(0x9D);
    for (const p of pts(g)) {
      expect(p.x).toBeGreaterThanOrEqual(100 + 2 + 4 - 1); expect(p.x).toBeLessThanOrEqual(400 - 6 + 1);
      expect(p.y).toBeGreaterThanOrEqual(100 + 2 + 4 - 1); expect(p.y).toBeLessThanOrEqual(300 - 6 + 1);
    }
  });
  it('halves circle radii read back from the page, and takes closed convex polygons', () => {
    const circle: any = perfectFromGeometry({type: 'GEO_circle', ellipseCenterPoint: {x: 10, y: 20}, ellipseMajorAxisRadius: 200, ellipseMinorAxisRadius: 200, ellipseAngle: 0});
    expect(circle.rx).toBe(100);
    const box: any = perfectFromGeometry({type: 'GEO_polygon', points: [{x: 0, y: 0}, {x: 50, y: 0}, {x: 50, y: 30}, {x: 0, y: 30}, {x: 0, y: 0}]});
    expect(box.kind).toBe('polygon');
    expect(perfectFromGeometry({type: 'GEO_polygon', points: [{x: 0, y: 0}, {x: 50, y: 0}, {x: 60, y: 30}]})).toBeNull();
  });
  it('built for a fill under the outline, it reaches the outline centre line', () => {
    const g: any = fillGeometry(perfectFromShape({kind: 'circle', cx: 500, cy: 600, r: 100})!, 0, 0xC9);
    const radius = Math.max(...pts(g).map(p => Math.hypot(p.x - 500, p.y - 600)));
    expect(radius).toBeGreaterThan(100 - 4 - 1); expect(radius).toBeLessThanOrEqual(100 - 4 + 1);
    const tri: any = fillGeometry(perfectFromShape({kind: 'poly', name: 'triangle', points: [{x: 300, y: 100}, {x: 340, y: 400}, {x: 260, y: 400}]})!, 0, 0xC9);
    expect(tri).not.toBeNull();
  });
  it('can fill with white to hide the page lines', () => {
    const g: any = fillGeometry(perfectFromShape({kind: 'circle', cx: 300, cy: 300, r: 80})!, 900, FILL_COLORS.white);
    expect(g.penColor).toBe(0xFE);
  });
  it('declines arrows, lines and axes, and shapes too small to hold a fill', () => {
    expect(perfectFromShape({kind: 'arrow', tail: {x: 0, y: 0}, tip: {x: 10, y: 0}})).toBeNull();
    expect(fillGeometry(perfectFromShape({kind: 'circle', cx: 50, cy: 50, r: 6})!, 600, 0xC9)).toBeNull();
  });
});
