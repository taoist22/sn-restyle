const mockRecognition: any[] = [];
const mockStorage = new Map<string, string>();
const mockState: {elements: any[]; disk: any[]; refreshUUIDs: boolean; reads: number; path: string; page: number; next: number; writes: string[]; skipInsert: boolean; partialDelete: boolean; journalFail: boolean} = {
  elements: [], disk: [], refreshUUIDs: false, reads: 0, path: '/Note/demo.note', page: 0, next: 1, writes: [], skipInsert: false, partialDelete: false, journalFail: false,
};
function mockAccessor(initial: any[] = []) {
  let data = JSON.parse(JSON.stringify(initial));
  return {size: async () => data.length, getRange: async (start: number, count: number) => JSON.parse(JSON.stringify(data.slice(start, start + count))), setRange: async (_start: number, _end: number, values: any[]) => {data = JSON.parse(JSON.stringify(values)); return true;}};
}
function mockElement(type: number, uuid: string) {
  return {uuid, type, numInPage: 1, pageNum: 0, layerNum: 0, thickness: 500, maxX: 1000, maxY: 1000, status: 0, userData: '', angles: mockAccessor(), contoursSrc: mockAccessor(),
    stroke: type === 0 ? {penType: 10, penColor: 0, points: mockAccessor([{x: 20, y: 50}, {x: 200, y: 50}]), pressures: mockAccessor([500, 500]), flagDraw: mockAccessor([true, true]), eraseLineTrailNums: mockAccessor(), markPenDirection: mockAccessor(), recognPoints: mockAccessor()} : null};
}
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {if (mockState.journalFail) {throw new Error('storage full');} mockStorage.set(key, value);}),
  removeItem: jest.fn(async (key: string) => {mockStorage.delete(key);}),
}));
jest.mock('sn-plugin-lib', () => ({
  Element: {TYPE_STROKE: 0, TYPE_GEO: 700}, PointUtils: {emrPoint2Android: (p: any) => p}, PluginManager: {getPluginDirPath: async () => '/private'},
  PluginNoteAPI: {saveCurrentNote: async () => {mockState.disk = mockState.elements.map(e => ({...e, geometry: e.geometry ? JSON.parse(JSON.stringify(e.geometry)) : undefined})); return {success: true, result: true};}},
  PluginCommAPI: {
    getPageDisplaySize: async () => ({success: true, result: {width: 1000, height: 1000}}),
    getCurrentFilePath: async () => ({success: true, result: mockState.path}), getCurrentPageNum: async () => ({success: true, result: mockState.page}),
    reloadFile: async () => {mockState.elements = mockState.disk.map(e => ({...e, geometry: e.geometry ? JSON.parse(JSON.stringify(e.geometry)) : undefined})); return {success: true, result: true};}, clearElementCache: jest.fn(),
    getLassoElements: async () => ({success: true, result: mockState.elements.filter(e => e.type === 0)}),
    getLassoRect: async () => ({success: true, result: {left: 10, top: 10, right: 300, bottom: 200}}),
    generateLassoPreview: async () => ({success: true, result: {rect: {left: 10, top: 10, right: 300, bottom: 200}, rotateDegree: 0}}),
    insertGeometry: async (geometry: any) => {
      mockState.writes.push('insert');
      if (!mockState.skipInsert) {
        const el: any = mockElement(700, `created-${mockState.next++}`); el.geometry = JSON.parse(JSON.stringify(geometry));
        el.numInPage = Math.max(0, ...mockState.elements.map(e => e.numInPage)) + 1; mockState.elements.push(el);
      }
      return {success: true, result: true};
    },
    deletePageElements: async (nums: number[], _page: number, layer: number) => {
      mockState.writes.push('delete');
      if (mockState.partialDelete) {mockState.partialDelete = false; mockState.elements = mockState.elements.filter(e => !(e.numInPage === nums[0] && e.layerNum === layer)); throw new Error('partial native deletion');}
      mockState.elements = mockState.elements.filter(e => !(nums.includes(e.numInPage) && e.layerNum === layer));
      mockState.elements.forEach((e, i) => {e.numInPage = i + 1;});
      return {success: true, result: true};
    },
    insertPageElements: async (elements: any[], _page: number, layer: number) => {
      mockState.writes.push('insert');
      for (const el of elements) {el.layerNum = layer; el.numInPage = Math.max(0, ...mockState.elements.map(e => e.numInPage)) + 1; mockState.elements.push(el);}
      return {success: true, result: true};
    },
    createElement: async (type: number) => ({success: true, result: mockElement(type, `created-${mockState.next++}`)}),
  },
  PluginFileAPI: {
    getPageSize: async () => ({success: true, result: {width: 1000, height: 1000}}),
    getElements: async () => {
      mockState.reads++;
      return {success: true, result: mockState.disk.map(e => ({...e, uuid: mockState.refreshUUIDs ? `read-${mockState.reads}-${e.uuid}` : e.uuid, geometry: e.geometry ? JSON.parse(JSON.stringify(e.geometry)) : undefined}))};
    },
    insertElements: async () => {throw new Error('File insertion must not be used for live cleanup/recovery');},
    deleteElements: async () => {throw new Error('File deletion must not be used for live cleanup/recovery');},
  },
}));
jest.mock('../src/recognitionData', () => ({readRecognitionData: async () => mockRecognition.slice()}));
import {applyCleanup, readCleanupRecord, recoverCleanup} from '../src/cleanupOps';
import {identityOf, exactTargets, fingerprintElement} from '../src/selectionSafety';
import type {LassoInfo} from '../src/types';
let info: LassoInfo;
beforeEach(async () => {
  mockState.disk = []; mockState.refreshUUIDs = false; mockState.reads = 0;
  mockRecognition.length = 0; mockStorage.clear(); mockState.elements = [mockElement(0, 'original')]; mockState.next = 1; mockState.path = '/Note/demo.note'; mockState.page = 0; mockState.writes = []; mockState.skipInsert = false; mockState.partialDelete = false; mockState.journalFail = false;
  info = {filePath: mockState.path, pageNum: 0, identities: await Promise.all(mockState.elements.map(async e => ({...identityOf(e), fingerprint: await fingerprintElement(e)}))), elementNums: [1], strokeCount: 1, geometryCount: 0, otherCount: 0, avgThickness: 500, avgGeometryWidth: 100, hasMixedThickness: false, hasMarkerStroke: false, crossDevice: false};
});
const options = {shape: 'line' as const, color: 'darkGray' as const, thickness: 700};
it('creates and verifies geometry before deleting ink, with appearance baked in', async () => {
  const record = await applyCleanup(info, options, () => {});
  expect(mockState.writes).toEqual(['insert', 'delete']); expect(mockState.elements).toHaveLength(1);
  expect(mockState.elements[0].geometry).toMatchObject({penColor: 157, penWidth: 700}); expect(record.phase).toBe('committed');
  expect((await readCleanupRecord())?.originals[0].data.points).toHaveLength(2);
});
it('retains originals when the SDK reports success but silently skips insertion', async () => {
  mockState.skipInsert = true;
  await expect(applyCleanup(info, options, () => {})).rejects.toThrow();
  expect(mockState.elements.map(e => e.uuid)).toEqual(['original']); expect(mockState.writes).toEqual(['insert']);
});
it('does not mutate if durable backup storage fails', async () => {
  mockState.journalFail = true;
  await expect(applyCleanup(info, options, () => {})).rejects.toThrow('storage full'); expect(mockState.writes).toEqual([]);
});
it('restores full ink after a partial delete, then removes created output', async () => {
  mockState.partialDelete = true;
  await expect(applyCleanup(info, options, () => {})).rejects.toThrow('partial native deletion');
  expect(mockState.elements).toHaveLength(1); expect(mockState.elements[0].type).toBe(0);
  expect(await mockState.elements[0].stroke.points.getRange(0, 2)).toEqual([{x: 20, y: 50}, {x: 200, y: 50}]); expect(await readCleanupRecord()).toBeNull();
});
it('undo restores strokes before removing geometry, and keeps neighboring ink', async () => {
  const record = await applyCleanup(info, options, () => {});
  const neighbor = mockElement(0, 'neighbor'); neighbor.numInPage = 100; await neighbor.stroke!.points.setRange(0, 1, [{x: 5, y: 5}, {x: 10, y: 10}]); mockState.elements.push(neighbor);
  await recoverCleanup(record, () => {});
  expect(mockState.writes).toEqual(['insert', 'delete', 'insert', 'delete']);
  expect(mockState.elements.map(e => e.uuid)).toContain('neighbor'); expect(mockState.elements.every(e => e.type === 0)).toBe(true);
});
it('refuses to delete edited geometry during undo and keeps restored original ink', async () => {
  const record = await applyCleanup(info, options, () => {}); mockState.elements[0].geometry.penWidth = 900;
  await expect(recoverCleanup(record, () => {})).rejects.toThrow('Output geometry changed');
  expect(mockState.elements.some(e => e.type === 0)).toBe(true); expect(mockState.elements.some(e => e.type === 700)).toBe(true);
});
it('rejects changed pages, cross-device notes and marker width overrides before writing', async () => {
  mockState.page = 1; await expect(applyCleanup(info, options, () => {})).rejects.toThrow('page changed');
  mockState.page = 0; await expect(applyCleanup({...info, crossDevice: true}, options, () => {})).rejects.toThrow('original device');
  await expect(applyCleanup({...info, hasMarkerStroke: true}, options, () => {})).rejects.toThrow('Marker'); expect(mockState.writes).toEqual([]);
});
it('retains recovery record and originals when generation becomes stale after insertion', async () => {
  let checks = 0;
  await expect(applyCleanup(info, options, () => {checks++; if (mockState.writes.length) {throw new Error('stale');}})).rejects.toThrow('needs recovery');
  expect(checks).toBeGreaterThan(0); expect(mockState.elements.some(e => e.uuid === 'original')).toBe(true); expect(await readCleanupRecord()).not.toBeNull();
});

