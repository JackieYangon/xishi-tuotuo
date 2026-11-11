const { loadModule, mountPage } = require('./vue-harness.cjs');
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const result = data => ({ result: { ok: true, data } });

function serviceHarness(options = {}) {
  const memory = new Map();
  const calls = [];
  const pending = [];
  const directClient = { callFunction(request) { calls.push(request); const reply = deferred(); pending.push(reply); return reply.promise; } };
  const app = { globalData: { cloudReady: true, cloud: null, ready: null, ...options.globalData } };
  const context = {
    module: { exports: {} },
    require: () => ({ functionName: 'xishiTuotuoApi' }),
    wx: { cloud: directClient, getStorageSync: key => memory.get(key), setStorageSync: (key, value) => memory.set(key, value), removeStorageSync: key => memory.delete(key) },
    getApp: () => app,
    console: { error() {} }
  };
  context.module.exports = loadModule(path.join(root, 'src/utils/service.js'), context, context.require);
  return { service: context.module.exports, calls, pending, app };
}

function pageHarness(filename, service, wxOverrides = {}) {
  const toasts = [];
  const wx = { showToast: value => toasts.push(value), stopPullDownRefresh() {}, hideShareMenu() {}, reLaunch() {}, ...wxOverrides };
  const page = mountPage(path.join(root, filename), { wx, console }, () => service);
  return { page, toasts };
}

function group(revision, changes = {}) {
  return {
    id: 'wedding-a', revision, ownerId: 'owner', selfId: 'owner', joinCode: 'ABCDEF123456', joinCodeExpiresAt: Date.now() + 86400000,
    members: [{ id: 'owner', nickname: '新人', role: '新娘' }],
    profile: { title: '我们的婚礼', bride: '新娘', groom: '新郎', date: '2027-05-20', venue: '原场地', address: '', latitude: null, longitude: null, coverFileID: '', musicFileID: '', invitationText: '欢迎亲友', theme: 'rose', ...changes }
  };
}
const input = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });

test('existing members can dismiss optional login and later open their own profile', async () => {
  const saved = [];
  const current = group(1);
  const { page } = pageHarness('src/pages/group/index.vue', {
    async loginMember(revision) { assert.equal(revision, 1); return { group: { ...current, revision: 2, members: [{ ...current.members[0], profileLoginAt: 123 }] } }; }
  }, { setStorageSync: (...args) => saved.push(args), getStorageSync: () => false });
  page.applyGroup(current);
  assert.equal(page.state.showLoginPrompt, true);
  page.skipLogin();
  assert.equal(page.state.showLoginPrompt, false); assert.equal(page.state.group.id, current.id); assert.equal(saved.length, 1);
  await page.loginAndEdit();
  assert.equal(page.state.memberOpen, true); assert.equal(page.state.memberId, 'owner');
  assert.equal(page.state.showLoginPrompt, false);
});

test('member drafts retain their original revision and are blocked after a conflict', async () => {
  let requests = 0;
  const { page } = pageHarness('src/pages/group/index.vue', { async saveMember(id, nickname, role, avatar, revision) {
    requests++; assert.equal(revision, 1); throw Object.assign(new Error('Conflict'), { code: 'CONFLICT' });
  } });
  page.applyGroup(group(1)); page.openMember(); page.state.memberNickname = '我的草稿';
  page.applyGroup(group(2));
  await page.saveMember(); await page.saveMember();
  assert.equal(page.state.memberNickname, '我的草稿'); assert.equal(page.state.memberOpen, true);
  assert.equal(page.state.memberConflict, true); assert.equal(requests, 1);
});

test('group deletion clears only its own cached selection and supports cleanup retries', async () => {
  const { service, pending } = serviceHarness();
  service.setGroup(group(1));
  const deleting = service.deleteGroup('wedding-a', 1, 'Title');
  pending[0].resolve(result({ deleted: true, groupId: 'wedding-a', cleanupPending: true }));
  await deleting;
  assert.equal(service.getGroupId(), ''); assert.equal(service.getCachedGroup(), null);
  service.setGroup({ ...group(1), id: 'wedding-b' });
  const retry = service.deleteGroup('wedding-a');
  pending[1].resolve(result({ deleted: true, cleanupPending: false }));
  await retry;
  assert.equal(service.getGroupId(), 'wedding-b');
});

test('group deletion requires typed confirmation and a failed request preserves the retry dialog', async () => {
  let requests = 0;
  const { page } = pageHarness('src/pages/group/index.vue', {
    async deleteGroup() { requests++; throw new Error('网络中断'); }
  });
  page.applyGroup(group(1)); page.openDelete();
  await page.deleteWedding(); assert.equal(requests, 0);
  page.state.deleteTitle = page.state.group.profile.title;
  await page.deleteWedding();
  assert.equal(requests, 1); assert.equal(page.state.deleteOpen, true);
  assert.equal(page.state.busy, false); assert.equal(page.state.deleteError, '网络中断');
});

