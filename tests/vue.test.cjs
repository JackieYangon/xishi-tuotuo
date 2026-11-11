const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isReactive, nextTick, watch } = require('vue');
const { mountPage } = require('./vue-harness.cjs');
const root = path.resolve(__dirname, '..');

test('homepage finishes its first Vue render without requiring a group', async () => {
  const page = mountPage(path.join(root, 'src/pages/home/index.vue'), { wx: {} }, name => {
    if (name.includes('service')) return { getGroupId: () => '' };
    if (name.includes('version')) return { version: 'test' };
    return {};
  });
  assert.ok(isReactive(page.state));
  let observed;
  watch(() => page.state.loading, value => { observed = value; });
  await page.load();
  await nextTick();
  assert.equal(observed, false);
  assert.equal(page.state.group, null);
});

test('every registered page uses Vue TypeScript source without native page APIs', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'src/pages.json'), 'utf8')).pages;
  assert.equal(pages.length, 6);
  for (const { path: page } of pages) {
    const source = fs.readFileSync(path.join(root, 'src', page + '.vue'), 'utf8');
    assert.match(source, /<script lang="ts">/);
    assert.doesNotMatch(source, /\bPage\s*\(|\bsetData\s*\(|wx:(?:if|for|elif)/);
  }
});
