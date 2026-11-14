'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, COLLECTION, STORAGE_PREFIX } = require('../cloudfunctions/xishiTuotuoApi/domain');
const APP_ID = `wx${'1'.repeat(16)}`;
const copy = value => value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));

class MemoryRepo {
  constructor() { this.groups = new Map(); this.queue = Promise.resolve(); }
  async get(id) { return copy(this.groups.get(id)) || null; }
  async listForMember(id) { return [...this.groups.values()].filter(group => group.memberIds.includes(id)).map(copy); }
  async findByJoinCode(code) { return copy([...this.groups.values()].find(group => group.joinCode === code)) || null; }
  async create(group) { assert.ok(!this.groups.has(group.id)); this.groups.set(group.id, copy(group)); }
  transact(id, change) {
    const task = this.queue.then(async () => {
      const changed = await change(await this.get(id));
      this.groups.set(id, copy(changed.group));
      return copy(changed.result);
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
function setup() {
  const repo = new MemoryRepo();
  let clock = Date.parse('2026-11-11T04:00:00Z');
  const uploads = [];
  const deletedFiles = [];
  const storage = {
    async upload(path, bytes) { uploads.push({ path, bytes }); return `cloud://test/${path}`; },
    async remove(fileID) { deletedFiles.push(fileID); },
    async urls(ids) { return Object.fromEntries(ids.map(id => [id, `https://files.example/${encodeURIComponent(id)}`])); }
  };
  const service = createService({ repo, storage, allowedAppId: APP_ID, now: () => clock });
  const call = (action, payload = {}, user = 'owner', appId = APP_ID) => service({ action, payload }, { OPENID: user, APPID: appId });
  async function ok(action, payload, user) { const result = await call(action, payload, user); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; }
  async function create(user = 'owner') {
    const group = (await ok('groups.create', { nickname: '新人', role: '新郎', profile: { title: '一起办婚礼', date: '2027-05-20' } }, user)).group;
    return (await ok('groups.collaboration', { groupId: group.id, revision: group.revision, enabled: true }, user)).group;
  }
  async function save(group, type, record, user = 'owner') { return (await ok('records.save', { groupId: group.id, revision: group.revision, type, record }, user)).group; }
  return { repo, storage, service, call, ok, create, save, uploads, deletedFiles, advance: ms => { clock += ms; } };
}

test('personal weddings support planning without invitations and reject other accounts', async () => {
  const env = setup();
  let group = (await env.ok('groups.create', { nickname: '我', mode: 'shared', profile: {} })).group;
  assert.equal(group.mode, 'personal');
  assert.equal(group.joinCode, '');
  assert.equal(group.joinCodeExpiresAt, 0);
  group = await env.save(group, 'tasks', { title: '个人安排', note: '稍后和家人一起准备' });
  group = await env.save(group, 'tables', { name: '主桌', capacity: 10 });
  group = await env.save(group, 'guests', { name: '亲友', partySize: 2, attendance: 'yes', tableId: group.tables[0].id });
  assert.equal((await env.ok('groups.get', { groupId: group.id })).group.guests.length, 1);
  for (const action of ['groups.get', 'media.urls', 'records.save', 'groups.collaboration']) {
    const response = await env.call(action, { groupId: group.id, revision: group.revision, enabled: true, type: 'tasks', record: { title: '越权' } }, 'stranger');
    assert.equal(response.error.code, 'FORBIDDEN', action);
  }
  assert.equal((await env.call('groups.rotateCode', { groupId: group.id, revision: group.revision })).error.code, 'COLLABORATION_DISABLED');
});

test('owner can enable collaboration, retain records and return to personal after removing members', async () => {
  const env = setup();
  let group = (await env.ok('groups.create', { nickname: '我', profile: {} })).group;
  group = await env.save(group, 'items', { name: '喜糖', quantity: 20 });
  const groupId = group.id;
  const itemId = group.items[0].id;
  group = (await env.ok('groups.collaboration', { groupId, revision: group.revision, enabled: true })).group;
  const code = group.joinCode;
  assert.match(code, /^[A-F0-9]{12}$/);
  group = (await env.ok('groups.join', { code, nickname: '家人' }, 'dad')).group;
  assert.equal(group.items[0].id, itemId);
  group = await env.save(group, 'items', { ...group.items[0], quantity: 30 }, 'dad');
  assert.equal((await env.ok('groups.get', { groupId })).group.items[0].quantity, 30);
  assert.equal((await env.call('groups.collaboration', { groupId, revision: group.revision, enabled: false }, 'dad')).error.code, 'FORBIDDEN');
  assert.equal((await env.call('groups.collaboration', { groupId, revision: group.revision, enabled: false })).error.code, 'MEMBERS_REMAIN');
  group = (await env.ok('groups.removeMember', { groupId, revision: group.revision, memberId: 'dad' })).group;
  const rotatedCode = group.joinCode;
  group = (await env.ok('groups.collaboration', { groupId, revision: group.revision, enabled: false })).group;
  assert.equal(group.mode, 'personal');
  assert.equal(group.id, groupId);
  assert.equal(group.items[0].quantity, 30);
  assert.equal(group.joinCode, '');
  for (const oldCode of [code, rotatedCode]) assert.equal((await env.call('groups.join', { code: oldCode, nickname: '家人' }, 'dad')).error.code, 'INVALID_CODE');
  assert.equal((await env.call('groups.get', { groupId }, 'dad')).error.code, 'FORBIDDEN');
  group = (await env.ok('groups.collaboration', { groupId, revision: group.revision, enabled: true })).group;
  assert.notEqual(group.joinCode, rotatedCode);
  assert.equal((await env.ok('groups.join', { code: group.joinCode, nickname: '家人' }, 'dad')).group.items[0].id, itemId);
});

test('collaboration transitions reject stale revisions and invalid flags', async () => {
  const env = setup(); const group = await env.create();
  assert.equal((await env.call('groups.collaboration', { groupId: group.id, revision: group.revision, enabled: 'false' })).error.code, 'INVALID_INPUT');
  await env.ok('groups.collaboration', { groupId: group.id, revision: group.revision, enabled: false });
  assert.equal((await env.call('groups.collaboration', { groupId: group.id, revision: group.revision, enabled: true })).error.code, 'CONFLICT');
});

test('legacy weddings without a mode retain family access', async () => {
  const env = setup(); const group = await env.create();
  delete env.repo.groups.get(group.id).mode;
  assert.equal((await env.ok('groups.get', { groupId: group.id })).group.mode, 'shared');
  const joined = (await env.ok('groups.join', { code: group.joinCode, nickname: '家人' }, 'dad')).group;
  assert.equal(joined.mode, 'shared');
  assert.equal((await env.save(joined, 'tasks', { title: '共同安排' }, 'dad')).tasks.at(-1).title, '共同安排');
});

test('optional profile login binds only the caller and does not gate existing members', async () => {
  const env = setup(); let group = await env.create();
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '家人' }, 'dad')).group;
  assert.equal(group.members.find(m => m.id === 'dad').profileLoginAt, undefined);
  assert.ok((await env.ok('groups.get', { groupId: group.id }, 'dad')).group);
  const logged = await env.ok('members.login', { groupId: group.id, revision: group.revision, memberId: 'owner' }, 'dad');
  assert.ok(logged.group.members.find(m => m.id === 'dad').profileLoginAt);
  assert.equal(logged.group.members.find(m => m.id === 'owner').profileLoginAt, undefined);
});

test('members edit their own identity labels while only the owner may edit other labels', async () => {
  const env = setup(); let group = await env.create();
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '家人' }, 'dad')).group;
  const update = { groupId: group.id, revision: group.revision, memberId: 'dad', nickname: '爸爸', role: '爸爸' };
  assert.equal((await env.call('members.update', { ...update, memberId: 'owner' }, 'dad')).error.code, 'FORBIDDEN');
  const edited = await env.ok('members.update', update, 'dad');
  assert.equal(edited.group.members.find(m => m.id === 'dad').nickname, '爸爸');
  const account = edited.group.members.find(m => m.id === 'dad').accountLabel;
  const ownerEdit = await env.ok('members.update', { ...update, revision: edited.group.revision, nickname: '新郎爸爸', ownerId: 'dad' });
  assert.equal(ownerEdit.group.ownerId, 'owner');
  assert.equal(ownerEdit.group.members.find(m => m.id === 'dad').accountLabel, account);
  assert.equal((await env.call('members.update', update, 'dad')).error.code, 'CONFLICT');
  assert.equal((await env.call('members.update', { ...update, revision: ownerEdit.group.revision, role: '群主' }, 'dad')).error.code, 'INVALID_INPUT');
});

