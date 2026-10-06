type P = {x: number; y: number};
const finitePoint = (p: any): p is P => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
function toSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(0.0001, dx * dx + dy * dy)));
  return dist(p, {x: a.x + f * dx, y: a.y + f * dy});
}
function follows(a: P[], b: P[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const p = {x: a[i - 1].x + f * (a[i].x - a[i - 1].x), y: a[i - 1].y + f * (a[i].y - a[i - 1].y)};
      if (!b.slice(1).some((end, j) => toSegment(p, b[j], end) <= 2)) {return false;}
    }
  }
  return true;
}
/** Native insertion success plus new-element identity is authoritative. Compare
 * rendered geometry, not JSON property order, sampling, or native style encoding.
 * Keep the actual saved payload in the recovery journal, unchanged.
 */
export function geometryReadbackProblem(actual: any, expected: any): string | null {
  if (!actual) {return 'missing native geometry';}
  if (!Number.isFinite(actual.penWidth) || actual.penWidth < 0 || !Number.isFinite(actual.penType)) {return 'invalid native pen metadata';}
  if (actual.penColor !== expected.penColor) {return `color ${actual.penColor}, expected ${expected.penColor}`;}
  if (expected.type === 'GEO_circle') {
    if (!['GEO_circle', 'GEO_ellipse'].includes(actual.type) || !finitePoint(actual.ellipseCenterPoint)) {return 'invalid circle data';}
    if (dist(actual.ellipseCenterPoint, expected.ellipseCenterPoint) > 2) {return 'circle center moved';}
    // Palette documents readback axes as diameters on Manta. Compare both the
    // radius and diameter conventions, consistently for the two axes.
    if (![1, 2].some(scale => Math.abs(actual.ellipseMajorAxisRadius / scale - expected.ellipseMajorAxisRadius) <= 2 && Math.abs(actual.ellipseMinorAxisRadius / scale - expected.ellipseMinorAxisRadius) <= 2)) {return 'circle dimensions changed';}
    return null;
  }
  if (!['GEO_polygon', 'straightLine'].includes(actual.type)) {return `unexpected geometry type ${actual.type}`;}
  const a = actual.points, b = expected.points;
  if (!Array.isArray(a) || a.length < 2 || a.length > 2000 || !a.every(finitePoint)) {return 'invalid native point data';}
  if (!Array.isArray(b) || b.length < 2 || !b.every(finitePoint)) {return 'invalid requested point data';}
  if (!follows(a, b) || !follows(b, a)) {
    return `point path changed (saved ${a.length}, requested ${b.length}; first saved ${a[0].x},${a[0].y}, requested ${b[0].x},${b[0].y})`;
  }
  return null;
}
