const service = require('../../utils/service');
Page({
  data: { loading: true, busy: false, error: '', invitation: null, preview: false, manage: false, playing: false, attendance: 'yes', partySize: 1, needsLodging: false, note: '', submitted: false },
  onLoad(options) {
    this.token = options.token || ''; this.guestId = options.guestId || '';
    this.setData({ preview: options.mode === 'preview', manage: options.mode === 'manage' });
    if (!this.token && !this.guestId) wx.hideShareMenu();
    this.load();
  },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      let invitation;
      if (this.token) invitation = (await service.call('invitations.get', { token: this.token })).invitation;
      else {
        const group = await service.getGroup();
        if (this.guestId) {
          const issued = await service.mutate('invitations.issue', { guestId: this.guestId });
          this.token = issued.token;
          invitation = (await service.call('invitations.get', { token: this.token })).invitation;
        } else {
          const media = await service.call('media.urls', { groupId: group.id });
          invitation = { profile: group.profile, coverUrl: media.urls[group.profile.coverFileID] || '', musicUrl: media.urls[group.profile.musicFileID] || '', guest: null, tableName: '' };
          this.setData({ preview: true });
        }
      }
      this.applyInvitation(invitation);
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  applyInvitation(invitation) {
    const guest = invitation.guest;
    this.setData({ invitation, hasLocation: typeof invitation.profile.latitude === 'number' && typeof invitation.profile.longitude === 'number', attendance: guest && guest.attendance === 'no' ? 'no' : 'yes', partySize: guest ? guest.partySize : 1, needsLodging: guest ? guest.needsLodging : false, note: guest ? guest.note : '', submitted: guest ? guest.attendance !== 'pending' : false });
    if (this.audio) { this.audio.destroy(); this.audio = null; this.setData({ playing: false }); }
    if (invitation.musicUrl) {
      this.audio = wx.createInnerAudioContext(); this.audio.src = invitation.musicUrl; this.audio.loop = true;
      this.audio.onPlay(() => this.setData({ playing: true })); this.audio.onPause(() => this.setData({ playing: false }));
      this.audio.onError(() => { this.setData({ playing: false }); service.showError(new Error('音乐暂时无法播放')); });
    }
  },
  toggleMusic() { if (!this.audio) return; if (this.data.playing) this.audio.pause(); else this.audio.play(); },
  onHide() { if (this.audio) this.audio.pause(); },
  onUnload() { if (this.audio) this.audio.destroy(); },
  attendanceChange(event) { this.setData({ attendance: event.detail.value }); },
  input(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  lodgingChange(event) { this.setData({ needsLodging: event.detail.value }); },
  async submit() {
    if (this.data.busy || !this.token || !this.data.invitation || !this.data.invitation.guest) return;
    const partySize = this.data.attendance === 'no' ? (this.data.invitation.guest.partySize || 1) : Number(this.data.partySize);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) return service.showError(new Error('请填写 1 至 30 位出席人数，包含你自己'));
    this.setData({ busy: true });
    try {
      const data = await service.call('invitations.respond', { token: this.token, response: { attendance: this.data.attendance, partySize, needsLodging: this.data.attendance === 'yes' && this.data.needsLodging, note: this.data.note } });
      this.applyInvitation(data.invitation);
      wx.showToast({ title: '回复已送达，谢谢你', icon: 'none', duration: 2500 });
    } catch (error) { service.showError(error); }
    finally { this.setData({ busy: false }); }
  },
  navigate() {
    const p = this.data.invitation.profile;
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number') wx.openLocation({ latitude: p.latitude, longitude: p.longitude, name: p.venue, address: p.address, scale: 16, fail: () => service.showError(new Error('地图打开失败，请复制地址后前往')) });
    else if (p.address || p.venue) wx.setClipboardData({ data: [p.venue, p.address].filter(Boolean).join(' ') });
  },
  guests() { wx.navigateTo({ url: '/pages/manage/index?type=guests' }); },
  home() { wx.reLaunch({ url: '/pages/home/index' }); },
  onShareAppMessage() {
    if (!this.token || !this.data.invitation) return { title: '喜事妥妥', path: '/pages/home/index' };
    const invitation = this.data.invitation;
    return { title: invitation.guest.name + '，诚邀您参加我们的婚礼', path: '/pages/invitation/index?token=' + this.token };
  }
});