test('avatars are self-owned, replace atomically, and are cleaned with the group', async () => {
  const env = setup(); let group = await env.create();
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '爸爸' }, 'dad')).group;
  const update = { groupId: group.id, revision: group.revision, memberId: 'dad', nickname: '爸爸', role: '爸爸', avatarBase64: Buffer.from([255,216,255,1]).toString('base64') };
  assert.equal((await env.call('members.update', update)).error.code, 'FORBIDDEN');
  assert.equal(env.uploads.length, 0);
  const first = await env.ok('members.update', update, 'dad');
  const firstFile = first.group.members.find(m => m.id === 'dad').avatarFileID;
  assert.ok(firstFile.startsWith('cloud://test/' + STORAGE_PREFIX + group.id + '/'));
  const second = await env.ok('members.update', { ...update, revision: first.group.revision, nickname: '新郎爸爸' }, 'dad');
  const secondFile = second.group.members.find(m => m.id === 'dad').avatarFileID;
  assert.notEqual(firstFile, secondFile); assert.ok(env.deletedFiles.includes(firstFile));
  assert.equal((await env.repo.get(group.id)).media.length, 1);
  const deleted = await env.ok('groups.delete', { groupId: group.id, revision: second.group.revision, confirmTitle: group.profile.title });
  assert.equal(deleted.cleanupPending, false); assert.ok(env.deletedFiles.includes(secondFile));
});

