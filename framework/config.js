// Loads settings.json and every modules\*.json into one config object.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

const settings = readJson(path.join(ROOT, 'settings.json'));
const moduleDir = path.join(ROOT, 'modules');
const modules = fs.readdirSync(moduleDir)
  .filter(f => f.toLowerCase().endsWith('.json'))
  .map(f => ({ file: f, ...readJson(path.join(moduleDir, f)) }));

module.exports = {
  ROOT,
  RESULTS: path.join(ROOT, 'results'),
  settings,
  modules,
  module: code => modules.find(m => m.code.toUpperCase() === String(code).toUpperCase()),
};
