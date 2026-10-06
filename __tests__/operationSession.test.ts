import {captureOperation, invalidateOperations, runExclusive} from '../src/operationSession';
it('invalidates work across a new opening', () => {
  const old = captureOperation(); invalidateOperations();
  expect(old).toThrow('Selection changed'); expect(captureOperation()).not.toThrow();
});
it('blocks concurrent work and releases the guard after failure', async () => {
  let finish!: () => void;
  const first = runExclusive(() => new Promise<void>(resolve => {finish = resolve;}));
  await expect(runExclusive(async () => 2)).rejects.toThrow('still finishing');
  finish(); await first;
  await expect(runExclusive(async () => {throw new Error('failure');})).rejects.toThrow('failure');
  await expect(runExclusive(async () => 3)).resolves.toBe(3);
});
