import {
  formatPenSize,
  millimetresToSdkWidth,
  sdkWidthToMillimetres,
  stepPenMillimetres,
  wideShapeWidth,
} from '../src/sizing';

describe('Restyle sizing', () => {
  test('maps native millimetre labels to SDK widths', () => {
    expect(millimetresToSdkWidth(0.3)).toBe(300);
    expect(millimetresToSdkWidth(1.2)).toBe(1200);
    expect(millimetresToSdkWidth(2.0)).toBe(2000);
    expect(sdkWidthToMillimetres(1500)).toBe(1.5);
    expect(formatPenSize(1300)).toBe('1.3 mm');
  });

  test('steps by one tenth and clamps to the fine-size range', () => {
    expect(stepPenMillimetres(1.0, 1)).toBe(1.1);
    expect(stepPenMillimetres(1.5, -1)).toBe(1.4);
    expect(stepPenMillimetres(0.1, -1)).toBe(0.1);
    expect(stepPenMillimetres(2.0, 1)).toBe(2.0);
  });

  test('keeps wide shapes relative to the selected geometry', () => {
    expect(wideShapeWidth(100, 4)).toBe(400);
    expect(wideShapeWidth(250, 8)).toBe(2000);
  });
});
