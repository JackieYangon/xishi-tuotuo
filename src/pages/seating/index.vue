<template>
<view class="container seating-page">
  <view class="seating-heading">
    <view class="eyebrow">把相聚的位置安排好</view>
    <view class="title">婚宴排桌</view>
    <view class="subtitle">围坐一桌，都是重要的人。</view>
  </view>
  <view v-if="state.loading && !state.tables.length" class="card empty">正在整理圆桌与宾客…</view>
  <view v-else-if="state.error" class="card empty">
    <view class="error-title">{{ state.noGroup ? '先创建或选择婚礼' : '暂时没有连接上' }}</view>
    <view class="muted error-description">{{ state.error }}</view>
    <button v-if="state.noGroup" class="button-primary" @tap="goGroup">开始筹备</button>
    <button v-else class="button-secondary" @tap="load">重新加载</button>
  </view>
  <template v-else>
    <view class="seating-stats">
      <view class="seating-stat"><view class="stat-number">{{ state.seatsCount }}<text> 桌</text></view><view class="stat-label">已设圆桌</view></view>
      <view class="seating-stat"><view class="stat-number">{{ state.assignedCount }}<text> 人</text></view><view class="stat-label">已安排入座</view></view>
      <view class="seating-stat"><view class="stat-number">{{ state.waitingCount }}<text> 人</text></view><view class="stat-label">等待安排</view></view>
    </view>
    <view class="capacity-caption">共 {{ state.totalCapacity }} 个座位 · 待回复亲友可先预留座位</view>

    <view class="card waiting-card">
      <view class="waiting-header"><view class="section-title">待安排亲友</view><button class="text-action" @tap="goGuests">管理名单 →</button></view>
      <view v-if="state.waitingCount" class="waiting-search"><input placeholder="搜索待排桌的亲友" :value="(state.query)" @input="onSearch" maxlength="60" /></view>
      <view v-for="(item, index) in state.waiting" :key="item.id" class="waiting-guest">
        <view class="waiting-person"><view class="guest-name">{{ item.name }}</view><view class="guest-detail">{{ item.partySize }} 人 · {{ item.attendance === 'yes' ? '确认出席' : '待回复' }}</view></view>
        <button class="small-button" :data-guest="(item.id)" @tap="openAssignment" :disabled="(state.saving || !state.tables.length)">安排入座</button>
      </view>
      <view v-if="!state.waiting.length" class="waiting-empty">{{ state.waitingCount ? '没有匹配的亲友，换个名字试试' : state.assignedCount ? '所有受邀亲友都已安排好座位' : '先添加宾客，再为亲友安排圆桌' }}</view>
      <view v-if="state.waitingCount && !state.tables.length" class="muted create-tip">先在下方添加一张圆桌，就能开始排座。</view>
    </view>

    <view class="tables-section-label">圆桌示意<text>点击座位可查看或调整安排</text></view>
    <view v-if="!state.tables.length" class="card empty table-empty">
      <view class="empty-table-art"><view></view><view></view><view></view><view></view></view>
      <view>第一桌，从这里开始</view>
      <view class="muted">10 人桌、12 人桌，或按宴会厅自定义人数</view>
    </view>

    <view v-for="(table, index) in state.tables" :key="table.id" class="card table-card">
      <view class="table-card-header">
        <view><view class="table-name">{{ table.name }}</view><view class="table-capacity">{{ table.capacity }} 人圆桌</view></view>
        <view :class="'occupancy-badge ' + (table.full ? 'is-full' : '')">{{ table.full ? '已满员' : '还可坐 ' + table.available + ' 人' }}</view>
      </view>
      <view class="round-table-canvas">
        <view class="table-outline"></view>
        <view class="table-surface">
          <view class="table-decoration">喜</view>
          <view class="table-center-name">{{ table.name }}</view>
          <view class="table-center-count">{{ table.count }}<text> / {{ table.capacity }} 人</text></view>
          <view class="table-center-flower">· ❀ ·</view>
        </view>
        <view v-for="(seat, index) in table.seats" :key="seat.index" :class="'chair ' + (seat.filled ? 'chair-filled' : 'chair-empty') + ' color-' + (seat.color)" :style="(seat.style)" :data-guest="(seat.guestId)" :data-table="(table.id)" @tap="openAssignment" :aria-label="(seat.fullLabel)">{{ seat.label }}</view>
      </view>
      <view class="table-legend"><view class="legend-dot legend-filled"></view><text>已安排</text><view class="legend-dot legend-empty"></view><text>空位</text><text class="legend-family">同色代表同组亲友</text></view>
      <view v-for="(guest, index) in table.guests" :key="guest.id" class="seated-guest">
        <view :class="'family-dot color-' + (guest.color)"></view>
        <view class="seated-guest-info"><view class="guest-name">{{ guest.name }}<text class="party-number">{{ guest.partySize }} 人</text></view><view v-if="guest.attendance === 'pending'" class="guest-detail">待回复 · 已预留座位</view></view>
        <button class="mini-action" :data-guest="(guest.id)" @tap="openAssignment" :disabled="(state.saving)">换桌</button>
        <button class="mini-action muted-action" :data-id="(guest.id)" @tap="unseat" :disabled="(state.saving)">移出</button>
      </view>
      <view v-if="!table.guests.length" class="table-no-guests">座位都准备好了，安排亲友入座吧。</view>
      <view class="table-actions">
        <button class="small-button assign-button" :data-table="(table.id)" @tap="openAssignment" :disabled="(state.saving || table.full)">＋ 安排亲友</button>
        <view class="action-spacer"></view>
        <button class="mini-action" :data-id="(table.id)" @tap="openTable" :disabled="(state.saving)">编辑</button>
        <button class="mini-action muted-action" :data-id="(table.id)" @tap="deleteTable" :disabled="(state.saving)">删除</button>
      </view>
    </view>
    <view class="bottom-action"><button class="button-primary" @tap="openTable" :disabled="(state.saving || state.loading)">＋ 添加圆桌</button></view>
  </template>
