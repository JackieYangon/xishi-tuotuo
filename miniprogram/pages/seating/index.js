const service = require('../../utils/service');

const guestFields = ['name', 'side', 'relation', 'phone', 'partySize', 'attendance', 'needsLodging', 'note', 'tableId'];
function partySize(guest) { return Number(guest.partySize || 1); }
function people(guests) { return guests.reduce((count, guest) => count + partySize(guest), 0); }
function tableGuests(group, tableId) { return (group.guests || []).filter(guest => guest.tableId === tableId && guest.attendance !== 'no'); }
function seatLayout(capacity, guests) {
  const palette = ['rose', 'sage', 'sand', 'mauve', 'clay'];
  const occupants = [];
  guests.forEach((guest, familyIndex) => {
    for (let index = 0; index < partySize(guest); index += 1) occupants.push({ guest, familyIndex, companion: index });
  });
  const size = capacity > 20 ? 36 : capacity > 14 ? 44 : 58;
  return Array.from({ length: capacity }, (_, index) => {
    const angle = (index / capacity) * Math.PI * 2 - Math.PI / 2;
    const occupant = occupants[index];
    const left = 280 + 224 * Math.cos(angle) - size / 2;
    const top = 280 + 224 * Math.sin(angle) - size / 2;
    return {
      index: index + 1, filled: !!occupant, guestId: occupant ? occupant.guest.id : '',
      label: occupant ? (capacity > 20 ? occupant.guest.name.slice(0, 1) : occupant.guest.name.slice(0, 2)) : index + 1,
      fullLabel: occupant ? occupant.guest.name + '，第 ' + (occupant.companion + 1) + ' 位' : '空位 ' + (index + 1),
      color: occupant ? palette[occupant.familyIndex % palette.length] : '',
      style: 'left:' + left.toFixed(2) + 'rpx;top:' + top.toFixed(2) + 'rpx;width:' + size + 'rpx;height:' + size + 'rpx;font-size:' + (capacity > 20 ? 18 : 21) + 'rpx;'
    };
  });
}

