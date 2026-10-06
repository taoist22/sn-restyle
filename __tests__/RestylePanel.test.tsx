import React from 'react';
import renderer, {act} from 'react-test-renderer';
import RestylePanel from '../src/RestylePanel';
import type {LassoInfo} from '../src/types';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const info: LassoInfo = {filePath: '/Note/test.note', pageNum: 0, identities: [], elementNums: [1], strokeCount: 1, geometryCount: 0, otherCount: 0, avgThickness: 500, avgGeometryWidth: 100, hasMixedThickness: false, hasMarkerStroke: false, crossDevice: false};
it('passes the selected Arrow through the actual panel Apply callback', async () => {
  const apply = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<RestylePanel info={info} presets={[null, null, null]} onApply={apply} onSavePreset={jest.fn()} onClearPreset={jest.fn()} onCancel={jest.fn()} busy={false} />);});
  await act(async () => {tree!.root.findAllByProps({testID: 'shape-arrow'})[0].props.onPress();});
  await act(async () => {tree!.root.findAllByProps({testID: 'restyle-apply'})[0].props.onPress();});
  expect(apply).toHaveBeenCalledWith({shape: 'arrow', fill: 'none', color: null, thickness: null});
  await act(async () => {tree!.unmount();});
});
it('sends a gray fill with a circle, but not with an arrow', async () => {
  const apply = jest.fn(); let tree: renderer.ReactTestRenderer;
  const press = async (id: string) => {await act(async () => {tree!.root.findAllByProps({testID: id})[0].props.onPress();});};
  await act(async () => {tree = renderer.create(<RestylePanel info={info} presets={[null, null, null]} onApply={apply} onSavePreset={jest.fn()} onClearPreset={jest.fn()} onCancel={jest.fn()} busy={false} />);});
  await press('shape-circle'); await press('fill-light'); await press('restyle-apply');
  expect(apply).toHaveBeenLastCalledWith({shape: 'circle', fill: 'light', color: null, thickness: null});
  await press('shape-arrow'); await press('restyle-apply');
  expect(apply).toHaveBeenLastCalledWith({shape: 'arrow', fill: 'none', color: null, thickness: null});
  await act(async () => {tree!.unmount();});
});
const make = (i: LassoInfo, apply = jest.fn()) => {
  let tree: renderer.ReactTestRenderer;
  const mount = async () => {await act(async () => {tree = renderer.create(<RestylePanel info={i} presets={[null, null, null]} onApply={apply} onSavePreset={jest.fn()} onClearPreset={jest.fn()} onCancel={jest.fn()} busy={false} />);});};
  const press = async (id: string) => {await act(async () => {tree!.root.findAllByProps({testID: id})[0].props.onPress();});};
  const has = (id: string) => tree!.root.findAllByProps({testID: id}).length > 0;
  const applyDisabled = () => !!tree!.root.findAllByProps({testID: 'restyle-apply'})[0].props.disabled;
  return {mount, press, has, applyDisabled, unmount: async () => {await act(async () => {tree!.unmount();});}};
};
it('opens on the Shape tab for one stroke and on the Style tab for several', async () => {
  const one = make(info); await one.mount();
  expect(one.has('shape-circle')).toBe(true);
  await one.press('tab-style'); expect(one.has('shape-circle')).toBe(false); await one.unmount();
  const many = make({...info, strokeCount: 3}); await many.mount();
  expect(many.has('shape-circle')).toBe(false); expect(many.has('restyle-apply')).toBe(true);
  await many.press('tab-shape'); expect(many.has('shape-circle')).toBe(true); await many.unmount();
});
it('keeps Apply available on both tabs, and off for axes until each axis has a range', async () => {
  const apply = jest.fn(); const p = make(info, apply); await p.mount();
  await p.press('shape-axes');
  expect(p.applyDisabled()).toBe(true);
  await p.press('axes-x to-plus'); await p.press('axes-x from-minus');
  expect(p.applyDisabled()).toBe(true);
  await p.press('axes-y to-plus'); await p.press('axes-y from-minus');
  expect(p.applyDisabled()).toBe(false);
  await p.press('tab-style'); expect(p.has('restyle-apply')).toBe(true); expect(p.applyDisabled()).toBe(false);
  await p.press('restyle-apply');
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({shape: 'axes', axes: expect.objectContaining({xMin: -1, xMax: 1, yMin: -1, yMax: 1, arrows: 'none'})}));
  await p.unmount();
});
it('offers Wide widths on the Shape tab for a stroke becoming a shape, from the stroke width', async () => {
  const apply = jest.fn(); const p = make(info, apply); await p.mount();
  expect(p.has('shape-wide-4')).toBe(true); expect(p.has('shape-diamond')).toBe(true);
  await p.press('shape-diamond'); await p.press('shape-wide-4'); await p.press('restyle-apply');
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({shape: 'diamond', thickness: 2000}));
  await p.unmount();
});
