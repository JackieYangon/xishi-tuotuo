const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../miniprogram/utils/catalog');

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
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/manage/index.js'), 'utf8'), {
    require: name => name.includes('service') ? service : catalog,
    Page: value => { definition = value; },
    wx: { setNavigationBarTitle() {}, showToast() {}, showModal(options) { options.success({ confirm: true }); }, stopPullDownRefresh() {} }
  });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), _group: group, _revision: group.revision };
  page.setData = function (patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts[parts.length - 1]] = value;
    }
  };
  page.onLoad({ type: 'tasks' });
  page.renderRecords();
  return { page, group, calls };
}

test('task editor keeps its original revision after background list refresh', async () => {
  const { page, group, calls } = createPage();
  page.openEdit({ currentTarget: { dataset: { id: 'task-a' } } });
  page.onInput({ currentTarget: { dataset: { key: 'title' } }, detail: { value: 'Unsaved task draft' } });
  group.revision = 2;
  group.tasks[0].title = 'Updated by family';
  await page.load();
  await page.save();
  assert.equal(calls[0].expectedRevision, 1);
  assert.equal(page.data.form.title, 'Unsaved task draft');
  assert.equal(page.data.editorConflict, true);
  await page.save();
  assert.equal(calls.length, 1, 'conflicted drafts must not be written using a newer cache revision');
});

test('explicit reload discards the stale draft before using the latest revision', async () => {
  const { page, group, calls } = createPage();
  page.openEdit({ currentTarget: { dataset: { id: 'task-a' } } });
  page.data.form.title = 'Unsaved draft';
  group.revision = 2;
  group.tasks[0].title = 'Family edit';
  await page.save();
  await page.reloadEditor();
  assert.equal(page.data.form.title, 'Family edit');
  assert.equal(page.data.editorConflict, false);
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

test('lodging editor exposes already assigned guests who later decline the invitation', () => {
  const { page, group } = createPage();
  group.guests = [{ id: 'declined', name: 'Declined family', partySize: 2, attendance: 'no', needsLodging: true }];
  group.lodgings = [{ id: 'room-a', hotel: 'Hotel', room: '1001', checkIn: '2026-12-01', checkOut: '2026-12-02', guestIds: ['declined'], note: '' }];
  page.onLoad({ type: 'lodgings' });
  page.renderRecords();
  page.openEdit({ currentTarget: { dataset: { id: 'room-a' } } });
  const field = page.data.fields.find(item => item.kind === 'guests');
  assert.equal(field.choices.length, 1);
  assert.equal(field.choices[0].checked, true);
  assert.equal(field.choices[0].notAttending, true);
  page.onGuestsChange({ detail: { value: [] } });
  assert.equal(page.validateForm().guestIds.length, 0);
});