it('accepts a recreated UUID after save only when number, layer and full points match', async () => {
  const original = mockState.elements[0];
  const identity = {...identityOf(original), fingerprint: await fingerprintElement(original)};
  const replaced = mockElement(0, 'recreated');
  await expect(exactTargets([replaced], [identity])).resolves.toEqual([replaced]);
  await replaced.stroke!.points.setRange(0, 1, [{x: 30, y: 60}, {x: 200, y: 50}]);
  await expect(exactTargets([replaced], [identity])).rejects.toThrow('drawing changed');
});
it('retains originals and rolls back geometry when readback changes the requested path', async () => {
  const sdk = jest.requireMock('sn-plugin-lib');
  const insert = sdk.PluginCommAPI.insertGeometry;
  sdk.PluginCommAPI.insertGeometry = async (...args: any[]) => {
    const res = await insert(...args); mockState.elements.find(e => e.type === 700).geometry.points[0].x += 40; return res;
  };
  try {
    await expect(applyCleanup(info, options, () => {})).rejects.toThrow('readback differed');
    expect(mockState.elements.map(e => e.uuid)).toEqual(['original']);
  } finally {sdk.PluginCommAPI.insertGeometry = insert;}
});
it('recovery survives reading a fresh journal instead of retaining native handles', async () => {
  await applyCleanup(info, options, () => {});
  const journal = await readCleanupRecord();
  await recoverCleanup(journal!, () => {});
  expect(mockState.elements).toHaveLength(1); expect(mockState.elements[0].type).toBe(0);
});

