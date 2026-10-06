/** Read complete native collections without trusting a single large batch. */
export async function readElementData(accessor: any, field: string, limit = 20000): Promise<any[]> {
  if (!accessor) {throw new Error(`Cannot read ${field}. Nothing was replaced.`);}
  const n = await accessor.size();
  // SDK size() leaves its sentinel at -1 when native returns an empty size (0).
  if (n === -1 || n === 0) {return [];}
  if (!Number.isInteger(n) || n < 0 || n > limit) {throw new Error(`Cannot safely back up ${field} (${n} items). Nothing was replaced.`);}
  const values: any[] = [];
  for (let start = 0; start < n; start += 128) {
    const count = Math.min(128, n - start);
    let batch = await accessor.getRange(start, count);
    if (!Array.isArray(batch) || batch.length !== count) {
      // getRange caches even incomplete responses. Clear that cache before
      // indexed reads so a filtered/shifted batch cannot masquerade as full data.
      accessor.clearCache?.();
      batch = [];
      for (let index = start; index < start + count; index++) {
        const item = await accessor.get(index);
        if (item == null) {throw new Error(`Incomplete ${field} data at item ${index + 1} of ${n}. Nothing was replaced.`);}
        batch.push(item);
      }
    }
    values.push(...batch);
  }
  return JSON.parse(JSON.stringify(values));
}
