'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const block = `<!-- badges:start -->
<p align="center">
  <img alt="version ${version}" src="https://img.shields.io/badge/version-${encodeURIComponent(version)}-00866a?style=flat-square" />
  <a href="LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-0088cc?style=flat-square" /></a>
  <img alt="WeChat Mini Program" src="https://img.shields.io/badge/WeChat-Mini_Program-07c160?style=flat-square&amp;logo=wechat&amp;logoColor=white" />
  <a href="https://uniapp.dcloud.net.cn/"><img alt="framework uni-app" src="https://img.shields.io/badge/framework-uni--app-2b9939?style=flat-square" /></a>
  <a href="https://vuejs.org/"><img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&amp;logo=vuedotjs&amp;logoColor=white" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&amp;logo=typescript&amp;logoColor=white" /></a>
</p>
<!-- badges:end -->`;
for (const name of ['README.md', 'README.en.md']) {
  const filename = path.join(root, name);
  const before = fs.readFileSync(filename, 'utf8');
  const after = before.includes('<!-- badges:start -->')
    ? before.replace(/<!-- badges:start -->[\s\S]*?<!-- badges:end -->/, block)
    : before.replace(/(<h1[^>]*>.*?<\/h1>)/, '$1\n' + block);
  if (process.argv.includes('--check')) {
    if (after !== before) { console.error(`${name}: run npm run docs:badges`); process.exitCode = 1; }
  } else if (after !== before) fs.writeFileSync(filename, after);
}