</view>

<view v-if="state.tableEditor" class="modal-mask" @tap.stop="closeTable" @touchmove.stop="stopTap">
  <view class="modal-sheet" @tap.stop="stopTap">
    <view class="modal-heading"><view class="modal-title">{{ state.tableId ? '编辑圆桌' : '添加圆桌' }}</view><button class="close-modal" @tap="closeTable" :disabled="(state.saving)">×</button></view>
    <view class="field"><view class="label">桌名</view><input class="input" :value="(state.tableName)" placeholder="例如：主桌、亲友桌" maxlength="40" @input="editTableName" :disabled="(state.saving)" /></view>
    <view class="field">
      <view class="label">每桌人数</view>
      <view class="capacity-options">
        <button :class="'capacity-option ' + (state.capacityMode === '10' ? 'capacity-selected' : '')" data-value="10" @tap="setCapacity" :disabled="(state.saving)"><text>10</text>人桌</button>
        <button :class="'capacity-option ' + (state.capacityMode === '12' ? 'capacity-selected' : '')" data-value="12" @tap="setCapacity" :disabled="(state.saving)"><text>12</text>人桌</button>
        <button :class="'capacity-option ' + (state.capacityMode === 'custom' ? 'capacity-selected' : '')" data-value="custom" @tap="setCapacity" :disabled="(state.saving)"><text>＋</text>自定义</button>
      </view>
      <input v-if="state.capacityMode === 'custom'" class="input custom-capacity" type="number" :value="(state.customCapacity)" placeholder="输入 1 至 30 人" maxlength="2" @input="editCustomCapacity" :disabled="(state.saving)" />
    </view>
    <view class="form-note">按宴会厅实际桌型设置人数，系统会检查是否超员。</view>
    <view v-if="state.tableError" class="form-error">{{ state.tableError }}</view>
    <button v-if="state.tableConflict" class="button-secondary reload-button" data-kind="table" @tap="reloadDraft" :disabled="(state.saving)">重新载入最新记录</button>
    <view class="modal-actions"><button class="button-secondary cancel-button" @tap="closeTable" :disabled="(state.saving)">取消</button><button class="button-primary confirm-button" @tap="saveTable" :loading="(state.saving)" :disabled="(state.saving || state.tableConflict)">保存圆桌</button></view>
  </view>
</view>

