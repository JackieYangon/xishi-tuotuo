const service = require('../../utils/service');
const catalog = require('../../utils/catalog');

function localDate() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
function dateLabel(value) { return value ? value.replace(/-/g, '.') : '未定日期'; }
function countPeople(guests) { return guests.reduce((sum, guest) => sum + Number(guest.partySize || 1), 0); }
function optionsText(fields, key, value) {
  const field = fields.find(item => item.key === key);
  const found = field && field.options && field.options.find(item => item.value === value);
  return found ? found.label : '';
}

Page({
  data: {
    type: 'tasks', config: catalog.tasks, loading: true, error: '', noGroup: false,
    query: '', filter: 'all', rows: [], stats: [], total: 0, allCount: 0,
    editorOpen: false, editingId: '', form: {}, fields: [], saving: false,
    pendingId: '', draftError: '', editorConflict: false, lodgingUnassigned: 0
  },
  onLoad(options) {
    const type = Object.prototype.hasOwnProperty.call(catalog, options.type) ? options.type : 'tasks';
    this.setData({ type, config: catalog[type] });
    wx.setNavigationBarTitle({ title: catalog[type].title });
  },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    if (this._loading) return;
    this._loading = true;
    this.setData({ loading: true, error: '', noGroup: false });
    try {
      this._group = await service.getGroup();
      this._revision = this._group.revision;
      this.renderRecords();
      if (this.data.editorOpen) this.renderFields();
    } catch (error) {
      this.setData({ error: error.message || '暂时无法读取，请稍后重试', noGroup: error.code === 'NO_GROUP' });
    } finally {
      this._loading = false;
      this.setData({ loading: false });
    }
  },
  async refreshAfterMutation(result) {
    const candidate = result && (result.group || (result.profile ? result : null));
    this._group = candidate || service.getCachedGroup();
    if (!this._group) this._group = await service.getGroup();
    this._revision = this._group.revision;
    this.renderRecords();
  },
  renderRecords() {
    const group = this._group;
    if (!group) return;
    const { type, query, filter } = this.data;
    const source = group[type] || [];
    const members = group.members || [];
    const memberNames = {};
    members.forEach(member => { memberNames[member.id] = member.nickname; });
    const guests = group.guests || [];
    const today = localDate();
    const rows = source.map(record => {
      const row = Object.assign({}, record);
      row.person = memberNames[record.assigneeId] || '待分工';
      row.heading = record.title || record.name || record.hotel;
      row.statusLabel = '';
      row.statusClass = '';
      row.details = [];
      row.searchText = [row.heading, record.note, record.category, record.contact, record.phone, record.relation, record.place, record.room, row.person].join(' ').toLowerCase();
      if (type === 'tasks') {
        row.overdue = !record.done && record.dueDate && record.dueDate < today;
        row.statusLabel = record.done ? '已完成' : row.overdue ? '已到期' : '待完成';
        row.statusClass = record.done ? 'status-done' : row.overdue ? 'status-urgent' : '';
        row.details = [record.dueDate ? dateLabel(record.dueDate) + ' 前完成' : '日期待定', row.person];
      } else if (type === 'items') {
        row.statusLabel = optionsText(catalog.items.fields, 'status', record.status);
        row.statusClass = record.status === 'ready' ? 'status-done' : '';
        row.details = ['数量 ' + record.quantity, row.person];
      } else if (type === 'vendors') {
        row.statusLabel = optionsText(catalog.vendors.fields, 'status', record.status);
        row.statusClass = record.status === 'booked' ? 'status-done' : '';
        row.details = [record.category || '服务类别未填写', record.contact || '联系人未填写'];
        row.quoteLabel = Number(record.quote) > 0 ? '报价 ¥' + Number(record.quote).toLocaleString('zh-CN') : '报价待确认';
      } else if (type === 'guests') {
        row.statusLabel = optionsText(catalog.guests.fields, 'attendance', record.attendance);
        row.statusClass = record.attendance === 'yes' ? 'status-done' : record.attendance === 'no' ? 'status-muted' : '';
        const table = (group.tables || []).find(item => item.id === record.tableId);
        row.details = [optionsText(catalog.guests.fields, 'side', record.side), String(record.partySize) + ' 人', record.relation || ''];
        row.seatLabel = table ? table.name : '尚未排桌';
      } else if (type === 'timeline') {
        row.statusLabel = record.time;
        row.statusClass = 'status-time';
        row.details = [record.place || '地点待定', row.person];
      } else if (type === 'lodgings') {
        const assigned = guests.filter(guest => (record.guestIds || []).includes(guest.id));
        row.statusLabel = assigned.length ? '已分配 ' + countPeople(assigned) + ' 人' : '待分配宾客';
        row.statusClass = assigned.length ? 'status-done' : '';
        row.details = [record.room || '房间待定', dateLabel(record.checkIn) + ' — ' + dateLabel(record.checkOut)];
        row.guestNames = assigned.map(guest => guest.name + (guest.attendance === 'no' ? '（已回复不出席）' : '')).join('、');
        row.searchText += ' ' + row.guestNames.toLowerCase();
      }
      row.details = row.details.filter(Boolean);
      return row;
    }).filter(row => {
      if (query && !row.searchText.includes(query.trim().toLowerCase())) return false;
      if (filter === 'all') return true;
      if (filter === 'mine') return row.assigneeId === group.selfId;
      if (type === 'tasks') return filter === 'overdue' ? row.overdue : filter === 'done' ? row.done : !row.done;
      if (type === 'items' || type === 'vendors') return row.status === filter;
      if (type === 'guests') return filter === 'lodging' ? row.needsLodging && row.attendance !== 'no' : row.attendance === filter;
      if (type === 'lodgings') return !(row.guestIds || []).length;
      return true;
    });
    if (type === 'tasks') rows.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    if (type === 'timeline') rows.sort((a, b) => a.time.localeCompare(b.time));
    if (type === 'lodgings') rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    let stats;
    if (type === 'tasks') {
      const completed = source.filter(item => item.done).length;
      stats = [{ label: '全部事项', value: source.length }, { label: '已经完成', value: completed }, { label: '完成进度', value: (source.length ? Math.round(completed / source.length * 100) : 0) + '%' }];
    } else if (type === 'guests') {
      stats = [{ label: '受邀亲友', value: countPeople(source) + ' 人' }, { label: '确认出席', value: countPeople(source.filter(guest => guest.attendance === 'yes')) + ' 人' }, { label: '等待回复', value: source.filter(guest => guest.attendance === 'pending').length + ' 组' }];
    } else if (type === 'items') {
      stats = [{ label: '物品种类', value: source.length }, { label: '已经买好', value: source.filter(item => item.status === 'ordered').length }, { label: '全部备齐', value: source.filter(item => item.status === 'ready').length }];
    } else if (type === 'vendors') {
      stats = [{ label: '候选商家', value: source.length }, { label: '已经沟通', value: source.filter(item => item.status === 'contacted').length }, { label: '已经预订', value: source.filter(item => item.status === 'booked').length }];
    } else if (type === 'timeline') {
      stats = [{ label: '当天环节', value: source.length }, { label: '已分工', value: source.filter(item => item.assigneeId).length }, { label: '待分工', value: source.filter(item => !item.assigneeId).length }];
    } else {
      const assignedIds = source.reduce((ids, lodging) => ids.concat(lodging.guestIds || []), []);
      const unassigned = guests.filter(guest => guest.needsLodging && guest.attendance !== 'no' && !assignedIds.includes(guest.id));
      stats = [{ label: '住宿安排', value: source.length }, { label: '已安排亲友', value: countPeople(guests.filter(guest => assignedIds.includes(guest.id))) + ' 人' }, { label: '待安排', value: countPeople(unassigned) + ' 人' }];
      this.setData({ lodgingUnassigned: countPeople(unassigned) });
    }
    this.setData({ rows, stats, total: rows.length, allCount: source.length });
  },
  onSearch(event) { this.setData({ query: event.detail.value }); this.renderRecords(); },
  onFilter(event) { this.setData({ filter: event.currentTarget.dataset.value }); this.renderRecords(); },
  openAdd() {
    if (!this._group || this.data.saving || this.data.pendingId) return;
    const form = JSON.parse(JSON.stringify(this.data.config.defaults));
    if (this.data.type === 'lodgings') {
      form.checkIn = this._group.profile.date || localDate();
      const date = new Date(form.checkIn + 'T12:00:00');
      date.setDate(date.getDate() + 1);
      form.checkOut = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    }
    this._editorRevision = this._revision;
    this.setData({ form, editingId: '', editorOpen: true, draftError: '', editorConflict: false });
    this.renderFields();
  },
  openEdit(event) {
    if (this.data.saving || this.data.pendingId) return;
    const record = (this._group[this.data.type] || []).find(item => item.id === event.currentTarget.dataset.id);
    if (!record) return;
    const form = {};
    Object.keys(this.data.config.defaults).forEach(key => { form[key] = record[key] === undefined ? this.data.config.defaults[key] : record[key]; });
    this._editorRevision = this._revision;
    this.setData({ form: JSON.parse(JSON.stringify(form)), editingId: record.id, editorOpen: true, draftError: '', editorConflict: false });
    this.renderFields();
  },
  renderFields() {
    const group = this._group;
    if (!group) return;
    const fields = this.data.config.fields.map(field => {
      const result = Object.assign({}, field, { value: this.data.form[field.key] });
      if (field.kind === 'member') result.options = [{ value: '', label: '暂不分配' }].concat((group.members || []).map(member => ({ value: member.id, label: member.nickname })));
      if (field.kind === 'member' || field.kind === 'select') {
        result.selected = Math.max(0, result.options.findIndex(item => item.value === result.value));
        result.display = result.options[result.selected].label;
      }
      if (field.kind === 'guests') {
        result.choices = (group.guests || []).filter(guest => guest.attendance !== 'no' || (result.value || []).includes(guest.id)).map(guest => ({
          id: guest.id, name: guest.name, partySize: guest.partySize,
          needsLodging: guest.needsLodging, notAttending: guest.attendance === 'no', checked: (result.value || []).includes(guest.id)
        }));
        result.selectedCount = countPeople((group.guests || []).filter(guest => (result.value || []).includes(guest.id)));
      }
      return result;
    });
    this.setData({ fields });
  },
  onInput(event) {
    if (this.data.saving) return;
    this.setData({ ['form.' + event.currentTarget.dataset.key]: event.detail.value, draftError: '' });
  },
  onPicker(event) {
    if (this.data.saving) return;
    const key = event.currentTarget.dataset.key;
    const field = this.data.fields.find(item => item.key === key);
    const value = field.kind === 'select' || field.kind === 'member' ? field.options[Number(event.detail.value)].value : event.detail.value;
    this.setData({ ['form.' + key]: value, draftError: '' });
    this.renderFields();
  },
  clearDate(event) {
    if (this.data.saving) return;
    this.setData({ ['form.' + event.currentTarget.dataset.key]: '', draftError: '' });
    this.renderFields();
  },
  onSwitch(event) {
    if (this.data.saving) return;
    this.setData({ ['form.' + event.currentTarget.dataset.key]: event.detail.value, draftError: '' });
  },
  onGuestsChange(event) {
    if (this.data.saving) return;
    this.setData({ 'form.guestIds': event.detail.value, draftError: '' });
    this.renderFields();
  },
  closeEditor() {
    if (this.data.saving) return;
    this.setData({ editorOpen: false, draftError: '' });
  },
  stopTap() {},
  validateForm() {
    const record = {};
    for (const key of Object.keys(this.data.config.defaults)) {
      const value = this.data.form[key];
      record[key] = typeof value === 'string' ? value.trim() : value;
    }
    for (const field of this.data.config.fields) {
      const value = record[field.key];
      if (field.required && (value === '' || value === undefined || value === null)) throw new Error('请填写' + field.label);
      if (field.kind === 'number' || field.kind === 'decimal') {
        const numeric = value === '' ? 0 : Number(value);
        if (!Number.isFinite(numeric) || numeric < field.min || numeric > field.max || (field.kind === 'number' && !Number.isInteger(numeric))) {
          throw new Error(field.label + '应为 ' + field.min + ' 至 ' + field.max + (field.kind === 'number' ? ' 的整数' : ' 之间的数字'));
        }
        record[field.key] = numeric;
      }
    }
    if (this.data.type === 'lodgings' && record.checkOut <= record.checkIn) throw new Error('退房日期应晚于入住日期');
    if (this.data.editingId) record.id = this.data.editingId;
    return record;
  },
  async save() {
    if (this.data.saving || this.data.editorConflict) return;
    let record;
    try { record = this.validateForm(); } catch (error) { this.setData({ draftError: error.message }); return; }
    this.setData({ saving: true, draftError: '' });
    try {
      const result = await service.mutate('records.save', { type: this.data.type, record }, this._editorRevision);
      await this.refreshAfterMutation(result);
      this.setData({ editorOpen: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      this.setData({ draftError: error.message || '保存失败，内容已保留，请重试' });
      if (error.code === 'CONFLICT' || error.code === 'REVISION_CONFLICT') {
        this.setData({ editorConflict: true });
        await this.load();
        this.setData({ draftError: '其他成员更新了群组，你的填写内容已保留。请先重新载入最新记录，再编辑保存，避免覆盖家人的修改。' });
      }
    } finally { this.setData({ saving: false }); }
  },
  async reloadEditor() {
    if (this.data.saving) return;
    const answer = await new Promise(resolve => wx.showModal({
      title: '重新载入最新记录', content: '重新载入会放弃当前未保存的填写内容，并打开家人更新后的记录。是否继续？',
      confirmText: '重新载入', success: resolve, fail: () => resolve({ confirm: false })
    }));
    if (!answer.confirm) return;
    const id = this.data.editingId;
    this.setData({ saving: true });
    try {
      this._group = await service.getGroup();
      this._revision = this._group.revision;
      this.renderRecords();
      this.setData({ saving: false });
      if (id && !(this._group[this.data.type] || []).some(record => record.id === id)) {
        this.setData({ editorOpen: false });
        wx.showToast({ title: '这条记录已被删除', icon: 'none' });
      } else if (id) this.openEdit({ currentTarget: { dataset: { id } } });
      else this.openAdd();
    } catch (error) { this.setData({ draftError: error.message || '重新载入失败，当前内容仍保留' }); }
    finally { this.setData({ saving: false }); }
  },
  async toggleDone(event) {
    if (this.data.pendingId || this.data.saving) return;
    const item = (this._group.tasks || []).find(record => record.id === event.currentTarget.dataset.id);
    const expectedRevision = this._revision;
    if (!item) return;
    const record = { id: item.id };
    Object.keys(catalog.tasks.defaults).forEach(key => { record[key] = item[key] === undefined ? catalog.tasks.defaults[key] : item[key]; });
    record.done = !record.done;
    this.setData({ pendingId: item.id });
    try {
      await this.refreshAfterMutation(await service.mutate('records.save', { type: 'tasks', record }, expectedRevision));
    } catch (error) { service.showError(error); await this.load(); }
    finally { this.setData({ pendingId: '' }); }
  },
  async advanceItem(event) {
    if (this.data.pendingId || this.data.saving) return;
    const item = (this._group.items || []).find(record => record.id === event.currentTarget.dataset.id);
    const expectedRevision = this._revision;
    if (!item || item.status === 'ready') return;
    const record = { id: item.id };
    Object.keys(catalog.items.defaults).forEach(key => { record[key] = item[key] === undefined ? catalog.items.defaults[key] : item[key]; });
    record.status = item.status === 'pending' ? 'ordered' : 'ready';
    this.setData({ pendingId: item.id });
    try {
      await this.refreshAfterMutation(await service.mutate('records.save', { type: 'items', record }, expectedRevision));
      wx.showToast({ title: record.status === 'ready' ? '物品已备齐' : '已标记购买', icon: 'success' });
    } catch (error) { service.showError(error); await this.load(); }
    finally { this.setData({ pendingId: '' }); }
  },
  async remove(event) {
    if (this.data.pendingId || this.data.saving) return;
    const id = event.currentTarget.dataset.id;
    const record = (this._group[this.data.type] || []).find(item => item.id === id);
    const expectedRevision = this._revision;
    if (!record) return;
    const response = await new Promise(resolve => wx.showModal({
      title: '删除' + this.data.config.singular,
      content: '确定删除“' + (record.title || record.name || record.hotel) + '”吗？' + (this.data.type === 'guests' ? '该宾客的排桌、住宿关联和专属请柬也将失效。' : '群组成员也会同步看到此次修改。'),
      confirmText: '删除', confirmColor: '#a64050', success: resolve, fail: () => resolve({ confirm: false })
    }));
    if (!response.confirm) return;
    this.setData({ pendingId: id });
    try {
      await this.refreshAfterMutation(await service.mutate('records.delete', { type: this.data.type, id }, expectedRevision));
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) { service.showError(error); await this.load(); }
    finally { this.setData({ pendingId: '' }); }
  },
  invite(event) { wx.navigateTo({ url: '/pages/invitation/index?guestId=' + encodeURIComponent(event.currentTarget.dataset.id) + '&mode=manage' }); },
  callVendor(event) {
    const phoneNumber = event.currentTarget.dataset.phone;
    if (phoneNumber) wx.makePhoneCall({ phoneNumber, fail: () => {} });
  },
  goGroup() { wx.navigateTo({ url: '/pages/group/index' }); },
  goSeats() { wx.navigateTo({ url: '/pages/seating/index' }); }
});