test('revoked invitation clears its private view and stops audio playback', () => {
  const { page } = pageHarness('src/pages/invitation/index.vue', {});
  let stopped = false;
  page.state.invitation = { guest: { name: 'Guest' } };
  page.runtime.audio = { destroy() { stopped = true; } };
  page.clearInvalidInvitation({ code: 'INVITATION_EXPIRED', message: '已失效' });
  assert.equal(page.state.invitation, null); assert.equal(page.runtime.audio, null);
  assert.equal(stopped, true);
});

test('out-of-order group reads never downgrade cached revisions', async () => {
  const { service, pending } = serviceHarness();
  service.setGroup(group(1));
  const older = service.getGroup();
  const newer = service.getGroup();
  pending[1].resolve(result({ group: group(3) }));
  await newer;
  pending[0].resolve(result({ group: group(2) }));
  const delayed = await older;
  assert.equal(service.getCachedGroup().revision, 3);
  assert.equal(delayed.revision, 3);
});

test('explicit edit revision is preserved when the shared cache is newer', async () => {
  const { service, calls, pending } = serviceHarness();
  service.setGroup(group(9));
  const saving = service.mutate('groups.profile', { profile: { title: '本地草稿' } }, 3);
  assert.equal(calls[0].data.payload.revision, 3);
  pending[0].resolve({ result: { ok: false, error: { code: 'CONFLICT', message: '请重新载入' } } });
  await assert.rejects(saving, error => error.code === 'CONFLICT');
  assert.equal(service.getCachedGroup().revision, 9);
});

test('a pending read cannot restore a previously selected wedding', async () => {
  const { service, pending } = serviceHarness();
  service.setGroup(group(1));
  const loading = service.getGroup();
  service.setGroup({ ...group(1), id: 'wedding-b' });
  pending[0].resolve(result({ group: group(2) }));
  await assert.rejects(loading, error => error.code === 'GROUP_CHANGED');
  assert.equal(service.getCachedGroup().id, 'wedding-b');
});

test('cloud calls await initialization and use the shared environment client', async () => {
  const ready = deferred();
  const requests = [];
  const { service, app, calls } = serviceHarness({ globalData: { cloudReady: false, ready: ready.promise } });
  const requesting = service.call('groups.list');
  await Promise.resolve();
  assert.equal(requests.length, 0);
  app.globalData.cloud = { async callFunction(request) { requests.push(request); return result({ groups: [] }); } };
  app.globalData.cloudReady = true;
  ready.resolve();
  const data = await requesting;
  assert.equal(data.groups.length, 0);
  assert.equal(requests.length, 1);
  assert.equal(calls.length, 0);
});

test('refreshing a family group keeps an unsaved profile and its original revision', async () => {
  const newest = group(2, { venue: '家人刚选的新场地' });
  const service = { async call() { return { groups: [] }; }, getGroupId: () => 'wedding-a', async getGroup() { return newest; }, showError() {} };
  const { page } = pageHarness('src/pages/group/index.vue', service);
  page.applyGroup(group(1));
  page.profileInput(input('title', '我尚未保存的标题'));
  await page.load();
  assert.equal(page.state.group.revision, 2);
  assert.equal(page.state.profile.title, '我尚未保存的标题');
  assert.equal(page.state.profile.venue, '原场地');
  assert.equal(page.runtime._profileRevision, 1);
  assert.equal(page.runtime._dirty, true);
});

test('declining a conflict reload cannot upgrade a stale profile draft for resubmission', async () => {
  const attempts = [];
  let reads = 0;
  const service = {
    async mutate(action, payload, revision) { attempts.push({ action, payload: clone(payload), revision }); throw Object.assign(new Error('其他成员更新了资料'), { code: 'CONFLICT' }); },
    async confirm() { return false; }, async getGroup() { reads += 1; return group(2); }, showError() {}
  };
  const { page, toasts } = pageHarness('src/pages/group/index.vue', service);
  page.applyGroup(group(1));
  page.profileInput(input('title', '我的标题'));
  await page.saveProfile();
  await page.saveProfile();
  assert.equal(reads, 0);
  assert.deepEqual(attempts.map(attempt => attempt.revision), [1, 1]);
  assert.deepEqual(attempts[0].payload.profile, { title: '我的标题' });
  assert.equal(page.state.profile.title, '我的标题');
  assert.equal(page.runtime._profileRevision, 1);
  assert.equal(toasts.length, 0);
});