test('an avatar upload conflict preserves member data and rolls back only the new file', async () => {
  const env = setup(); const group = await env.create();
  const upload = env.storage.upload;
  env.storage.upload = async (...args) => { const fileID = await upload(...args); await env.ok('groups.profile', { groupId: group.id, revision: group.revision, profile: { venue: '家人更新' } }); return fileID; };
  const outcome = await env.call('members.update', { groupId: group.id, revision: group.revision, memberId: 'owner', nickname: '未保存', role: '新郎', avatarBase64: Buffer.from([255,216,255,1]).toString('base64') });
  assert.equal(outcome.error.code, 'CONFLICT');
  const current = await env.repo.get(group.id);
  assert.equal(current.members[0].nickname, '新人'); assert.equal(current.members[0].avatarFileID, undefined);
  assert.equal(env.deletedFiles.length, 1);
});

test('removing a member cleans their avatar and does not expose obsolete media URLs', async () => {
  const env = setup(); let group = await env.create();
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '爸爸' }, 'dad')).group;
  group = (await env.ok('members.update', { groupId: group.id, revision: group.revision, memberId: 'dad', nickname: '爸爸', role: '爸爸', avatarBase64: Buffer.from([255,216,255,1]).toString('base64') }, 'dad')).group;
  const avatar = group.members.find(m => m.id === 'dad').avatarFileID;
  assert.ok((await env.ok('media.urls', { groupId: group.id })).urls[avatar]);
  await env.ok('groups.removeMember', { groupId: group.id, revision: group.revision, memberId: 'dad' });
  assert.ok(env.deletedFiles.includes(avatar));
  assert.deepEqual((await env.ok('media.urls', { groupId: group.id })).urls, {});
});

test('only the owner can delete, with a current revision and exact title confirmation', async () => {
  const env = setup(); let group = await env.create();
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '父亲' }, 'dad')).group;
  const payload = { groupId: group.id, revision: group.revision, confirmTitle: group.profile.title };
  assert.equal((await env.call('groups.delete', payload, 'dad')).error.code, 'FORBIDDEN');
  assert.equal((await env.call('groups.delete', { ...payload, ownerId: 'owner' }, 'stranger')).error.code, 'FORBIDDEN');
  assert.equal((await env.call('groups.delete', { ...payload, revision: 1 })).error.code, 'CONFLICT');
  assert.equal((await env.call('groups.delete', { ...payload, confirmTitle: '' })).error.code, 'CONFIRMATION_REQUIRED');
  assert.equal((await env.repo.get(group.id)).status, undefined);
});

test('deleting a group erases personal data, revokes invites and leaves other groups untouched', async () => {
  const env = setup(); let group = await env.create(); const other = await env.create('other');
  group = await env.save(group, 'guests', { name: 'Private guest', partySize: 2 });
  const originalCode = group.joinCode;
  const outcome = await env.ok('groups.delete', { groupId: group.id, revision: group.revision, confirmTitle: group.profile.title });
  assert.equal(outcome.cleanupPending, false);
  const marker = await env.repo.get(group.id);
  assert.equal(marker.status, 'deleted');
  assert.equal(marker.guests, undefined); assert.equal(marker.tasks, undefined);
  assert.deepEqual(marker.members, []); assert.deepEqual(marker.media, []);
  assert.ok(!JSON.stringify(marker).includes('Private guest'));
  assert.ok(!JSON.stringify(marker).includes('一起办婚礼'));
  assert.equal((await env.call('groups.get', { groupId: group.id })).error.code, 'GROUP_DELETED');
  assert.equal((await env.call('groups.join', { code: originalCode, nickname: '家人' }, 'dad')).error.code, 'INVALID_CODE');
  assert.equal((await env.call('records.save', { groupId: group.id, revision: group.revision, type: 'tasks', record: { title: 'late' } })).error.code, 'GROUP_DELETED');
  assert.deepEqual((await env.ok('groups.list')).groups, []);
  assert.equal((await env.ok('groups.delete', { groupId: group.id })).deleted, true);
  assert.equal((await env.repo.get(other.id)).status, undefined);
  assert.equal((await env.repo.get(other.id)).tasks.length, other.tasks.length);
});

test('media cleanup failures remain owner-retryable and never target another namespace', async () => {
  const env = setup(); let group = await env.create();
  const legacyPath = STORAGE_PREFIX + group.id + '/legacy.jpg';
  const upload = { fileID: 'cloud://test/' + legacyPath };
  const legacy = await env.repo.get(group.id);
  legacy.media.push({ fileID: upload.fileID, cloudPath: legacyPath, kind: 'image' });
  env.repo.groups.set(group.id, legacy);
  const remove = env.storage.remove;
  env.storage.remove = async () => { throw new Error('storage unavailable'); };
  const first = await env.ok('groups.delete', { groupId: group.id, revision: group.revision, confirmTitle: group.profile.title });
  assert.equal(first.cleanupPending, true);
  assert.equal((await env.ok('groups.list')).groups[0].deletionPending, true);
  assert.equal((await env.call('media.urls', { groupId: group.id })).error.code, 'GROUP_DELETED');
  assert.equal((await env.call('groups.delete', { groupId: group.id }, 'dad')).error.code, 'FORBIDDEN');
  env.storage.remove = remove;
  assert.equal((await env.ok('groups.delete', { groupId: group.id })).cleanupPending, false);
  assert.deepEqual(env.deletedFiles, [upload.fileID]);
  const other = await env.create();
  const stored = await env.repo.get(other.id);
  stored.media.push({ fileID: 'cloud://test/other-project/file.jpg', cloudPath: 'other-project/file.jpg', kind: 'image' });
  env.repo.groups.set(other.id, stored);
  assert.equal((await env.ok('groups.delete', { groupId: other.id, revision: other.revision, confirmTitle: other.profile.title })).cleanupPending, true);
  assert.equal(env.deletedFiles.length, 1);
});

