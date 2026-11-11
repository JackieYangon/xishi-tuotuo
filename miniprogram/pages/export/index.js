const service = require('../../utils/service');
const { buildSheets, CATEGORIES } = require('../../utils/export-data');
const { createWorkbook } = require('../../utils/xlsx');
const { version } = require('../../version');

function fileCall(manager, method, options) {
  return new Promise((resolve, reject) => manager[method](Object.assign({}, options, { success: resolve, fail: reject })));
}
async function cleanOldExports(manager, directory, keep) {
  try {
    const result = await fileCall(manager, 'readdir', { dirPath: directory });
    const files = (result.files || []).filter(name => /^xishi-export-[a-zA-Z0-9-]+\.xlsx$/.test(name));
    for (const name of files) {
      const filePath = directory + '/' + name;
      if (filePath !== keep) await fileCall(manager, 'unlink', { filePath }).catch(() => {});
    }
  } catch (error) { /* A valid new export remains available if an old file is locked. */ }
}
function exportName() {
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, '0')).join('-');
  return 'xishi-export-' + date + '-' + Math.random().toString(36).slice(2, 8) + '.xlsx';
}

Page({
  data: {
    loading: true, generating: false, opening: false, sharing: false, error: '', exportError: '', noGroup: false,
    title: '', categories: CATEGORIES, categoryIndex: 0, includePhones: false, includeNotes: false,
    filePath: '', fileName: '', sheetCount: 0, rowCount: 0, fileSize: ''
  },
  onShow() { this._destroyed = false; this.load(); },
  onUnload() { this._destroyed = true; },
  async load() {
    if (this._loading) return;
    this._loading = true;
    this.setData({ loading: true, error: '', noGroup: false });
    try {
      const group = await service.getGroup();
      this._group = group;
      if (!this._destroyed) this.setData({ title: group.profile && group.profile.title || '我们的婚礼' });
    } catch (error) {
      this._group = null;
      if (!this._destroyed) this.setData({ error: error.message || '资料暂时无法读取，请稍后重试', noGroup: error.code === 'NO_GROUP', filePath: '' });
    } finally {
      this._loading = false;
      if (!this._destroyed) this.setData({ loading: false });
    }
  },
  onCategory(event) {
    if (this.data.generating) return;
    this.setData({ categoryIndex: Number(event.detail.value), filePath: '', exportError: '' });
  },
  onPrivacy(event) {
    if (this.data.generating) return;
    const key = event.currentTarget.dataset.key;
    if (key === 'includePhones' || key === 'includeNotes') this.setData({ [key]: event.detail.value, filePath: '', exportError: '' });
  },
  async exportFile() {
    if (this.data.generating || this.data.opening || this.data.sharing || !this._group) return;
    this.setData({ generating: true, exportError: '', filePath: '' });
    try {
      // Refresh membership and data immediately before producing a shareable snapshot.
      const group = await service.getGroup();
      this._group = group;
      const category = CATEGORIES[this.data.categoryIndex];
      if (!category) throw new Error('请选择导出内容');
      const sheets = buildSheets(group, { category: category.value, includePhones: this.data.includePhones, includeNotes: this.data.includeNotes });
      const workbook = createWorkbook(sheets, { version });
      const manager = wx.getFileSystemManager();
      const fileName = exportName();
      const directory = wx.env.USER_DATA_PATH;
      const filePath = directory + '/' + fileName;
      try {
        await fileCall(manager, 'writeFile', { filePath, data: workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) });
      } catch (error) {
        await fileCall(manager, 'unlink', { filePath }).catch(() => {});
        throw new Error('文件未能保存，请检查手机剩余空间后重试');
      }
      await cleanOldExports(manager, directory, filePath);
      if (!this._destroyed) {
        this.setData({ filePath, fileName, sheetCount: sheets.length, rowCount: sheets.reduce((count, sheet) => count + Math.max(0, sheet.rows.length - 1), 0), fileSize: Math.max(1, Math.ceil(workbook.byteLength / 1024)) + ' KB' });
        wx.showToast({ title: '表格已生成', icon: 'success' });
      }
    } catch (error) {
      if (!this._destroyed) {
        this.setData({ exportError: error.message || '导出未完成，请稍后重试', noGroup: error.code === 'NO_GROUP' });
        service.showError(error instanceof Error ? error : new Error('导出未完成，请稍后重试'));
      }
    } finally { if (!this._destroyed) this.setData({ generating: false }); }
  },
  async openFile() {
    if (!this.data.filePath || this.data.opening || this.data.generating || this.data.sharing) return;
    this.setData({ opening: true });
    try {
      await new Promise((resolve, reject) => wx.openDocument({ filePath: this.data.filePath, fileType: 'xlsx', showMenu: true, success: resolve, fail: reject }));
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) service.showError(new Error('暂时无法预览，可点击“发送文件”交给亲友查看'));
    } finally { if (!this._destroyed) this.setData({ opening: false }); }
  },
  async shareFile() {
    if (!this.data.filePath || this.data.sharing || this.data.generating || this.data.opening) return;
    if (typeof wx.shareFileMessage !== 'function') {
      wx.showToast({ title: '可在表格预览右上角转发文件', icon: 'none' });
      return this.openFile();
    }
    this.setData({ sharing: true });
    try {
      await new Promise((resolve, reject) => wx.shareFileMessage({ filePath: this.data.filePath, fileName: this.data.fileName, success: resolve, fail: reject }));
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) service.showError(new Error('文件暂未发送，请重试或从预览页面转发'));
    } finally { if (!this._destroyed) this.setData({ sharing: false }); }
  },
  goGroup() { wx.navigateTo({ url: '/pages/group/index' }); }
});
