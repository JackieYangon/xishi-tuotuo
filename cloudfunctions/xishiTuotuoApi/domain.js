'use strict';

const crypto = require('node:crypto');
const COLLECTION = 'xishi_tuotuo_groups';
const STORAGE_PREFIX = 'xishi-tuotuo/';
const TYPES = ['tasks', 'items', 'vendors', 'guests', 'tables', 'timeline', 'lodgings'];
const MEMBER_ROLES = ['新娘', '新郎', '妈妈', '爸爸', '家人', '伴郎伴娘'];
const DAY = 86400000;
const MAX_DOCUMENT_BYTES = 700 * 1024;
const MAX_RECORDS = { tasks: 300, items: 300, vendors: 100, guests: 500, tables: 100, timeline: 150, lodgings: 150 };

class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fail(code, message) { throw new AppError(code, message); }
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', '提交的数据格式不正确');
  return value;
}
function text(value, label, max = 200, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail('INVALID_INPUT', `${label}应为文字`);
  value = value.trim();
  if (value.length > max || (required && !value)) fail('INVALID_INPUT', `${label}${required ? '不能为空，且' : ''}不能超过 ${max} 字`);
  return value;
}
function number(value, label, min, max, integer = false, fallback) {
  if (value === undefined || value === '') value = fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail('INVALID_INPUT', `${label}应为 ${min} 至 ${max} 范围内的${integer ? '整数' : '数字'}`);
  return value;
}
function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail('INVALID_INPUT', '开关选项格式不正确');
  return value;
}
function choice(value, values, fallback, label) {
  value = value === undefined ? fallback : value;
  if (!values.includes(value)) fail('INVALID_INPUT', `${label}选项不正确`);
  return value;
}
function date(value, label) {
  value = text(value, label, 10);
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)) fail('INVALID_INPUT', `${label}应为有效日期`);
  return value;
}
function id(value, label = '记录标识') {
  value = text(value, label, 64, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) fail('INVALID_INPUT', `${label}格式不正确`);
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function assertSize(group) {
  if (Buffer.byteLength(JSON.stringify(group), 'utf8') > MAX_DOCUMENT_BYTES) fail('LIMIT_REACHED', '本群组资料已接近容量上限，请先导出并精简不需要的内容');
}
function member(group, userId) {
  if (group && group.status) fail('GROUP_DELETED', '此婚礼群组已删除，无法继续访问');
  if (!group || !group.members.some(entry => entry.id === userId)) fail('FORBIDDEN', '你不是此筹备群组的成员');
}
function revision(group, expected) {
  if (!Number.isSafeInteger(expected) || expected !== group.revision) fail('CONFLICT', '其他成员刚刚更新了资料，请刷新后重试，当前内容未被覆盖');
}
function privateGroup(group, userId) {
  const result = clone(group);
  result.profile = cleanProfile(result.profile);
  result.guests.forEach(guest => { delete guest.replyNote; });
  delete result._id;
  delete result.invitations;
  delete result.invitationHashes;
  delete result.memberIds;
  delete result.media;
  result.selfId = userId;
  result.members = result.members.map(entry => ({ ...entry, accountLabel: hash(group.id + ':' + entry.id).slice(0, 8).toUpperCase() }));
  return result;
}
function cleanProfile(source) {
  const keys = ['title', 'bride', 'groom', 'date', 'venue', 'address', 'latitude', 'longitude'];
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}
function profile(input, existing) {
  object(input);
  const next = cleanProfile(existing);
  const stringFields = { title: 60, bride: 30, groom: 30, venue: 100, address: 200 };
  Object.entries(stringFields).forEach(([key, max]) => { if (input[key] !== undefined) next[key] = text(input[key], key === 'title' ? '婚礼名称' : '婚礼资料', max); });
  if (!next.title) next.title = '我们的婚礼';
  if (input.date !== undefined) next.date = date(input.date, '婚礼日期');
  ['latitude', 'longitude'].forEach(key => {
    if (input[key] !== undefined) next[key] = input[key] === '' || input[key] === null ? null : number(input[key], '地图坐标', key === 'latitude' ? -90 : -180, key === 'latitude' ? 90 : 180);
  });
  if ((next.latitude === null) !== (next.longitude === null)) fail('INVALID_INPUT', '请同时设置完整地图坐标');
  return next;
}
function assignee(value, group) {
  value = text(value, '负责人', 128);
  if (value && !group.members.some(entry => entry.id === value)) fail('INVALID_INPUT', '负责人已不在群组中，请重新选择');
  return value;
}
function record(type, input, group, recordId) {
  object(input);
  const result = { id: recordId };
  const note = () => text(input.note, '备注', 1000);
  if (type === 'tasks') Object.assign(result, {
    title: text(input.title, '事项名称', 100, true), dueDate: date(input.dueDate, '截止日期'), assigneeId: assignee(input.assigneeId, group), done: bool(input.done), note: note()
  });
  if (type === 'items') Object.assign(result, {
    name: text(input.name, '物品名称', 100, true), quantity: number(input.quantity, '数量', 1, 100000, true, 1), status: choice(input.status, ['pending', 'ordered', 'ready'], 'pending', '准备状态'), assigneeId: assignee(input.assigneeId, group), note: note()
  });
  if (type === 'vendors') Object.assign(result, {
    name: text(input.name, '商家名称', 100, true), category: text(input.category, '商家分类', 40), contact: text(input.contact, '联系人', 50), phone: text(input.phone, '联系电话', 40), quote: number(input.quote, '报价', 0, 100000000, false, 0), status: choice(input.status, ['pending', 'contacted', 'booked'], 'pending', '联系状态'), note: note()
  });
  if (type === 'guests') Object.assign(result, {
    name: text(input.name, '宾客姓名', 60, true), side: choice(input.side, ['bride', 'groom', 'shared'], 'shared', '宾客分组'), relation: text(input.relation, '关系', 40), phone: text(input.phone, '联系电话', 40), partySize: number(input.partySize, '出席人数', 1, 30, true, 1), attendance: choice(input.attendance, ['pending', 'yes', 'no'], 'pending', '出席状态'), needsLodging: bool(input.needsLodging), note: note(), tableId: text(input.tableId, '桌位', 64)
  });
  if (type === 'tables') Object.assign(result, { name: text(input.name, '桌名', 40, true), capacity: number(input.capacity, '每桌人数', 1, 30, true, 10) });
  if (type === 'timeline') {
    const time = text(input.time, '时间', 5, true);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('INVALID_INPUT', '请输入有效时间，如 08:30');
    Object.assign(result, { time, title: text(input.title, '环节名称', 100, true), place: text(input.place, '地点', 100), assigneeId: assignee(input.assigneeId, group), note: note() });
  }
  if (type === 'lodgings') {
    if (!Array.isArray(input.guestIds) || input.guestIds.length > 30) fail('INVALID_INPUT', '每个房间最多安排 30 组宾客');
    const guestIds = [...new Set(input.guestIds.map(value => id(value, '宾客标识')))];
    if (guestIds.some(guestId => !group.guests.some(guest => guest.id === guestId))) fail('INVALID_INPUT', '住宿安排包含已删除的宾客');
    const checkIn = date(input.checkIn, '入住日期');
    const checkOut = date(input.checkOut, '退房日期');
    if (checkIn && checkOut && checkOut < checkIn) fail('INVALID_INPUT', '退房日期不能早于入住日期');
    Object.assign(result, { hotel: text(input.hotel, '酒店名称', 100, true), room: text(input.room, '房间', 40), checkIn, checkOut, guestIds, note: note() });
  }
  return result;
}
function checkSeating(group, guest, autoUnseat = false) {
  if (!guest.tableId) return '';
  const table = group.tables.find(entry => entry.id === guest.tableId);
  const invalid = !table || guest.attendance === 'no';
  const occupied = group.guests.filter(entry => entry.id !== guest.id && entry.tableId === guest.tableId && entry.attendance !== 'no').reduce((sum, entry) => sum + entry.partySize, 0);
  if (invalid || occupied + guest.partySize > table.capacity) {
    if (autoUnseat) { guest.tableId = ''; return invalid ? '已取消此宾客原有的桌位安排' : '人数变化超过原桌容量，已移至待排座，请重新安排'; }
    fail('CAPACITY_EXCEEDED', invalid ? '请为会出席的宾客选择有效桌位' : '此桌剩余座位不足，请选择其他桌位');
  }
  return '';
}
function defaultTasks(now, weddingDate, randomId) {
  const tasks = [
    ['确认婚期与婚礼场地', 180], ['整理双方宾客名单', 120], ['联系婚庆、摄影与化妆团队', 90], ['确认婚纱礼服与试妆', 60], ['准备喜糖、酒水和伴手礼', 30], ['确认宾客出席和住宿', 14], ['安排婚宴桌位', 7], ['确认婚礼当天流程与负责人', 7], ['检查婚礼当天携带物品', 1]
  ];
  return tasks.map(([title, before]) => ({ id: randomId(), title, dueDate: weddingDate ? new Date(Date.parse(`${weddingDate}T12:00:00Z`) - before * DAY).toISOString().slice(0, 10) : '', assigneeId: '', done: false, note: '' }));
}

function createService({ repo, storage, allowedAppId, now = () => Date.now(), random = bytes => crypto.randomBytes(bytes).toString('hex') }) {
  const randomId = () => random(12);
  async function cleanupAvatar(groupId, file) {
    if (!file || !storage) return;
    const prefix = `${STORAGE_PREFIX}${groupId}/`;
    if (file.kind !== 'avatar' || !file.cloudPath?.startsWith(prefix) || file.cloudPath.slice(prefix.length).includes('/') || !file.fileID?.startsWith('cloud://') || !file.fileID.endsWith('/' + file.cloudPath)) return;
    try {
      await storage.remove(file.fileID);
      await repo.transact(groupId, async current => {
        current.media = current.media.filter(entry => entry.fileID !== file.fileID);
        return { group: current, result: null };
      });
    } catch (_) { /* Keep registered media for group-deletion cleanup if storage is unavailable. */ }
  }
  async function mutate(payload, userId, change, ownerOnly = false) {
    const groupId = id(payload.groupId, '群组标识');
    return repo.transact(groupId, async group => {
      member(group, userId);
      revision(group, payload.revision);
      if (ownerOnly && group.ownerId !== userId) fail('FORBIDDEN', '仅群主可以进行此操作');
      const extra = await change(group) || {};
      delete group.invitations;
      delete group.invitationHashes;
      group.profile = cleanProfile(group.profile);
      group.guests.forEach(guest => { delete guest.replyNote; });
      group.memberIds = group.members.map(entry => entry.id);
      group.revision += 1;
      group.updatedAt = now();
      assertSize(group);
      return { group, result: Object.assign({ group: privateGroup(group, userId) }, extra) };
    });
  }
  return async function service(event, identity) {
    try {
      // Shared environments expose the calling mini program as FROM_*.
      // Never mix a source AppID with the resource owner's OPENID.
      const shared = Boolean(identity && (identity.FROM_APPID || identity.FROM_OPENID));
      const callerAppId = identity && (shared ? identity.FROM_APPID : identity.APPID);
      const callerOpenId = identity && (shared ? identity.FROM_OPENID : identity.OPENID);
      if (!/^wx[a-f0-9]{16}$/i.test(allowedAppId || '') || callerAppId !== allowedAppId) fail('APP_NOT_ALLOWED', '云函数尚未配置本小程序身份，请检查本地部署配置');
      if (!callerOpenId || typeof callerOpenId !== 'string') fail('UNAUTHENTICATED', '请在微信中登录后重试');
      object(event);
      const payload = event.payload === undefined ? {} : object(event.payload);
      const userId = callerOpenId;
      let data;
      if (event.action === 'groups.list') {
        const groups = await repo.listForMember(userId);
        data = { groups: groups.filter(group => group.status !== 'deleted').map(group => ({ id: group.id, title: group.profile.title, date: group.profile.date, memberCount: group.members.length, deletionPending: group.status === 'deleting' })), userId };
      } else if (event.action === 'groups.delete') {
        const groupId = id(payload.groupId, '群组标识');
        const pending = await repo.transact(groupId, async group => {
          if (!group || group.ownerId !== userId) fail('FORBIDDEN', '仅群主可以删除此群组');
          if (group.status) return { group, result: group.media || [] };
          revision(group, payload.revision);
          if (payload.confirmTitle !== group.profile.title) fail('CONFIRMATION_REQUIRED', '请输入完整婚礼名称确认删除');
          // Keep only a cleanup/idempotency marker; erase all wedding and guest data atomically.
          const marker = { id: groupId, ownerId: userId, status: 'deleting', revision: group.revision + 1,
            profile: { title: '已删除的婚礼' }, members: [], memberIds: [userId],
            media: group.media || [], joinCode: '', deletedAt: now() };
          return { group: marker, result: marker.media };
        });
        // Bounded parallel cleanup avoids exceeding the function time budget. Failed entries remain retryable.
        const removed = [];
        await Promise.all(pending.map(async file => {
          const prefix = `${STORAGE_PREFIX}${groupId}/`;
          if (!storage || !file.cloudPath || !file.cloudPath.startsWith(prefix) || file.cloudPath.slice(prefix.length).includes('/') || typeof file.fileID !== 'string' || !file.fileID.startsWith('cloud://') || !file.fileID.endsWith('/' + file.cloudPath)) return;
          try {
            await storage.remove(file.fileID);
            removed.push(file.fileID);
          } catch (_) { /* Preserve the cleanup entry for the owner's next retry. */ }
        }));
        data = await repo.transact(groupId, async group => {
          group.media = group.media.filter(entry => !removed.includes(entry.fileID));
          const cleanupPending = group.media.length > 0;
          group.status = cleanupPending ? 'deleting' : 'deleted';
          group.memberIds = cleanupPending ? [userId] : [];
          return { group, result: { deleted: true, groupId, cleanupPending } };
        });
      } else if (event.action === 'groups.create') {
        const nickname = text(payload.nickname, '你的称呼', 30, true);
        const role = text(payload.role, '身份', 20) || '家人';
        if ((await repo.listForMember(userId)).length >= 20) fail('LIMIT_REACHED', '最多加入 20 个筹备群组');
        const stamp = now();
        const group = {
          id: randomId(), revision: 1, ownerId: userId, joinCode: random(6).toUpperCase(), joinCodeExpiresAt: stamp + 7 * DAY,
          profile: profile(payload.profile || {}, { title: '我们的婚礼', bride: '', groom: '', date: '', venue: '', address: '', latitude: null, longitude: null }),
          members: [{ id: userId, nickname, role }], memberIds: [userId], media: [],
          tasks: [], items: [], vendors: [], guests: [], tables: [], timeline: [], lodgings: [], createdAt: stamp, updatedAt: stamp
        };
        group.tasks = defaultTasks(stamp, group.profile.date, randomId);
        assertSize(group);
        await repo.create(group);
        data = { group: privateGroup(group, userId) };
      } else if (event.action === 'groups.join') {
        const code = text(payload.code, '群组邀请码', 12, true).toUpperCase();
        if (!/^[A-F0-9]{12}$/.test(code)) fail('INVALID_CODE', '群组邀请码不正确或已过期');
        const nickname = text(payload.nickname, '你的称呼', 30, true);
        const role = text(payload.role, '身份', 20) || '家人';
        const match = await repo.findByJoinCode(code);
        if (!match) fail('INVALID_CODE', '群组邀请码不正确或已过期');
        data = await repo.transact(match.id, async group => {
          if (!group || group.status || group.joinCode !== code || group.joinCodeExpiresAt < now()) fail('INVALID_CODE', '群组邀请码不正确或已过期');
          if (group.members.some(entry => entry.id === userId)) return { group, result: { group: privateGroup(group, userId) } };
          if (group.members.length >= 30) fail('LIMIT_REACHED', '一个筹备群组最多 30 位成员');
          group.members.push({ id: userId, nickname, role });
          group.memberIds = group.members.map(entry => entry.id);
          group.revision += 1;
          group.updatedAt = now();
          assertSize(group);
          return { group, result: { group: privateGroup(group, userId) } };
        });
      } else if (event.action === 'groups.get' || event.action === 'media.urls') {
        const group = await repo.get(id(payload.groupId, '群组标识'));
        member(group, userId);
        const visibleFiles = group.members.map(entry => entry.avatarFileID);
        const fileIDs = [...new Set(visibleFiles.filter(fileID => fileID && group.media.some(file => file.fileID === fileID)))];
        data = event.action === 'groups.get' ? { group: privateGroup(group, userId) } : { urls: storage ? await storage.urls(fileIDs) : {} };
      } else if (event.action === 'members.login') {
        data = await mutate(payload, userId, group => {
          group.members.find(entry => entry.id === userId).profileLoginAt = now();
        });
      } else if (event.action === 'members.update') {
        const groupId = id(payload.groupId, '群组标识');
        const before = await repo.get(groupId);
        member(before, userId); revision(before, payload.revision);
        const targetId = text(payload.memberId, '成员标识', 128, true);
        if (targetId !== userId && before.ownerId !== userId) fail('FORBIDDEN', '只能修改自己的资料');
        if (!before.members.some(entry => entry.id === targetId)) fail('NOT_FOUND', '成员已不在群组中');
        const nickname = text(payload.nickname, '群内称呼', 30, true);
        const role = choice(payload.role, MEMBER_ROLES, '家人', '身份');
        let uploaded;
        if (payload.avatarBase64 !== undefined) {
          if (targetId !== userId) fail('FORBIDDEN', '只能由本人设置头像');
          if (!storage) fail('UNAVAILABLE', '头像服务暂不可用');
          if (before.media.filter(file => file.kind === 'avatar' && file.uploaderId === userId).length >= 5) fail('LIMIT_REACHED', '待清理的头像较多，请稍后重试');
          if (typeof payload.avatarBase64 !== 'string' || payload.avatarBase64.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.avatarBase64)) fail('INVALID_INPUT', '头像必须是 2MB 以内的 JPG 或 PNG');
          const bytes = Buffer.from(payload.avatarBase64, 'base64');
          const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          if (bytes.length > 2 * 1024 * 1024 || !(png || jpeg)) fail('INVALID_INPUT', '头像必须是 2MB 以内的 JPG 或 PNG');
          const cloudPath = `${STORAGE_PREFIX}${groupId}/${randomId()}.${png ? 'png' : 'jpg'}`;
          uploaded = { fileID: await storage.upload(cloudPath, bytes), cloudPath, kind: 'avatar', uploaderId: userId };
        }
        let oldAvatar;
        try {
          data = await mutate(payload, userId, group => {
            if (targetId !== userId && group.ownerId !== userId) fail('FORBIDDEN', '只能修改自己的资料');
            const target = group.members.find(entry => entry.id === targetId);
            if (!target) fail('NOT_FOUND', '成员已不在群组中');
            target.nickname = nickname; target.role = role;
            if (uploaded) {
              oldAvatar = group.media.find(file => file.fileID === target.avatarFileID);
              target.avatarFileID = uploaded.fileID;
              group.media.push(uploaded);
            }
          });
        } catch (error) {
          if (uploaded) {
            try { await storage.remove(uploaded.fileID); }
            catch (_) {
              await repo.transact(groupId, async current => {
                current.media.push(uploaded);
                if (current.status) { current.status = 'deleting'; current.memberIds = [current.ownerId]; }
                return { group: current, result: null };
              });
            }
          }
          throw error;
        }
        await cleanupAvatar(groupId, oldAvatar);
      } else if (event.action === 'groups.profile') {
        data = await mutate(payload, userId, group => { group.profile = profile(payload.profile, group.profile); });
      } else if (event.action === 'groups.rotateCode') {
        data = await mutate(payload, userId, group => { group.joinCode = random(6).toUpperCase(); group.joinCodeExpiresAt = now() + 7 * DAY; }, true);
      } else if (event.action === 'groups.removeMember') {
        let removedAvatar;
        data = await mutate(payload, userId, group => {
          const memberId = text(payload.memberId, '成员标识', 128, true);
          if (memberId === group.ownerId) fail('INVALID_INPUT', '不能移除群主');
          if (!group.members.some(entry => entry.id === memberId)) fail('NOT_FOUND', '成员已不在群组中');
          const avatarFileID = group.members.find(entry => entry.id === memberId).avatarFileID;
          removedAvatar = group.media.find(file => file.fileID === avatarFileID);
          group.members = group.members.filter(entry => entry.id !== memberId);
          ['tasks', 'items', 'timeline'].forEach(type => group[type].forEach(entry => { if (entry.assigneeId === memberId) entry.assigneeId = ''; }));
          group.joinCode = random(6).toUpperCase();
          group.joinCodeExpiresAt = now() + 7 * DAY;
        }, true);
        await cleanupAvatar(data.group.id, removedAvatar);
      } else if (event.action === 'records.save') {
        data = await mutate(payload, userId, group => {
          const type = choice(payload.type, TYPES, '', '记录类型');
          const input = object(payload.record);
          const existing = input.id ? group[type].find(entry => entry.id === id(input.id)) : null;
          if (input.id && !existing) fail('NOT_FOUND', '此记录已删除，请刷新');
          if (!existing && group[type].length >= MAX_RECORDS[type]) fail('LIMIT_REACHED', '此类记录已达到群组容量上限');
          const next = record(type, input, group, existing ? existing.id : randomId());
          let warning = '';
          if (type === 'guests') {
            warning = checkSeating(group, next, Boolean(existing && existing.tableId === next.tableId));
          }
          if (type === 'tables') {
            const occupied = group.guests.filter(guest => guest.tableId === next.id && guest.attendance !== 'no').reduce((sum, guest) => sum + guest.partySize, 0);
            if (occupied > next.capacity) fail('CAPACITY_EXCEEDED', `此桌已安排 ${occupied} 人，请先调整宾客再减少座位`);
          }
          if (existing) group[type] = group[type].map(entry => entry.id === existing.id ? next : entry);
          else group[type].push(next);
          return { warning };
        });
      } else if (event.action === 'records.delete') {
        data = await mutate(payload, userId, group => {
          const type = choice(payload.type, TYPES, '', '记录类型');
          const recordId = id(payload.id);
          if (!group[type].some(entry => entry.id === recordId)) fail('NOT_FOUND', '此记录已删除，请刷新');
          group[type] = group[type].filter(entry => entry.id !== recordId);
          if (type === 'tables') group.guests.forEach(guest => { if (guest.tableId === recordId) guest.tableId = ''; });
          if (type === 'guests') {
            group.lodgings.forEach(room => { room.guestIds = room.guestIds.filter(guestId => guestId !== recordId); });
          }
        });
      } else fail('INVALID_ACTION', '不支持此操作，请更新小程序');
      return { ok: true, data };
    } catch (error) {
      if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } };
      return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '云端暂时无法确认操作结果，请刷新后重试' } };
    }
  };
}

module.exports = { createService, AppError, COLLECTION, STORAGE_PREFIX, MAX_DOCUMENT_BYTES };