test('an upload racing deletion cannot resurrect the group and failed rollback remains tracked', async () => {
  const env = setup(); const group = await env.create();
  let finish; let started;
  const uploading = new Promise(resolve => { started = resolve; });
  env.storage.upload = async path => { started(); return new Promise(resolve => { finish = () => resolve('cloud://test/' + path); }); };
  const request = env.call('members.update', { groupId: group.id, revision: group.revision, memberId: 'owner', nickname: '新人', role: '新郎', avatarBase64: Buffer.from([255,216,255,1]).toString('base64') });
  await uploading;
  await env.ok('groups.delete', { groupId: group.id, revision: group.revision, confirmTitle: group.profile.title });
  env.storage.remove = async () => { throw new Error('temporary'); };
  finish();
  assert.equal((await request).error.code, 'GROUP_DELETED');
  const stored = await env.repo.get(group.id);
  assert.equal(stored.status, 'deleting'); assert.equal(stored.media.length, 1);
  assert.equal(stored.tasks, undefined);
  env.storage.remove = async fileID => env.deletedFiles.push(fileID);
  assert.equal((await env.ok('groups.delete', { groupId: group.id })).cleanupPending, false);
});

test('namespace is isolated and app identity is enforced even for public invitations', async () => {
  assert.equal(COLLECTION, 'xishi_tuotuo_groups');
  assert.equal(STORAGE_PREFIX, 'xishi-tuotuo/');
  const env = setup();
  assert.equal((await env.call('groups.list', {}, 'owner', `wx${'2'.repeat(16)}`)).error.code, 'APP_NOT_ALLOWED');
  assert.equal((await env.call('invitations.get', { token: 'a'.repeat(64) }, 'owner', 'other')).error.code, 'APP_NOT_ALLOWED');
  assert.equal((await env.service({ action: 'groups.list' }, { APPID: APP_ID })).error.code, 'UNAUTHENTICATED');
  const unconfigured = createService({ repo: env.repo });
  assert.equal((await unconfigured({ action: 'groups.list' }, { APPID: APP_ID, OPENID: 'owner' })).error.code, 'APP_NOT_ALLOWED');
});

test('new groups have shared task defaults and omit internal capabilities', async () => {
  const env = setup();
  const group = await env.create();
  assert.equal(group.tasks.length, 9);
  assert.equal(group.selfId, 'owner');
  assert.equal(group.tasks.filter(task => task.done).length, 0);
  assert.match(group.joinCode, /^[A-F0-9]{12}$/);
  assert.equal(group.invitations, undefined);
  assert.equal(group.memberIds, undefined);
  assert.equal(group.media, undefined);
  assert.equal((await env.ok('groups.list')).groups.length, 1);
  assert.deepEqual((await env.ok('groups.list', {}, 'stranger')).groups, []);
});

test('shared environments use the complete FROM identity and reject owner fallback', async () => {
  const env = setup();
  const sharedContext = { APPID: `wx${'2'.repeat(16)}`, OPENID: 'resource-owner-id', FROM_APPID: APP_ID, FROM_OPENID: 'calling-user-id' };
  const created = await env.service({ action: 'groups.create', payload: { nickname: '新人', profile: {} } }, sharedContext);
  assert.equal(created.ok, true);
  assert.equal(created.data.group.selfId, 'calling-user-id');
  assert.equal(created.data.group.ownerId, 'calling-user-id');
  const untrustedSource = await env.service({ action: 'groups.list' }, { APPID: APP_ID, OPENID: 'calling-user-id', FROM_APPID: `wx${'3'.repeat(16)}`, FROM_OPENID: 'attacker' });
  assert.equal(untrustedSource.error.code, 'APP_NOT_ALLOWED');
  const missingSourceUser = await env.service({ action: 'groups.list' }, { APPID: APP_ID, OPENID: 'resource-owner-id', FROM_APPID: APP_ID });
  assert.equal(missingSourceUser.error.code, 'UNAUTHENTICATED');
  const missingSourceApp = await env.service({ action: 'groups.list' }, { APPID: APP_ID, OPENID: 'resource-owner-id', FROM_OPENID: 'attacker' });
  assert.equal(missingSourceApp.error.code, 'APP_NOT_ALLOWED');
  const spoofedPayload = await env.service({ action: 'groups.get', payload: { groupId: created.data.group.id, FROM_APPID: APP_ID, FROM_OPENID: 'calling-user-id' } }, { APPID: APP_ID, OPENID: 'stranger' });
  assert.equal(spoofedPayload.error.code, 'FORBIDDEN');
});

