const service = require('../../utils/service');
const blankProfile = { title: '', bride: '', groom: '', date: '', venue: '', address: '', latitude: null, longitude: null, coverFileID: '', musicFileID: '', invitationText: '诚邀您见证我们的幸福时刻，期待与您相聚。', theme: 'rose' };
Page({
  data: { loading: true, busy: false, error: '', group: null, groups: [], nickname: '', roleIndex: 0, roles: ['新娘', '新郎', '妈妈', '爸爸', '家人', '伴郎伴娘'], code: '', joinMode: false, profile: { ...blankProfile }, coverUrl: '', themes: ['温柔玫瑰', '奶油简约', '中式喜红'], themeIndex: 0 },
  onLoad(options) { if (options.code) this.setData({ code: options.code, joinMode: true }); },
  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const listed = await service.call('groups.list');
      this.setData({ groups: listed.groups });
      if (service.getGroupId() && !this.data.joinMode) {
        try { this.applyGroup(await service.getGroup()); await this.mediaUrls(); }
        catch (error) {
          if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') {
            service.setGroup(null); this._dirty = false; this._profileBase = null; this._profileRevision = undefined;
            this.setData({ group: null, profile: { ...blankProfile }, coverUrl: '', isOwner: false, error: '你已无法访问此群组，可以选择其他婚礼或重新加入。' });
          } else throw error;
        }
      }
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  applyGroup(group, resetForm = false) {
    const patch = { group, isOwner: group.ownerId === group.selfId,
      expires: new Date(group.joinCodeExpiresAt).toLocaleDateString(), codeExpired: group.joinCodeExpiresAt < Date.now() };
    if (!this._dirty || resetForm) {
      this._profileRevision = group.revision;
      this._profileBase = { ...blankProfile, ...group.profile };
      patch.profile = { ...this._profileBase };
      patch.themeIndex = Math.max(0, ['rose', 'ivory', 'red'].indexOf(group.profile.theme));
      this._dirty = false;
    }
    this.setData(patch);
  },
  async mediaUrls() {
    if (!this.data.group || !this.data.group.profile.coverFileID) { this.setData({ coverUrl: '' }); return; }
    try { const data = await service.call('media.urls', { groupId: this.data.group.id }); this.setData({ coverUrl: data.urls[this.data.group.profile.coverFileID] || '' }); } catch (_) { this.setData({ coverUrl: '' }); }
  },
  input(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  profileInput(event) { this._dirty = true; this.setData({ ['profile.' + event.currentTarget.dataset.key]: event.detail.value }); },
  roleChange(event) { this.setData({ roleIndex: Number(event.detail.value) }); },
  themeChange(event) { this._dirty = true; const index = Number(event.detail.value); this.setData({ themeIndex: index, 'profile.theme': ['rose', 'ivory', 'red'][index] }); },
  toggleJoin() { this.setData({ joinMode: !this.data.joinMode }); },
  async createOrJoin() {
    if (this.data.busy) return;
    if (!this.data.nickname.trim()) return service.showError(new Error('先填写家人怎么称呼你'));
    this.setData({ busy: true });
    try {
      const payload = { nickname: this.data.nickname.trim(), role: this.data.roles[this.data.roleIndex] };
      const data = this.data.joinMode ? await service.call('groups.join', { ...payload, code: this.data.code.trim() }) : await service.call('groups.create', { ...payload, profile: this.data.profile });
      service.setGroup(data.group); this.setData({ joinMode: false }); this.applyGroup(data.group);
      wx.showToast({ title: '一起开始筹备吧', icon: 'success' });
      wx.reLaunch({ url: '/pages/home/index' });
    } catch (error) { service.showError(error); }
    finally { this.setData({ busy: false }); }
  },
  async selectGroup(event) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { const data = await service.call('groups.get', { groupId: event.currentTarget.dataset.id }); service.setGroup(data.group); wx.reLaunch({ url: '/pages/home/index' }); }
    catch (error) { service.showError(error); }
    finally { this.setData({ busy: false }); }
  },
  async saveProfile() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      const profile = {};
      Object.keys(blankProfile).forEach(key => { if (!this._profileBase || this.data.profile[key] !== this._profileBase[key]) profile[key] = this.data.profile[key]; });
      const data = await service.mutate('groups.profile', { profile }, this._profileRevision);
      this.applyGroup(data.group, true); this.setData({ error: '' }); wx.showToast({ title: '婚礼资料已保存' });
    } catch (error) {
      if (error.code === 'CONFLICT') {
        if (await service.confirm('家人刚更新了资料。重新载入会放弃当前未保存修改，请查看最新资料后重新编辑。', '资料已更新')) {
          try { this.applyGroup(await service.getGroup(), true); this.setData({ error: '' }); } catch (reloadError) { service.showError(reloadError); }
        } else this.setData({ error: '草稿已保留且尚未提交。重新载入最新资料后才能继续保存。' });
      } else service.showError(error);
    }
    finally { this.setData({ busy: false }); }
  },
  chooseLocation() {
    wx.chooseLocation({ success: location => { this._dirty = true; this.setData({ 'profile.venue': location.name || this.data.profile.venue, 'profile.address': location.address, 'profile.latitude': location.latitude, 'profile.longitude': location.longitude }); }, fail: error => { if (!/cancel/.test(error.errMsg || '')) service.showError(new Error('未能选择地图位置，可先填写详细地址')); } });
  },
  clearLocation() { this._dirty = true; this.setData({ 'profile.latitude': null, 'profile.longitude': null }); },
  copyCode() { wx.setClipboardData({ data: this.data.group.joinCode }); },
  async rotateCode() {
    if (this.data.busy || !await service.confirm('更新后，之前分享的群组邀请将失效，已加入的家人不受影响。')) return;
    this.setData({ busy: true });
    try { const data = await service.mutate('groups.rotateCode'); this.applyGroup(data.group); } catch (error) { service.showError(error); } finally { this.setData({ busy: false }); }
  },
  async removeMember(event) {
    if (this.data.busy || !await service.confirm('移除后，对方无法查看或修改筹备资料，已分配给对方的事项会变为待分工。')) return;
    this.setData({ busy: true });
    try { const data = await service.mutate('groups.removeMember', { memberId: event.currentTarget.dataset.id }); this.applyGroup(data.group); } catch (error) { service.showError(error); } finally { this.setData({ busy: false }); }
  },
  async pickImage() {
    if (this.data.busy) return;
    if (this._dirty) return service.showError(new Error('请先保存婚礼资料，再添加照片'));
    wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async result => {
      const file = result.tempFiles[0];
      if (file.size > 2 * 1024 * 1024) return service.showError(new Error('请选择 2MB 以内的 JPG 或 PNG 照片'));
      await this.uploadMedia(file.tempFilePath, 'image', 'wedding.jpg');
    } });
  },
  async pickMusic() {
    if (this.data.busy) return;
    if (this._dirty) return service.showError(new Error('请先保存婚礼资料，再添加音乐'));
    try { const result = await service.chooseFile({ count: 1, type: 'file', extension: ['mp3'] }); const file = result.tempFiles[0];
      if (file.size > 2 * 1024 * 1024) throw new Error('请选择 2MB 以内的 MP3 音乐');
      await this.uploadMedia(file.path, 'audio', file.name);
    } catch (error) { if (!/cancel/.test(error.errMsg || '')) service.showError(error); }
  },
  async uploadMedia(path, kind, name) {
    if (this._dirty) { service.showError(new Error('请先保存婚礼资料，再添加照片或音乐')); return; }
    this.setData({ busy: true });
    try {
      const uploaded = await service.upload(path, kind, name);
      const key = kind === 'image' ? 'coverFileID' : 'musicFileID';
      this.setData({ ['profile.' + key]: uploaded.fileID });
      const data = await service.mutate('groups.profile', { profile: { [key]: uploaded.fileID } });
      this.applyGroup(data.group, true); await this.mediaUrls(); wx.showToast({ title: '已添加到请柬' });
    } catch (error) { service.showError(error); } finally { this.setData({ busy: false }); }
  },
  clearMusic() { this._dirty = true; this.setData({ 'profile.musicFileID': '' }); },
  home() { wx.reLaunch({ url: '/pages/home/index' }); },
  onShareAppMessage() {
    if (!this.data.group) return { title: '喜事妥妥，一家人一起筹备婚礼', path: '/pages/home/index' };
    return { title: '邀请你一起筹备：' + this.data.group.profile.title, path: '/pages/group/index?code=' + this.data.group.joinCode };
  }
});
