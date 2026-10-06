/** A panel opening invalidates older work. Submitted native writes are never retried. */
let generation = 0;
let running = false;
export function invalidateOperations(): void {generation++;}
export function captureOperation(): () => void {
  const token = generation;
  return () => {if (generation !== token) {throw new Error('Selection changed. Open Restyle again.');}};
}
export async function runExclusive<T>(work: () => Promise<T>): Promise<T> {
  if (running) {throw new Error('An operation is still finishing. Please wait.');}
  running = true;
  try {return await work();} finally {running = false;}
}
