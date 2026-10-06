import {readElementData} from '../src/elementData';
function accessor(data: any[]) {
  return {size: jest.fn(async () => data.length), getRange: jest.fn(async (start: number, count: number) => data.slice(start, start + count)), get: jest.fn(async (index: number) => data[index] ?? null), clearCache: jest.fn()};
}
it('uses bounded batches and preserves all items in order', async () => {
  const data = Array.from({length: 300}, (_, i) => i), source = accessor(data);
  expect(await readElementData(source, 'pressures')).toEqual(data);
  expect(source.getRange.mock.calls).toEqual([[0, 128], [128, 128], [256, 44]]);
  expect(source.get).not.toHaveBeenCalled();
});
it('clears the partial batch cache and recovers through serial indexed reads', async () => {
  const source = accessor([[{x: 1, y: 2}], [{x: 3, y: 4}]]);
  source.getRange.mockResolvedValue([]);
  expect(await readElementData(source, 'contours')).toEqual([[{x: 1, y: 2}], [{x: 3, y: 4}]]);
  expect(source.clearCache).toHaveBeenCalledTimes(1);
  expect(source.get.mock.calls).toEqual([[0], [1]]);
  expect(source.clearCache.mock.invocationCallOrder[0]).toBeLessThan(source.get.mock.invocationCallOrder[0]);
});
it('preserves false flags and zero pressures during fallback', async () => {
  const source = accessor([false, 0]); source.getRange.mockResolvedValue([]);
  expect(await readElementData(source, 'flags')).toEqual([false, 0]);
});
it('names missing data rather than returning a lossy snapshot', async () => {
  const source = accessor([1, 2]); source.getRange.mockResolvedValue([]); source.get.mockResolvedValue(null);
  await expect(readElementData(source, 'pressures')).rejects.toThrow('Incomplete pressures data at item 1 of 2');
});
it('handles the SDK empty sentinel without fetching', async () => {
  const source = accessor([]); source.size.mockResolvedValue(-1);
  expect(await readElementData(source, 'angles')).toEqual([]); expect(source.getRange).not.toHaveBeenCalled();
});
