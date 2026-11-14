'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule, mountPage } = require('./vue-harness.cjs');
const catalog = loadModule(path.join(__dirname, '../src/utils/catalog.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const idEvent = id => ({ currentTarget: { dataset: { id } } });
const pickerEvent = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });

function createHarness(count = 23, mutate) {
  const group = {
    id: 'batch-group', revision: 1, mode: 'personal', selfId: 'owner', profile: {}, members: [],
    tasks: [], items: [], vendors: [], tables: [], timeline: [], lodgings: [],
    guests: Array.from({ length: count }, (_, index) => ({
      ...catalog.guests.defaults,
      id: 'guest-' + (index + 1), name: 'Family ' + String(index + 1).padStart(2, '0'),
      partySize: 2, attendance: index % 2 ? 'pending' : 'yes', needsLodging: true,
      note: 'Private note ' + index
    }))
  };
  const env = { group, activeId: group.id, readError: null, calls: [], toasts: [] };
  const service = {
    getGroupId: () => env.activeId,
    getGroup: async () => { if (env.readError) throw env.readError; return env.group; },
    getCachedGroup: () => env.group,
    showError() {}, confirm: async () => true,
    mutate: async (action, payload, expectedRevision) => {
      env.calls.push({ action, payload: clone(payload), expectedRevision });
      if (mutate) return mutate(action, payload, expectedRevision, env);
      assert.equal(action, 'guests.batchUpdate');
      if (expectedRevision !== env.group.revision) throw Object.assign(new Error('Changed elsewhere'), { code: 'CONFLICT' });
      env.group.guests = env.group.guests.map(guest => payload.guestIds.includes(guest.id) ? { ...guest, ...payload.changes } : guest);
      env.group.revision++;
      return { group: env.group };
    }
  };
  const page = mountPage(path.join(__dirname, '../src/pages/manage/index.vue'), {
    wx: {
      setNavigationBarTitle() {}, pageScrollTo() {}, stopPullDownRefresh() {},
      showToast: options => env.toasts.push(options),
      showModal: options => options.success({ confirm: true, cancel: false })
    }
  }, name => name.includes('service') ? service : catalog);
  page.runtime._group = env.group;
  page.runtime._revision = env.group.revision;
  page.onLoad({ type: 'guests' });
  page.state.loading = false;
  page.renderRecords();
  return { ...env, env, page };
}

test('batch selection survives page changes and can select every filtered guest', async () => {
  const { page } = createHarness();
  await page.startBatch();
  page.toggleBatchPage();
  assert.equal(page.state.batchIds.length, 10);
  page.goToPage(2);
  page.toggleBatchGuest(idEvent('guest-12'));
  assert.equal(page.state.batchIds.length, 11);
  page.goToPage(1);
  assert.ok(page.state.batchIds.includes('guest-12'));
  page.toggleBatchPage();
  assert.deepEqual(page.state.batchIds, ['guest-12'], 'Deselecting this page keeps selections from another page');
  page.onFilter({ currentTarget: { dataset: { value: 'yes' } } });
  assert.deepEqual(page.state.batchIds, [], 'A changed filter cannot silently retain hidden selections');
  page.selectFilteredGuests();
  assert.deepEqual(page.state.batchIds, Array.from({ length: 12 }, (_, index) => 'guest-' + (index * 2 + 1)));
  page.onSearch({ detail: { value: 'Family 2' } });
  assert.deepEqual(page.state.batchIds, []);
  page.selectFilteredGuests();
  assert.deepEqual(page.state.batchIds, ['guest-21', 'guest-23']);
  page.clearBatchSelection();
  assert.deepEqual(page.state.batchIds, []);
});

test('batch save sends one patch for selected guests and preserves unchanged fields', async () => {
  const { page, env } = createHarness();
  const before = clone(env.group.guests);
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-2'));
  page.goToPage(3);
  page.toggleBatchGuest(idEvent('guest-23'));
  page.openBatchEditor();
  assert.equal(page.state.batchEditorOpen, true);
  assert.deepEqual(page.state.batchForm, { attendance: '', needsLodging: '', side: '' });
  page.onBatchPicker(pickerEvent('needsLodging', 2));
  page.onBatchPicker(pickerEvent('side', 2));
  await page.saveBatch();
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.calls[0], {
    action: 'guests.batchUpdate',
    payload: { guestIds: ['guest-2', 'guest-23'], changes: { needsLodging: false, side: 'bride' } },
    expectedRevision: 1
  });
  for (let index = 0; index < before.length; index++) {
    const expected = ['guest-2', 'guest-23'].includes(before[index].id) ? { ...before[index], needsLodging: false, side: 'bride' } : before[index];
    assert.deepEqual(env.group.guests[index], expected);
  }
  assert.equal(page.state.batchMode, false);
  assert.equal(page.state.batchEditorOpen, false);
  assert.deepEqual(page.state.batchIds, []);
  assert.equal(page.state.rows.find(guest => guest.id === 'guest-23').needsLodging, false);
});

test('batch editing requires selected guests and at least one explicit change', async () => {
  const { page, env } = createHarness(2);
  await page.startBatch();
  page.openBatchEditor();
  assert.equal(page.state.batchEditorOpen, false);
  await page.saveBatch();
  assert.equal(env.calls.length, 0);
  page.toggleBatchGuest(idEvent('guest-1'));
  page.openBatchEditor();
  await page.saveBatch();
  assert.equal(env.calls.length, 0);
  assert.ok(page.state.batchError);
  assert.equal(page.state.batchEditorOpen, true);
});

