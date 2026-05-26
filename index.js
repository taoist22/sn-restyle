import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {installPluginRouter} from './src/pluginRouter';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();
installPluginRouter();

// Lasso toolbar button — appears when strokes (0) or geometry (5) are selected
PluginManager.registerButton(2, ['NOTE'], {
  id: 200,
  name: JSON.stringify({
    en: 'Restyle',
    zh_CN: '重设样式',
    zh_TW: '重設樣式',
    ja: 'スタイル変更',
  }),
  icon: Image.resolveAssetSource(require('./assets/icon/contract.png')).uri,
  showType: 1,
  editDataTypes: [0, 5],
});
