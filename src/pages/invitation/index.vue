<template>
<view v-if="state.loading" class="container empty">正在打开这份邀请…</view>
<view v-else-if="state.error" class="container"><view class="card empty"><view class="title">请柬暂时未能打开</view><view>{{ state.error }}</view><button class="button-primary retry" @tap="load">重试</button></view></view>
<view v-else-if="state.invitation" :class="'invitation theme-' + (state.invitation.profile.theme || 'rose')">
  <view v-if="state.manage" class="manage-banner">这是 {{ state.invitation.guest.name }} 的专属请柬，请单独发送给本人或该家庭。<button class="button-primary" open-type="share">发送这份邀请</button></view>
  <view v-if="state.preview" class="manage-banner">请柬样式预览<button class="button-text" @tap="guests">前往宾客名单，生成专属邀请 ›</button></view>
  <button v-if="state.invitation.musicUrl" class="music-button" @tap="toggleMusic">{{ state.playing ? '♫ 暂停' : '♫ 音乐' }}</button>
  <view class="invitation-top"><text class="english">WE ARE GETTING MARRIED</text><view class="seal">囍</view><view class="invitation-names">{{ state.invitation.profile.bride || '新娘' }}<text> &amp; </text>{{ state.invitation.profile.groom || '新郎' }}</view><view class="date">{{ state.invitation.profile.date || '婚期待定' }}</view><view class="thin-line"></view><view class="invitation-title">诚 · 邀 · 赴 · 宴</view></view>
  <image v-if="state.invitation.coverUrl" :src="(state.invitation.coverUrl)" mode="widthFix" class="wedding-photo"/>
  <view v-else class="photo-placeholder"><view class="rings"><view></view><view></view></view><text>良辰与共，喜乐相逢</text></view>
  <view class="letter"><view v-if="state.invitation.guest" class="dear">亲爱的 {{ state.invitation.guest.name }}：</view><text class="invitation-text">{{ state.invitation.profile.invitationText || '诚邀您见证我们的幸福时刻，期待与您相聚。' }}</text><view class="venue">{{ state.invitation.profile.venue || '婚礼场地待定' }}</view><view class="address">{{ state.invitation.profile.address }}</view><button v-if="state.invitation.profile.venue || state.invitation.profile.address" class="map-button" @tap="navigate">{{ state.hasLocation ? '查看地图 · 导航赴宴' : '复制婚礼地址' }} ↗</button><view v-if="state.invitation.tableName" class="seat-info">为您安排：{{ state.invitation.tableName }}</view></view>
  <view v-if="state.invitation.guest && !state.manage" class="rsvp card">
    <view class="section-title">{{ state.submitted ? '我们收到您的回复啦' : '期待与您相见' }}</view><view class="muted">{{ state.submitted ? '安排有变化时，可以在这里修改。' : '请告诉我们您的安排，方便提前准备。' }}</view>
    <radio-group @change="attendanceChange" class="attendance"><label><radio value="yes" :checked="(state.attendance === 'yes')" color="#954b50"/>欣然赴约</label><label><radio value="no" :checked="(state.attendance === 'no')" color="#954b50"/>遗憾缺席</label></radio-group>
    <template v-if="state.attendance === 'yes'"><view class="field"><text class="label">共几位出席（包含您自己）</text><input class="input" type="number" maxlength="2" :value="(state.partySize)" data-key="partySize" @input="input"/></view><view class="between field"><text>需要安排住宿</text><switch :checked="(state.needsLodging)" color="#954b50" @change="lodgingChange"/></view></template>
    <view class="field"><text class="label">给新人的留言 / 饮食需求（500 字以内）</text><textarea class="input" :value="(state.note)" data-key="note" @input="input" maxlength="500" placeholder="有需要提前安排的事情，可以告诉我们"/></view><view v-if="state.invitation.warning" class="notice">{{ state.invitation.warning }}</view><button class="button-primary" :loading="(state.busy)" :disabled="(state.busy)" @tap="submit">{{ state.submitted ? '更新出席回复' : '送出我的回复' }}</button>
  </view>
  <view class="invitation-footer">愿每一份相聚，都成为温柔的回忆。<view>喜事妥妥 · 用心准备，安心相聚</view></view>
</view>

</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';

