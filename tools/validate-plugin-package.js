#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const requireNative = new Set(process.argv.slice(2)).has('--native');
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'PluginConfig.json');

function fail(message) {
  console.error(`Package validation failed: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not read JSON at ${filePath}: ${error.message}`);
  }
}

if (!fs.existsSync(configPath)) {fail('PluginConfig.json is missing.');}
const config = readJson(configPath);
for (const field of [
  'name', 'desc', 'iconPath', 'versionName', 'versionCode', 'pluginID', 'pluginKey', 'jsMainPath',
]) {
  if (!config[field] || typeof config[field] !== 'string') {
    fail(`PluginConfig.json is missing string field "${field}".`);
  }
}

const packagePath = path.join(projectRoot, 'build', 'outputs', `${config.name}.snplg`);
if (!fs.existsSync(packagePath)) {fail(`Expected package was not found: ${packagePath}`);}

let listing;
try {
  listing = execFileSync('unzip', ['-l', packagePath], {encoding: 'utf8'});
} catch (error) {
  fail(`Could not inspect ${packagePath}: ${error.message}`);
}

if (!listing.includes('PluginConfig.json')) {fail('PluginConfig.json is missing from the package.');}
if (config.iconPath && !listing.includes(path.basename(config.iconPath))) {
  fail(`Configured icon ${config.iconPath} does not appear to be packaged.`);
}

if (requireNative) {
  if (!listing.includes('app.npk')) {fail('Native validation requested, but app.npk is missing.');}
  const generatedConfig = readJson(path.join(projectRoot, 'build', 'generated', 'PluginConfig.json'));
  if (generatedConfig.nativeCodePackage !== '/app.npk') {
    fail('Native validation requested, but nativeCodePackage is not /app.npk.');
  }
  if (!generatedConfig.reactPackages?.includes(
    'com.reactnativecommunity.asyncstorage.AsyncStoragePackage',
  )) {
    fail('AsyncStoragePackage is missing from reactPackages.');
  }
}

console.log(`Package validation passed: ${packagePath}`);
