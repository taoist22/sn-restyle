import {arrowParts, headFill} from '../src/arrowHead';

const inside = (p: {x: number; y: number}, t: {x: number; y: number}[], slack = 0.5) => {
  const sign = (a: any, b: any, c: any) => (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);
  const d1 = sign(p, t[0], t[1]), d2 = sign(p, t[1], t[2]), d3 = sign(p, t[2], t[0]);
  const neg = d1 < -slack || d2 < -slack || d3 < -slack, pos = d1 > slack || d2 > slack || d3 > slack;
  return !(neg && pos);
};

describe('arrow head', () => {
  it('keeps the outline to shaft plus head triangle, with a separate fill inside the head', () => {
    const parts = arrowParts({x: 100, y: 300}, {x: 400, y: 300}, 28, 2);
    expect(parts.outline.length).toBe(5); // tail, tip, barb, barb, tip
    expect(parts.fill).not.toBeNull();
    const tri = [parts.outline[1], parts.outline[2], parts.outline[3]];
    for (const p of parts.fill!.points) {expect(inside(p, tri, 1)).toBe(true);}
    expect(parts.fill!.widthPx).toBeGreaterThanOrEqual(2); expect(parts.fill!.widthPx).toBeLessThanOrEqual(8);
  });
  it('uses wide rows on a large head and narrower ones on a small head', () => {
    const big = arrowParts({x: 0, y: 0}, {x: 400, y: 0}, 90, 4).fill!;
    const small = arrowParts({x: 0, y: 0}, {x: 300, y: 0}, 18, 2).fill;
    expect(big.widthPx).toBe(8);
    if (small) {expect(small.widthPx).toBeLessThan(8);}
  });
  it('runs the head fill out to the outline centre line, so the outline can cover its edge', () => {
    const parts = arrowParts({x: 0, y: 300}, {x: 300, y: 300}, 40, 4);
    const tri = [parts.outline[1], parts.outline[2], parts.outline[3]];
    const edge = (p: {x: number; y: number}) => Math.min(...tri.map((a, i) => {
      const b = tri[(i + 1) % 3], dx = b.x - a.x, dy = b.y - a.y, f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - (a.x + f * dx), p.y - (a.y + f * dy));
    }));
    const nearest = Math.min(...parts.fill!.points.map(edge));
    expect(nearest).toBeLessThanOrEqual(parts.fill!.widthPx / 2 + 1);
  });
  it('keeps an elbow leg in front of the head outline', () => {
    const parts = arrowParts({x: 400, y: 300}, {x: 400, y: 500}, 28, 2, [{x: 100, y: 300}]);
    expect(parts.outline[0]).toEqual({x: 100, y: 300}); expect(parts.outline.length).toBe(6);
  });
  it('gives no fill when the head is too small to hold one', () => {
    expect(headFill([{x: 0, y: 0}, {x: -3, y: 1}, {x: -3, y: -1}], 4)).toBeNull();
  });
});
