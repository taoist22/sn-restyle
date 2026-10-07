const mockCalls: string[] = [];
const mockInit = jest.fn(async () => {
  mockCalls.push('init');
});
const mockRegisterButton = jest.fn(async () => {
  mockCalls.push('button');
  return true;
});
const mockInstallPluginRouter = jest.fn(() => {
  mockCalls.push('listener');
});

jest.mock('react-native', () => ({
  AppRegistry: {registerComponent: jest.fn()},
  Image: {resolveAssetSource: jest.fn(() => ({uri: 'restyle-icon'}))},
}));

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    init: mockInit,
    registerButton: mockRegisterButton,
  },
}));

jest.mock('../App', () => ({__esModule: true, default: () => null}));

jest.mock('../src/pluginRouter', () => ({
  BUTTON_ID_LASSO: 7342,
  installPluginRouter: mockInstallPluginRouter,
}));

it('initializes, registers the lasso button, then installs its listener', async () => {
  require('../index');
  await new Promise<void>(resolve => setImmediate(() => resolve()));

  expect(mockCalls).toEqual(['init', 'button', 'listener']);
  expect(mockRegisterButton).toHaveBeenCalledWith(2, ['NOTE'], {
    id: 7342,
    name: 'Restyle',
    icon: 'restyle-icon',
    showType: 1,
    editDataTypes: [0, 5],
  });
});