export default defineComponent({
  data() { return { state: { loading: true, busy: false, error: '', invitation: null, preview: false, manage: false, playing: false, attendance: 'yes', partySize: 1, needsLodging: false, note: '', submitted: false } as Record<string, any>, runtime: {} as Record<string, any> }; },
onLoad(options) {
    this.runtime.token = options.token || '';
    this.runtime.guestId = options.guestId || '';
    updateState(this.state, { preview: options.mode === 'preview', manage: options.mode === 'manage' });
    if (!this.runtime.token && !this.runtime.guestId)
        wx.hideShareMenu();
    this.load();
},
async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
onShow() { if (this.runtime._shown) this.load(); this.runtime._shown = true; },
onHide() { if (this.runtime.audio)
    this.runtime.audio.pause(); },
onUnload() { if (this.runtime.audio)
    this.runtime.audio.destroy(); },
onShareAppMessage() {
    if (!this.runtime.token || !this.state.invitation)
        return { title: '喜事妥妥', path: '/pages/home/index' };
    const invitation = this.state.invitation;
    return { title: invitation.guest.name + '，诚邀您参加我们的婚礼', path: '/pages/invitation/index?token=' + this.runtime.token };
},
 methods: {
async load() {
    updateState(this.state, { loading: true, error: '' });
    try {
        let invitation;
        if (this.runtime.token)
            invitation = (await service.call('invitations.get', { token: this.runtime.token })).invitation;
        else {
            const group = await service.getGroup();
            if (this.runtime.guestId) {
                const issued = await service.mutate('invitations.issue', { guestId: this.runtime.guestId });
                this.runtime.token = issued.token;
                invitation = (await service.call('invitations.get', { token: this.runtime.token })).invitation;
            }
            else {
                const media = await service.call('media.urls', { groupId: group.id });
                invitation = { profile: group.profile, coverUrl: media.urls[group.profile.coverFileID] || '', musicUrl: media.urls[group.profile.musicFileID] || '', guest: null, tableName: '' };
                updateState(this.state, { preview: true });
            }
        }
        this.applyInvitation(invitation);
    }
    catch (error) {
        this.clearInvalidInvitation(error);
        updateState(this.state, { error: error.message });
    }
    finally {
        updateState(this.state, { loading: false });
    }
},
clearInvalidInvitation(error) {
    if (!['INVITATION_EXPIRED', 'GROUP_DELETED', 'FORBIDDEN', 'NO_GROUP'].includes(error.code)) return;
    if (this.runtime.audio) { this.runtime.audio.destroy(); this.runtime.audio = null; }
    updateState(this.state, { invitation: null, playing: false, submitted: false, note: '', error: error.message });
},
applyInvitation(invitation) {
    const guest = invitation.guest;
    updateState(this.state, { invitation, hasLocation: typeof invitation.profile.latitude === 'number' && typeof invitation.profile.longitude === 'number', attendance: guest && guest.attendance === 'no' ? 'no' : 'yes', partySize: guest ? guest.partySize : 1, needsLodging: guest ? guest.needsLodging : false, note: guest ? guest.note : '', submitted: guest ? guest.attendance !== 'pending' : false });
    if (this.runtime.audio) {
        this.runtime.audio.destroy();
        this.runtime.audio = null;
        updateState(this.state, { playing: false });
    }
    if (invitation.musicUrl) {
        this.runtime.audio = markRaw(wx.createInnerAudioContext());
        this.runtime.audio.src = invitation.musicUrl;
        this.runtime.audio.loop = true;
        this.runtime.audio.onPlay(() => updateState(this.state, { playing: true }));
        this.runtime.audio.onPause(() => updateState(this.state, { playing: false }));
        this.runtime.audio.onError(() => { updateState(this.state, { playing: false }); service.showError(new Error('音乐暂时无法播放')); });
    }
},
toggleMusic() { if (!this.runtime.audio)
    return; if (this.state.playing)
    this.runtime.audio.pause();
else
    this.runtime.audio.play(); },
attendanceChange(event) { updateState(this.state, { attendance: event.detail.value }); },
input(event) { updateState(this.state, { [event.currentTarget.dataset.key]: event.detail.value }); },
lodgingChange(event) { updateState(this.state, { needsLodging: event.detail.value }); },
async submit() {
    if (this.state.busy || !this.runtime.token || !this.state.invitation || !this.state.invitation.guest)
        return;
    const partySize = this.state.attendance === 'no' ? (this.state.invitation.guest.partySize || 1) : Number(this.state.partySize);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30)
        return service.showError(new Error('请填写 1 至 30 位出席人数，包含你自己'));
    updateState(this.state, { busy: true });
    try {
        const data = await service.call('invitations.respond', { token: this.runtime.token, response: { attendance: this.state.attendance, partySize, needsLodging: this.state.attendance === 'yes' && this.state.needsLodging, note: this.state.note } });
        this.applyInvitation(data.invitation);
        wx.showToast({ title: '回复已送达，谢谢你', icon: 'none', duration: 2500 });
    }
    catch (error) {
        this.clearInvalidInvitation(error);
        service.showError(error);
    }
    finally {
        updateState(this.state, { busy: false });
    }
},
navigate() {
    const p = this.state.invitation.profile;
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number')
        wx.openLocation({ latitude: p.latitude, longitude: p.longitude, name: p.venue, address: p.address, scale: 16, fail: () => service.showError(new Error('地图打开失败，请复制地址后前往')) });
    else if (p.address || p.venue)
        wx.setClipboardData({ data: [p.venue, p.address].filter(Boolean).join(' ') });
},
guests() { wx.navigateTo({ url: '/pages/manage/index?type=guests' }); },
home() { wx.reLaunch({ url: '/pages/home/index' }); }
}
});
</script>