it('does not mutate ink when indexed fallback cannot complete a contour backup', async () => {
  const el = mockState.elements[0];
  el.contoursSrc = {size: async () => 1, getRange: async () => [], clearCache: jest.fn(), get: async () => null};
  await expect(applyCleanup(info, options, () => {})).rejects.toThrow('Incomplete contours data at item 1 of 1');
  expect(mockState.writes).toEqual([]); expect(await readCleanupRecord()).toBeNull();
});
it('continues cleanup and undo when contours require indexed reads', async () => {
  const contour = [{x: 20, y: 50}, {x: 200, y: 50}];
  mockState.elements[0].contoursSrc = {size: async () => 1, getRange: async () => [], clearCache: jest.fn(), get: async () => contour};
  const record = await applyCleanup(info, options, () => {});
  expect(record.originals[0].data.contoursSrc).toEqual([contour]);
  await recoverCleanup(record, () => {}); expect(mockState.elements[0].type).toBe(0);
});

it('prefers Snap pixel recognition records to EMR conversion', async () => {
  mockRecognition.push({x: 30, y: 80, flag: 0, timestamp: 0}, {x: 210, y: 80, flag: 1, timestamp: 1});
  await applyCleanup(info, options, () => {});
  expect(mockState.elements[0].geometry.points).toEqual([{x: 30, y: 80}, {x: 210, y: 80}]);
});
it('creates a Snap filled-head arrow through the live native insertion path', async () => {
  await applyCleanup(info, {...options, shape: 'arrow'}, () => {});
  expect(mockState.elements[0].geometry.type).toBe('GEO_polygon');
  expect(mockState.elements[0].geometry.points.length).toBeGreaterThan(5);
  expect(mockState.writes).toEqual(['insert', 'delete']);
});