Page({
  data: {
    loading: true, error: '', noGroup: false, tables: [], waiting: [], waitingCount: 0,
    seatsCount: 0, assignedCount: 0, totalCapacity: 0, query: '', saving: false,
    tableEditor: false, tableId: '', tableName: '', capacityMode: '10', customCapacity: '', tableError: '', tableConflict: false,
    assignmentOpen: false, assignGuestId: '', assignTableId: '', guestOptions: [], tableOptions: [],
    guestIndex: 0, tableIndex: 0, assignmentHint: '', assignmentError: '', assignmentConflict: false, canAssign: false
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
      this.render();
      if (this.data.assignmentOpen) this.renderAssignment();
    } catch (error) {
      this.setData({ error: error.message || '暂时无法读取排桌信息', noGroup: error.code === 'NO_GROUP' });
    } finally { this._loading = false; this.setData({ loading: false }); }
  },
  render() {
    if (!this._group) return;
    const group = this._group;
    const palette = ['rose', 'sage', 'sand', 'mauve', 'clay'];
    const tables = (group.tables || []).map(table => {
      const guests = tableGuests(group, table.id);
      const count = people(guests);
      return Object.assign({}, table, {
        guests: guests.map((guest, index) => Object.assign({}, guest, { color: palette[index % palette.length] })),
        count, available: Math.max(0, table.capacity - count), full: count >= table.capacity,
        seats: seatLayout(table.capacity, guests)
      });
    });
    const tableIds = tables.map(table => table.id);
    const waiting = (group.guests || []).filter(guest => guest.attendance !== 'no' && (!guest.tableId || !tableIds.includes(guest.tableId)));
    this.setData({
      tables, waiting: waiting.filter(guest => !this.data.query || guest.name.toLowerCase().includes(this.data.query.trim().toLowerCase())),
      waitingCount: people(waiting), assignedCount: tables.reduce((sum, table) => sum + table.count, 0),
      totalCapacity: tables.reduce((sum, table) => sum + table.capacity, 0), seatsCount: tables.length
    });
  },
  async apply(result) {
    this._group = result && result.group || service.getCachedGroup();
    if (!this._group) this._group = await service.getGroup();
    this._revision = this._group.revision;
    this.render();
  },
  onSearch(event) { this.setData({ query: event.detail.value }); this.render(); },
  openTable(event) {
    if (this.data.saving || !this._group) return;
    const id = event.currentTarget.dataset.id;
    const table = (this._group.tables || []).find(item => item.id === id);
    let number = 1;
    while ((this._group.tables || []).some(item => item.name === '第' + number + '桌')) number += 1;
    this._tableRevision = this._revision;
    this.setData({
      tableEditor: true, tableId: table ? table.id : '', tableName: table ? table.name : '第' + number + '桌',
      capacityMode: table && table.capacity !== 10 && table.capacity !== 12 ? 'custom' : String(table ? table.capacity : 10),
      customCapacity: table && table.capacity !== 10 && table.capacity !== 12 ? String(table.capacity) : '', tableError: '', tableConflict: false
    });
  },
  editTableName(event) { if (!this.data.saving) this.setData({ tableName: event.detail.value, tableError: '' }); },
  setCapacity(event) { if (!this.data.saving) this.setData({ capacityMode: event.currentTarget.dataset.value, tableError: '' }); },
  editCustomCapacity(event) { if (!this.data.saving) this.setData({ customCapacity: event.detail.value, tableError: '' }); },
  closeTable() { if (!this.data.saving) this.setData({ tableEditor: false }); },
  stopTap() {},
  async saveTable() {
    if (this.data.saving || this.data.tableConflict) return;
    const capacity = Number(this.data.capacityMode === 'custom' ? this.data.customCapacity : this.data.capacityMode);
    const name = this.data.tableName.trim();
    if (!name) { this.setData({ tableError: '请给圆桌起个名字，例如“亲友桌”' }); return; }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) { this.setData({ tableError: '每桌人数请输入 1 至 30 的整数' }); return; }
    const occupied = this.data.tableId ? people(tableGuests(this._group, this.data.tableId)) : 0;
    if (capacity < occupied) { this.setData({ tableError: '本桌已安排 ' + occupied + ' 人，请先移出宾客，再减少桌子人数' }); return; }
    const record = { name, capacity };
    if (this.data.tableId) record.id = this.data.tableId;
    this.setData({ saving: true, tableError: '' });
    try {
      await this.apply(await service.mutate('records.save', { type: 'tables', record }, this._tableRevision));
      this.setData({ tableEditor: false });
      wx.showToast({ title: '圆桌已保存', icon: 'success' });
    } catch (error) {
      this.setData({ tableError: error.message || '保存失败，请重试' });
      if (error.code === 'CONFLICT' || error.code === 'REVISION_CONFLICT') {
        this.setData({ tableConflict: true });
        await this.load();
        this.setData({ tableError: '其他成员更新了排桌，当前填写内容已保留。请先重新载入最新记录，再进行编辑。' });
      }
    } finally { this.setData({ saving: false }); }
  },
  async deleteTable(event) {
    if (this.data.saving) return;
    const table = (this._group.tables || []).find(item => item.id === event.currentTarget.dataset.id);
    const expectedRevision = this._revision;
    if (!table) return;
    const answer = await new Promise(resolve => wx.showModal({
      title: '删除“' + table.name + '”', content: '本桌宾客会回到待安排名单，宾客信息会保留。确定删除吗？',
      confirmText: '删除圆桌', confirmColor: '#984354', success: resolve, fail: () => resolve({ confirm: false })
    }));
    if (!answer.confirm) return;
    this.setData({ saving: true });
    try {
      await this.apply(await service.mutate('records.delete', { type: 'tables', id: table.id }, expectedRevision));
      wx.showToast({ title: '圆桌已删除', icon: 'success' });
    } catch (error) { service.showError(error); await this.load(); }
    finally { this.setData({ saving: false }); }
  },
  openAssignment(event) {
    if (this.data.saving || !this._group) return;
    const dataset = event.currentTarget.dataset;
    this._assignmentRevision = this._revision;
    this.setData({ assignmentOpen: true, assignGuestId: dataset.guest || '', assignTableId: dataset.table || '', assignmentError: '', assignmentConflict: false });
    this.renderAssignment();
  },
  renderAssignment() {
    const group = this._group;
    const eligible = (group.guests || []).filter(guest => guest.attendance !== 'no');
    const guestOptions = [{ id: '', label: '请选择宾客 / 家庭' }].concat(eligible.map(guest => {
      const table = (group.tables || []).find(item => item.id === guest.tableId);
      return { id: guest.id, label: guest.name + ' · ' + partySize(guest) + ' 人' + (table ? ' · ' + table.name : ' · 未排桌') };
    }));
    const guest = eligible.find(item => item.id === this.data.assignGuestId);
    const tableOptions = [{ id: '', label: '请选择圆桌' }].concat((group.tables || []).map(table => {
      const occupied = people(tableGuests(group, table.id).filter(item => !guest || item.id !== guest.id));
      return { id: table.id, label: table.name + ' · 可安排 ' + (table.capacity - occupied) + ' 人', available: table.capacity - occupied };
    }));
    const table = (group.tables || []).find(item => item.id === this.data.assignTableId);
    let hint = '按宾客名单中的同行人数整组入座，亲友会坐在同一桌。';
    let canAssign = false;
    if (guest && table) {
      const available = table.capacity - people(tableGuests(group, table.id).filter(item => item.id !== guest.id));
      if (guest.tableId === table.id) hint = '这组亲友已经安排在本桌。';
      else if (partySize(guest) > available) hint = '这组亲友共 ' + partySize(guest) + ' 人，本桌只剩 ' + available + ' 个空位，请选择其他桌。';
      else { hint = '将把 ' + guest.name + ' 共 ' + partySize(guest) + ' 人安排到“' + table.name + '”。'; canAssign = true; }
    }
    this.setData({
      guestOptions, tableOptions, guestIndex: Math.max(0, guestOptions.findIndex(item => item.id === this.data.assignGuestId)),
      tableIndex: Math.max(0, tableOptions.findIndex(item => item.id === this.data.assignTableId)), assignmentHint: hint, canAssign
    });
  },
  selectGuest(event) {
    if (this.data.saving) return;
    this.setData({ assignGuestId: this.data.guestOptions[Number(event.detail.value)].id, assignmentError: '' });
    this.renderAssignment();
  },
  selectTable(event) {
    if (this.data.saving) return;
    this.setData({ assignTableId: this.data.tableOptions[Number(event.detail.value)].id, assignmentError: '' });
    this.renderAssignment();
  },
  closeAssignment() { if (!this.data.saving) this.setData({ assignmentOpen: false }); },
  guestRecord(guest, tableId) {
    const record = { id: guest.id };
    guestFields.forEach(key => { if (guest[key] !== undefined) record[key] = guest[key]; });
    record.tableId = tableId;
    return record;
  },
  async assign() {
    if (this.data.saving || this.data.assignmentConflict) return;
    this.renderAssignment();
    if (!this.data.canAssign) return;
    const guest = (this._group.guests || []).find(item => item.id === this.data.assignGuestId && item.attendance !== 'no');
    if (!guest) return;
    this.setData({ saving: true, assignmentError: '' });
    try {
      await this.apply(await service.mutate('records.save', { type: 'guests', record: this.guestRecord(guest, this.data.assignTableId) }, this._assignmentRevision));
      this.setData({ assignmentOpen: false });
      wx.showToast({ title: '已安排入座', icon: 'success' });
    } catch (error) {
      this.setData({ assignmentError: error.message || '安排失败，请重试' });
      if (error.code === 'CONFLICT' || error.code === 'REVISION_CONFLICT') {
        this.setData({ assignmentConflict: true });
        await this.load();
        this.setData({ assignmentError: '其他成员更新了排桌。请先重新载入最新记录，重新选择亲友和圆桌。' });
      }
    } finally { this.setData({ saving: false }); }
  },
  async unseat(event) {
    if (this.data.saving) return;
    const guest = (this._group.guests || []).find(item => item.id === event.currentTarget.dataset.id);
    const expectedRevision = this._revision;
    if (!guest || !guest.tableId) return;
    const answer = await new Promise(resolve => wx.showModal({ title: '移出本桌', content: '将“' + guest.name + '”移回待安排名单？', confirmText: '移出', success: resolve, fail: () => resolve({ confirm: false }) }));
    if (!answer.confirm) return;
    this.setData({ saving: true });
    try {
      await this.apply(await service.mutate('records.save', { type: 'guests', record: this.guestRecord(guest, '') }, expectedRevision));
      wx.showToast({ title: '已移回待安排', icon: 'success' });
    } catch (error) { service.showError(error); await this.load(); }
    finally { this.setData({ saving: false }); }
  },
  async reloadDraft(event) {
    if (this.data.saving) return;
    const kind = event.currentTarget.dataset.kind;
    const answer = await new Promise(resolve => wx.showModal({
      title: '重新载入最新记录', content: '将放弃当前未保存的修改或座位选择，并载入家人更新后的安排。是否继续？',
      confirmText: '重新载入', success: resolve, fail: () => resolve({ confirm: false })
    }));
    if (!answer.confirm) return;
    const id = this.data.tableId;
    this.setData({ saving: true });
    try {
      this._group = await service.getGroup();
      this._revision = this._group.revision;
      this.render();
      this.setData({ saving: false });
      if (kind === 'assignment') this.openAssignment({ currentTarget: { dataset: {} } });
      else if (id && !(this._group.tables || []).some(table => table.id === id)) {
        this.setData({ tableEditor: false });
        wx.showToast({ title: '这张圆桌已被删除', icon: 'none' });
      } else this.openTable({ currentTarget: { dataset: { id } } });
    } catch (error) {
      this.setData(kind === 'assignment' ? { assignmentError: error.message || '重新载入失败，当前选择仍保留' } : { tableError: error.message || '重新载入失败，当前内容仍保留' });
    } finally { this.setData({ saving: false }); }
  },
  goGuests() { wx.navigateTo({ url: '/pages/manage/index?type=guests' }); },
  goGroup() { wx.navigateTo({ url: '/pages/group/index' }); }
});
