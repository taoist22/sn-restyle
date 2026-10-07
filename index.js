import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {BUTTON_ID_LASSO, installPluginRouter} from './src/pluginRouter';

AppRegistry.registerComponent(appName, () => App);

// Lasso toolbar button: shown for strokes (0) and geometry (5). Measured on device: a lassoed rectangle is
// reported as type 5 on a custom layer and as type 0 on Main.
//
// The button ID must be unique ACROSS plugins. Calc, Add to Calendar, Keyword and Restyle all used 200, which
// can make their registrations replace one another. Changing this ID orphans the old registration, so keep it
// fixed from now on.
const restyleButton = {
  id: BUTTON_ID_LASSO,
  name: 'Restyle',
  icon: Image.resolveAssetSource(require('./assets/icon/contract.png')).uri,
  showType: 1,
  editDataTypes: [0, 5],
};

async function initializeRestyle() {
  await PluginManager.init();
  const registered = await PluginManager.registerButton(2, ['NOTE'], restyleButton);
  if (!registered) {
    console.error('[RESTYLE] Button registration returned false');
  }
  installPluginRouter();
}

initializeRestyle().catch(error => {
  console.error('[RESTYLE] Initialization failed', error);
});
