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
  assert.equal(pages.length, 5);
  for (const { path: page } of pages) {
    const source = fs.readFileSync(path.join(root, 'src', page + '.vue'), 'utf8');
    assert.match(source, /<script lang="ts">/);
    assert.doesNotMatch(source, /\bPage\s*\(|\bsetData\s*\(|wx:(?:if|for|elif)/);
  }
});

test('invitation routes, editors and upload helpers are absent while family and export pages remain', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'src/pages.json'), 'utf8')).pages.map(page => page.path);
  assert.ok(pages.includes('pages/group/index'));
  assert.ok(pages.includes('pages/export/index'));
  assert.ok(!pages.includes('pages/invitation/index'));
  assert.equal(fs.existsSync(path.join(root, 'src/pages/invitation/index.vue')), false);
  for (const page of pages) {
    const source = fs.readFileSync(path.join(root, 'src', page + '.vue'), 'utf8');
    assert.doesNotMatch(source, /pages\/invitation|invitations\.(?:issue|get|respond)|pickImage|pickMusic|uploadMedia|coverFileID|musicFileID|invitationText|replyNote/);
  }
  const service = fs.readFileSync(path.join(root, 'src/utils/service.js'), 'utf8');
  assert.doesNotMatch(service, /media\.upload|chooseMessageFile/);
  assert.match(service, /members\.update/);
});
