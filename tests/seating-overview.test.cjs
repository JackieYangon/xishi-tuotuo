const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mountPage } = require('./vue-harness.cjs');

function fixture() {
  return {
    id: 'overview-group', revision: 1, profile: {}, selfId: 'owner', members: [],
    tables: Array.from({ length: 14 }, (_, index) => ({
      id: 'table-' + (index + 1), name: 'Round table ' + (index + 1), capacity: index === 13 ? 12 : 10
    })),
    guests: [
      { id: 'seated-a', name: 'First family', side: 'shared', relation: 'Family', phone: '', partySize: 3, attendance: 'yes', needsLodging: true, note: 'Keep family together', tableId: 'table-1', internalMarker: 'must-not-be-sent' },
      { id: 'seated-b', name: 'Last table family', side: 'bride', partySize: 2, attendance: 'pending', needsLodging: false, tableId: 'table-14' },
      { id: 'waiting-a', name: 'Waiting family', side: 'groom', partySize: 4, attendance: 'yes', needsLodging: true, tableId: '', internalMarker: 'must-not-be-sent' },
      { id: 'not-attending', name: 'Absent family', side: 'shared', partySize: 2, attendance: 'no', needsLodging: false, tableId: '' }
    ]
  };
}

function createPage(options = {}) {
  let group = fixture();
  let readError;
  const calls = [];
  const service = {
    getGroup: async () => {
      if (readError) throw readError;
      return structuredClone(group);
    },
    getCachedGroup: () => structuredClone(group),
    showError() {},
    mutate: async (action, payload, expectedRevision) => {
      calls.push({ action, payload: structuredClone(payload), expectedRevision });
      if (options.beforeMutation) await options.beforeMutation();
      assert.equal(expectedRevision, group.revision, 'The mutation uses the current revision');
      group = structuredClone(group);
      if (action === 'records.save') {
        const records = group[payload.type];
        const index = records.findIndex(record => record.id === payload.record.id);
        if (index >= 0) records[index] = { ...records[index], ...payload.record };
        else records.push({ ...payload.record, id: 'new-table' });
      } else if (action === 'records.delete' && payload.type === 'tables') {
        group.tables = group.tables.filter(table => table.id !== payload.id);
        group.guests = group.guests.map(guest => guest.tableId === payload.id ? { ...guest, tableId: '' } : guest);
      } else {
        assert.fail('Unexpected mutation: ' + action);
      }
      group.revision += 1;
      return { group: structuredClone(group) };
    }
  };
  const page = mountPage(path.join(__dirname, '../src/pages/seating/index.vue'), {
    wx: { showToast() {}, showModal(options) { options.success({ confirm: true }); }, stopPullDownRefresh() {}, navigateTo() {} }
  }, () => service);
  page.runtime._group = structuredClone(group);
  page.runtime._revision = group.revision;
  page.render();
  page.state.loading = false;
  return {
    page, calls,
    snapshot: () => structuredClone(group),
    updateGroup(change) { change(group); group.revision += 1; },
    rejectReads(code) { readError = Object.assign(new Error('Access revoked'), { code }); }
  };
}

const event = (dataset = {}) => ({ currentTarget: { dataset } });

test('all fourteen tables are available without opening a detail view or writing data', () => {
  const { page, calls, snapshot } = createPage();
  const original = snapshot();
  assert.equal(page.state.tables.length, 14);
  assert.equal(page.state.detailTableId, '');
  assert.equal(page.state.detailTable, null);
  assert.equal(page.state.waitingOpen, false);
  for (const table of original.tables) {
    page.openTableDetail(event({ id: table.id }));
    assert.equal(page.state.detailTableId, table.id);
    assert.equal(page.state.detailTable.id, table.id);
    assert.equal(page.state.detailTable.name, table.name);
    assert.equal(page.state.detailTable.seats.length, table.capacity);
  }
  page.closeTableDetail();
  assert.equal(page.state.detailTableId, '');
  assert.equal(page.state.detailTable, null);
  assert.equal(calls.length, 0);
  assert.deepEqual(snapshot(), original);
});

test('an unknown table cannot open a detail or silently select another table', () => {
  const { page, calls } = createPage();
  page.openTableDetail(event({ id: 'missing' }));
  assert.equal(page.state.detailTable, null);
  page.openTableDetail(event({ id: 'table-14' }));
  page.openTableDetail(event({ id: 'missing' }));
  assert.equal(page.state.detailTableId, 'table-14');
  assert.equal(page.state.detailTable.id, 'table-14');
  assert.equal(calls.length, 0);
});

