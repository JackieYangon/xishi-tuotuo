const { loadModule, mountPage } = require('./vue-harness.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(capacity = 10) {
  return {
    id: 'group-a', revision: 1, profile: {}, selfId: 'member-a', members: [],
    tables: [{ id: 'table-a', name: 'Table A', capacity }, { id: 'table-b', name: 'Table B', capacity: 12 }],
    guests: [
      { id: 'guest-a', name: 'Family A', side: 'shared', relation: 'Family', phone: '', partySize: 3, attendance: 'yes', needsLodging: false, note: '', tableId: 'table-a', invitationToken: 'never-copy-this', replyNote: 'Public reply' },
      { id: 'guest-b', name: 'Family B', side: 'bride', relation: '', phone: '', partySize: 8, attendance: 'pending', needsLodging: false, note: '', tableId: '' },
      { id: 'guest-c', name: 'Family C', side: 'groom', relation: '', phone: '', partySize: 2, attendance: 'no', needsLodging: false, note: '', tableId: '' }
    ]
  };
}

function createPage(group = fixture(), customMutation) {
  let definition;
  const calls = [];
  const service = {
    getGroup: async () => group,
    getCachedGroup: () => group,
    showError() {},
    mutate: async (action, payload, expectedRevision) => {
      calls.push({ action, payload, expectedRevision });
      if (customMutation) return customMutation(action, payload, group, expectedRevision);
      if (action === 'records.save') {
        const rows = group[payload.type];
        const index = rows.findIndex(row => row.id === payload.record.id);
        if (index >= 0) rows[index] = { ...rows[index], ...payload.record };
        else rows.push({ ...payload.record, id: 'created-record' });
      }
      return { group };
    }
  };
  const page = mountPage(path.join(__dirname, '../src/pages/seating/index.vue'), { wx: { showToast() {}, showModal(options) { options.success({ confirm: true }); }, stopPullDownRefresh() {}, navigateTo() {} } }, () => service);
  page.runtime._group = group; page.runtime._revision = group.revision;
  page.render();
  return { page, calls, group };
}

function event(dataset = {}) { return { currentTarget: { dataset } }; }

test('round-table layout creates one bounded seat per capacity and respects party sizes', () => {
  for (const capacity of [3, 10, 12, 30]) {
    const { page } = createPage(fixture(capacity));
    const table = page.state.tables[0];
    assert.equal(table.seats.length, capacity);
    assert.equal(table.seats.filter(seat => seat.filled).length, 3);
    assert.equal(table.count, 3);
    assert.equal(new Set(table.seats.map(seat => seat.style)).size, capacity);
    table.seats.forEach(seat => {
      const left = Number(seat.style.match(/left:([\d.]+)/)[1]);
      const top = Number(seat.style.match(/top:([\d.]+)/)[1]);
      const width = Number(seat.style.match(/width:([\d.]+)/)[1]);
      assert.ok(left >= 0 && top >= 0 && left + width <= 560 && top + width <= 560);
    });
  }
});

test('only eligible unseated guests contribute to waiting counts', () => {
  const { page } = createPage();
  assert.equal(page.state.waitingCount, 8);
  assert.equal(page.state.assignedCount, 3);
  assert.equal(page.state.waiting.length, 1);
  page.openAssignment(event({ table: 'table-a' }));
  assert.equal(page.state.guestOptions.some(guest => guest.id === 'guest-c'), false);
});

test('table capacity supports presets and custom values while preventing shrink overflow', async () => {
  const { page, calls } = createPage();
  page.openTable(event());
  page.setCapacity(event({ value: '12' }));
  await page.saveTable();
  assert.equal(calls[0].payload.record.capacity, 12);
  page.openTable(event({ id: 'table-a' }));
  page.setCapacity(event({ value: 'custom' }));
  page.editCustomCapacity({ detail: { value: '31' } });
  await page.saveTable();
  assert.equal(calls.length, 1);
  assert.ok(page.state.tableError);
  page.editCustomCapacity({ detail: { value: '2' } });
  await page.saveTable();
  assert.equal(calls.length, 1);
  page.editCustomCapacity({ detail: { value: '6' } });
  await page.saveTable();
  assert.equal(calls[1].payload.record.capacity, 6);
});