test('accepting a conflict reload replaces the draft before a new edit is saved', async () => {
  let attempted = 0;
  let finalPayload;
  const newest = group(2, { venue: '最新场地', title: '家人更新的标题' });
  const service = {
    async mutate(action, payload, revision) {
      attempted += 1;
      if (attempted === 1) throw Object.assign(new Error('冲突'), { code: 'CONFLICT' });
      finalPayload = { action, payload: clone(payload), revision };
      return { group: group(3, { ...newest.profile, ...payload.profile }) };
    },
    async confirm() { return true; }, async getGroup() { return newest; }, showError() {}
  };
  const { page } = pageHarness('src/pages/group/index.vue', service);
  page.applyGroup(group(1));
  page.profileInput(input('title', '旧草稿'));
  await page.saveProfile();
  assert.equal(page.state.profile.title, '家人更新的标题');
  assert.equal(page.runtime._profileRevision, 2);
  assert.equal(page.runtime._dirty, false);
  page.profileInput(input('bride', '更新姓名'));
  await page.saveProfile();
  assert.equal(finalPayload.revision, 2);
  assert.deepEqual(finalPayload.payload.profile, { bride: '更新姓名' });
  assert.equal(page.state.profile.venue, '最新场地');
});

test('media upload cannot discard an unsaved wedding profile', async () => {
  let uploads = 0;
  const messages = [];
  const service = { async upload() { uploads += 1; }, showError: error => messages.push(error.message) };
  const { page } = pageHarness('src/pages/group/index.vue', service);
  page.applyGroup(group(1));
  page.profileInput(input('title', '尚未保存'));
  await page.uploadMedia('/photo.jpg', 'image', 'photo.jpg');
  assert.equal(uploads, 0);
  assert.equal(page.state.profile.title, '尚未保存');
  assert.ok(messages[0].includes('先保存'));
});

test('declining an invitation does not require the hidden party-size input', async () => {
  const submissions = [];
  const errors = [];
  const invitation = { profile: group(1).profile, guest: { name: '亲友', attendance: 'no', partySize: 1, needsLodging: false, note: '' }, tableName: '', coverUrl: '', musicUrl: '' };
  const service = {
    async call(action, payload) { submissions.push({ action, payload: clone(payload) }); return { invitation }; },
    showError: error => errors.push(error.message)
  };
  const { page } = pageHarness('src/pages/invitation/index.vue', service);
  page.runtime.token = 'a'.repeat(64);
  page.applyInvitation({ ...invitation, guest: { ...invitation.guest, attendance: 'pending', partySize: 2 } });
  Object.assign(page.state, { attendance: 'no', partySize: '', needsLodging: true });
  await page.submit();
  assert.equal(submissions.length, 1, errors.join('; '));
  assert.equal(submissions[0].action, 'invitations.respond');
  assert.equal(submissions[0].payload.response.attendance, 'no');
  assert.equal(submissions[0].payload.response.needsLodging, false);
  assert.ok(Number.isInteger(submissions[0].payload.response.partySize));
  assert.ok(submissions[0].payload.response.partySize >= 1);
  assert.equal(page.state.submitted, true);
});

test('a removed member loses the previously rendered group and unsaved private draft', async () => {
  let cleared = false;
  const service = {
    async call() { return { groups: [] }; },
    getGroupId() { return 'group-a'; },
    async getGroup() { const error = new Error('Access revoked'); error.code = 'FORBIDDEN'; throw error; },
    setGroup(value) { cleared = value === null; }
  };
  const { page } = pageHarness('src/pages/group/index.vue', service);
  page.applyGroup(group(1));
  page.profileInput(input('title', 'Private unsaved title'));
  await page.load();
  assert.equal(cleared, true);
  assert.equal(page.state.group, null);
  assert.equal(page.state.profile.title, '');
  assert.equal(page.state.coverUrl, '');
  assert.equal(page.runtime._dirty, false);
  assert.ok(page.state.error);
});

test('failed RSVP submission keeps user input and never reports success', async () => {
  const errors = [];
  const service = { async call() { throw new Error('网络暂不可用'); }, showError: error => errors.push(error.message) };
  const { page, toasts } = pageHarness('src/pages/invitation/index.vue', service);
  page.runtime.token = 'b'.repeat(64);
  page.applyInvitation({ profile: group(1).profile, guest: { name: 'Guest', attendance: 'pending', partySize: 1, needsLodging: false, note: '' }, tableName: '', coverUrl: '', musicUrl: '' });
  Object.assign(page.state, { attendance: 'yes', partySize: '3', needsLodging: true, note: '请安排一间房' });
  await page.submit();
  assert.equal(page.state.partySize, '3');
  assert.equal(page.state.note, '请安排一间房');
  assert.equal(page.state.needsLodging, true);
  assert.equal(page.state.busy, false);
  assert.equal(page.state.submitted, false);
  assert.equal(toasts.length, 0);
  assert.equal(errors.length, 1);
});