test('cancelling table edits and seat choices returns to the same unchanged table', () => {
  const { page, calls, snapshot } = createPage();
  const original = snapshot();
  page.openTableDetail(event({ id: 'table-14' }));
  page.openTable(event({ id: 'table-14' }));
  page.editTableName({ detail: { value: 'Unsaved name' } });
  page.closeTable();
  assert.equal(page.state.tableEditor, false);
  assert.equal(page.state.detailTableId, 'table-14');
  assert.equal(page.state.detailTable.name, 'Round table 14');
  page.openAssignment(event({ table: 'table-14', guest: 'waiting-a' }));
  assert.equal(page.state.canAssign, true);
  page.closeAssignment();
  assert.equal(page.state.assignmentOpen, false);
  assert.equal(page.state.detailTableId, 'table-14');
  assert.equal(page.state.detailTable.count, 2);
  assert.deepEqual(snapshot(), original);
  assert.equal(calls.length, 0);
});

test('assigning from a selected table refreshes its guests and remaining seats', async () => {
  const { page, calls } = createPage();
  page.openTableDetail(event({ id: 'table-14' }));
  page.openAssignment(event({ table: 'table-14', guest: 'waiting-a' }));
  assert.deepEqual(page.state.guestOptions.filter(guest => guest.id).map(guest => guest.id), ['waiting-a']);
  await page.assign();
  assert.equal(page.state.assignmentOpen, false);
  assert.equal(page.state.detailTableId, 'table-14');
  assert.equal(page.state.detailTable.count, 6);
  assert.equal(page.state.detailTable.available, 6);
  assert.deepEqual(page.state.detailTable.guests.map(guest => guest.id), ['seated-b', 'waiting-a']);
  assert.equal(page.state.tables.find(table => table.id === 'table-14').count, 6);
  assert.equal(page.state.waitingCount, 0);
  assert.equal(calls[0].payload.record.tableId, 'table-14');
  assert.equal('internalMarker' in calls[0].payload.record, false);
});

test('moving a family refreshes the open source table and the destination overview', async () => {
  const { page, calls } = createPage();
  page.openTableDetail(event({ id: 'table-1' }));
  page.openAssignment(event({ guest: 'seated-a' }));
  assert.equal(page.state.assignmentMode, 'move');
  assert.equal(page.state.availableTables.some(table => table.id === 'table-1'), false);
  page.selectTable(event({ id: 'table-14' }));
  await page.assign();
  assert.equal(page.state.detailTableId, 'table-1');
  assert.equal(page.state.detailTable.count, 0);
  assert.equal(page.state.detailTable.available, 10);
  assert.deepEqual(page.state.detailTable.guests, []);
  assert.equal(page.state.tables.find(table => table.id === 'table-14').count, 5);
  assert.equal(calls[0].payload.record.partySize, 3);
  assert.equal(calls[0].payload.record.note, 'Keep family together');
  assert.equal('internalMarker' in calls[0].payload.record, false);
});

test('removing a family keeps the selected table open with updated availability', async () => {
  const { page, calls } = createPage();
  page.openTableDetail(event({ id: 'table-1' }));
  await page.unseat(event({ id: 'seated-a' }));
  assert.equal(page.state.detailTableId, 'table-1');
  assert.equal(page.state.detailTable.count, 0);
  assert.equal(page.state.detailTable.available, 10);
  assert.equal(page.state.waitingCount, 7);
  assert.equal(calls[0].payload.record.tableId, '');
  assert.equal(calls[0].payload.record.needsLodging, true);
  assert.equal('internalMarker' in calls[0].payload.record, false);
});

test('saving table changes updates the open detail without losing its occupants', async () => {
  const { page } = createPage();
  page.openTableDetail(event({ id: 'table-1' }));
  page.openTable(event({ id: 'table-1' }));
  page.editTableName({ detail: { value: 'Renamed family table' } });
  page.setCapacity(event({ value: '12' }));
  await page.saveTable();
  assert.equal(page.state.tableEditor, false);
  assert.equal(page.state.detailTableId, 'table-1');
  assert.equal(page.state.detailTable.name, 'Renamed family table');
  assert.equal(page.state.detailTable.capacity, 12);
  assert.equal(page.state.detailTable.count, 3);
  assert.equal(page.state.detailTable.available, 9);
  assert.equal(page.state.detailTable.seats.length, 12);
  assert.deepEqual(page.state.detailTable.guests.map(guest => guest.id), ['seated-a']);
});

test('deleting the selected table closes its detail and returns occupants to waiting', async () => {
  const { page, snapshot } = createPage();
  page.openTableDetail(event({ id: 'table-1' }));
  await page.deleteTable(event({ id: 'table-1' }));
  assert.equal(page.state.detailTableId, '');
  assert.equal(page.state.detailTable, null);
  assert.equal(page.state.tables.length, 13);
  assert.equal(page.state.waitingCount, 7);
  assert.equal(snapshot().guests.find(guest => guest.id === 'seated-a').tableId, '');
  assert.equal(snapshot().guests.length, 4);
});