<view v-if="state.assignmentOpen" class="modal-mask assignment-mask" @tap.stop="closeAssignment" @touchmove.stop="stopTap">
  <view class="modal-sheet assignment-sheet" @tap.stop="stopTap">
    <view class="modal-heading assignment-heading"><view class="modal-title">{{ state.assignmentMode === 'move' ? '为亲友换桌' : '安排亲友入座' }}</view><button class="close-modal" @tap="closeAssignment" :disabled="(state.saving)">×</button></view>
    <scroll-view class="assignment-scroll" scroll-y enhanced :show-scrollbar="false">
      <view class="assignment-body">
        <view class="field">
          <view class="label">宾客 / 家庭</view>
          <view v-if="state.assignmentMode === 'move'" class="input assignment-guest-value">
            <view class="assignment-guest-name">{{ state.assignmentGuestName }}</view><view class="assignment-guest-detail">{{ state.assignmentGuestDetail }}</view>
          </view>
          <picker v-else class="assignment-guest-picker" :range="state.guestOptions" range-key="label" :value="state.guestIndex" @change="selectGuest" :disabled="state.saving || state.assignmentConflict || state.guestOptions.length <= 1">
            <view class="input picker-input assignment-guest-value"><view class="assignment-guest-copy"><view class="assignment-guest-name">{{ state.assignmentGuestName }}</view><view v-if="state.assignmentGuestDetail" class="assignment-guest-detail">{{ state.assignmentGuestDetail }}</view></view><text class="assignment-picker-arrow">⌄</text></view>
          </picker>
        </view>
        <view class="field">
          <view class="label">安排到哪一桌</view>
          <view class="form-note assignment-filter-note">{{ state.assignGuestId ? '只显示能容纳这组亲友的圆桌，同行亲友不拆桌。' : '只显示有空位的圆桌，选择亲友后会按同行人数筛选。' }}</view>
          <view v-if="!state.availableTables.length" class="assignment-empty">{{ state.tableEmptyHint }}</view>
          <button v-for="table in state.availableTables" :key="table.id" :class="'table-choice ' + (state.assignTableId === table.id ? 'table-choice-selected' : '')" :data-id="table.id" @tap="selectTable" :disabled="state.saving || state.assignmentConflict" :aria-label="table.label">
            <view class="table-choice-name">{{ table.name }}</view>
            <view class="table-choice-availability">还可安排 <text>{{ table.available }}</text> 人</view>
            <view class="table-choice-details">共 {{ table.capacity }} 个座位 · 已安排 {{ table.occupied }} 人</view>
            <view class="table-choice-mark">{{ state.assignTableId === table.id ? '✓' : '' }}</view>
          </button>
        </view>
        <view :class="'assignment-note ' + (state.canAssign ? 'assignment-ready' : '')">{{ state.assignmentHint }}</view>
        <view v-if="state.assignmentError" class="form-error">{{ state.assignmentError }}</view>
        <button v-if="state.assignmentConflict" class="button-secondary reload-button" data-kind="assignment" @tap="reloadDraft" :disabled="(state.saving)">重新载入最新记录</button>
      </view>
    </scroll-view>
    <view class="modal-actions assignment-actions"><button class="button-secondary cancel-button" @tap="closeAssignment" :disabled="(state.saving)">取消</button><button class="button-primary confirm-button" @tap="assign" :loading="(state.saving)" :disabled="(state.saving || !state.canAssign || state.assignmentConflict)">{{ state.assignmentMode === 'move' ? '确认换桌' : '确认入座' }}</button></view>
  </view>
</view>

</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';

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


