const mockState = {elements: [] as any[], selected: [] as any[], writes: [] as string[], partial: false, recreate: false, shapeReadFail: false, shapeWritten: false};
const mockPoints = [{x: 100, y: 100}, {x: 500, y: 100}];
function mockRead(el: any) {
  return {...JSON.parse(JSON.stringify(el)), stroke: el.stroke ? {...el.stroke, points: {size: async () => mockPoints.length, getRange: async () => mockPoints}} : null, recycle: async () => {}};
}
jest.mock('sn-plugin-lib', () => ({
  Element: {TYPE_STROKE: 0, TYPE_GEO: 700},
  PluginManager: {getPluginDirPath: async () => '/private', getDeviceType: async () => 4},
  PluginNoteAPI: {saveCurrentNote: async () => {
    mockState.writes.push('save');
    if (mockState.recreate) {mockState.elements.forEach(e => {e.uuid = 'saved-' + e.uuid;}); mockState.recreate = false;}
    return {success: true, result: true};
  }},
  PluginCommAPI: {
    getCurrentFilePath: async () => ({success: true, result: '/Note/demo.note'}), getCurrentPageNum: async () => ({success: true, result: 0}),
    reloadFile: async () => {mockState.writes.push('reload'); return {success: true, result: true};}, clearElementCache: jest.fn(),
    getLassoElements: async () => ({success: true, result: mockState.selected.map(mockRead)}),
    getLassoRect: async () => ({success: true, result: {left: 0, top: 0, right: 600, bottom: 600}}),
    generateLassoPreview: async () => ({success: true, result: {rect: {left: 0, top: 0, right: 600, bottom: 600}, rotateDegree: 0}}),
    getLassoGeometries: async () => mockState.shapeReadFail && mockState.shapeWritten ? {success: false} : {success: true, result: mockState.elements.filter(e => e.type === 700).map(e => ({...e.geometry}))},
    modifyLassoGeometry: async (geometry: any) => {mockState.writes.push('lassoModify'); mockState.elements[0].geometry = {...geometry}; mockState.shapeWritten = true; return {success: true, result: true};},
  },
  PluginFileAPI: {
    getPageSize: async () => ({success: true, result: {width: 1404, height: 1872}}),
    getElements: async () => ({success: true, result: mockState.elements.map(mockRead)}),
    modifyElements: async (_path: string, _page: number, elements: any[]) => {
      mockState.writes.push('modify');
      const changes = mockState.partial ? elements.slice(0, 1) : elements;
      mockState.partial = false;
      changes.forEach(el => {
        const target = mockState.elements.find(e => e.uuid === el.uuid);
        target.thickness = el.thickness;
        if (target.stroke) {target.stroke.penColor = el.stroke.penColor;}
        if (target.geometry) {target.geometry = {...el.geometry};}
      });
      return {success: true, result: changes.map(el => el.numInPage)};
    },
  },
}));
import {applyRestyle, undoRestyle} from '../src/restyleOps';
import {fingerprintElement, identityOf} from '../src/selectionSafety';
import type {LassoInfo} from '../src/types';
async function selection(elements: any[]): Promise<LassoInfo> {
  mockState.elements = elements; mockState.selected = elements.map(e => ({...e}));
  const identities = [];
  for (const e of elements) {identities.push({...identityOf(e), fingerprint: await fingerprintElement(mockRead(e))});}
  return {filePath: '/Note/demo.note', pageNum: 0, strokeCount: elements.filter(e => e.type === 0).length, geometryCount: elements.filter(e => e.type === 700).length, otherCount: 0, identities, elementNums: elements.map(e => e.numInPage), avgThickness: 500, avgGeometryWidth: 500, hasMixedThickness: false, hasMarkerStroke: false, crossDevice: false};
}
const stroke = (n: number) => ({uuid: `stroke-${n}`, numInPage: n, pageNum: 0, layerNum: 0, type: 0, thickness: 500, stroke: {penType: 10, penColor: 0}});
const geo = () => ({uuid: 'geometry', numInPage: 1, pageNum: 0, layerNum: 0, type: 700, thickness: 500, geometry: {type: 'straightLine', penWidth: 500, penColor: 0, points: mockPoints, ellipseCenterPoint: null, ellipseMajorAxisRadius: 0, ellipseMinorAxisRadius: 0, ellipseAngle: 0}});
beforeEach(() => {mockState.writes = []; mockState.partial = false; mockState.recreate = false; mockState.shapeReadFail = false; mockState.shapeWritten = false;});
it('styles a single native shape with one lasso modification and no save/reload', async () => {
  const info = await selection([geo()]);
  const undo = await applyRestyle(info, {color: 'darkGray', thickness: 700});
  expect(mockState.writes).toEqual(['lassoModify']); expect(mockState.elements[0].geometry).toMatchObject({penWidth: 700, penColor: 157});
  expect(undo[0]).toMatchObject({originalPenColor: 0, originalPenWidth: 500});
});
it('accepts successful native styling even when immediate lasso readback is unavailable', async () => {
  const info = await selection([geo()]); mockState.shapeReadFail = true;
  const snapshots = await applyRestyle(info, {color: 'darkGray', thickness: 700});
  expect(snapshots[0]).toMatchObject({originalPenColor: 0, originalPenWidth: 500});
  expect(mockState.elements[0].geometry).toMatchObject({penColor: 157, penWidth: 700, showLassoAfterInsert: true});
  expect(mockState.writes).toEqual(['lassoModify']);
});
it('keeps the title-safe save/reload sequence and accepts fingerprinted UUID recreation', async () => {
  const info = await selection([stroke(1)]); mockState.recreate = true;
  const undo = await applyRestyle(info, {color: 'lightGray', thickness: 800});
  expect(mockState.writes).toEqual(['save', 'reload', 'modify', 'reload']);
  expect(mockState.elements[0].stroke.penColor).toBe(201); expect(undo[0].uuid).toBe('saved-stroke-1');
  await undoRestyle(info.filePath, info.pageNum, undo);
  expect(mockState.elements[0].stroke.penColor).toBe(0); expect(mockState.elements[0].thickness).toBe(500);
});
it('rolls back partial style writes rather than reporting success', async () => {
  const info = await selection([stroke(1), stroke(2)]); mockState.partial = true;
  await expect(applyRestyle(info, {color: 'darkGray', thickness: 900})).rejects.toThrow('original styles were restored');
  expect(mockState.elements.every(e => e.stroke.penColor === 0 && e.thickness === 500)).toBe(true);
});
it('rejects marker width changes and cross-device writes in the controller', async () => {
  const info = await selection([stroke(1)]);
  await expect(applyRestyle({...info, hasMarkerStroke: true}, {color: null, thickness: 700})).rejects.toThrow('Marker');
  await expect(applyRestyle({...info, crossDevice: true}, {color: 'darkGray', thickness: null})).rejects.toThrow('cross-device');
  expect(mockState.writes).toEqual([]);
});

it('retains the original style snapshot if the native shape update is refused', async () => {
  const info = await selection([geo()]);
  const sdk = jest.requireMock('sn-plugin-lib'), modify = sdk.PluginCommAPI.modifyLassoGeometry;
  sdk.PluginCommAPI.modifyLassoGeometry = async () => ({success: false, error: {message: 'native refusal'}});
  try {
    await expect(applyRestyle(info, {color: 'darkGray', thickness: 700})).rejects.toMatchObject({name: 'StyleRecoveryError', snapshots: [expect.objectContaining({originalPenColor: 0, originalPenWidth: 500})]});
  } finally {sdk.PluginCommAPI.modifyLassoGeometry = modify;}
});
it('restores shape width and shade when save recreates the element UUID', async () => {
  const info = await selection([geo()]);
  const snapshots = await applyRestyle(info, {color: 'lightGray', thickness: 800});
  mockState.recreate = true;
  await undoRestyle(info.filePath, info.pageNum, snapshots);
  expect(mockState.elements[0].geometry).toMatchObject({penColor: 0, penWidth: 500});
});
