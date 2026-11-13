<template>
<view class="container">
  <view class="page-head"><view class="title">我的婚礼筹备</view><view class="subtitle">一个人就能开始，需要时再邀请家人一起安排。</view></view>
  <view v-if="state.loading" class="empty">正在同步婚礼…</view>
  <view v-if="state.error" class="error">{{ state.error }}<button class="button-text" @tap="load">重新连接</button></view>
  <template v-if="!state.loading">
    <view v-if="!state.group || state.joinMode" class="card">
      <view class="between"><view class="section-title">{{ state.joinMode ? '加入家人的婚礼' : '创建个人婚礼' }}</view><button class="button-text" @tap="toggleJoin">{{ state.joinMode ? '我来创建' : '已有邀请码' }}</button></view>
      <view v-if="state.joinMode" class="field"><text class="label">家人怎么称呼你</text><input class="input" :value="(state.nickname)" data-key="nickname" @input="input" maxlength="30" placeholder="例如：小杨 / 新娘妈妈"/></view>
      <view v-if="state.joinMode" class="field"><text class="label">你的身份</text><picker :range="(state.roles)" :value="(state.roleIndex)" @change="roleChange"><view class="input">{{ state.roles[state.roleIndex] }} ▾</view></picker></view>
      <view v-if="state.joinMode" class="field"><text class="label">家庭群组邀请码</text><input class="input" :value="(state.code)" data-key="code" @input="input" maxlength="12" placeholder="输入家人发来的 12 位邀请码"/></view>
      <template v-else><view class="field"><text class="label">婚礼名称</text><input class="input" :value="(state.profile.title)" data-key="title" @input="profileInput" maxlength="60" placeholder="例如：我们的婚礼"/></view><view class="field"><text class="label">婚期（可以之后再定）</text><picker mode="date" :value="(state.profile.date)" data-key="date" @change="profileInput"><view class="input">{{ state.profile.date || '选择婚礼日期' }} ▾</view></picker></view></template>
      <view class="notice">{{ state.joinMode ? '加入后，可与家人共同查看和编辑婚礼资料、宾客名单与筹备事项。' : '默认仅自己可访问，事项、宾客、排座和导出都可以独立使用。之后可随时开启家庭协作。' }}</view><button class="button-primary" :loading="(state.busy)" :disabled="(state.busy)" @tap="createOrJoin">{{ state.joinMode ? '加入，一起筹备' : '开始个人筹备' }}</button>
    </view>
    <template v-if="state.group && !state.joinMode">
      <view v-if="state.personal" class="card"><view class="section-title">个人筹备 · 仅自己可见</view><view class="muted">所有筹备功能均可独立使用。开启家庭协作后，受邀加入的成员可以查看和编辑这场婚礼的资料。</view><button v-if="state.isOwner" class="button-secondary" :disabled="state.busy" @tap="enableCollaboration">开启家庭协作</button></view>
      <view v-else class="card">
        <view class="between"><view class="section-title">筹备家人 · {{ state.group.members.length }} 人</view><text class="chip">共同编辑</text></view>
        <view v-if="state.showLoginPrompt" class="notice login-prompt">
          <view>要不要微信登录，完善一下头像和称呼？</view><view class="muted small">可以跳过，不影响一起筹备婚礼。</view>
          <view class="actions"><button class="button-secondary" :disabled="state.busy" @tap="skipLogin">暂不登录</button><button class="button-primary login-button" :disabled="state.busy" @tap="loginAndEdit">微信登录并完善资料</button></view>
        </view>
        <view v-for="item in state.group.members" :key="item.id" class="member member-row">
          <image v-if="item.avatarFileID && state.avatarUrls && state.avatarUrls[item.avatarFileID]" class="member-avatar" :src="state.avatarUrls[item.avatarFileID]" :data-file="item.avatarFileID" @error="avatarError" mode="aspectFill" />
          <view v-else class="member-avatar avatar-placeholder">{{ item.nickname.slice(0, 1) || '家' }}</view>
          <view class="member-info"><view><text class="member-name">{{ item.nickname }}</text><text class="pill">{{ item.role }}</text></view><view class="muted small"><text v-if="item.id === state.group.ownerId">群主 · </text><text v-if="item.id === state.group.selfId">我 · </text>账号标记 {{ item.accountLabel }}</view></view>
          <view class="member-actions"><button v-if="state.isOwner || item.id === state.group.selfId" class="button-text member-edit" :data-id="item.id" :disabled="state.busy" @tap="openMember">修改</button><button v-if="state.isOwner && item.id !== state.group.selfId" class="button-text danger" :data-id="item.id" @tap="removeMember" :disabled="state.busy">移除</button></view>
        </view>
        <button v-if="!state.showLoginPrompt" class="button-text login-button" :disabled="state.busy" @tap="loginAndEdit">微信登录 / 完善我的资料</button>
        <view class="muted small">头像和称呼由成员填写，仅供辨认，不代表实名验证。请将邀请码只发给认识的家人；账号标记可区分同名成员。</view>
        <view class="divider"></view><view class="muted">邀请码 · {{ state.codeExpired ? '已过期，请群主更新' : '有效至 ' + state.expires }}</view><view class="invite-code">{{ state.group.joinCode }}</view><view class="actions"><button class="button-secondary" @tap="copyCode">复制邀请码</button><button class="button-primary" open-type="share" :disabled="state.codeExpired">邀请家人</button></view><button v-if="state.isOwner" class="button-text small" @tap="rotateCode" :disabled="state.busy">更新邀请码</button><button v-if="state.isOwner" class="button-text" :disabled="state.busy || state.group.members.length > 1" @tap="disableCollaboration">切换为个人筹备</button><view v-if="state.isOwner && state.group.members.length > 1" class="muted small">如需切回个人筹备，请先移除其他成员。</view>
      </view>
      <view class="card"><view class="section-title">婚礼资料</view><view class="field"><text class="label">婚礼名称</text><input class="input" :value="(state.profile.title)" data-key="title" @input="profileInput" maxlength="60"/></view><view class="couple-fields"><view class="field"><text class="label">新娘</text><input class="input" :value="(state.profile.bride)" data-key="bride" @input="profileInput" maxlength="30" placeholder="新娘姓名"/></view><view class="field"><text class="label">新郎</text><input class="input" :value="(state.profile.groom)" data-key="groom" @input="profileInput" maxlength="30" placeholder="新郎姓名"/></view></view><view class="field"><text class="label">婚礼日期</text><picker mode="date" :value="(state.profile.date)" data-key="date" @change="profileInput"><view class="input">{{ state.profile.date || '选择日期' }} ▾</view></picker></view><view class="field"><text class="label">场地名称</text><input class="input" :value="(state.profile.venue)" data-key="venue" @input="profileInput" maxlength="100" placeholder="酒店或婚礼场地"/></view><view class="field"><text class="label">详细地址</text><input class="input" :value="(state.profile.address)" data-key="address" @input="profileInput" maxlength="200" placeholder="亲友可按这个地址前往"/></view><view class="row"><button class="button-secondary" @tap="chooseLocation">{{ state.profile.latitude !== null ? '重新选择地图位置' : '添加地图导航' }}</button><button v-if="state.profile.latitude !== null" class="button-text" @tap="clearLocation">移除定位</button></view><view class="notice" v-if="state.profile.latitude !== null">地图位置已选好。</view></view>
      <button class="button-primary" :loading="(state.busy)" :disabled="(state.busy)" @tap="saveProfile">保存婚礼资料</button><button class="button-text" @tap="home">返回婚礼首页</button>
      <view v-if="state.isOwner" class="card delete-section"><view class="section-title danger">删除婚礼档案</view><view class="muted">删除后所有家人将无法访问，筹备资料、宾客和云文件均会清除，旧群组邀请立即失效。此操作不可恢复，建议先导出备份。</view><button class="button-secondary danger" :disabled="state.busy" @tap="openDelete">删除此婚礼</button></view>
    </template>
    <view v-if="state.groups.length" class="card groups"><view class="section-title">我参与的婚礼</view><view v-for="item in state.groups" :key="item.id"><button v-if="!item.deletionPending" class="group-choice between" @tap="selectGroup" :data-id="item.id" :disabled="state.busy"><text>{{ item.title }}</text><text class="muted">{{ item.date || '婚期待定' }} ›</text></button><view v-else class="notice">群组已关闭访问，部分云文件仍待清理。<button class="button-text danger" :disabled="state.busy" :data-id="item.id" @tap="retryDeletion">重试文件清理</button></view></view></view>
  </template>
