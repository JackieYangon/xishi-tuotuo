<template>
<view class="container">
  <view class="page-head">
    <view class="title">把安排，交到手上</view>
    <view class="subtitle">整理成 Excel，方便家人和现场人员查阅。</view>
  </view>
  <view v-if="state.loading" class="card empty">正在整理婚礼资料…</view>
  <view v-else-if="state.noGroup" class="card empty">
    <view class="title">先创建或选择婚礼</view>
    <view>开始筹备后，就能导出婚礼安排。</view>
    <button class="button-primary export-start" @tap="goGroup">开始筹备</button>
  </view>
  <view v-else-if="state.error" class="card">
    <view class="error">{{ state.error }}</view>
    <button class="button-secondary" @tap="load">重新读取</button>
  </view>
  <template v-else>
    <view class="card">
      <view class="between"><view class="export-heading">{{ state.title }}</view><view class="pill">Excel 表格</view></view>
      <view class="field">
        <view class="label">选择导出内容</view>
        <picker :range="(state.categories)" range-key="label" :value="(state.categoryIndex)" @change="onCategory" :disabled="(state.generating)">
          <view class="input between"><text>{{ state.categories[state.categoryIndex].label }}</text><text class="muted">⌄</text></view>
        </picker>
      </view>
      <view class="muted">导出全部时，婚礼简况、事项、物品、商家、宾客、座位、流程和住宿将分别放在工作表中。</view>
      <view class="divider"></view>
      <view class="between export-switch">
        <view><view>包含联系电话</view><view class="muted small">宾客与商家的手机号或座机</view></view>
        <switch color="#954b50" :checked="(state.includePhones)" data-key="includePhones" :disabled="(state.generating)" @change="onPrivacy" />
      </view>
      <view class="between export-switch">
        <view><view>包含内部备注</view><view class="muted small">筹备过程中填写的说明</view></view>
        <switch color="#954b50" :checked="(state.includeNotes)" data-key="includeNotes" :disabled="(state.generating)" @change="onPrivacy" />
      </view>
      <view class="notice">默认不包含电话和备注，发送前可按接收人的需要选择。</view>
      <view v-if="state.exportError" class="error">{{ state.exportError }}</view>
      <button class="button-primary" :loading="(state.generating)" :disabled="(state.generating || state.opening || state.sharing)" @tap="exportFile">{{ state.generating ? '正在生成表格' : '生成 Excel 表格' }}</button>
    </view>
    <view v-if="state.filePath" class="card export-result">
      <view class="pill">已生成</view>
      <view class="export-heading export-result-title">资料整理好了</view>
      <view class="muted">{{ state.sheetCount }} 个工作表 · {{ state.rowCount }} 行资料 · {{ state.fileSize }}</view>
      <view class="export-filename small">{{ state.fileName }}</view>
      <view class="actions">
        <button class="button-secondary" @tap="openFile" :loading="(state.opening)" :disabled="(state.opening || state.sharing || state.generating)">预览表格</button>
        <button class="button-primary" @tap="shareFile" :loading="(state.sharing)" :disabled="(state.opening || state.sharing || state.generating)">发送文件</button>
      </view>
      <view class="muted small export-footnote">这是生成时的资料快照；筹备内容更新后，请重新生成。</view>
    </view>
  </template>
</view>

</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';
import imported0 from '../../utils/export-data';
const { buildSheets, CATEGORIES } = imported0;
import imported1 from '../../utils/xlsx';
const { createWorkbook } = imported1;
import imported2 from '../../version.json';
const { version } = imported2;

