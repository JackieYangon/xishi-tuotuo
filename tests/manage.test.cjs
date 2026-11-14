const { loadModule, mountPage } = require('./vue-harness.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = loadModule(path.join(__dirname, '../src/utils/catalog.js'));

function createPage(customMutation) {
  const group = {
    id: 'group-a', revision: 1, selfId: 'member-a', profile: {}, members: [{ id: 'member-a', nickname: 'Partner' }],
    tasks: [{ id: 'task-a', title: 'Original task', dueDate: '', assigneeId: 'member-a', done: false, note: '' }],
    items: [], vendors: [], guests: [], tables: [], timeline: [], lodgings: []
  };
  let definition;
  const calls = [];
  const service = {
    getGroup: async () => group, getCachedGroup: () => group, showError() {},
    mutate: async (action, payload, expectedRevision) => {
      calls.push({ action, payload, expectedRevision });
      if (customMutation) return customMutation(action, payload, group, expectedRevision);
      if (expectedRevision !== group.revision) throw Object.assign(new Error('Changed elsewhere'), { code: 'CONFLICT' });
      return { group };
    }
  };
  const page = mountPage(path.join(__dirname, '../src/pages/manage/index.vue'), { wx: { setNavigationBarTitle() {}, showToast() {}, showModal(options) { options.success({ confirm: true }); }, stopPullDownRefresh() {}, pageScrollTo() {} } }, name => name.includes('service') ? service : catalog);
  page.runtime._group = group; page.runtime._revision = group.revision;
  page.onLoad({ type: 'tasks' });
  page.renderRecords();
  return { page, group, calls };
}

function createGuestPage(count, customMutation) {
  const result = createPage(customMutation);
  result.group.guests = Array.from({ length: count }, (_, index) => ({
    ...catalog.guests.defaults,
    id: 'guest-' + (index + 1), name: 'Family ' + String(index + 1).padStart(2, '0'),
    partySize: 2, attendance: index % 2 ? 'pending' : 'yes', needsLodging: (index + 1) % 3 === 0
  }));
  result.page.onLoad({ type: 'guests' });
  result.page.state.loading = false;
  result.page.renderRecords();
  return result;
}

test('guest pages contain ten records while totals continue to count every family and companion', () => {
  const { page, group } = createGuestPage(23);
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.pageCount, 3);
  assert.equal(page.state.total, 23);
  assert.equal(page.state.allCount, 23);
  assert.deepEqual(page.state.rows.map(row => row.id), group.guests.slice(0, 10).map(guest => guest.id));
  assert.deepEqual(page.state.stats.map(stat => stat.value), ['46 人', '24 人', '11 组']);
  page.onPageChange({ currentTarget: { dataset: { page: 2 } } });
  assert.equal(page.state.currentPage, 2);
  assert.deepEqual(page.state.rows.map(row => row.id), group.guests.slice(10, 20).map(guest => guest.id));
  page.onPagePick({ detail: { value: 2 } });
  assert.equal(page.state.currentPage, 3);
  assert.deepEqual(page.state.rows.map(row => row.id), ['guest-21', 'guest-22', 'guest-23']);
  assert.equal(page.state.total, 23);
  assert.deepEqual(page.state.stats.map(stat => stat.value), ['46 人', '24 人', '11 组']);
  page.goToPage(1);
  assert.equal(page.state.rows[0].id, 'guest-1');
  assert.equal(group.guests.length, 23, 'Pagination never removes records from the group');
});