test('cross-group reads, writes and uploads cannot impersonate members', async () => {
  const env = setup();
  const group = await env.create();
  for (const action of ['groups.get', 'groups.profile', 'records.save', 'media.urls', 'members.update']) {
    const result = await env.call(action, { groupId: group.id, revision: 1, userId: 'owner', ownerId: 'stranger', type: 'tables', record: { name: '主桌', capacity: 10 }, profile: { title: '篡改' } }, 'stranger');
    assert.equal(result.error.code, 'FORBIDDEN', action);
  }
  assert.equal((await env.repo.get(group.id)).profile.title, '一起办婚礼');
  assert.equal(env.uploads.length, 0);
});

test('family group joining respects expiry and is idempotent', async () => {
  const env = setup();
  const group = await env.create();
  const joined = await env.ok('groups.join', { code: group.joinCode, nickname: '爸爸', role: '父母' }, 'dad');
  assert.equal(joined.group.members.length, 2);
  assert.equal(joined.group.selfId, 'dad');
  const again = await env.ok('groups.join', { code: group.joinCode, nickname: '爸爸', role: '父母' }, 'dad');
  assert.equal(again.group.revision, joined.group.revision);
  assert.equal(again.group.members.length, 2);
  env.advance(8 * 86400000);
  assert.equal((await env.call('groups.join', { code: group.joinCode, nickname: '妈妈' }, 'mom')).error.code, 'INVALID_CODE');
});

test('stale and simultaneous writes preserve the successful update', async () => {
  const env = setup();
  const group = await env.create();
  const payload = { groupId: group.id, revision: group.revision, type: 'tables' };
  const results = await Promise.all([
    env.call('records.save', { ...payload, record: { name: '主桌', capacity: 10 } }),
    env.call('records.save', { ...payload, record: { name: '亲友桌', capacity: 12 } })
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => result.error?.code === 'CONFLICT').length, 1);
  assert.equal((await env.repo.get(group.id)).tables.length, 1);
  const stale = await env.call('groups.profile', { groupId: group.id, revision: group.revision, profile: { title: '旧版本覆盖' } });
  assert.equal(stale.error.code, 'CONFLICT');
});

test('table capacity validates party sizes and custom capacities', async () => {
  const env = setup();
  let group = await env.create();
  group = await env.save(group, 'tables', { name: '家人桌', capacity: 12 });
  const table = group.tables[0];
  group = await env.save(group, 'guests', { name: '一家十口', partySize: 10, attendance: 'yes', tableId: table.id });
  const full = await env.call('records.save', { groupId: group.id, revision: group.revision, type: 'guests', record: { name: '另一家', partySize: 3, attendance: 'yes', tableId: table.id } });
  assert.equal(full.error.code, 'CAPACITY_EXCEEDED');
  const reduce = await env.call('records.save', { groupId: group.id, revision: group.revision, type: 'tables', record: { ...table, capacity: 9 } });
  assert.equal(reduce.error.code, 'CAPACITY_EXCEEDED');
  const absent = await env.call('records.save', { groupId: group.id, revision: group.revision, type: 'guests', record: { name: '不出席', partySize: 1, attendance: 'no', tableId: table.id } });
  assert.equal(absent.error.code, 'CAPACITY_EXCEEDED');
  group = await env.save(group, 'tables', { name: '小桌', capacity: 7 });
  assert.equal(group.tables[1].capacity, 7);
});

test('guest batch updates only selected fields and guests in a single revision', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'guests', { name: '第一家', partySize: 3, attendance: 'pending', needsLodging: true, side: 'groom', relation: '同学', phone: '12345', note: '保留备注' });
  group = await env.save(group, 'guests', { name: '第二家', partySize: 2, attendance: 'pending', needsLodging: true, side: 'bride' });
  group = await env.save(group, 'guests', { name: '未选亲友', attendance: 'no', needsLodging: true });
  const before = copy(group);
  const guestIds = [group.guests[0].id, group.guests[1].id, group.guests[0].id];
  const result = await env.ok('guests.batchUpdate', { groupId: group.id, revision: group.revision, guestIds, changes: { attendance: 'yes', needsLodging: false } });
  assert.equal(result.updatedCount, 2, 'Duplicate IDs are updated once');
  assert.equal(result.warning, '');
  assert.equal(result.group.revision, before.revision + 1, 'One batch commits one revision');
  assert.deepEqual(result.group.guests.slice(0, 2), before.guests.slice(0, 2).map(guest => ({ ...guest, attendance: 'yes', needsLodging: false })));
  assert.deepEqual(result.group.guests[2], before.guests[2]);
  const sideOnly = await env.ok('guests.batchUpdate', { groupId: group.id, revision: result.group.revision, guestIds: [guestIds[0]], changes: { side: 'shared' } });
  assert.deepEqual(sideOnly.group.guests[0], { ...result.group.guests[0], side: 'shared' });
});