function fileCall(manager, method, options) {
  return new Promise<{ files?: string[] }>((resolve, reject) => manager[method](Object.assign({}, options, { success: resolve, fail: reject })));
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


export default defineComponent({
  data() { return { state: {
    loading: true, generating: false, opening: false, sharing: false, error: '', exportError: '', noGroup: false,
    title: '', categories: CATEGORIES, categoryIndex: 0, includePhones: false, includeNotes: false,
    filePath: '', fileName: '', sheetCount: 0, rowCount: 0, fileSize: ''
  } as Record<string, any>, runtime: {} as Record<string, any> }; },
onShow() { this.runtime._destroyed = false; this.load(); },
onUnload() { this.runtime._destroyed = true; },
 methods: {
async load() {
    if (this.runtime._loading)
        return;
    this.runtime._loading = true;
    updateState(this.state, { loading: true, error: '', noGroup: false });
    try {
        const group = await service.getGroup();
        this.runtime._group = group;
        if (!this.runtime._destroyed)
            updateState(this.state, { title: group.profile && group.profile.title || '我们的婚礼' });
    }
    catch (error) {
        this.runtime._group = null;
        if (!this.runtime._destroyed)
            updateState(this.state, { error: error.message || '资料暂时无法读取，请稍后重试', noGroup: ['NO_GROUP', 'GROUP_DELETED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code), filePath: '', title: '' });
    }
    finally {
        this.runtime._loading = false;
        if (!this.runtime._destroyed)
            updateState(this.state, { loading: false });
    }
},
onCategory(event) {
    if (this.state.generating)
        return;
    updateState(this.state, { categoryIndex: Number(event.detail.value), filePath: '', exportError: '' });
},
onPrivacy(event) {
    if (this.state.generating)
        return;
    const key = event.currentTarget.dataset.key;
    if (key === 'includePhones' || key === 'includeNotes')
        updateState(this.state, { [key]: event.detail.value, filePath: '', exportError: '' });
},
async exportFile() {
    if (this.state.generating || this.state.opening || this.state.sharing || !this.runtime._group)
        return;
    updateState(this.state, { generating: true, exportError: '', filePath: '' });
    try {
        // Refresh membership and data immediately before producing a shareable snapshot.
        const group = await service.getGroup();
        this.runtime._group = group;
        const category = CATEGORIES[this.state.categoryIndex];
        if (!category)
            throw new Error('请选择导出内容');
        const sheets = buildSheets(group, { category: category.value, includePhones: this.state.includePhones, includeNotes: this.state.includeNotes });
        const workbook = createWorkbook(sheets, { version });
        const manager = wx.getFileSystemManager();
        const fileName = exportName();
        const directory = wx.env.USER_DATA_PATH;
        const filePath = directory + '/' + fileName;
        try {
            await fileCall(manager, 'writeFile', { filePath, data: workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) });
        }
        catch (error) {
            await fileCall(manager, 'unlink', { filePath }).catch(() => { });
            throw new Error('文件未能保存，请检查手机剩余空间后重试');
        }
        await cleanOldExports(manager, directory, filePath);
        if (!this.runtime._destroyed) {
            updateState(this.state, { filePath, fileName, sheetCount: sheets.length, rowCount: sheets.reduce((count, sheet) => count + Math.max(0, sheet.rows.length - 1), 0), fileSize: Math.max(1, Math.ceil(workbook.byteLength / 1024)) + ' KB' });
            wx.showToast({ title: '表格已生成', icon: 'success' });
        }
    }
    catch (error) {
        if (!this.runtime._destroyed) {
            updateState(this.state, { exportError: error.message || '导出未完成，请稍后重试', noGroup: error.code === 'NO_GROUP' });
            service.showError(error instanceof Error ? error : new Error('导出未完成，请稍后重试'));
        }
    }
    finally {
        if (!this.runtime._destroyed)
            updateState(this.state, { generating: false });
    }
},
async openFile() {
    if (!this.state.filePath || this.state.opening || this.state.generating || this.state.sharing)
        return;
    updateState(this.state, { opening: true });
    try {
        await new Promise((resolve, reject) => wx.openDocument({ filePath: this.state.filePath, fileType: 'xlsx', showMenu: true, success: resolve, fail: reject }));
    }
    catch (error) {
        if (!/cancel/i.test(error.errMsg || ''))
            service.showError(new Error('暂时无法预览，可点击“发送文件”交给亲友查看'));
    }
    finally {
        if (!this.runtime._destroyed)
            updateState(this.state, { opening: false });
    }
},
async shareFile() {
    if (!this.state.filePath || this.state.sharing || this.state.generating || this.state.opening)
        return;
    if (typeof wx.shareFileMessage !== 'function') {
        wx.showToast({ title: '可在表格预览右上角转发文件', icon: 'none' });
        return this.openFile();
    }
    updateState(this.state, { sharing: true });
    try {
        await new Promise((resolve, reject) => wx.shareFileMessage({ filePath: this.state.filePath, fileName: this.state.fileName, success: resolve, fail: reject }));
    }
    catch (error) {
        if (!/cancel/i.test(error.errMsg || ''))
            service.showError(new Error('文件暂未发送，请重试或从预览页面转发'));
    }
    finally {
        if (!this.runtime._destroyed)
            updateState(this.state, { sharing: false });
    }
},
goGroup() { wx.navigateTo({ url: '/pages/group/index' }); }
}
});
</script>

<style>
.export-heading { font-size: 32rpx; font-weight: 600; }
.export-switch { margin: 26rpx 0; }
.export-switch switch { flex-shrink: 0; transform: scale(.85); transform-origin: right center; }
.export-result-title { margin: 16rpx 0 8rpx; }
.export-filename { color: #8a7771; overflow-wrap: anywhere; margin-top: 18rpx; }
.export-footnote { margin-top: 22rpx; }
.export-start { margin-top: 28rpx; }

</style>
