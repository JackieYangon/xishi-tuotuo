import config from '../config.local.json';
const GROUP_KEY = 'xishi-tuotuo:active-group';
let groupCache = null;
let generation = 0;
function getGroupId() { return wx.getStorageSync(GROUP_KEY) || ''; }
function setGroup(group) {
  if (group) {
    wx.setStorageSync(GROUP_KEY, group.id);
    if (!groupCache || groupCache.id !== group.id || group.revision >= groupCache.revision) groupCache = group;
  }
  else { wx.removeStorageSync(GROUP_KEY); groupCache = null; }
  generation += 1;
  return group;
}
function getCachedGroup() { return groupCache; }
async function call(action, payload = {}) {
  const app = getApp();
  if (app.globalData.ready) await app.globalData.ready;
  if (!app.globalData.cloudReady) {
    const error = new Error('暂时无法连接婚礼服务，请稍后重试'); error.code = 'CLOUD_NOT_READY'; throw error;
  }
  let response;
  try { response = await (app.globalData.cloud || wx.cloud).callFunction({ name: config.functionName, data: { action, payload } }); }
  catch (cause) {
    console.error('Wedding service unavailable', action, cause.errCode || '');
    const error = new Error('网络连接失败，请稍后重试'); error.code = 'NETWORK'; throw error;
  }
  const result = response.result;
  if (!result || !result.ok) {
    const error = new Error(result && result.error && result.error.message || '操作未完成，请稍后重试');
    error.code = result && result.error && result.error.code || 'SERVICE_ERROR'; throw error;
  }
  return result.data;
}
async function getGroup() {
  const groupId = getGroupId();
  if (!groupId) { const error = new Error('请先创建或加入婚礼群组'); error.code = 'NO_GROUP'; throw error; }
  const requestGeneration = generation;
  const data = await call('groups.get', { groupId });
  if (getGroupId() !== groupId) { const error = new Error('当前婚礼已切换，请返回首页'); error.code = 'GROUP_CHANGED'; throw error; }
  if (generation === requestGeneration && (!groupCache || data.group.revision >= groupCache.revision)) groupCache = data.group;
  return groupCache || data.group;
}
async function mutate(action, payload = {}, expectedRevision) {
  const group = groupCache || await getGroup();
  const data = await call(action, { ...payload, groupId: group.id, revision: expectedRevision === undefined ? group.revision : expectedRevision });
  if (data.group && getGroupId() === group.id) setGroup(data.group);
  return data;
}
function showError(error) { wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none', duration: 3500 }); }
function confirm(content, title = '请确认') {
  return new Promise(resolve => wx.showModal({ title, content, confirmColor: '#954b50', success: result => resolve(result.confirm), fail: () => resolve(false) }));
}
function chooseFile(options) { return new Promise((resolve, reject) => wx.chooseMessageFile({ ...options, success: resolve, fail: reject })); }
async function upload(path, kind, name) {
  const base64 = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: path, encoding: 'base64', success: r => resolve(r.data), fail: reject }));
  return mutate('media.upload', { base64, kind, name });
}
export default { call, getGroup, getGroupId, getCachedGroup, setGroup, mutate, showError, confirm, chooseFile, upload };