test('guest batch attendance changes release seats while preserving room assignments', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'tables', { name: '亲友桌', capacity: 10 });
  const tableId = group.tables[0].id;
  group = await env.save(group, 'guests', { name: '第一家', partySize: 3, attendance: 'yes', needsLodging: true, tableId });
  group = await env.save(group, 'guests', { name: '第二家', partySize: 2, attendance: 'yes', needsLodging: true, tableId });
  group = await env.save(group, 'guests', { name: '未选亲友', partySize: 1, attendance: 'yes', tableId });
  const guestIds = group.guests.slice(0, 2).map(guest => guest.id);
  group = await env.save(group, 'lodgings', { hotel: '酒店', room: '101', guestIds, checkIn: '2027-05-19', checkOut: '2027-05-21' });
  const rooms = copy(group.lodgings);
  const result = await env.ok('guests.batchUpdate', { groupId: group.id, revision: group.revision, guestIds, changes: { attendance: 'no', needsLodging: false } });
  assert.equal(result.group.guests[0].tableId, '');
  assert.equal(result.group.guests[1].tableId, '');
  assert.equal(result.group.guests[2].tableId, tableId);
  assert.match(result.warning, /2 组/);
  assert.deepEqual(result.group.lodgings, rooms, 'Changing lodging needs does not silently cancel existing reservations');
});

test('lodging-only and side-only batches preserve legacy seating until attendance is changed', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'guests', { name: '旧记录亲友', attendance: 'yes', needsLodging: true, side: 'groom' });
  const stored = await env.repo.get(group.id);
  stored.guests[0].tableId = 'legacy-missing-table';
  env.repo.groups.set(group.id, stored);
  const base = { groupId: group.id, guestIds: [group.guests[0].id] };
  const lodging = await env.ok('guests.batchUpdate', { ...base, revision: group.revision, changes: { needsLodging: false } });
  assert.equal(lodging.group.guests[0].needsLodging, false);
  assert.equal(lodging.group.guests[0].tableId, 'legacy-missing-table');
  assert.equal(lodging.warning, '');
  const side = await env.ok('guests.batchUpdate', { ...base, revision: lodging.group.revision, changes: { side: 'shared' } });
  assert.equal(side.group.guests[0].side, 'shared');
  assert.equal(side.group.guests[0].tableId, 'legacy-missing-table');
  assert.equal(side.warning, '');
  const attendance = await env.ok('guests.batchUpdate', { ...base, revision: side.group.revision, changes: { attendance: 'no' } });
  assert.equal(attendance.group.guests[0].tableId, '');
  assert.match(attendance.warning, /1 组/);
});

test('invalid guest batch input rejects every update without changing stored records', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'guests', { name: '亲友', attendance: 'pending', needsLodging: true });
  const guestId = group.guests[0].id;
  const before = await env.repo.get(group.id);
  const base = { groupId: group.id, revision: group.revision, guestIds: [guestId], changes: { attendance: 'yes' } };
  const invalid = [
    { guestIds: [] }, { guestIds: 'all' }, { guestIds: [guestId, null] },
    { guestIds: Array(501).fill(guestId) },
    { changes: {} }, { changes: null }, { changes: [] },
    { changes: { attendance: 'maybe' } }, { changes: { attendance: undefined } },
    { changes: { needsLodging: 'false' } }, { changes: { needsLodging: null } }, { changes: { needsLodging: undefined } },
    { changes: { side: 'other' } }, { changes: { side: undefined } },
    { changes: { attendance: 'yes', partySize: 10 } },
    { changes: { attendance: 'yes', ownerId: 'visitor' } },
    { changes: JSON.parse('{"attendance":"yes","__proto__":{}}') }
  ];
  for (const override of invalid) {
    const result = await env.call('guests.batchUpdate', { ...base, ...override });
    assert.equal(result.error.code, 'INVALID_INPUT');
    assert.deepEqual(await env.repo.get(group.id), before, 'Invalid batches must not apply a partial update');
  }
});

test('guest batches reject unknown and cross-group IDs without partially updating known guests', async () => {
  const env = setup(); let first = await env.create(); let second = await env.create();
  first = await env.save(first, 'guests', { name: '第一场亲友', attendance: 'pending' });
  second = await env.save(second, 'guests', { name: '第二场亲友', attendance: 'pending' });
  const firstBefore = await env.repo.get(first.id);
  const secondBefore = await env.repo.get(second.id);
  for (const unknownId of ['missing-guest', second.guests[0].id]) {
    const result = await env.call('guests.batchUpdate', { groupId: first.id, revision: first.revision, guestIds: [first.guests[0].id, unknownId], changes: { attendance: 'yes' } });
    assert.equal(result.error.code, 'INVALID_INPUT');
    assert.deepEqual(await env.repo.get(first.id), firstBefore);
    assert.deepEqual(await env.repo.get(second.id), secondBefore);
  }
});