test('refresh updates the selected table and closes a detail whose table was deleted elsewhere', async () => {
  const { page, updateGroup } = createPage();
  page.openTableDetail(event({ id: 'table-14' }));
  updateGroup(group => {
    group.tables[13].name = 'Changed by another family member';
    group.guests.find(guest => guest.id === 'waiting-a').tableId = 'table-14';
  });
  await page.load();
  assert.equal(page.state.detailTable.name, 'Changed by another family member');
  assert.equal(page.state.detailTable.count, 6);
  assert.equal(page.state.detailTable.available, 6);
  updateGroup(group => { group.tables = group.tables.filter(table => table.id !== 'table-14'); });
  await page.load();
  assert.equal(page.state.detailTableId, '');
  assert.equal(page.state.detailTable, null);
  assert.equal(page.state.waitingOpen, false);
  assert.equal(page.state.tables.length, 13);
  assert.equal(page.state.waitingCount, 6, 'Guests whose table was removed are waiting again');
});

test('access revocation removes stale details and waiting lists', async () => {
  for (const code of ['FORBIDDEN', 'GROUP_DELETED', 'NOT_FOUND', 'NO_GROUP']) {
    for (const entry of ['detail', 'waiting']) {
      const { page, rejectReads } = createPage();
      if (entry === 'detail') page.openTableDetail(event({ id: 'table-1' }));
      else page.openWaiting();
      rejectReads(code);
      await page.load();
      assert.equal(page.runtime._group, null);
      assert.equal(page.state.detailTableId, '');
      assert.equal(page.state.detailTable, null);
      assert.equal(page.state.waitingOpen, false);
      assert.deepEqual(page.state.tables, []);
      assert.deepEqual(page.state.waiting, []);
    }
  }
});

test('switching weddings closes the prior overview context even when table IDs match', async () => {
  for (const entry of ['detail', 'waiting']) {
    const { page, updateGroup } = createPage();
    if (entry === 'detail') page.openTableDetail(event({ id: 'table-1' }));
    else page.openWaiting();
    updateGroup(group => {
      group.id = 'another-wedding';
      group.tables[0].name = 'Another wedding table';
      group.guests[0].name = 'Another wedding family';
    });
    await page.load();
    assert.equal(page.state.detailTableId, '');
    assert.equal(page.state.detailTable, null);
    assert.equal(page.state.waitingOpen, false);
    assert.equal(page.state.tables[0].name, 'Another wedding table');
  }
});

test('waiting search and assignment cancellation preserve all overview data', () => {
  const { page, calls, snapshot } = createPage();
  const original = snapshot();
  const tableCounts = page.state.tables.map(table => [table.id, table.count, table.available]);
  page.openWaiting();
  assert.equal(page.state.waitingOpen, true);
  page.onSearch({ detail: { value: 'Waiting family' } });
  assert.deepEqual(page.state.waiting.map(guest => guest.id), ['waiting-a']);
  page.openAssignment(event({ guest: 'waiting-a' }));
  page.closeAssignment();
  assert.equal(page.state.waitingOpen, true);
  page.onSearch({ detail: { value: 'no match' } });
  assert.equal(page.state.waiting.length, 0);
  assert.equal(page.state.waitingCount, 4);
  page.closeWaiting();
  assert.equal(page.state.waitingOpen, false);
  assert.deepEqual(page.state.tables.map(table => [table.id, table.count, table.available]), tableCounts);
  assert.deepEqual(snapshot(), original);
  assert.equal(calls.length, 0);
});

test('a pending save prevents changing or dismissing the selected table context', async () => {
  let finish;
  const { page, calls } = createPage({ beforeMutation: () => new Promise(resolve => { finish = resolve; }) });
  page.openTableDetail(event({ id: 'table-1' }));
  page.openTable(event({ id: 'table-1' }));
  page.editTableName({ detail: { value: 'Saved after waiting' } });
  const saving = page.saveTable();
  assert.equal(page.state.saving, true);
  page.openTableDetail(event({ id: 'table-14' }));
  page.closeTableDetail();
  page.openWaiting();
  page.closeWaiting();
  assert.equal(page.state.detailTableId, 'table-1');
  assert.equal(page.state.detailTable.id, 'table-1');
  assert.equal(page.state.waitingOpen, false);
  await page.saveTable();
  assert.equal(calls.length, 1);
  finish();
  await saving;
  assert.equal(page.state.saving, false);
  assert.equal(page.state.detailTableId, 'table-1');
  assert.equal(page.state.detailTable.name, 'Saved after waiting');
});

test('a pending waiting-list assignment keeps its drawer context and refreshes it after saving', async () => {
  let finish;
  const { page } = createPage({ beforeMutation: () => new Promise(resolve => { finish = resolve; }) });
  page.openWaiting();
  page.openAssignment(event({ guest: 'waiting-a', table: 'table-14' }));
  const saving = page.assign();
  assert.equal(page.state.saving, true);
  page.closeWaiting();
  page.openTableDetail(event({ id: 'table-1' }));
  assert.equal(page.state.waitingOpen, true);
  assert.equal(page.state.detailTable, null);
  finish();
  await saving;
  assert.equal(page.state.assignmentOpen, false);
  assert.equal(page.state.waitingOpen, true);
  assert.equal(page.state.waitingCount, 0);
  assert.deepEqual(page.state.waiting, []);
  assert.equal(page.state.tables.find(table => table.id === 'table-14').count, 6);
});