</view>
<view v-if="state.deleteOpen" class="delete-mask">
  <view class="card delete-dialog">
    <view class="section-title danger">永久删除此婚礼？</view>
    <view class="muted">包括所有筹备事项、宾客、排桌、住宿和云文件。所有成员都会失去访问权限；已经导出或转发的副本无法撤回。</view>
    <view class="field"><text class="label">输入婚礼名称：{{ state.group.profile.title }}</text><input class="input delete-confirm-input" :value="state.deleteTitle" @input="deleteTitleInput" :disabled="state.busy" placeholder="完整输入名称以确认" /></view>
    <view v-if="state.deleteError" class="error">{{ state.deleteError }}</view>
    <view class="actions"><button class="button-secondary" :disabled="state.busy" @tap="state.deleteOpen = false">取消</button><button class="button-primary delete-submit" :loading="state.busy" :disabled="state.busy || state.deleteTitle !== state.group.profile.title" @tap="deleteWedding">确认永久删除</button></view>
  </view>
</view>

<view v-if="state.memberOpen && state.group" class="delete-mask member-mask">
  <view class="card delete-dialog">
    <view class="section-title">{{ state.memberId === state.group.selfId ? '我的群内资料' : '修改家人的群内称呼' }}</view>
    <button v-if="state.memberId === state.group.selfId" class="avatar-picker" open-type="chooseAvatar" @chooseavatar="chooseAvatar" :disabled="state.busy">
      <image v-if="state.memberAvatar" class="member-avatar avatar-large" :src="state.memberAvatar" mode="aspectFill" /><view v-else class="member-avatar avatar-large avatar-placeholder">{{ state.memberNickname.slice(0, 1) || '我' }}</view><text>选择微信头像</text>
    </button>
    <view v-else class="muted small">头像只能由本人设置。修改称呼或身份不会更换微信账号，也不会改变群主权限。</view>
    <view class="field"><text class="label">群内称呼</text><input :type="state.memberId === state.group.selfId ? 'nickname' : 'text'" class="input member-nickname" :value="state.memberNickname" @input="memberNicknameInput" @blur="memberNicknameInput" :disabled="state.busy" maxlength="30" placeholder="填写家人熟悉的称呼" /></view>
    <view class="field"><text class="label">在婚礼中的身份</text><picker class="member-role" :range="state.roles" :value="Math.max(0, state.roles.indexOf(state.memberRole))" @change="memberRoleChange" :disabled="state.busy"><view class="input">{{ state.memberRole }} ▾</view></picker></view>
    <view v-if="state.memberError" class="error">{{ state.memberError }}</view>
    <view class="actions"><button class="button-secondary" :disabled="state.busy" @tap="closeMember">取消</button><button class="button-primary member-save" :disabled="state.busy || state.memberConflict" :loading="state.busy" @tap="saveMember">保存资料</button></view>
  </view>