<style>
.invitation { background: #f8efea; color: #88474c; min-height: 100vh; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }.theme-ivory { background: #f7f5ec; color: #7b7155; }.theme-red { background: #fbf0df; color: #9b292c; }.invitation-top { text-align: center; padding: 62rpx 36rpx 42rpx; }.english { font-size: 18rpx; letter-spacing: 5rpx; opacity: .7; }.seal { font-family: serif; font-size: 96rpx; line-height: 1.4; margin: 30rpx 0 10rpx; }.invitation-names { font-size: 44rpx; letter-spacing: 6rpx; font-weight: 500; }.invitation-names text { font-family: Georgia,serif; font-style: italic; color: #b38b6c; }.date { font-family: Georgia,serif; letter-spacing: 4rpx; font-size: 29rpx; margin-top: 20rpx; }.thin-line { width: 66rpx; height: 2rpx; background: #b99e83; margin: 32rpx auto; }.invitation-title { font-size: 24rpx; letter-spacing: 8rpx; }.wedding-photo { display: block; width: calc(100% - 80rpx); margin: 0 40rpx; border-radius: 180rpx 180rpx 16rpx 16rpx; }.photo-placeholder { margin: 0 40rpx; height: 340rpx; border: 1rpx solid #d8bfa7; border-radius: 180rpx 180rpx 8rpx 8rpx; text-align: center; background: rgba(255,255,255,.4); padding-top: 90rpx; }.rings { display: flex; justify-content: center; margin-bottom: 36rpx; }.rings view { border: 5rpx solid #b49972; width: 96rpx; height: 96rpx; border-radius: 50%; }.rings view + view { margin-left: -26rpx; }.photo-placeholder text { font-size: 24rpx; letter-spacing: 7rpx; }.letter { text-align: center; padding: 48rpx 54rpx; }.dear { font-size: 30rpx; margin-bottom: 26rpx; }.invitation-text { white-space: pre-wrap; font-size: 27rpx; line-height: 2; }.venue { font-size: 33rpx; font-weight: 600; margin-top: 42rpx; }.address { font-size: 24rpx; opacity: .75; margin: 10rpx 0 22rpx; }.map-button { display: inline-block; background: rgba(255,255,255,.7); border: 1rpx solid #d7c2ae; color: inherit; padding: 16rpx 28rpx; font-size: 24rpx; border-radius: 80rpx; }.seat-info { margin-top: 24rpx; font-size: 28rpx; }.rsvp { margin: 0 32rpx; color: #4c3934; padding: 34rpx; }.rsvp .section-title { margin-top: 0; }.attendance { display: flex; flex-wrap: wrap; gap: 26rpx; margin: 30rpx 0; }.attendance label { display: flex; align-items: center; font-size: 27rpx; }.attendance radio { transform: scale(.85); }.invitation-footer { text-align: center; padding: 52rpx 20rpx 10rpx; font-size: 24rpx; opacity: .65; }.invitation-footer view { font-size: 21rpx; margin-top: 16rpx; }.manage-banner { padding: 24rpx 32rpx; background: #fff; color: #7d6658; font-size: 24rpx; text-align: center; }.manage-banner button { margin-top: 18rpx; }.music-button { position: fixed; right: 22rpx; top: 22rpx; z-index: 5; border-radius: 80rpx; color: white; background: rgba(90,52,48,.7); padding: 12rpx 18rpx; font-size: 21rpx; }.manage-banner ~ .music-button { top: 215rpx; }.retry { margin-top: 30rpx; }

</style>
