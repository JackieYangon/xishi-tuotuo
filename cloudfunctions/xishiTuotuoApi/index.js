'use strict';

const cloud = require('wx-server-sdk');
const { createService, COLLECTION } = require('./domain');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
let localConfig = {};
try { localConfig = require('./local-config.json'); } catch (_) { /* Fail closed until local configuration is generated. */ }

function documentData(result) {
  if (!result) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
}
function withoutSystemFields(group) {
  const data = Object.assign({}, group);
  delete data._id;
  delete data._openid;
  return data;
}
const repo = {
  async get(groupId) {
    try { return documentData(await db.collection(COLLECTION).doc(groupId).get()); }
    catch (error) { if (/not exist|not found|does not exist/i.test(error.message || error.errMsg || '')) return null; throw error; }
  },
  async listForMember(userId) {
    const result = await db.collection(COLLECTION).where({ memberIds: db.command.all([userId]) }).limit(100).get();
    return result.data;
  },
  async findByJoinCode(code) {
    return documentData(await db.collection(COLLECTION).where({ joinCode: code }).limit(1).get());
  },
  async findByInvitationHash(tokenHash) {
    return documentData(await db.collection(COLLECTION).where({ invitationHashes: db.command.all([tokenHash]) }).limit(1).get());
  },
  async create(group) {
    await db.collection(COLLECTION).add({ data: Object.assign({ _id: group.id }, withoutSystemFields(group)) });
  },
  async transact(groupId, mutate) {
    let finalResult;
    await db.runTransaction(async transaction => {
      const document = transaction.collection(COLLECTION).doc(groupId);
      const group = documentData(await document.get());
      const change = await mutate(group);
      await document.set({ data: withoutSystemFields(change.group) });
      finalResult = change.result;
    });
    return finalResult;
  }
};
const storage = {
  async upload(cloudPath, fileContent) { return (await cloud.uploadFile({ cloudPath, fileContent })).fileID; },
  async remove(fileID) { await cloud.deleteFile({ fileList: [fileID] }); },
  async urls(fileIDs) {
    if (!fileIDs.length) return {};
    const result = await cloud.getTempFileURL({ fileList: fileIDs });
    return result.fileList.reduce((map, file) => { if (file.status === 0 && file.tempFileURL) map[file.fileID] = file.tempFileURL; return map; }, {});
  }
};
const service = createService({ repo, storage, allowedAppId: localConfig.allowedAppId });
exports.main = async event => service(event, cloud.getWXContext());