test('over-capacity groups cannot be seated and no mutation is submitted', async () => {
  const { page, calls } = createPage();
  page.openAssignment(event({ guest: 'guest-b', table: 'table-a' }));
  assert.equal(page.state.canAssign, false);
  await page.assign();
  assert.equal(calls.length, 0);
  page.openAssignment(event({ guest: 'guest-c', table: 'table-b' }));
  await page.assign();
  assert.equal(calls.length, 0);
});

test('moving a guest sends only editable fields and keeps the group together', async () => {
  const { page, calls } = createPage();
  page.openAssignment(event({ guest: 'guest-a', table: 'table-b' }));
  assert.equal(page.state.canAssign, true);
  await page.assign();
  const record = calls[0].payload.record;
  assert.equal(record.tableId, 'table-b');
  assert.equal(record.partySize, 3);
  assert.equal('invitationToken' in record, false);
  assert.equal('replyNote' in record, false);
  assert.equal(page.state.tables[0].count, 0);
  assert.equal(page.state.tables[1].count, 3);
  assert.equal(page.state.assignmentOpen, false);
});

test('duplicate save clicks share one in-flight mutation', async () => {
  let complete;
  const { page, calls, group } = createPage(fixture(), () => new Promise(resolve => { complete = resolve; }));
  page.openTable(event());
  const pending = page.saveTable();
  await page.saveTable();
  assert.equal(calls.length, 1);
  complete({ group });
  await pending;
  assert.equal(page.state.saving, false);
});

test('revision conflicts preserve the table draft and refresh group data', async () => {
  const { page, calls } = createPage(fixture(), async () => { throw Object.assign(new Error('Changed elsewhere'), { code: 'CONFLICT' }); });
  page.openTable(event());
  page.editTableName({ detail: { value: 'My table draft' } });
  await page.saveTable();
  assert.equal(page.state.tableEditor, true);
  assert.equal(page.state.tableName, 'My table draft');
  assert.ok(page.state.tableError);
  assert.equal(page.state.saving, false);
  assert.equal(page.state.tableConflict, true);
  await page.saveTable();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedRevision, 1);
});

test('reloading list data does not promote an open table draft revision', async () => {
  const { page, group, calls } = createPage(fixture(), async (action, payload, current, expected) => {
    if (expected !== current.revision) throw Object.assign(new Error('Changed elsewhere'), { code: 'CONFLICT' });
    return { group: current };
  });
  page.openTable(event({ id: 'table-a' }));
  page.editTableName({ detail: { value: 'Unsaved table name' } });
  group.revision = 2;
  group.tables[0].name = 'Updated by family';
  await page.load();
  await page.saveTable();
  assert.equal(calls[0].expectedRevision, 1);
  assert.equal(page.state.tableName, 'Unsaved table name');
  await page.saveTable();
  assert.equal(calls.length, 1);
  await page.reloadDraft(event({ kind: 'table' }));
  assert.equal(page.state.tableName, 'Updated by family');
  assert.equal(page.state.tableConflict, false);
  await page.saveTable();
  assert.equal(calls[1].expectedRevision, 2);
});

test('assignment conflicts require explicit reload before another write', async () => {
  const { page, group, calls } = createPage(fixture(), async (action, payload, current, expected) => {
    if (expected !== current.revision) throw Object.assign(new Error('Changed elsewhere'), { code: 'CONFLICT' });
    return { group: current };
  });
  page.openAssignment(event({ guest: 'guest-a', table: 'table-b' }));
  group.revision = 2;
  await page.load();
  await page.assign();
  assert.equal(calls[0].expectedRevision, 1);
  assert.equal(page.state.assignmentConflict, true);
  await page.assign();
  assert.equal(calls.length, 1);
  await page.reloadDraft(event({ kind: 'assignment' }));
  assert.equal(page.state.assignmentConflict, false);
  assert.equal(page.state.assignGuestId, '');
  assert.equal(page.state.assignTableId, '');
  page.openAssignment(event({ guest: 'guest-a', table: 'table-b' }));
  await page.assign();
  assert.equal(calls[1].expectedRevision, 2);
});
