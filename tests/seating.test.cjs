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

test('new seat assignments offer only waiting guests including guests whose old table is gone', () => {
  const group = fixture();
  group.guests.push({ ...group.guests[1], id: 'orphan', name: 'Former table family', partySize: 2, tableId: 'deleted-table' });
  const { page } = createPage(group);
  page.openAssignment(event({ guest: 'guest-b' }));
  assert.equal(page.state.assignmentMode, 'new');
  assert.equal(page.state.assignGuestId, 'guest-b');
  assert.deepEqual(page.state.guestOptions.filter(option => option.id).map(option => option.id), ['guest-b', 'orphan']);
  assert.equal(page.state.waitingCount, 10);
  page.openAssignment(event({ table: 'table-b' }));
  assert.deepEqual(page.state.guestOptions.filter(option => option.id).map(option => option.id), ['guest-b', 'orphan']);
  assert.equal(page.state.assignGuestId, '', 'A table-first entry must not pick a different guest automatically');
});

test('table choices exclude full tables and seats too few for the complete guest party', () => {
  const group = fixture(3);
  group.tables = [
    group.tables[0],
    { id: 'small', name: 'Seven remaining seats', capacity: 7 },
    { id: 'exact', name: 'Eight remaining seats', capacity: 8 },
    group.tables[1]
  ];
  const { page } = createPage(group);
  page.openAssignment(event({ guest: 'guest-b' }));
  const choices = page.state.tableOptions.filter(option => option.id);
  assert.deepEqual(choices.map(option => option.id), ['exact', 'table-b']);
  assert.deepEqual(choices.map(option => option.available), [8, 12]);
  page.selectTable({ detail: { value: page.state.tableOptions.findIndex(option => option.id === 'exact') } });
  assert.equal(page.state.canAssign, true, 'A party fits when the remaining seats exactly match its size');
});

test('selecting a larger family recalculates tables and clears a destination that no longer fits', () => {
  const group = fixture();
  group.guests.push({ ...group.guests[1], id: 'small-family', name: 'Small family', partySize: 2 });
  const { page } = createPage(group);
  page.openAssignment(event({ guest: 'small-family', table: 'table-a' }));
  assert.equal(page.state.canAssign, true);
  page.selectGuest({ detail: { value: page.state.guestOptions.findIndex(option => option.id === 'guest-b') } });
  assert.equal(page.state.assignGuestId, 'guest-b');
  assert.equal(page.state.assignTableId, '');
  assert.equal(page.state.canAssign, false);
  assert.deepEqual(page.state.tableOptions.filter(option => option.id).map(option => option.id), ['table-b']);
  page.selectTable(event({ id: 'table-b' }));
  assert.equal(page.state.assignTableId, 'table-b');
  assert.equal(page.state.canAssign, true);
});

test('moving a seated family locks the guest and offers only other suitable tables', () => {
  const { page } = createPage(fixture(3));
  page.openAssignment(event({ guest: 'guest-a', table: 'table-a' }));
  assert.equal(page.state.assignmentMode, 'move');
  assert.deepEqual(page.state.guestOptions.filter(option => option.id).map(option => option.id), ['guest-a']);
  assert.equal(page.state.assignGuestId, 'guest-a');
  assert.equal(page.state.assignTableId, '', 'The original table is not a move destination');
  assert.deepEqual(page.state.tableOptions.filter(option => option.id).map(option => option.id), ['table-b']);
  page.selectGuest({ detail: { value: 0 } });
  assert.equal(page.state.assignGuestId, 'guest-a', 'Move mode cannot change to a different family');
  page.selectTable(event({ id: 'table-b' }));
  assert.equal(page.state.canAssign, true);
});

test('invalid guests or full destinations never silently fall back to another valid choice', async () => {
  const { page, calls } = createPage(fixture(3));
  page.openAssignment(event({ guest: 'missing-guest', table: 'table-b' }));
  assert.equal(page.state.assignGuestId, '');
  assert.equal(page.state.canAssign, false);
  await page.assign();
  page.openAssignment(event({ guest: 'guest-b', table: 'table-a' }));
  assert.equal(page.state.assignTableId, '');
  assert.equal(page.state.canAssign, false);
  await page.assign();
  assert.equal(calls.length, 0);
});

test('empty candidate lists stay safe when every table is full or every guest is seated', async () => {
  const group = fixture(3);
  group.tables[1].capacity = 8;
  group.guests.push({ ...group.guests[1], id: 'occupants-b', name: 'Seated family', tableId: 'table-b' });
  const { page, calls } = createPage(group);
  page.openAssignment(event({ guest: 'guest-b' }));
  assert.deepEqual(page.state.tableOptions.filter(option => option.id), []);
  assert.equal(page.state.canAssign, false);
  assert.ok(page.state.assignmentHint);
  await page.assign();
  assert.equal(calls.length, 0);
  group.guests = group.guests.filter(guest => guest.id !== 'guest-b');
  page.openAssignment(event());
  assert.deepEqual(page.state.guestOptions.filter(option => option.id), []);
  assert.equal(page.state.canAssign, false);
  group.tables = [];
  page.openAssignment(event({ guest: 'guest-a' }));
  assert.equal(page.state.assignmentMode, 'new');
  assert.deepEqual(page.state.tableOptions.filter(option => option.id), []);
  assert.equal(page.state.canAssign, false);
});

test('refresh and save revalidation reject a guest seated elsewhere or a newly full target', async () => {
  const { page, group, calls } = createPage();
  page.openAssignment(event({ guest: 'guest-b', table: 'table-b' }));
  assert.equal(page.state.canAssign, true);
  group.guests[1].tableId = 'table-a';
  group.revision++;
  await page.load();
  assert.equal(page.state.assignmentMode, 'new', 'A pending assignment must not become an implicit move');
  assert.equal(page.state.assignGuestId, '');
  assert.equal(page.state.canAssign, false);
  await page.assign();
  assert.equal(calls.length, 0);

  group.guests[1].tableId = '';
  page.openAssignment(event({ guest: 'guest-b', table: 'table-b' }));
  group.guests.push({ ...group.guests[0], id: 'new-occupants', partySize: 12, tableId: 'table-b' });
  await page.assign();
  assert.equal(page.state.assignTableId, '');
  assert.equal(page.state.canAssign, false);
  assert.equal(calls.length, 0, 'Capacity is rechecked at save time even without a page refresh');
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