test('guest batches require current membership and revision and ignore claimed client identity', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'guests', { name: '亲友', attendance: 'pending' });
  const base = { groupId: group.id, revision: group.revision, guestIds: [group.guests[0].id], changes: { attendance: 'yes' } };
  const before = await env.repo.get(group.id);
  assert.equal((await env.call('guests.batchUpdate', { ...base, userId: 'owner', selfId: 'owner', ownerId: 'visitor' }, 'visitor')).error.code, 'FORBIDDEN');
  assert.equal((await env.call('guests.batchUpdate', { ...base, revision: group.revision - 1 })).error.code, 'CONFLICT');
  assert.equal((await env.call('guests.batchUpdate', base, 'owner', `wx${'2'.repeat(16)}`)).error.code, 'APP_NOT_ALLOWED');
  assert.deepEqual(await env.repo.get(group.id), before);
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '家人' }, 'dad')).group;
  const updated = await env.ok('guests.batchUpdate', { ...base, revision: group.revision }, 'dad');
  assert.equal(updated.group.guests[0].attendance, 'yes', 'Family members may maintain guests');
  const stale = await env.call('guests.batchUpdate', { ...base, revision: group.revision, changes: { needsLodging: true } }, 'dad');
  assert.equal(stale.error.code, 'CONFLICT');
  assert.equal((await env.repo.get(group.id)).guests[0].needsLodging, false);
  group = (await env.ok('groups.removeMember', { groupId: group.id, revision: updated.group.revision, memberId: 'dad' })).group;
  assert.equal((await env.call('guests.batchUpdate', { ...base, revision: group.revision }, 'dad')).error.code, 'FORBIDDEN');
});

test('guest batch updates support the full 500-guest group capacity', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'guests', { name: '亲友模板', attendance: 'pending' });
  const stored = await env.repo.get(group.id);
  stored.guests = Array.from({ length: 500 }, (_, index) => ({ ...stored.guests[0], id: 'guest-' + index, name: '亲友' + index }));
  env.repo.groups.set(group.id, stored);
  const result = await env.ok('guests.batchUpdate', { groupId: group.id, revision: group.revision, guestIds: stored.guests.map(guest => guest.id), changes: { attendance: 'pending', needsLodging: true, side: 'bride' } });
  assert.equal(result.updatedCount, 500);
  assert.equal(result.group.revision, group.revision + 1);
  assert.ok(result.group.guests.every(guest => guest.attendance === 'pending' && guest.needsLodging && guest.side === 'bride'));
});

test('deletions clean related seating and room lists', async () => {
  const env = setup();
  let group = await env.create();
  group = await env.save(group, 'tables', { name: '圆桌', capacity: 10 });
  const tableId = group.tables[0].id;
  group = await env.save(group, 'guests', { name: '亲友', partySize: 2, attendance: 'yes', tableId });
  const guestId = group.guests[0].id;
  group = await env.save(group, 'lodgings', { hotel: '酒店', room: '101', guestIds: [guestId], checkIn: '2027-05-19', checkOut: '2027-05-21' });
  group = (await env.ok('records.delete', { groupId: group.id, revision: group.revision, type: 'tables', id: tableId })).group;
  assert.equal(group.guests[0].tableId, '');
  group = (await env.ok('records.delete', { groupId: group.id, revision: group.revision, type: 'guests', id: guestId })).group;
  assert.deepEqual(group.lodgings[0].guestIds, []);
});

test('only the owner manages membership and removed members lose access', async () => {
  const env = setup();
  let group = await env.create();
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '爸爸' }, 'dad')).group;
  group = await env.save(group, 'tasks', { ...group.tasks[0], assigneeId: 'dad' });
  assert.equal((await env.call('groups.rotateCode', { groupId: group.id, revision: group.revision }, 'dad')).error.code, 'FORBIDDEN');
  assert.equal((await env.call('groups.removeMember', { groupId: group.id, revision: group.revision, memberId: 'owner' })).error.code, 'INVALID_INPUT');
  const originalCode = group.joinCode;
  group = (await env.ok('groups.removeMember', { groupId: group.id, revision: group.revision, memberId: 'dad' })).group;
  assert.equal(group.tasks[0].assigneeId, '');
  assert.notEqual(group.joinCode, originalCode);
  assert.equal((await env.call('groups.get', { groupId: group.id }, 'dad')).error.code, 'FORBIDDEN');
  assert.equal((await env.call('groups.join', { code: originalCode, nickname: '爸爸' }, 'dad')).error.code, 'INVALID_CODE');
});

test('validation failures leave prior data unchanged and ignore protected fields', async () => {
  const env = setup();
  let group = await env.create();
  const original = await env.repo.get(group.id);
  const invalid = [
    ['guests', { name: '宾客', partySize: -1 }],
    ['tables', { name: '桌子', capacity: 1.5 }],
    ['tasks', { title: '事项', dueDate: '2027-02-31' }],
    ['tasks', { title: '事项', assigneeId: 'outsider' }],
    ['timeline', { title: '环节', time: '25:90' }],
    ['lodgings', { hotel: '酒店', guestIds: ['absent'] }]
  ];
  for (const [type, record] of invalid) {
    const result = await env.call('records.save', { groupId: group.id, revision: group.revision, type, record });
    assert.equal(result.error.code, 'INVALID_INPUT');
  }
  assert.deepEqual(await env.repo.get(group.id), original);
  group = await env.save(group, 'guests', { name: '宾客', partySize: 1, ownerId: 'visitor', invitations: ['attack'] });
  assert.equal(group.guests[0].ownerId, undefined);
  assert.equal(group.guests[0].invitations, undefined);
});

