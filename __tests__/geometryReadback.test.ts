import {geometryReadbackProblem} from '../src/geometryReadback';
const expected = {type: 'GEO_polygon', penType: 16, penWidth: 700, penColor: 0, points: [{x: 20, y: 100}, {x: 220, y: 100}, {x: 180, y: 80}, {x: 180, y: 120}, {x: 220, y: 100}]};
it('accepts equivalent native property order, duplicate points and style encoding', () => {
  const actual = {...expected, penType: 1, penWidth: 650, points: expected.points.flatMap(p => [{y: p.y, x: p.x}, {y: p.y, x: p.x}])};
  expect(geometryReadbackProblem(actual, expected)).toBeNull();
});
it('accepts reversed and densified paths representing the same native ink', () => {
  const points = expected.points.flatMap((p, i) => i ? [{x: (p.x + expected.points[i - 1].x) / 2, y: (p.y + expected.points[i - 1].y) / 2}, p] : [p]).reverse();
  expect(geometryReadbackProblem({...expected, points}, expected)).toBeNull();
});
it('rejects a moved arrow, missing head, wrong color and malformed points', () => {
  expect(geometryReadbackProblem({...expected, points: expected.points.map(p => ({x: p.x + 40, y: p.y}))}, expected)).toContain('path changed');
  expect(geometryReadbackProblem({...expected, points: expected.points.slice(0, 2)}, expected)).toContain('path changed');
  expect(geometryReadbackProblem({...expected, penColor: 254}, expected)).toContain('color');
  expect(geometryReadbackProblem({...expected, points: [{x: NaN, y: 100}]}, expected)).toContain('invalid');
});
it('handles the documented native circle diameter representation', () => {
  const circle = {type: 'GEO_circle', penColor: 0, penType: 10, penWidth: 500, ellipseCenterPoint: {x: 100, y: 100}, ellipseMajorAxisRadius: 30, ellipseMinorAxisRadius: 30};
  expect(geometryReadbackProblem({...circle, type: 'GEO_ellipse', ellipseMajorAxisRadius: 60, ellipseMinorAxisRadius: 60}, circle)).toBeNull();
  expect(geometryReadbackProblem({...circle, ellipseMajorAxisRadius: 100}, circle)).toContain('dimensions');
});
