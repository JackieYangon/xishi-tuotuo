'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { parse } = require('@vue/compiler-sfc');
const { reactive } = require('vue');

function loadModule(filename, globals = {}, mockRequire) {
  const absolute = path.resolve(filename);
  if (absolute.endsWith('.json')) return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const source = fs.readFileSync(absolute, 'utf8');
  const script = absolute.endsWith('.vue') ? parse(source).descriptor.script.content : source;
  const code = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  const context = { ...globals, exports, module: { exports }, require(name) {
    if (name === 'vue') return require('vue');
    if (name.endsWith('/state')) return loadModule(path.resolve(__dirname, '../src/utils/state.ts'));
    if (mockRequire) return mockRequire(name);
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(absolute), name);
    const candidate = [target, target+'.js', target+'.ts', target+'.json'].find(p=>fs.existsSync(p));
    return { __esModule: true, default: loadModule(candidate, globals) };
  } };
  const keys = Object.keys(context);
  new Function(...keys, code + '\n//# sourceURL=' + absolute)(...keys.map(key => context[key]));
  return context.module.exports.default || context.module.exports;
}

function mountPage(filename, globals, mockRequire) {
  const options = loadModule(filename, globals, mockRequire);
  const instance = reactive(options.data());
  for (const [name, method] of Object.entries(options.methods || {})) instance[name] = method.bind(instance);
  for (const [name, hook] of Object.entries(options)) if (name.startsWith('on')) instance[name] = hook.bind(instance);
  return instance;
}
module.exports = { loadModule, mountPage };