test('retired invitation and media-upload actions reject both members and visitors without writes', async () => {
  const env = setup(); const group = await env.create();
  const before = await env.repo.get(group.id);
  for (const user of ['owner', 'visitor']) {
    for (const action of ['invitations.issue', 'invitations.get', 'invitations.respond', 'media.upload']) {
      const result = await env.call(action, { groupId: group.id, revision: group.revision, token: 'a'.repeat(64), kind: 'image', base64: 'AAAA', response: { attendance: 'yes' } }, user);
      assert.equal(result.error.code, 'INVALID_ACTION', action);
    }
  }
  assert.deepEqual(await env.repo.get(group.id), before);
  assert.equal(env.uploads.length, 0);
});

test('legacy invitation data stays inaccessible while member avatars and group collaboration still work', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'guests', { name: '亲友', partySize: 2, note: '内部备注' });
  const legacy = await env.repo.get(group.id);
  const oldPath = STORAGE_PREFIX + group.id + '/legacy.jpg';
  const avatarPath = STORAGE_PREFIX + group.id + '/avatar.jpg';
  legacy.profile.coverFileID = 'cloud://test/' + oldPath;
  legacy.profile.musicFileID = 'cloud://test/music.mp3';
  legacy.profile.invitationText = '旧邀请语'; legacy.profile.theme = 'rose';
  legacy.guests[0].replyNote = '旧回执留言';
  legacy.invitations = [{ token: 'legacy-token' }]; legacy.invitationHashes = ['legacy-hash'];
  legacy.members[0].avatarFileID = 'cloud://test/' + avatarPath;
  legacy.media.push({ fileID: legacy.profile.coverFileID, cloudPath: oldPath, kind: 'image' }, { fileID: legacy.members[0].avatarFileID, cloudPath: avatarPath, kind: 'avatar' });
  env.repo.groups.set(group.id, legacy);
  const view = (await env.ok('groups.get', { groupId: group.id })).group;
  for (const field of ['coverFileID', 'musicFileID', 'invitationText', 'theme']) assert.equal(view.profile[field], undefined);
  assert.equal(view.guests[0].replyNote, undefined);
  assert.equal(view.guests[0].note, '内部备注');
  assert.equal(view.invitations, undefined);
  const urls = (await env.ok('media.urls', { groupId: group.id })).urls;
  assert.deepEqual(Object.keys(urls), [legacy.members[0].avatarFileID]);
  group = (await env.ok('groups.join', { code: group.joinCode, nickname: '爸爸', role: '爸爸' }, 'dad')).group;
  group = await env.save(group, 'tasks', { ...group.tasks[0], assigneeId: 'dad', done: true }, 'dad');
  assert.equal(group.tasks[0].done, true);
  const stored = await env.repo.get(group.id);
  assert.equal(stored.invitations, undefined); assert.equal(stored.invitationHashes, undefined);
  assert.equal(stored.guests[0].replyNote, undefined);
  assert.equal(stored.media.length, 2, 'retain legacy references for scoped deletion cleanup');
  assert.equal((await env.ok('groups.delete', { groupId: group.id, revision: group.revision, confirmTitle: group.profile.title })).cleanupPending, false);
  assert.deepEqual(env.deletedFiles.sort(), [legacy.profile.coverFileID, legacy.members[0].avatarFileID].sort());
});

test('manual attendance updates preserve notes and safely unseat a growing party', async () => {
  const env = setup(); let group = await env.create();
  group = await env.save(group, 'tables', { name: '圆桌', capacity: 10 });
  group = await env.save(group, 'guests', { name: '第一家', partySize: 8, attendance: 'yes', tableId: group.tables[0].id });
  group = await env.save(group, 'guests', { name: '第二家', partySize: 2, attendance: 'yes', tableId: group.tables[0].id, note: '内部说明' });
  const response = await env.ok('records.save', { groupId: group.id, revision: group.revision, type: 'guests', record: { ...group.guests[1], partySize: 3, needsLodging: true, replyNote: 'ignored' } });
  assert.ok(response.warning.includes('容量'));
  assert.equal(response.group.guests[1].tableId, '');
  assert.equal(response.group.guests[1].note, '内部说明');
  assert.equal(response.group.guests[1].replyNote, undefined);
  assert.equal(response.group.guests[1].needsLodging, true);
});

test('backend failures are sanitized and do not expose implementation or credentials', async () => {
  const service = createService({ repo: { async listForMember() { throw new Error('secret=private-token'); } }, allowedAppId: APP_ID });
  const result = await service({ action: 'groups.list', payload: {} }, { OPENID: 'owner', APPID: APP_ID });
  assert.equal(result.error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('private-token'), false);
});