test('a failed batch request preserves the selected guests and change draft for retry', async () => {
  const { page, env } = createHarness(2, async () => { throw Object.assign(new Error('Network unavailable'), { code: 'NETWORK' }); });
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-1'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('attendance', 3));
  await page.saveBatch();
  assert.equal(env.calls.length, 1);
  assert.equal(page.state.batchSaving, false);
  assert.equal(page.state.batchEditorOpen, true);
  assert.equal(page.state.batchMode, true);
  assert.deepEqual(page.state.batchIds, ['guest-1']);
  assert.equal(page.state.batchForm.attendance, 'no');
  assert.ok(page.state.batchError);
  assert.equal(env.group.guests[0].attendance, 'yes');
});

test('background refresh cannot upgrade a batch revision and conflicts require an explicit restart', async () => {
  const { page, env } = createHarness();
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-2'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('attendance', 2));
  env.group.revision = 2;
  env.group.guests[1].note = 'A family member changed this note';
  await page.load();
  await page.saveBatch();
  assert.equal(env.calls[0].expectedRevision, 1);
  assert.equal(page.state.batchConflict, true);
  assert.deepEqual(page.state.batchIds, ['guest-2']);
  assert.equal(page.state.batchForm.attendance, 'yes');
  await page.saveBatch();
  assert.equal(env.calls.length, 1, 'A conflicted patch must not retry against a newer revision');
  await page.restartBatch();
  assert.equal(page.state.batchConflict, false);
  assert.equal(page.state.batchEditorOpen, false);
  assert.deepEqual(page.state.batchIds, []);
  assert.deepEqual(page.state.batchForm, { attendance: '', needsLodging: '', side: '' });
  page.toggleBatchGuest(idEvent('guest-2'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('attendance', 2));
  await page.saveBatch();
  assert.equal(env.calls[1].expectedRevision, 2);
  assert.equal(env.group.guests[1].note, 'A family member changed this note');
});

test('an in-flight batch save blocks duplicate requests, changed selection and navigation', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { page, env } = createHarness(23, async () => pending);
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-1'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('needsLodging', 2));
  const save = page.saveBatch();
  await Promise.resolve();
  assert.equal(page.state.batchSaving, true);
  await page.saveBatch();
  page.toggleBatchGuest(idEvent('guest-2'));
  page.toggleBatchPage();
  page.selectFilteredGuests();
  page.clearBatchSelection();
  page.goToPage(2);
  page.closeBatchEditor();
  page.cancelBatch();
  assert.equal(env.calls.length, 1);
  assert.deepEqual(page.state.batchIds, ['guest-1']);
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.batchEditorOpen, true);
  assert.equal(page.state.batchMode, true);
  finish({ group: env.group });
  await save;
  assert.equal(page.state.batchSaving, false);
});

test('switching weddings clears a batch and cannot submit selections to the new wedding', async () => {
  const { page, env } = createHarness();
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-1'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('attendance', 3));
  env.activeId = 'other-group';
  await page.saveBatch();
  assert.equal(env.calls.length, 0, 'Selections from an old wedding must not be sent using a different active group');
  env.group = { ...env.group, id: 'other-group' };
  await page.load();
  assert.equal(page.state.batchMode, false);
  assert.equal(page.state.batchEditorOpen, false);
  assert.deepEqual(page.state.batchIds, []);
});

test('a late batch response cannot restore the previous wedding after switching groups', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { page, env } = createHarness(2, async () => pending);
  const previousGroup = clone(env.group);
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-1'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('attendance', 3));
  const save = page.saveBatch();
  await Promise.resolve();
  env.activeId = 'other-group';
  env.group = { ...clone(previousGroup), id: 'other-group', guests: [{ ...previousGroup.guests[0], id: 'other-guest', name: 'Other wedding guest' }] };
  await page.load();
  finish({ group: { ...previousGroup, revision: 2 } });
  await save;
  assert.equal(page.runtime._group.id, 'other-group');
  assert.deepEqual(page.state.rows.map(guest => guest.id), ['other-guest']);
  assert.equal(page.state.batchMode, false);
});

test('lost group access clears batch selection and its pending changes', async () => {
  const { page, env } = createHarness();
  await page.startBatch();
  page.toggleBatchGuest(idEvent('guest-1'));
  page.openBatchEditor();
  page.onBatchPicker(pickerEvent('needsLodging', 2));
  env.readError = Object.assign(new Error('No longer a member'), { code: 'FORBIDDEN' });
  await page.load();
  assert.equal(page.state.batchMode, false);
  assert.equal(page.state.batchEditorOpen, false);
  assert.deepEqual(page.state.batchIds, []);
  assert.deepEqual(page.state.batchForm, { attendance: '', needsLodging: '', side: '' });
  assert.deepEqual(page.state.rows, []);
});

test('single-guest editors stay closed during batch selection', async () => {
  const { page } = createHarness();
  await page.startBatch();
  page.openAdd();
  assert.equal(page.state.editorOpen, false);
  page.openEdit(idEvent('guest-1'));
  assert.equal(page.state.editorOpen, false);
  page.cancelBatch();
  page.openEdit(idEvent('guest-1'));
  assert.equal(page.state.editorOpen, true);
});
