<template>
<view class="container">
  <view class="page-head"><view class="title">一家人，把喜事办妥。</view><view class="subtitle">新人、父母、帮忙的家人，一起分工，一起期待。</view></view>
  <view v-if="state.loading" class="empty">正在同步群组…</view>
  <view v-if="state.error" class="error">{{ state.error }}<button class="button-text" @tap="load">重新连接</button></view>
  <template v-if="!state.loading">
    <view v-if="!state.group || state.joinMode" class="card">
      <view class="between"><view class="section-title">{{ state.joinMode ? '加入家人的婚礼' : '创建筹备群组' }}</view><button class="button-text" @tap="toggleJoin">{{ state.joinMode ? '我来创建' : '已有邀请码' }}</button></view>
      <view class="field"><text class="label">家人怎么称呼你</text><input class="input" :value="(state.nickname)" data-key="nickname" @input="input" maxlength="30" placeholder="例如：小杨 / 新娘妈妈"/></view>
      <view class="field"><text class="label">你的身份</text><picker :range="(state.roles)" :value="(state.roleIndex)" @change="roleChange"><view class="input">{{ state.roles[state.roleIndex] }} ▾</view></picker></view>
      <view v-if="state.joinMode" class="field"><text class="label">家庭群组邀请码</text><input class="input" :value="(state.code)" data-key="code" @input="input" maxlength="12" placeholder="输入家人发来的 12 位邀请码"/></view>
      <template v-else><view class="field"><text class="label">婚礼名称</text><input class="input" :value="(state.profile.title)" data-key="title" @input="profileInput" maxlength="60" placeholder="例如：我们的婚礼"/></view><view class="field"><text class="label">婚期（可以之后再定）</text><picker mode="date" :value="(state.profile.date)" data-key="date" @change="profileInput"><view class="input">{{ state.profile.date || '选择婚礼日期' }} ▾</view></picker></view></template>
      <view class="notice">加入群组后，成员可以共同查看和编辑婚礼资料、宾客名单与筹备事项。</view><button class="button-primary" :loading="(state.busy)" :disabled="(state.busy)" @tap="createOrJoin">{{ state.joinMode ? '加入，一起筹备' : '创建我们的婚礼' }}</button>
    </view>
    <template v-if="state.group && !state.joinMode">
      <view class="card"><view class="between"><view class="section-title">筹备家人 · {{ state.group.members.length }} 人</view><text class="chip">共同编辑</text></view><view v-for="(item, index) in state.group.members" :key="item.id" class="between member"><view><text class="member-name">{{ item.nickname }}</text><text class="pill">{{ item.role }}</text><text v-if="item.id === state.group.ownerId" class="muted"> · 群主</text></view><button v-if="state.isOwner && item.id !== state.group.selfId" class="button-text danger" :data-id="(item.id)" @tap="removeMember" :disabled="(state.busy)">移除</button></view><view class="divider"></view><view class="muted">邀请码 · {{ state.codeExpired ? '已过期，请群主更新' : '有效至 ' + state.expires }}</view><view class="invite-code">{{ state.group.joinCode }}</view><view class="actions"><button class="button-secondary" @tap="copyCode">复制邀请码</button><button class="button-primary" open-type="share" :disabled="(state.codeExpired)">邀请家人</button></view><button v-if="state.isOwner" class="button-text small" @tap="rotateCode" :disabled="(state.busy)">更新邀请码</button></view>
      <view class="card"><view class="section-title">我们的婚礼</view><view class="field"><text class="label">婚礼名称</text><input class="input" :value="(state.profile.title)" data-key="title" @input="profileInput" maxlength="60"/></view><view class="couple-fields"><view class="field"><text class="label">新娘</text><input class="input" :value="(state.profile.bride)" data-key="bride" @input="profileInput" maxlength="30" placeholder="新娘姓名"/></view><view class="field"><text class="label">新郎</text><input class="input" :value="(state.profile.groom)" data-key="groom" @input="profileInput" maxlength="30" placeholder="新郎姓名"/></view></view><view class="field"><text class="label">婚礼日期</text><picker mode="date" :value="(state.profile.date)" data-key="date" @change="profileInput"><view class="input">{{ state.profile.date || '选择日期' }} ▾</view></picker></view><view class="field"><text class="label">场地名称</text><input class="input" :value="(state.profile.venue)" data-key="venue" @input="profileInput" maxlength="100" placeholder="酒店或婚礼场地"/></view><view class="field"><text class="label">详细地址</text><input class="input" :value="(state.profile.address)" data-key="address" @input="profileInput" maxlength="200" placeholder="亲友可按这个地址前往"/></view><view class="row"><button class="button-secondary" @tap="chooseLocation">{{ state.profile.latitude !== null ? '重新选择地图位置' : '添加地图导航' }}</button><button v-if="state.profile.latitude !== null" class="button-text" @tap="clearLocation">移除定位</button></view><view class="notice" v-if="state.profile.latitude !== null">地图位置已选好，保存后亲友可在请柬中一键导航。</view></view>
      <view class="card"><view class="section-title">电子请柬样式</view><image v-if="state.coverUrl" class="cover" :src="(state.coverUrl)" mode="aspectFill"/><button class="button-secondary" @tap="pickImage" :disabled="(state.busy)">{{ state.profile.coverFileID ? '更换合照' : '添加一张合照' }}</button><view class="muted small">JPG / PNG，2MB 以内</view><view class="field"><text class="label">请柬主题</text><picker :range="(state.themes)" :value="(state.themeIndex)" @change="themeChange"><view class="input">{{ state.themes[state.themeIndex] }} ▾</view></picker></view><view class="field"><text class="label">想对亲友说的话</text><textarea class="input" :value="(state.profile.invitationText)" data-key="invitationText" @input="profileInput" maxlength="2000"/></view><view class="row"><button class="button-secondary" @tap="pickMusic" :disabled="(state.busy)">{{ state.profile.musicFileID ? '更换背景音乐' : '添加背景音乐' }}</button><button v-if="state.profile.musicFileID" class="button-text" @tap="clearMusic">移除</button></view><view class="muted small">从微信文件选择 MP3，2MB 以内</view></view>
      <button class="button-primary" :loading="(state.busy)" :disabled="(state.busy)" @tap="saveProfile">保存婚礼资料与请柬</button><button class="button-text" @tap="home">返回婚礼首页</button>
    </template>
    <view v-if="state.groups.length" class="card groups"><view class="section-title">我参与的婚礼</view><button v-for="(item, index) in state.groups" :key="item.id" class="group-choice between" @tap="selectGroup" :data-id="(item.id)" :disabled="(state.busy)"><text>{{ item.title }}</text><text class="muted">{{ item.date || '婚期待定' }} ›</text></button></view>
  </template>