test('guest search and attendance filters use the full list and restart at the first result page', () => {
  const { page } = createGuestPage(25);
  page.goToPage(3);
  page.onSearch({ detail: { value: 'Family 2' } });
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.pageCount, 1);
  assert.equal(page.state.total, 6);
  assert.deepEqual(page.state.rows.map(row => row.id), ['guest-20', 'guest-21', 'guest-22', 'guest-23', 'guest-24', 'guest-25']);
  page.onSearch({ detail: { value: '' } });
  page.goToPage(2);
  page.onFilter({ currentTarget: { dataset: { value: 'pending' } } });
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.total, 12);
  assert.equal(page.state.rows.length, 10);
  page.goToPage(2);
  assert.deepEqual(page.state.rows.map(row => row.id), ['guest-22', 'guest-24']);
  page.onFilter({ currentTarget: { dataset: { value: 'lodging' } } });
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.total, 8);
  assert.deepEqual(page.state.rows.map(row => row.id), ['guest-3', 'guest-6', 'guest-9', 'guest-12', 'guest-15', 'guest-18', 'guest-21', 'guest-24']);
  page.onSearch({ detail: { value: 'Nobody matches' } });
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.pageCount, 1);
  assert.equal(page.state.total, 0);
  assert.deepEqual(page.state.rows, []);
  assert.equal(page.state.stats[0].value, '50 人');
});

test('deleting the only guest on the last page returns to the previous valid page', async () => {
  const { page, group, calls } = createGuestPage(21, (action, payload, current) => {
    assert.equal(action, 'records.delete');
    current.guests = current.guests.filter(guest => guest.id !== payload.id);
    current.revision++;
    return { group: current };
  });
  page.goToPage(3);
  await page.remove({ currentTarget: { dataset: { id: 'guest-21' } } });
  assert.equal(calls[0].payload.id, 'guest-21');
  assert.equal(page.state.currentPage, 2);
  assert.equal(page.state.pageCount, 2);
  assert.equal(page.state.total, 20);
  assert.deepEqual(page.state.rows.map(row => row.id), group.guests.slice(10).map(guest => guest.id));
  group.guests = [];
  page.renderRecords();
  assert.equal(page.state.currentPage, 1);
  assert.equal(page.state.pageCount, 1);
  assert.deepEqual(page.state.rows, []);
});

test('saving a new guest clears active filters and opens the page containing the new record', async () => {
  const { page, calls } = createGuestPage(20, (action, payload, current) => {
    assert.equal(action, 'records.save');
    current.guests.push({ ...payload.record, id: 'guest-new' });
    current.revision++;
    return { group: current };
  });
  page.onSearch({ detail: { value: 'Family 01' } });
  page.onFilter({ currentTarget: { dataset: { value: 'yes' } } });
  page.openAdd();
  page.onInput({ currentTarget: { dataset: { key: 'name' } }, detail: { value: 'New pending family' } });
  await page.save();
  assert.equal(calls.length, 1);
  assert.equal(page.state.editorOpen, false);
  assert.equal(page.state.query, '');
  assert.equal(page.state.filter, 'all');
  assert.equal(page.state.currentPage, 3);
  assert.equal(page.state.pageCount, 3);
  assert.equal(page.state.total, 21);
  assert.deepEqual(page.state.rows.map(row => row.id), ['guest-new']);
});

test('editing a guest keeps the current page and existing search filter', async () => {
  const { page } = createGuestPage(23, (action, payload, current) => {
    current.guests = current.guests.map(guest => guest.id === payload.record.id ? { ...guest, ...payload.record } : guest);
    current.revision++;
    return { group: current };
  });
  page.onSearch({ detail: { value: 'Family' } });
  page.goToPage(2);
  page.openEdit({ currentTarget: { dataset: { id: 'guest-12' } } });
  page.onInput({ currentTarget: { dataset: { key: 'name' } }, detail: { value: 'Family 12 updated' } });
  await page.save();
  assert.equal(page.state.currentPage, 2);
  assert.equal(page.state.query, 'Family');
  assert.equal(page.state.rows.length, 10);
  assert.equal(page.state.rows.find(row => row.id === 'guest-12').name, 'Family 12 updated');
});

