import {ElementDataAccessor, ElementPointDataType, type Point} from 'sn-plugin-lib';
import {readElementData} from './elementData';

/** SDK 0.1.65 native recognition records use lowercase x/y/flag, but its
 * recognData validator requires uppercase X/Y/Flag and drops native records.
 * The public point accessor accepts native x/y. Validate the remaining fields
 * explicitly and retain the native spelling for setRange() during recovery.
 */
export async function readRecognitionData(uuid: string): Promise<any[]> {
  const accessor = new ElementDataAccessor<Point>(uuid, ElementPointDataType.RECOGNITION_DATA_POINT, 'point');
  const values = await readElementData(accessor, 'recognPoints');
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!['x', 'y', 'flag'].every(key => Number.isSafeInteger(value[key])) || !Number.isSafeInteger(value.timestamp)) {
      throw new Error(`Invalid recognPoints data at item ${index + 1} of ${values.length}. Nothing was replaced.`);
    }
  }
  return values;
}
