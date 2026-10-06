const mockRecords = [{x: 24, y: 80, flag: 0, timestamp: 1728123456789}, {x: 25, y: 81, flag: 1, timestamp: -1}];
const mockCalls: any[][] = [];
jest.mock('../node_modules/sn-plugin-lib/src/module/NativePluginAPI', () => ({
  __esModule: true,
  default: {opElementPointData: async (...args: any[]) => {
    mockCalls.push(args);
    const [, , op, index, , values] = args;
    if (op === 0) {return mockRecords.length;}
    if (op === 2) {return mockRecords.slice(index[0], (index[1] ?? index[0]) + 1);}
    if (op === 5) {mockRecords.splice(index[0], index[1] - index[0] + 1, ...values); return true;}
    return null;
  }},
}));
jest.mock('sn-plugin-lib', () => jest.requireActual('../node_modules/sn-plugin-lib/src/model/Element'));
import {ElementDataAccessor, ElementPointDataType, type RecognData} from 'sn-plugin-lib';
import {readRecognitionData} from '../src/recognitionData';
const original = JSON.parse(JSON.stringify(mockRecords));
beforeEach(() => {mockRecords.splice(0, mockRecords.length, ...JSON.parse(JSON.stringify(original))); mockCalls.length = 0;});
it('reproduces the actual SDK dropping lowercase native recognition records', async () => {
  const broken = new ElementDataAccessor<RecognData>('ink', ElementPointDataType.RECOGNITION_DATA_POINT, 'recognData');
  expect(await broken.size()).toBe(2);
  expect(await broken.getRange(0, 2)).toEqual([]);
  expect(await broken.get(0)).toBeNull();
});
it('reads every native record through the compatibility reader without changing fields', async () => {
  expect(await readRecognitionData('ink')).toEqual(original);
  expect(mockCalls.every(call => call[0] === 'ink' && call[1] === 7)).toBe(true);
});
it('retains native keys for lossless restoration through SDK setRange', async () => {
  const saved = await readRecognitionData('ink');
  mockRecords.splice(0);
  const restore = new ElementDataAccessor<RecognData>('restored', ElementPointDataType.RECOGNITION_DATA_POINT, 'recognData');
  expect(await restore.setRange(0, saved.length - 1, saved)).toBe(true);
  expect(await readRecognitionData('restored')).toEqual(original);
});
it('refuses missing recognition metadata rather than deleting ink with a lossy backup', async () => {
  delete (mockRecords[0] as any).timestamp;
  await expect(readRecognitionData('ink')).rejects.toThrow('Invalid recognPoints data at item 1 of 2');
});
it('retains empty native recognition collections', async () => {
  mockRecords.splice(0); expect(await readRecognitionData('ink')).toEqual([]);
});