test('page navigation is blocked while a guest operation or editor is active', () => {
  const { page } = createGuestPage(23);
  for (const [key, value] of [['loading', true], ['saving', true], ['pendingId', 'guest-1'], ['editorOpen', true]]) {
    page.state[key] = value;
    page.goToPage(2);
    assert.equal(page.state.currentPage, 1, key + ' must prevent page navigation');
    page.state[key] = key === 'pendingId' ? '' : false;
  }
  page.goToPage(2);
  assert.equal(page.state.currentPage, 2);
});

test('guest pagination leaves other management lists and lodging choices unpaginated', () => {
  const { page, group } = createGuestPage(33);
  group.tasks = Array.from({ length: 13 }, (_, index) => ({ ...catalog.tasks.defaults, id: 'task-' + index, title: 'Task ' + index }));
  page.onLoad({ type: 'tasks' });
  page.renderRecords();
  assert.equal(page.state.rows.length, 13);
  assert.equal(page.state.total, 13);
  page.onLoad({ type: 'lodgings' });
  page.renderRecords();
  page.openAdd();
  assert.equal(page.state.fields.find(field => field.kind === 'guests').choices.length, 11);
});

test('deleting a group clears an open editor and private list on refresh', async () => {
  const { mountPage } = require('./vue-harness.cjs');
  const page = mountPage(path.join(__dirname, '../src/pages/manage/index.vue'), { wx: {} }, name => name.includes('service') ? {
    async getGroup() { throw Object.assign(new Error('此群组已删除'), { code: 'GROUP_DELETED' }); }
  } : catalog);
  Object.assign(page.state, { rows: [{ name: 'Private guest' }], form: { phone: 'private' }, editorOpen: true });
  await page.load();
  assert.deepEqual(page.state.rows, []); assert.deepEqual(page.state.form, {});
  assert.equal(page.state.editorOpen, false); assert.equal(page.state.noGroup, true);
  assert.equal(page.runtime._group, null);
});

test('task editor keeps its original revision after background list refresh', async () => {
  const { page, group, calls } = createPage();
  page.openEdit({ currentTarget: { dataset: { id: 'task-a' } } });
  page.onInput({ currentTarget: { dataset: { key: 'title' } }, detail: { value: 'Unsaved task draft' } });
  group.revision = 2;
  group.tasks[0].title = 'Updated by family';
  await page.load();
  await page.save();
  assert.equal(calls[0].expectedRevision, 1);
  assert.equal(page.state.form.title, 'Unsaved task draft');
  assert.equal(page.state.editorConflict, true);
  await page.save();
  assert.equal(calls.length, 1, 'conflicted drafts must not be written using a newer cache revision');
});

test('explicit reload discards the stale draft before using the latest revision', async () => {
  const { page, group, calls } = createPage();
  page.openEdit({ currentTarget: { dataset: { id: 'task-a' } } });
  page.state.form.title = 'Unsaved draft';
  group.revision = 2;
  group.tasks[0].title = 'Family edit';
  await page.save();
  await page.reloadEditor();
  assert.equal(page.state.form.title, 'Family edit');
  assert.equal(page.state.editorConflict, false);
  await page.save();
  assert.equal(calls[1].expectedRevision, 2);
  assert.equal(calls[1].payload.record.title, 'Family edit');
});

test('quick completion sends the page snapshot revision instead of a changed cache revision', async () => {
  const { page, group, calls } = createPage();
  group.revision = 3;
  await page.toggleDone({ currentTarget: { dataset: { id: 'task-a' } } });
  assert.equal(calls[0].expectedRevision, 1);
  assert.equal(calls[0].payload.record.done, true);
});