</view>

</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';
const blankProfile = { title: '', bride: '', groom: '', date: '', venue: '', address: '', latitude: null, longitude: null, coverFileID: '', musicFileID: '', invitationText: '诚邀您见证我们的幸福时刻，期待与您相聚。', theme: 'rose' };

export default defineComponent({
  data() { return { state: { loading: true, busy: false, error: '', group: null, groups: [], nickname: '', roleIndex: 0, roles: ['新娘', '新郎', '妈妈', '爸爸', '家人', '伴郎伴娘'], code: '', joinMode: false, profile: { ...blankProfile }, coverUrl: '', themes: ['温柔玫瑰', '奶油简约', '中式喜红'], themeIndex: 0 } as Record<string, any>, runtime: {} as Record<string, any> }; },
onLoad(options) { if (options.code)
    updateState(this.state, { code: options.code, joinMode: true }); },
onShow() { this.load(); },
async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
onShareAppMessage() {
    if (!this.state.group)
        return { title: '喜事妥妥，一家人一起筹备婚礼', path: '/pages/home/index' };
    return { title: '邀请你一起筹备：' + this.state.group.profile.title, path: '/pages/group/index?code=' + this.state.group.joinCode };
},
 methods: {
async load() {
    updateState(this.state, { loading: true, error: '' });
    try {
        const listed = await service.call('groups.list');
        updateState(this.state, { groups: listed.groups });
        if (service.getGroupId() && !this.state.joinMode) {
            try {
                this.applyGroup(await service.getGroup());
                await this.mediaUrls();
            }
            catch (error) {
                if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') {
                    service.setGroup(null);
                    this.runtime._dirty = false;
                    this.runtime._profileBase = null;
                    this.runtime._profileRevision = undefined;
                    updateState(this.state, { group: null, profile: { ...blankProfile }, coverUrl: '', isOwner: false, error: '你已无法访问此群组，可以选择其他婚礼或重新加入。' });
                }
                else
                    throw error;
            }
        }
    }
    catch (error) {
        updateState(this.state, { error: error.message });
    }
    finally {
        updateState(this.state, { loading: false });
    }
},
applyGroup(group, resetForm = false) {
    const patch: Record<string, any> = { group, isOwner: group.ownerId === group.selfId,
        expires: new Date(group.joinCodeExpiresAt).toLocaleDateString(), codeExpired: group.joinCodeExpiresAt < Date.now() };
    if (!this.runtime._dirty || resetForm) {
        this.runtime._profileRevision = group.revision;
        this.runtime._profileBase = { ...blankProfile, ...group.profile };
        patch.profile = { ...this.runtime._profileBase };
        patch.themeIndex = Math.max(0, ['rose', 'ivory', 'red'].indexOf(group.profile.theme));
        this.runtime._dirty = false;
    }
    updateState(this.state, patch);
},
async mediaUrls() {
    if (!this.state.group || !this.state.group.profile.coverFileID) {
        updateState(this.state, { coverUrl: '' });
        return;
    }
    try {
        const data = await service.call('media.urls', { groupId: this.state.group.id });
        updateState(this.state, { coverUrl: data.urls[this.state.group.profile.coverFileID] || '' });
    }
    catch (_) {
        updateState(this.state, { coverUrl: '' });
    }
},
input(event) { updateState(this.state, { [event.currentTarget.dataset.key]: event.detail.value }); },
profileInput(event) { this.runtime._dirty = true; updateState(this.state, { ['profile.' + event.currentTarget.dataset.key]: event.detail.value }); },
roleChange(event) { updateState(this.state, { roleIndex: Number(event.detail.value) }); },
themeChange(event) { this.runtime._dirty = true; const index = Number(event.detail.value); updateState(this.state, { themeIndex: index, 'profile.theme': ['rose', 'ivory', 'red'][index] }); },
toggleJoin() { updateState(this.state, { joinMode: !this.state.joinMode }); },
async createOrJoin() {
    if (this.state.busy)
        return;
    if (!this.state.nickname.trim())
        return service.showError(new Error('先填写家人怎么称呼你'));
    updateState(this.state, { busy: true });
    try {
        const payload = { nickname: this.state.nickname.trim(), role: this.state.roles[this.state.roleIndex] };
        const data = this.state.joinMode ? await service.call('groups.join', { ...payload, code: this.state.code.trim() }) : await service.call('groups.create', { ...payload, profile: this.state.profile });
        service.setGroup(data.group);
        updateState(this.state, { joinMode: false });
        this.applyGroup(data.group);
        wx.showToast({ title: '一起开始筹备吧', icon: 'success' });
        wx.reLaunch({ url: '/pages/home/index' });
    }
    catch (error) {
        service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
async selectGroup(event) {
    if (this.state.busy)
        return;
    updateState(this.state, { busy: true });
    try {
        const data = await service.call('groups.get', { groupId: event.currentTarget.dataset.id });
        service.setGroup(data.group);
        wx.reLaunch({ url: '/pages/home/index' });
    }
    catch (error) {
        service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
async saveProfile() {
    if (this.state.busy)
        return;
    updateState(this.state, { busy: true });
    try {
        const profile = {};
        Object.keys(blankProfile).forEach(key => { if (!this.runtime._profileBase || this.state.profile[key] !== this.runtime._profileBase[key])
            profile[key] = this.state.profile[key]; });
        const data = await service.mutate('groups.profile', { profile }, this.runtime._profileRevision);
        this.applyGroup(data.group, true);
        updateState(this.state, { error: '' });
        wx.showToast({ title: '婚礼资料已保存' });
    }
    catch (error) {
        if (error.code === 'CONFLICT') {
            if (await service.confirm('家人刚更新了资料。重新载入会放弃当前未保存修改，请查看最新资料后重新编辑。', '资料已更新')) {
                try {
                    this.applyGroup(await service.getGroup(), true);
                    updateState(this.state, { error: '' });
                }
                catch (reloadError) {
                    service.showError(reloadError);
                }
            }
            else
                updateState(this.state, { error: '草稿已保留且尚未提交。重新载入最新资料后才能继续保存。' });
        }
        else
            service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
chooseLocation() {
    wx.chooseLocation({ success: location => { this.runtime._dirty = true; updateState(this.state, { 'profile.venue': location.name || this.state.profile.venue, 'profile.address': location.address, 'profile.latitude': location.latitude, 'profile.longitude': location.longitude }); }, fail: error => { if (!/cancel/.test(error.errMsg || ''))
            service.showError(new Error('未能选择地图位置，可先填写详细地址')); } });
},
clearLocation() { this.runtime._dirty = true; updateState(this.state, { 'profile.latitude': null, 'profile.longitude': null }); },
copyCode() { wx.setClipboardData({ data: this.state.group.joinCode }); },
async rotateCode() {
    if (this.state.busy || !await service.confirm('更新后，之前分享的群组邀请将失效，已加入的家人不受影响。'))
        return;
    updateState(this.state, { busy: true });
    try {
        const data = await service.mutate('groups.rotateCode');
        this.applyGroup(data.group);
    }
    catch (error) {
        service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
async removeMember(event) {
    if (this.state.busy || !await service.confirm('移除后，对方无法查看或修改筹备资料，已分配给对方的事项会变为待分工。'))
        return;
    updateState(this.state, { busy: true });
    try {
        const data = await service.mutate('groups.removeMember', { memberId: event.currentTarget.dataset.id });
        this.applyGroup(data.group);
    }
    catch (error) {
        service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
async pickImage() {
    if (this.state.busy)
        return;
    if (this.runtime._dirty)
        return service.showError(new Error('请先保存婚礼资料，再添加照片'));
    wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (result) => {
            const file = result.tempFiles[0];
            if (file.size > 2 * 1024 * 1024)
                return service.showError(new Error('请选择 2MB 以内的 JPG 或 PNG 照片'));
            await this.uploadMedia(file.tempFilePath, 'image', 'wedding.jpg');
        } });
},
async pickMusic() {
    if (this.state.busy)
        return;
    if (this.runtime._dirty)
        return service.showError(new Error('请先保存婚礼资料，再添加音乐'));
    try {
        const result = await service.chooseFile({ count: 1, type: 'file', extension: ['mp3'] });
        const file = result.tempFiles[0];
        if (file.size > 2 * 1024 * 1024)
            throw new Error('请选择 2MB 以内的 MP3 音乐');
        await this.uploadMedia(file.path, 'audio', file.name);
    }
    catch (error) {
        if (!/cancel/.test(error.errMsg || ''))
            service.showError(error);
    }
},
async uploadMedia(path, kind, name) {
    if (this.runtime._dirty) {
        service.showError(new Error('请先保存婚礼资料，再添加照片或音乐'));
        return;
    }
    updateState(this.state, { busy: true });
    try {
        const uploaded = await service.upload(path, kind, name);
        const key = kind === 'image' ? 'coverFileID' : 'musicFileID';
        updateState(this.state, { ['profile.' + key]: uploaded.fileID });
        const data = await service.mutate('groups.profile', { profile: { [key]: uploaded.fileID } });
        this.applyGroup(data.group, true);
        await this.mediaUrls();
        wx.showToast({ title: '已添加到请柬' });
    }
    catch (error) {
        service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
clearMusic() { this.runtime._dirty = true; updateState(this.state, { 'profile.musicFileID': '' }); },
home() { wx.reLaunch({ url: '/pages/home/index' }); }
}
});
</script>

<style>
.card .section-title { margin-top: 0; }.member { min-height: 90rpx; border-bottom: 1rpx solid #f5eee7; }.member-name { margin-right: 16rpx; font-weight: 500; }.invite-code { font-size: 42rpx; letter-spacing: 6rpx; font-weight: 600; color: #954b50; margin-top: 8rpx; }.couple-fields { display: flex; gap: 24rpx; }.couple-fields .field { flex: 1; width: 0; margin-top: 0; }.cover { width: 100%; height: 340rpx; border-radius: 18rpx; margin-bottom: 20rpx; }.group-choice { width: 100%; background: #faf7f2; padding: 24rpx; margin-top: 14rpx; text-align: left; }.groups { margin-top: 30rpx; }

</style>