</view>

</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';
const blankProfile = { title: '', bride: '', groom: '', date: '', venue: '', address: '', latitude: null, longitude: null };

export default defineComponent({
  data() { return { state: { loading: true, busy: false, error: '', group: null, groups: [], nickname: '', roleIndex: 0, roles: ['新娘', '新郎', '妈妈', '爸爸', '家人', '伴郎伴娘'], code: '', joinMode: false, profile: { ...blankProfile } } as Record<string, any>, runtime: {} as Record<string, any> }; },
onLoad(options) { if (options.code)
    updateState(this.state, { code: options.code, joinMode: true }); },
onShow() { this.load(); },
async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
onShareAppMessage() {
    if (!this.state.group || this.state.personal)
        return { title: '喜事妥妥，把婚礼安排妥当', path: '/pages/home/index' };
    return { title: '邀请你一起筹备：' + this.state.group.profile.title, path: '/pages/group/index?code=' + this.state.group.joinCode };
},
 methods: {
openMember(event) {
    if (this.state.busy) return;
    const memberId = event?.currentTarget?.dataset?.id || this.state.group.selfId;
    const target = this.state.group.members.find(entry => entry.id === memberId);
    if (!target || (memberId !== this.state.group.selfId && !this.state.isOwner)) return;
    this.runtime._memberRevision = this.state.group.revision;
    updateState(this.state, { memberOpen: true, memberId, memberNickname: target.nickname, memberRole: target.role,
      memberAvatar: this.state.avatarUrls?.[target.avatarFileID] || '', memberAvatarPath: '', memberError: '', memberConflict: false });
},
closeMember() { if (!this.state.busy) this.state.memberOpen = false; },
memberNicknameInput(event) { this.state.memberNickname = event.detail.value; },
memberRoleChange(event) { this.state.memberRole = this.state.roles[Number(event.detail.value)]; },
chooseAvatar(event) {
    if (this.state.busy || this.state.memberId !== this.state.group.selfId) return;
    const avatarUrl = event.detail.avatarUrl;
    if (!avatarUrl) return;
    updateState(this.state, { memberAvatarPath: avatarUrl, memberAvatar: avatarUrl, memberError: '' });
},
avatarError(event) {
    const fileID = event.currentTarget.dataset.file;
    if (fileID && this.state.avatarUrls) this.state.avatarUrls[fileID] = '';
},
skipLogin() {
    this.state.showLoginPrompt = false;
    wx.setStorageSync('xishi-tuotuo:profile-prompt:' + this.state.group.id, true);
},
async loginAndEdit() {
    if (this.state.busy) return;
    this.state.busy = true;
    try {
        const data = await service.loginMember(this.state.group.revision);
        this.applyGroup(data.group);
        this.state.showLoginPrompt = false;
        this.state.busy = false;
        this.openMember();
    } catch (error) { service.showError(error); }
    finally { this.state.busy = false; }
},
async saveMember() {
    if (this.state.busy || this.state.memberConflict) return;
    if (!this.state.memberNickname.trim()) { this.state.memberError = '请填写群内称呼'; return; }
    this.state.busy = true;
    try {
        const data = await service.saveMember(this.state.memberId, this.state.memberNickname.trim(), this.state.memberRole, this.state.memberAvatarPath, this.runtime._memberRevision);
        this.applyGroup(data.group);
        this.state.memberOpen = false;
        this.state.memberAvatarPath = '';
        await this.mediaUrls();
        wx.showToast({ title: '成员资料已保存', icon: 'success' });
    } catch (error) {
        this.state.memberConflict = error.code === 'CONFLICT';
        this.state.memberError = error.code === 'CONFLICT' ? '家人更新了群组，当前修改已保留。请取消后刷新，再重新编辑。' : error.message || '资料未保存，请重试';
    } finally { this.state.busy = false; }
},
deleteTitleInput(event: Event | WechatMiniprogram.Input) { this.state.deleteTitle = (event as WechatMiniprogram.Input).detail.value; },
openDelete() {
    if (this.state.busy || !this.state.isOwner) return;
    updateState(this.state, { deleteOpen: true, deleteTitle: '', deleteError: '' });
},
async deleteWedding() {
    if (this.state.busy || !this.state.isOwner || this.state.deleteTitle !== this.state.group.profile.title) return;
    const group = this.state.group;
    this.state.busy = true;
    try {
        const result = await service.deleteGroup(group.id, group.revision, this.state.deleteTitle);
        this.clearDeletedGroup();
        wx.showToast({ title: result.cleanupPending ? '群组已删除，文件待清理' : '群组已删除', icon: 'none' });
        await this.load();
    } catch (error) {
        this.state.deleteError = error.code === 'CONFLICT' ? '家人更新了资料，请取消删除并刷新群组，确认后重新操作。' : error.message;
    } finally { this.state.busy = false; }
},
clearDeletedGroup() {
    this.runtime = {};
    updateState(this.state, { group: null, profile: { ...blankProfile }, isOwner: false, deleteOpen: false, memberOpen: false, avatarUrls: {}, deleteTitle: '', deleteError: '', code: '', error: '', joinMode: false });
},
async retryDeletion(event) {
    if (this.state.busy) return;
    this.state.busy = true;
    try {
        const result = await service.deleteGroup(event.currentTarget.dataset.id);
        wx.showToast({ title: result.cleanupPending ? '部分文件未清理，请稍后重试' : '文件已清理完成', icon: 'none' });
        await this.load();
    } catch (error) { service.showError(error); }
    finally { this.state.busy = false; }
},
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
                if (['FORBIDDEN', 'NOT_FOUND', 'GROUP_DELETED'].includes(error.code)) {
                    service.setGroup(null);
                    this.runtime._dirty = false;
                    this.runtime._profileBase = null;
                    this.runtime._profileRevision = undefined;
                    updateState(this.state, { group: null, profile: { ...blankProfile }, isOwner: false, memberOpen: false, avatarUrls: {}, deleteOpen: false, deleteTitle: '', error: '群组已删除或你已无法访问，可以选择其他婚礼。' });
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
    const selfMember = group.members.find(entry => entry.id === group.selfId);
    const dismissed = typeof wx.getStorageSync === 'function' && wx.getStorageSync('xishi-tuotuo:profile-prompt:' + group.id);
    const patch: Record<string, any> = { group, isOwner: group.ownerId === group.selfId,
        personal: group.mode === 'personal', selfMember, showLoginPrompt: !selfMember?.profileLoginAt && !dismissed,
        expires: new Date(group.joinCodeExpiresAt).toLocaleDateString(), codeExpired: group.joinCodeExpiresAt < Date.now() };
    if (!this.runtime._dirty || resetForm) {
        this.runtime._profileRevision = group.revision;
        this.runtime._profileBase = { ...blankProfile, ...group.profile };
        patch.profile = { ...this.runtime._profileBase };
        this.runtime._dirty = false;
    }
    updateState(this.state, patch);
},
async mediaUrls() {
    if (!this.state.group) {
        updateState(this.state, { avatarUrls: {} });
        return;
    }
    try {
        const data = await service.call('media.urls', { groupId: this.state.group.id });
        updateState(this.state, { avatarUrls: data.urls });
    }
    catch (_) {
        updateState(this.state, { avatarUrls: {} });
    }
},
input(event) { updateState(this.state, { [event.currentTarget.dataset.key]: event.detail.value }); },
profileInput(event) { this.runtime._dirty = true; updateState(this.state, { ['profile.' + event.currentTarget.dataset.key]: event.detail.value }); },
roleChange(event) { updateState(this.state, { roleIndex: Number(event.detail.value) }); },
toggleJoin() { updateState(this.state, { joinMode: !this.state.joinMode }); },
async createOrJoin() {
    if (this.state.busy)
        return;
    if (this.state.joinMode && !this.state.nickname.trim())
        return service.showError(new Error('先填写家人怎么称呼你'));
    updateState(this.state, { busy: true });
    try {
        const payload = { nickname: this.state.joinMode ? this.state.nickname.trim() : '我', role: this.state.joinMode ? this.state.roles[this.state.roleIndex] : '家人' };
        const data = this.state.joinMode ? await service.call('groups.join', { ...payload, code: this.state.code.trim() }) : await service.call('groups.create', { ...payload, profile: this.state.profile });
        service.setGroup(data.group);
        updateState(this.state, { joinMode: false });
        this.applyGroup(data.group);
        wx.showToast({ title: this.state.group.mode === 'personal' ? '个人婚礼已创建' : '已加入家庭协作', icon: 'success' });
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
copyCode() { if (!this.state.personal && this.state.group?.joinCode) wx.setClipboardData({ data: this.state.group.joinCode }); },
async enableCollaboration() { await this.setCollaboration(true); },
async disableCollaboration() { await this.setCollaboration(false); },
async setCollaboration(enabled) {
    if (this.state.busy || !this.state.isOwner) return;
    const message = enabled ? '开启后，受邀加入的家人可查看和编辑现有的婚礼资料、宾客及筹备记录。是否开启？' : '切换后仅自己可访问，旧邀请码立即失效，已有筹备资料保留。是否继续？';
    if (!await service.confirm(message)) return;
    this.state.busy = true;
    try {
        const data = await service.mutate('groups.collaboration', { enabled }, this.state.group.revision);
        this.applyGroup(data.group);
        wx.showToast({ title: enabled ? '家庭协作已开启' : '已切换为个人筹备', icon: 'success' });
    } catch (error) { service.showError(error); }
    finally { this.state.busy = false; }
},
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
home() { wx.reLaunch({ url: '/pages/home/index' }); }
}
});
</script>

<style>
.member-row { display: flex; gap: 18rpx; padding: 20rpx 0; align-items: center; }
.member-avatar { width: 80rpx; height: 80rpx; border-radius: 50%; flex-shrink: 0; }
.avatar-placeholder { display: flex; align-items: center; justify-content: center; background: #efe1d8; color: #954b50; font-weight: 600; }
.member-info { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.member-actions { flex-shrink: 0; }
.member-actions button { padding: 8rpx; }
.avatar-picker { background: transparent; display: flex; flex-direction: column; align-items: center; gap: 12rpx; margin-top: 20rpx; color: #954b50; }
.avatar-large { width: 128rpx; height: 128rpx; }
.login-prompt .actions { flex-wrap: wrap; }
.login-prompt button { font-size: 24rpx; }

.delete-section { margin-top: 32rpx; border: 1rpx solid #e4c3c3; }
.delete-section button { margin-top: 24rpx; }
.delete-mask { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; padding: 32rpx; background: rgba(40, 28, 28, .48); }
.delete-dialog { width: 100%; max-height: 80vh; overflow-y: auto; }
.delete-dialog .label { overflow-wrap: anywhere; }
.card .section-title { margin-top: 0; }.member { min-height: 90rpx; border-bottom: 1rpx solid #f5eee7; }.member-name { margin-right: 16rpx; font-weight: 500; }.invite-code { font-size: 42rpx; letter-spacing: 6rpx; font-weight: 600; color: #954b50; margin-top: 8rpx; }.couple-fields { display: flex; gap: 24rpx; }.couple-fields .field { flex: 1; width: 0; margin-top: 0; }.group-choice { width: 100%; background: #faf7f2; padding: 24rpx; margin-top: 14rpx; text-align: left; }.groups { margin-top: 30rpx; }

</style>