it('accepts native style encoding and reordered coordinate properties, with Undo using the saved payload', async () => {
  const sdk = jest.requireMock('sn-plugin-lib'), insert = sdk.PluginCommAPI.insertGeometry;
  sdk.PluginCommAPI.insertGeometry = async (...args: any[]) => {
    const response = await insert(...args), g = mockState.elements.find(e => e.type === 700).geometry;
    g.penType = 1; g.penWidth = 650; g.points = g.points.map((p: any) => ({y: p.y, x: p.x}));
    return response;
  };
  try {
    const record = await applyCleanup(info, options, () => {});
    expect(record.phase).toBe('committed'); expect(record.outputs[0].geometry.penWidth).toBe(650);
    await recoverCleanup(record, () => {}); expect(mockState.elements.every(e => e.type === 0)).toBe(true);
  } finally {sdk.PluginCommAPI.insertGeometry = insert;}
});

it('keeps live and saved note consistent when every file read gets fresh UUIDs and deletion renumbers the shape', async () => {
  mockState.refreshUUIDs = true;
  const record = await applyCleanup(info, {...options, shape: 'arrow'}, () => {});
  expect(record.phase).toBe('committed');
  expect(mockState.elements).toHaveLength(1); expect(mockState.disk).toHaveLength(1);
  expect(mockState.elements[0].type).toBe(700); expect(mockState.disk[0].numInPage).toBe(1);
  await recoverCleanup(record, () => {});
  expect(mockState.elements).toHaveLength(1); expect(mockState.disk).toHaveLength(1);
  expect(mockState.disk[0].type).toBe(0);
});
it('recovers a partially deleted live note by saving it before reading recovery state', async () => {
  mockState.refreshUUIDs = true; mockState.partialDelete = true;
  await expect(applyCleanup(info, options, () => {})).rejects.toThrow('partial native deletion');
  expect(mockState.elements).toHaveLength(1); expect(mockState.disk).toHaveLength(1);
  expect(mockState.disk[0].type).toBe(0);
});
it('does not clear native cache after insertion or recovery, and retains the recovered journal as a backup', async () => {
  const sdk = jest.requireMock('sn-plugin-lib'), before = sdk.PluginCommAPI.clearElementCache.mock.calls.length;
  const record = await applyCleanup(info, options, () => {});
  expect(sdk.PluginCommAPI.clearElementCache.mock.calls.length).toBe(before + 1);
  await recoverCleanup(record, () => {});
  expect(sdk.PluginCommAPI.clearElementCache.mock.calls.length).toBe(before + 1);
  expect(mockStorage.has('restyle_cleanup_previous_recovery_v1')).toBe(true);
});

it('restores all three arrow strokes with fresh IDs on every saved read', async () => {
  mockState.refreshUUIDs = true;
  const head1 = mockElement(0, 'head1'), head2 = mockElement(0, 'head2');
  head1.numInPage = 2; head2.numInPage = 3;
  await head1.stroke!.points.setRange(0, 1, [{x: 175, y: 30}, {x: 200, y: 50}]);
  await head2.stroke!.points.setRange(0, 1, [{x: 175, y: 70}, {x: 200, y: 50}]);
  mockState.elements.push(head1, head2);
  info.identities = [];
  for (const el of mockState.elements) {info.identities.push({...identityOf(el), fingerprint: await fingerprintElement(el)});}
  info.elementNums = [1, 2, 3]; info.strokeCount = 3;
  const record = await applyCleanup(info, {...options, shape: 'arrow'}, () => {});
  expect(mockState.disk).toHaveLength(1);
  await recoverCleanup(record, () => {});
  expect(mockState.disk).toHaveLength(3); expect(mockState.disk.every(e => e.type === 0)).toBe(true);
  const points = [];
  for (const e of mockState.disk) {points.push(await e.stroke.points.getRange(0, 2));}
  expect(points).toEqual(record.originals.map(o => o.data.points));
});
it('does not count pre-existing identical neighboring ink as restored original ink', async () => {
  const neighbor = mockElement(0, 'neighbor'); neighbor.numInPage = 2; mockState.elements.push(neighbor);
  const sdk = jest.requireMock('sn-plugin-lib'), lasso = sdk.PluginCommAPI.getLassoElements;
  sdk.PluginCommAPI.getLassoElements = async () => ({success: true, result: [mockState.elements[0]]});
  try {
    const record = await applyCleanup(info, options, () => {});
    expect(mockState.disk.filter(e => e.type === 0)).toHaveLength(1);
    mockState.refreshUUIDs = true;
    await recoverCleanup(record, () => {});
    expect(mockState.disk).toHaveLength(2); expect(mockState.disk.every(e => e.type === 0)).toBe(true);
  } finally {sdk.PluginCommAPI.getLassoElements = lasso;}
});