test('new lodging only offers guests marked as needing lodging who have not declined', () => {
  const { page, group } = createPage();
  group.guests = [
    { id: 'confirmed', name: 'Confirmed family', partySize: 3, attendance: 'yes', needsLodging: true },
    { id: 'pending', name: 'Pending family', partySize: 2, attendance: 'pending', needsLodging: true },
    { id: 'local', name: 'Local family', partySize: 2, attendance: 'yes', needsLodging: false },
    { id: 'unmarked', name: 'Unmarked guest', partySize: 1, attendance: 'pending' },
    { id: 'declined', name: 'Declined family', partySize: 2, attendance: 'no', needsLodging: true }
  ];
  page.onLoad({ type: 'lodgings' });
  page.renderRecords();
  page.openAdd();
  const field = page.state.fields.find(item => item.kind === 'guests');
  assert.deepEqual(field.choices.map(guest => guest.id), ['confirmed', 'pending']);
  assert.ok(field.choices.every(guest => !guest.checked));
  assert.equal(field.selectedCount, 0);
  assert.equal(page.state.lodgingUnassigned, 5);
  page.onGuestsChange({ detail: { value: ['confirmed', 'pending'] } });
  assert.equal(page.state.fields.find(item => item.kind === 'guests').selectedCount, 5);
  page.onInput({ currentTarget: { dataset: { key: 'hotel' } }, detail: { value: 'Hotel' } });
  assert.deepEqual(page.validateForm().guestIds, ['confirmed', 'pending']);
});

test('new lodging has no choices when nobody needs lodging', () => {
  const { page, group } = createPage();
  group.guests = [{ id: 'local', name: 'Local family', partySize: 2, attendance: 'yes', needsLodging: false }];
  page.onLoad({ type: 'lodgings' });
  page.openAdd();
  const field = page.state.fields.find(item => item.kind === 'guests');
  assert.deepEqual(field.choices, []);
  assert.equal(field.selectedCount, 0);
});

test('lodging editor keeps guests who no longer need lodging visible until unassigned', async () => {
  const { page, group, calls } = createPage();
  group.guests = [
    { id: 'changed', name: 'Changed family', partySize: 2, attendance: 'yes', needsLodging: false },
    { id: 'eligible', name: 'Eligible guest', partySize: 1, attendance: 'pending', needsLodging: true },
    { id: 'local', name: 'Local family', partySize: 3, attendance: 'yes', needsLodging: false }
  ];
  group.lodgings = [{ id: 'room-a', hotel: 'Hotel', room: '1001', checkIn: '2026-12-01', checkOut: '2026-12-02', guestIds: ['changed'], note: '' }];
  page.onLoad({ type: 'lodgings' });
  page.openEdit({ currentTarget: { dataset: { id: 'room-a' } } });
  const field = page.state.fields.find(item => item.kind === 'guests');
  assert.deepEqual(field.choices.map(guest => guest.id), ['changed', 'eligible']);
  assert.equal(field.choices[0].checked, true);
  assert.equal(field.choices[0].needsLodging, false);
  assert.equal(field.selectedCount, 2);
  assert.deepEqual(page.validateForm().guestIds, ['changed']);
  page.onGuestsChange({ detail: { value: ['eligible'] } });
  const updated = page.state.fields.find(item => item.kind === 'guests');
  assert.deepEqual(updated.choices.map(guest => guest.id), ['eligible']);
  assert.equal(updated.selectedCount, 1);
  await page.save();
  assert.deepEqual(calls[0].payload.record.guestIds, ['eligible']);
});

test('lodging editor exposes already assigned guests who later decline the invitation', () => {
  const { page, group } = createPage();
  group.guests = [{ id: 'declined', name: 'Declined family', partySize: 2, attendance: 'no', needsLodging: true }];
  group.lodgings = [{ id: 'room-a', hotel: 'Hotel', room: '1001', checkIn: '2026-12-01', checkOut: '2026-12-02', guestIds: ['declined'], note: '' }];
  page.onLoad({ type: 'lodgings' });
  page.renderRecords();
  page.openEdit({ currentTarget: { dataset: { id: 'room-a' } } });
  const field = page.state.fields.find(item => item.kind === 'guests');
  assert.equal(field.choices.length, 1);
  assert.equal(field.choices[0].checked, true);
  assert.equal(field.choices[0].notAttending, true);
  page.onGuestsChange({ detail: { value: [] } });
  assert.equal(page.validateForm().guestIds.length, 0);
});
