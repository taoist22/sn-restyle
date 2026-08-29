#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const packagePath = path.join(projectRoot, 'package.json');
const configPath = path.join(projectRoot, 'PluginConfig.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

config.versionName = packageJson.version;
const currentVersionCode = Number.parseInt(config.versionCode || '0', 10);
config.versionCode = String(Number.isFinite(currentVersionCode) ? currentVersionCode + 1 : 1);

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(
  `Synced PluginConfig.json to versionName=${config.versionName}, versionCode=${config.versionCode}`,
);