it('retains durable originals when live restoration fails', async () => {
  const record = await applyCleanup(info, options, () => {});
  const sdk = jest.requireMock('sn-plugin-lib'), insert = sdk.PluginCommAPI.insertPageElements;
  sdk.PluginCommAPI.insertPageElements = async () => ({success: false, error: {message: 'restore refused'}});
  try {
    await expect(recoverCleanup(record, () => {})).rejects.toThrow('restore refused');
    expect((await readCleanupRecord())?.originals[0].data.points).toHaveLength(2);
    expect(mockState.disk[0].type).toBe(700);
  } finally {sdk.PluginCommAPI.insertPageElements = insert;}
});
it('rejects display-size mismatch before cleanup mutates ink', async () => {
  const sdk = jest.requireMock('sn-plugin-lib'), size = sdk.PluginCommAPI.getPageDisplaySize;
  sdk.PluginCommAPI.getPageDisplaySize = async () => ({success: true, result: {width: 500, height: 500}});
  try {
    await expect(applyCleanup(info, options, () => {})).rejects.toThrow('normal size');
    expect(mockState.writes).toEqual([]); expect(await readCleanupRecord()).toBeNull();
  } finally {sdk.PluginCommAPI.getPageDisplaySize = size;}
});

async function selectAxes() {
  const el = mockState.elements[0];
  const points = [{x: 100, y: 30}, {x: 100, y: 200}, {x: 330, y: 200}];
  await el.stroke.points.setRange(0, 2, points);
  await el.stroke.pressures.setRange(0, 2, [500, 500, 500]);
  await el.stroke.flagDraw.setRange(0, 2, [true, true, true]);
  info.identities = [{...identityOf(el), fingerprint: await fingerprintElement(el)}];
}
it('creates all native axes pieces before deleting ink, and undoes them with changing UUIDs', async () => {
  await selectAxes(); mockState.refreshUUIDs = true;
  const record = await applyCleanup(info, {...options, shape: 'axes'}, () => {});
  expect(record.phase).toBe('committed'); expect(record.outputs).toHaveLength(4);
  expect(mockState.disk).toHaveLength(4); expect(mockState.disk.every(e => e.type === 700)).toBe(true);
  expect(mockState.writes).toEqual(['insert', 'insert', 'insert', 'insert', 'delete']);
  expect(mockState.disk.map(e => e.geometry.penWidth)).toEqual([700, 350, 700, 350]);
  await recoverCleanup(record, () => {});
  expect(mockState.disk).toHaveLength(1); expect(mockState.disk[0].type).toBe(0);
  expect(await mockState.disk[0].stroke.points.getRange(0, 3)).toEqual(record.originals[0].data.points);
});
it('removes partial axes output and retains original ink when an axis piece cannot be inserted', async () => {
  await selectAxes();
  const sdk = jest.requireMock('sn-plugin-lib'), insert = sdk.PluginCommAPI.insertGeometry;
  let calls = 0;
  sdk.PluginCommAPI.insertGeometry = async (...args: any[]) => ++calls === 3 ? {success: false, error: {message: 'axis insertion refused'}} : insert(...args);
  try {
    await expect(applyCleanup(info, {...options, shape: 'axes'}, () => {})).rejects.toThrow('axis insertion refused');
    expect(mockState.disk).toHaveLength(1); expect(mockState.disk[0].type).toBe(0);
    expect(await readCleanupRecord()).toBeNull();
  } finally {sdk.PluginCommAPI.insertGeometry = insert;}
});