export default defineComponent({
  data() { return { state: {
    loading: true, error: '', noGroup: false, tables: [], waiting: [], waitingCount: 0,
    seatsCount: 0, assignedCount: 0, totalCapacity: 0, query: '', saving: false,
    tableEditor: false, tableId: '', tableName: '', capacityMode: '10', customCapacity: '', tableError: '', tableConflict: false,
    assignmentOpen: false, assignmentMode: 'new', assignGuestId: '', assignTableId: '', guestOptions: [], tableOptions: [], availableTables: [],
    assignmentGuestName: '', assignmentGuestDetail: '', tableEmptyHint: '',
    guestIndex: 0, tableIndex: 0, assignmentHint: '', assignmentError: '', assignmentConflict: false, canAssign: false
  } as Record<string, any>, runtime: {} as Record<string, any> }; },
onShow() { this.load(); },
onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
 methods: {
async load() {
    if (this.runtime._loading)
        return;
    this.runtime._loading = true;
    updateState(this.state, { loading: true, error: '', noGroup: false });
    try {
        this.runtime._group = await service.getGroup();
        this.runtime._revision = this.runtime._group.revision;
        this.render();
        if (this.state.assignmentOpen)
            this.renderAssignment();
    }
    catch (error) {
        if (['GROUP_DELETED', 'FORBIDDEN', 'NOT_FOUND', 'NO_GROUP'].includes(error.code)) {
            this.runtime._group = null;
            updateState(this.state, { tables: [], waiting: [], tableEditor: false, assignmentOpen: false, tableName: '', guestOptions: [], tableOptions: [], availableTables: [], assignGuestId: '', assignTableId: '', assignmentGuestName: '', assignmentGuestDetail: '', canAssign: false });
        }
        updateState(this.state, { error: error.message || '暂时无法读取排桌信息', noGroup: ['NO_GROUP', 'GROUP_DELETED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code) });
    }
    finally {
        this.runtime._loading = false;
        updateState(this.state, { loading: false });
    }
},
render() {
    if (!this.runtime._group)
        return;
    const group = this.runtime._group;
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
    updateState(this.state, {
        tables, waiting: waiting.filter(guest => !this.state.query || guest.name.toLowerCase().includes(this.state.query.trim().toLowerCase())),
        waitingCount: people(waiting), assignedCount: tables.reduce((sum, table) => sum + table.count, 0),
        totalCapacity: tables.reduce((sum, table) => sum + table.capacity, 0), seatsCount: tables.length
    });
},
async apply(result) {
    this.runtime._group = result && result.group || service.getCachedGroup();
    if (!this.runtime._group)
        this.runtime._group = await service.getGroup();
    this.runtime._revision = this.runtime._group.revision;
    this.render();
},
onSearch(event) { updateState(this.state, { query: event.detail.value }); this.render(); },
openTable(event) {
    if (this.state.saving || !this.runtime._group)
        return;
    const id = event.currentTarget.dataset.id;
    const table = (this.runtime._group.tables || []).find(item => item.id === id);
    let number = 1;
    while ((this.runtime._group.tables || []).some(item => item.name === '第' + number + '桌'))
        number += 1;
    this.runtime._tableRevision = this.runtime._revision;
    updateState(this.state, {
        tableEditor: true, tableId: table ? table.id : '', tableName: table ? table.name : '第' + number + '桌',
        capacityMode: table && table.capacity !== 10 && table.capacity !== 12 ? 'custom' : String(table ? table.capacity : 10),
        customCapacity: table && table.capacity !== 10 && table.capacity !== 12 ? String(table.capacity) : '', tableError: '', tableConflict: false
    });
},
editTableName(event) { if (!this.state.saving)
    updateState(this.state, { tableName: event.detail.value, tableError: '' }); },
setCapacity(event) { if (!this.state.saving)
    updateState(this.state, { capacityMode: event.currentTarget.dataset.value, tableError: '' }); },
editCustomCapacity(event) { if (!this.state.saving)
    updateState(this.state, { customCapacity: event.detail.value, tableError: '' }); },
closeTable() { if (!this.state.saving)
    updateState(this.state, { tableEditor: false }); },
stopTap() { },
async saveTable() {
    if (this.state.saving || this.state.tableConflict)
        return;
    const capacity = Number(this.state.capacityMode === 'custom' ? this.state.customCapacity : this.state.capacityMode);
    const name = this.state.tableName.trim();
    if (!name) {
        updateState(this.state, { tableError: '请给圆桌起个名字，例如“亲友桌”' });
        return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) {
        updateState(this.state, { tableError: '每桌人数请输入 1 至 30 的整数' });
        return;
    }
    const occupied = this.state.tableId ? people(tableGuests(this.runtime._group, this.state.tableId)) : 0;
    if (capacity < occupied) {
        updateState(this.state, { tableError: '本桌已安排 ' + occupied + ' 人，请先移出宾客，再减少桌子人数' });
        return;
    }
    const record: Record<string, any> = { name, capacity };
    if (this.state.tableId)
        record.id = this.state.tableId;
    updateState(this.state, { saving: true, tableError: '' });
    try {
        await this.apply(await service.mutate('records.save', { type: 'tables', record }, this.runtime._tableRevision));
        updateState(this.state, { tableEditor: false });
        wx.showToast({ title: '圆桌已保存', icon: 'success' });
    }
    catch (error) {
        updateState(this.state, { tableError: error.message || '保存失败，请重试' });
        if (error.code === 'CONFLICT' || error.code === 'REVISION_CONFLICT') {
            updateState(this.state, { tableConflict: true });
            await this.load();
            updateState(this.state, { tableError: '其他成员更新了排桌，当前填写内容已保留。请先重新载入最新记录，再进行编辑。' });
        }
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
async deleteTable(event) {
    if (this.state.saving)
        return;
    const table = (this.runtime._group.tables || []).find(item => item.id === event.currentTarget.dataset.id);
    const expectedRevision = this.runtime._revision;
    if (!table)
        return;
    const answer = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => wx.showModal({
        title: '删除“' + table.name + '”', content: '本桌宾客会回到待安排名单，宾客信息会保留。确定删除吗？',
        confirmText: '删除圆桌', confirmColor: '#984354', success: resolve, fail: () => resolve({ confirm: false, cancel: true, content: String(), errMsg: '' })
    }));
    if (!answer.confirm)
        return;
    updateState(this.state, { saving: true });
    try {
        await this.apply(await service.mutate('records.delete', { type: 'tables', id: table.id }, expectedRevision));
        wx.showToast({ title: '圆桌已删除', icon: 'success' });
    }
    catch (error) {
        service.showError(error);
        await this.load();
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
openAssignment(event) {
    if (this.state.saving || !this.runtime._group)
        return;
    const dataset = event.currentTarget.dataset;
    const guest = (this.runtime._group.guests || []).find(item => item.id === dataset.guest);
    const moving = guest && guest.attendance !== 'no' && (this.runtime._group.tables || []).some(table => table.id === guest.tableId);
    this.runtime._movingGuestId = moving ? guest.id : '';
    this.runtime._assignmentRevision = this.runtime._revision;
    updateState(this.state, { assignmentOpen: true, assignmentMode: moving ? 'move' : 'new', assignGuestId: dataset.guest || '', assignTableId: dataset.table || '', assignmentError: '', assignmentConflict: false });
    this.renderAssignment();
},
renderAssignment() {
    const group = this.runtime._group;
    if (!group) return;
    const tables = group.tables || [];
    const tableIds = tables.map(table => table.id);
    const moving = this.state.assignmentMode === 'move';
    const eligible = (group.guests || []).filter(guest => guest.attendance !== 'no' && (moving
        ? guest.id === this.runtime._movingGuestId
        : !guest.tableId || !tableIds.includes(guest.tableId)));
    const guestOptions = [{ id: '', label: '请选择宾客 / 家庭' }].concat(eligible.map(guest => {
        const table = tables.find(item => item.id === guest.tableId);
        return { id: guest.id, label: guest.name + ' · ' + partySize(guest) + ' 人' + (table ? ' · ' + table.name : ' · 未排桌') };
    }));
    const guest = eligible.find(item => item.id === this.state.assignGuestId);
    const assignGuestId = guest ? guest.id : '';
    const availableTables = tables.map(table => {
        const occupied = people(tableGuests(group, table.id));
        const available = Math.max(0, table.capacity - occupied);
        return { id: table.id, name: table.name, capacity: table.capacity, occupied, available, label: table.name + ' · 还可安排 ' + available + ' 人' };
    }).filter(table => table.available > 0 && (!guest || (table.available >= partySize(guest) && table.id !== guest.tableId)));
    const tableOptions = [{ id: '', label: '请选择圆桌' }].concat(availableTables);
    const table = availableTables.find(item => item.id === this.state.assignTableId);
    const assignTableId = table ? table.id : '';
    let hint = '按宾客名单中的同行人数整组入座，亲友会坐在同一桌。';
    let canAssign = false;
    if (guest && table) {
        hint = '将把 ' + guest.name + ' 共 ' + partySize(guest) + ' 人安排到“' + table.name + '”，安排后还剩 ' + (table.available - partySize(guest)) + ' 个空位。';
        canAssign = true;
    }
    else if (!eligible.length) hint = moving ? '这组亲友已被删除或标记不出席，请重新载入名单。' : '暂无未排座的亲友，已安排和不出席的宾客不会显示。';
    else if (guest) hint = '已选 ' + guest.name + '，共 ' + partySize(guest) + ' 人，请选择可容纳整组亲友的圆桌。';
    const currentTable = guest && tables.find(item => item.id === guest.tableId);
    const tableEmptyHint = !tables.length ? '还没有圆桌，请先添加圆桌。' : guest
        ? '暂无能容纳这组 ' + partySize(guest) + ' 人的' + (moving ? '其他' : '') + '圆桌，请添加圆桌或调整现有排座。'
        : '暂无有空位的圆桌，请添加圆桌或调整现有排座。';
    updateState(this.state, {
        assignGuestId, assignTableId, guestOptions, tableOptions, availableTables,
        assignmentGuestName: guest ? guest.name : moving ? '原宾客已无法安排' : '请选择未排座的宾客 / 家庭',
        assignmentGuestDetail: guest ? partySize(guest) + ' 人' + (moving && currentTable ? ' · 原桌：' + currentTable.name : ' · 未排桌') : '',
        guestIndex: Math.max(0, guestOptions.findIndex(item => item.id === assignGuestId)),
        tableIndex: Math.max(0, tableOptions.findIndex(item => item.id === assignTableId)), assignmentHint: hint, tableEmptyHint, canAssign
    });
},
selectGuest(event) {
    if (this.state.saving || this.state.assignmentConflict || this.state.assignmentMode === 'move')
        return;
    const option = this.state.guestOptions[Number(event.detail.value)];
    if (!option) return;
    updateState(this.state, { assignGuestId: option.id, assignmentError: '' });
    this.renderAssignment();
},
selectTable(event) {
    if (this.state.saving || this.state.assignmentConflict)
        return;
    const id = event.currentTarget?.dataset?.id;
    const option = id !== undefined ? this.state.tableOptions.find(table => table.id === id) : this.state.tableOptions[Number(event.detail?.value)];
    if (!option) return;
    updateState(this.state, { assignTableId: option.id, assignmentError: '' });
    this.renderAssignment();
},
closeAssignment() { if (!this.state.saving)
    updateState(this.state, { assignmentOpen: false }); },
guestRecord(guest, tableId) {
    const record: Record<string, any> = { id: guest.id };
    guestFields.forEach(key => { if (guest[key] !== undefined)
        record[key] = guest[key]; });
    record.tableId = tableId;
    return record;
},
async assign() {
    if (this.state.saving || this.state.assignmentConflict)
        return;
    this.renderAssignment();
    if (!this.state.canAssign)
        return;
    const guest = (this.runtime._group.guests || []).find(item => item.id === this.state.assignGuestId && item.attendance !== 'no');
    if (!guest)
        return;
    updateState(this.state, { saving: true, assignmentError: '' });
    try {
        await this.apply(await service.mutate('records.save', { type: 'guests', record: this.guestRecord(guest, this.state.assignTableId) }, this.runtime._assignmentRevision));
        updateState(this.state, { assignmentOpen: false });
        wx.showToast({ title: '已安排入座', icon: 'success' });
    }
    catch (error) {
        updateState(this.state, { assignmentError: error.message || '安排失败，请重试' });
        if (error.code === 'CONFLICT' || error.code === 'REVISION_CONFLICT') {
            updateState(this.state, { assignmentConflict: true });
            await this.load();
            updateState(this.state, { assignmentError: '其他成员更新了排桌。请先重新载入最新记录，重新选择亲友和圆桌。' });
        }
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
async unseat(event) {
    if (this.state.saving)
        return;
    const guest = (this.runtime._group.guests || []).find(item => item.id === event.currentTarget.dataset.id);
    const expectedRevision = this.runtime._revision;
    if (!guest || !guest.tableId)
        return;
    const answer = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => wx.showModal({ title: '移出本桌', content: '将“' + guest.name + '”移回待安排名单？', confirmText: '移出', success: resolve, fail: () => resolve({ confirm: false, cancel: true, content: String(), errMsg: '' }) }));
    if (!answer.confirm)
        return;
    updateState(this.state, { saving: true });
    try {
        await this.apply(await service.mutate('records.save', { type: 'guests', record: this.guestRecord(guest, '') }, expectedRevision));
        wx.showToast({ title: '已移回待安排', icon: 'success' });
    }
    catch (error) {
        service.showError(error);
        await this.load();
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
async reloadDraft(event) {
    if (this.state.saving)
        return;
    const kind = event.currentTarget.dataset.kind;
    const answer = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => wx.showModal({
        title: '重新载入最新记录', content: '将放弃当前未保存的修改或座位选择，并载入家人更新后的安排。是否继续？',
        confirmText: '重新载入', success: resolve, fail: () => resolve({ confirm: false, cancel: true, content: String(), errMsg: '' })
    }));
    if (!answer.confirm)
        return;
    const id = this.state.tableId;
    updateState(this.state, { saving: true });
    try {
        this.runtime._group = await service.getGroup();
        this.runtime._revision = this.runtime._group.revision;
        this.render();
        updateState(this.state, { saving: false });
        if (kind === 'assignment')
            this.openAssignment({ currentTarget: { dataset: {} } });
        else if (id && !(this.runtime._group.tables || []).some(table => table.id === id)) {
            updateState(this.state, { tableEditor: false });
            wx.showToast({ title: '这张圆桌已被删除', icon: 'none' });
        }
        else
            this.openTable({ currentTarget: { dataset: { id } } });
    }
    catch (error) {
        updateState(this.state, kind === 'assignment' ? { assignmentError: error.message || '重新载入失败，当前选择仍保留' } : { tableError: error.message || '重新载入失败，当前内容仍保留' });
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
goGuests() { wx.navigateTo({ url: '/pages/manage/index?type=guests' }); },
goGroup() { wx.navigateTo({ url: '/pages/group/index' }); }
}
});
</script>

<style>
.seating-page { padding-bottom: 190rpx; }
.seating-heading { padding: 12rpx 0 28rpx; }
.eyebrow { color: #a26570; font-size: 22rpx; letter-spacing: 3rpx; margin-bottom: 12rpx; }
.seating-stats { display: flex; padding: 30rpx 8rpx; background: #f2e8e4; border-radius: 24rpx; }
.seating-stat { flex: 1; text-align: center; border-right: 1rpx solid #e3d3cd; }
.seating-stat:last-child { border: none; }
.stat-number { font-size: 38rpx; font-weight: 600; color: #843c4b; }
.stat-number text { font-size: 22rpx; font-weight: 400; }
.stat-label { color: #937970; font-size: 22rpx; margin-top: 8rpx; }
.capacity-caption { color: #a0887b; font-size: 22rpx; text-align: center; margin: 18rpx 0 30rpx; }
.waiting-card { padding: 28rpx; }
.waiting-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.text-action { background: transparent; color: #984354; font-size: 24rpx; padding: 0; margin: 0; line-height: 1.6; }
.text-action::after, .small-button::after, .mini-action::after, .close-modal::after, .capacity-option::after { border: none; }
.waiting-search { background: #f7f2ec; padding: 18rpx 22rpx; border-radius: 12rpx; margin: 18rpx 0 12rpx; }
.waiting-search input { font-size: 25rpx; }
.waiting-guest { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; padding: 20rpx 0; border-bottom: 1rpx solid #f1e8df; }
.waiting-guest:last-child { border: none; }
.waiting-person { min-width: 0; flex: 1; }
.guest-name { color: #5e433e; font-size: 28rpx; line-height: 1.6; word-break: break-word; }
.guest-detail { color: #a2897b; font-size: 22rpx; margin-top: 5rpx; }
.small-button { margin: 0; padding: 12rpx 20rpx; border-radius: 12rpx; background: #f4e6e6; color: #984354; font-size: 24rpx; line-height: 1.5; flex-shrink: 0; }
.waiting-empty { color: #a48b7d; font-size: 25rpx; text-align: center; padding: 28rpx 0 14rpx; line-height: 1.8; }
.create-tip { font-size: 23rpx; line-height: 1.7; margin-top: 16rpx; }
.tables-section-label { color: #6f4e44; font-size: 30rpx; font-weight: 600; margin: 36rpx 4rpx 20rpx; }
.tables-section-label text { display: block; color: #a3897b; font-size: 22rpx; font-weight: 400; margin-top: 10rpx; }
.table-card { padding: 28rpx; margin-bottom: 26rpx; overflow: hidden; }
.table-card-header { display: flex; align-items: center; justify-content: space-between; }
.table-name { color: #5b3938; font-size: 32rpx; font-weight: 600; max-width: 380rpx; word-break: break-word; }
.table-capacity { color: #a28778; font-size: 22rpx; margin-top: 7rpx; }
.occupancy-badge { color: #78916c; background: #edf2e8; padding: 10rpx 16rpx; border-radius: 40rpx; font-size: 22rpx; flex-shrink: 0; }
.is-full { color: #a16c62; background: #f5e8e2; }
.round-table-canvas { width: 560rpx; height: 560rpx; position: relative; margin: 20rpx auto 4rpx; }
.table-outline { position: absolute; width: 382rpx; height: 382rpx; border: 1rpx dashed #ead7cb; border-radius: 50%; top: 89rpx; left: 89rpx; }
.table-surface { position: absolute; width: 304rpx; height: 304rpx; left: 128rpx; top: 128rpx; border-radius: 50%; background: #f6e8dd; border: 8rpx solid #fff8f0; box-sizing: border-box; box-shadow: 0 0 0 2rpx #e6ccbb, 0 12rpx 20rpx rgba(106, 61, 44, .08); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.table-decoration { font-size: 26rpx; color: #c59c83; line-height: 1; margin-bottom: 18rpx; }
.table-center-name { font-size: 31rpx; font-weight: 600; color: #82594d; max-width: 218rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-center-count { color: #a16f5e; font-size: 40rpx; margin-top: 10rpx; font-weight: 600; }
.table-center-count text { font-size: 24rpx; font-weight: 400; }
.table-center-flower { color: #bb9480; font-size: 30rpx; margin-top: 14rpx; }
.chair { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 14rpx; box-sizing: border-box; border: 2rpx solid #dbc8bc; font-size: 21rpx; font-weight: 500; }
.chair-empty { background: #fbf7f0; color: #baa699; border-style: dashed; }
.chair-filled { box-shadow: 0 4rpx 8rpx rgba(115, 70, 60, .08); }
.color-rose { background: #d69ca3; border-color: #c38891; color: #fff; }
.color-sage { background: #a2b295; border-color: #8d9e7f; color: #fff; }
.color-sand { background: #d5b48d; border-color: #c49f74; color: #fff; }
.color-mauve { background: #bba2b8; border-color: #a78ca4; color: #fff; }
.color-clay { background: #c9a494; border-color: #b89180; color: #fff; }
.table-legend { display: flex; align-items: center; justify-content: center; color: #b0998a; font-size: 20rpx; margin-bottom: 22rpx; }
.legend-dot { width: 14rpx; height: 14rpx; border-radius: 4rpx; margin-right: 8rpx; margin-left: 18rpx; box-sizing: border-box; }
.legend-filled { background: #d69ca3; }
.legend-empty { border: 1rpx dashed #bca390; }
.legend-family { margin-left: 22rpx; color: #b19d90; }
.seated-guest { display: flex; align-items: center; gap: 12rpx; padding: 20rpx 0; border-top: 1rpx solid #f0e6dd; }
.family-dot { width: 12rpx; height: 36rpx; border-radius: 8rpx; flex-shrink: 0; }
.seated-guest-info { flex: 1; min-width: 0; }
.party-number { color: #a78978; font-size: 22rpx; margin-left: 16rpx; white-space: nowrap; }
.mini-action { color: #967869; font-size: 23rpx; background: transparent; padding: 8rpx 10rpx; line-height: 1.5; margin: 0; flex-shrink: 0; }
.muted-action { color: #b49b8d; }
.table-no-guests { color: #b19b8c; text-align: center; font-size: 23rpx; padding: 8rpx 0 22rpx; }
.table-actions { display: flex; align-items: center; padding-top: 20rpx; border-top: 1rpx solid #f0e6dd; }
.action-spacer { flex: 1; }
.bottom-action { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(252, 248, 243, .96); border-top: 1rpx solid #ece1db; padding: 22rpx 32rpx; padding-bottom: calc(22rpx + env(safe-area-inset-bottom)); z-index: 10; }
.table-empty .muted { font-size: 23rpx; margin-top: 16rpx; }
.empty-table-art { width: 104rpx; height: 104rpx; border-radius: 50%; background: #f2e4d9; border: 4rpx solid #e5cebc; margin: 10rpx auto 34rpx; position: relative; }
.empty-table-art view { position: absolute; width: 24rpx; height: 24rpx; background: #e9d7c9; border-radius: 7rpx; }
.empty-table-art view:nth-child(1) { left: 40rpx; top: -28rpx; }
.empty-table-art view:nth-child(2) { right: -28rpx; top: 40rpx; }
.empty-table-art view:nth-child(3) { left: 40rpx; bottom: -28rpx; }
.empty-table-art view:nth-child(4) { left: -28rpx; top: 40rpx; }
.error-title { font-size: 32rpx; margin-bottom: 18rpx; }
.error-description { margin-bottom: 28rpx; font-size: 26rpx; line-height: 1.7; }
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: rgba(50, 32, 30, .45); z-index: 100; display: flex; align-items: flex-end; }
.modal-sheet { width: 100%; border-radius: 32rpx 32rpx 0 0; box-sizing: border-box; background: #fffcf8; padding: 30rpx 36rpx; padding-bottom: calc(30rpx + env(safe-area-inset-bottom)); }
.modal-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32rpx; }
.modal-title { font-size: 34rpx; color: #5c3e39; font-weight: 600; }
.close-modal { width: 60rpx; height: 60rpx; border-radius: 50%; font-size: 42rpx; padding: 0; line-height: 55rpx; margin: 0; color: #a68778; background: #f4ece4; }
.modal-sheet .field { margin-bottom: 28rpx; }
.modal-sheet .input { font-size: 28rpx; box-sizing: border-box; min-height: 88rpx; background: #f7f1eb; }
.capacity-options { display: flex; gap: 16rpx; }
.capacity-option { flex: 1; margin: 0; color: #9f8271; background: #f7f0e9; border: 2rpx solid #eee1d5; font-size: 25rpx; padding: 20rpx 0 16rpx; line-height: 1.7; border-radius: 16rpx; }
.capacity-option text { display: block; font-size: 40rpx; line-height: 1.5; font-weight: 600; }
.capacity-selected { background: #f7e9e8; border-color: #a85d69; color: #984354; }
.custom-capacity { margin-top: 18rpx; }
.form-note { font-size: 23rpx; color: #ac9383; line-height: 1.8; }
.form-error { margin-top: 18rpx; padding: 20rpx; border-radius: 12rpx; color: #a54e52; background: #f9eae7; font-size: 25rpx; line-height: 1.7; }
.modal-actions { display: flex; gap: 20rpx; margin-top: 30rpx; }
.cancel-button { width: 30%; margin: 0; }
.confirm-button { flex: 1; margin: 0; }
.picker-input { display: flex; justify-content: space-between; align-items: center; line-height: 1.7; }
.picker-input text { color: #a78e7c; margin-left: 14rpx; }
.assignment-note { padding: 22rpx; color: #a0806a; background: #f8f0e6; border-radius: 14rpx; font-size: 25rpx; line-height: 1.8; }
.assignment-ready { color: #617954; background: #f0f3e9; }
.assignment-sheet { max-height: 92vh; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.assignment-heading { flex-shrink: 0; margin: 0; padding: 30rpx 36rpx 24rpx; border-bottom: 1rpx solid #eee1d5; }
.assignment-scroll { height: 58vh; min-height: 0; }
.assignment-body { padding: 4rpx 36rpx 28rpx; }
.assignment-guest-value { width: 100%; min-height: 112rpx; }
.assignment-guest-copy { flex: 1; min-width: 0; }
.assignment-guest-name { color: #5e433e; font-size: 28rpx; line-height: 1.7; white-space: normal; word-break: break-all; }
.assignment-guest-detail { color: #927564; font-size: 24rpx; line-height: 1.7; margin-top: 6rpx; word-break: break-all; }
.assignment-picker-arrow { flex-shrink: 0; }
.assignment-filter-note { margin-bottom: 18rpx; }
.assignment-empty { padding: 24rpx; background: #f7f0e9; border-radius: 16rpx; color: #967869; font-size: 25rpx; line-height: 1.8; }
.table-choice { position: relative; width: 100%; margin: 0 0 18rpx; padding: 22rpx 24rpx; border: 2rpx solid #eaded3; border-radius: 18rpx; text-align: left; background: #fffaf5; font-weight: 400; }
.table-choice::after { border: none; }
.table-choice-selected { background: #f6e9e7; border-color: #a45b67; }
.table-choice-name { color: #62423c; font-size: 28rpx; line-height: 1.7; padding-right: 46rpx; white-space: normal; word-break: break-all; }
.table-choice-availability { color: #627a54; font-size: 27rpx; line-height: 1.7; margin-top: 8rpx; }
.table-choice-availability text { font-size: 34rpx; font-weight: 600; }
.table-choice-details { color: #9a8070; font-size: 23rpx; line-height: 1.7; margin-top: 4rpx; }
.table-choice-mark { position: absolute; top: 27rpx; right: 24rpx; width: 34rpx; height: 34rpx; border: 2rpx solid #dbc5b8; border-radius: 50%; line-height: 30rpx; text-align: center; color: #984354; font-size: 23rpx; }
.table-choice-selected .table-choice-mark { border-color: #984354; background: #984354; color: white; }
.assignment-actions { flex-shrink: 0; margin: 0; padding: 22rpx 36rpx; padding-bottom: calc(22rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #eee1d5; }
.reload-button { margin-top: 18rpx; }

</style>
