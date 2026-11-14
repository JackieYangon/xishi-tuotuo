<template>
<view :class="'container manage-page ' + (state.type === 'guests' && state.pageCount > 1 ? 'manage-page-paginated' : '')">
  <view class="page-heading">
    <view class="eyebrow">一起筹备 · 喜事妥妥</view>
    <view class="title">{{ state.config.title }}</view>
    <view class="subtitle">{{ state.config.subtitle }}</view>
  </view>

  <view v-if="state.loading && !state.allCount" class="card empty">正在整理{{ state.config.title }}…</view>
  <view v-else-if="state.error" class="card empty">
    <view class="error-title">{{ state.noGroup ? '先创建或选择婚礼' : '暂时没有连接上' }}</view>
    <view class="muted error-description">{{ state.error }}</view>
    <button v-if="state.noGroup" class="button-primary" @tap="goGroup">开始筹备</button>
    <button v-else class="button-secondary" @tap="load">重新加载</button>
  </view>
  <template v-else>
    <view class="stats-bar">
      <view class="stat" v-for="(item, index) in state.stats" :key="item.label">
        <view class="stat-value">{{ item.value }}</view>
        <view class="stat-label">{{ item.label }}</view>
      </view>
    </view>
    <view v-if="state.type === 'guests'" class="soft-notice">
      <text>一份名单，安排出席、排桌与住宿。</text>
      <button class="text-action" @tap="goSeats">去排桌 →</button>
    </view>
    <view v-if="state.type === 'lodgings' && state.lodgingUnassigned" class="soft-notice">
      <text>还有 {{ state.lodgingUnassigned }} 位需要住宿的亲友待安排。</text>
    </view>
    <view class="search-box">
      <text class="search-symbol">⌕</text>
      <input class="search-input" :value="(state.query)" :placeholder="(state.config.search)" @input="onSearch" maxlength="80" confirm-type="search" :disabled="state.batchSaving" />
    </view>
    <scroll-view class="filter-scroll" scroll-x enhanced :show-scrollbar="(false)">
      <view class="filter-row">
        <view v-for="(item, index) in state.config.filters" :key="item.value" :class="'filter-chip ' + (state.filter === item.value ? 'filter-active' : '')" :data-value="(item.value)" @tap="onFilter">{{ item.label }}</view>
      </view>
    </scroll-view>
    <view class="list-caption">{{ state.query || state.filter !== 'all' ? '筛选结果' : '全部记录' }} · {{ state.total }} {{ state.type === 'guests' ? '组' : '条' }}<text v-if="state.type === 'guests' && state.total"> · 每页 10 组</text><text v-if="state.loading"> · 更新中</text></view>
    <view v-if="state.batchMode" class="batch-selection-bar">
      <view class="batch-selection-summary">已选 {{ state.batchIds.length }} 组 · {{ state.batchPeople }} 人</view>
      <view class="batch-selection-actions">
        <button class="mini-action" @tap="toggleBatchPage" :disabled="!state.rows.length || state.loading || state.batchSaving">{{ state.batchPageSelected ? '取消本页' : '全选本页' }}</button>
        <button class="mini-action" @tap="selectFilteredGuests" :disabled="!state.total || state.loading || state.batchSaving">全选筛选结果（{{ state.total }} 组）</button>
        <button class="mini-action" @tap="clearBatchSelection" :disabled="!state.batchIds.length || state.batchSaving">清空</button>
      </view>
      <view class="muted batch-hint">可跨页选择；更换搜索或筛选会清空选择。</view>
    </view>

    <view v-if="!state.rows.length" class="card empty">
      <view class="empty-mark">{{ state.allCount ? '⌕' : '＋' }}</view>
      <view>{{ state.allCount ? '没有找到符合条件的记录' : state.config.empty }}</view>
      <view class="muted empty-help">{{ state.allCount ? '换个关键词，或查看其他分类' : state.personal ? '添加你的第一条筹备记录' : '添加后，家人就能一起查看和更新' }}</view>
    </view>

    <view v-for="(item, index) in state.rows" :key="item.id" :class="'card record-card ' + (state.type === 'tasks' && item.done ? 'record-complete' : '')">
      <view class="record-top">
        <checkbox-group v-if="state.batchMode" class="batch-checkbox" :data-id="item.id" @change="toggleBatchGuest">
          <label class="batch-choice"><checkbox :value="item.id" :checked="item.batchChecked" :aria-label="'选择' + item.heading" color="#984354" :disabled="state.loading || state.batchSaving" /></label>
        </checkbox-group>
        <button v-if="state.type === 'tasks'" :class="'check-button ' + (item.done ? 'is-checked' : '')" :data-id="(item.id)" @tap="toggleDone" :disabled="(!!state.pendingId)" :aria-label="(item.done ? '标记未完成' : '标记完成')">{{ item.done ? '✓' : '' }}</button>
        <view class="record-main" :data-id="(item.id)" @tap="openEdit">
          <view class="record-title">{{ item.heading }}</view>
          <view class="record-details">
            <text v-for="(detail, detailIndex) in item.details" :key="detail">{{ detailIndex ? ' · ' : '' }}{{ detail }}</text>
          </view>
        </view>
        <view :class="'record-status ' + (item.statusClass)">{{ item.statusLabel }}</view>
      </view>
      <view v-if="state.type === 'vendors'" class="extra-line">
        <text>{{ item.quoteLabel }}</text>
        <text v-if="item.phone" class="phone-link" :data-phone="(item.phone)" @tap="callVendor">{{ item.phone }}</text>
      </view>
      <view v-if="state.type === 'guests'" class="extra-line">
        <text>{{ item.seatLabel }}</text>
        <text v-if="item.needsLodging" class="small-tag">需住宿</text>
        <text v-if="item.phone" class="muted">{{ item.phone }}</text>
      </view>
      <view v-if="state.type === 'lodgings' && item.guestNames" class="extra-line guest-names">入住：{{ item.guestNames }}</view>
      <view v-if="item.note" class="record-note">{{ item.note }}</view>
      <view v-if="!state.batchMode" class="record-actions">
        <button v-if="state.type === 'items' && item.status !== 'ready'" class="mini-action accent-action" :data-id="(item.id)" @tap="advanceItem" :loading="(state.pendingId === item.id)" :disabled="(!!state.pendingId)">{{ item.status === 'pending' ? '标记已购买' : '标记已备齐' }}</button>
        <view class="action-spacer"></view>
        <button class="mini-action" :data-id="(item.id)" @tap="openEdit" :disabled="(!!state.pendingId)">编辑</button>
        <button class="mini-action delete-action" :data-id="(item.id)" @tap="remove" :disabled="(!!state.pendingId)">删除</button>
      </view>
    </view>

    <view class="bottom-action">
      <view v-if="state.type === 'guests' && state.pageCount > 1" class="guest-pagination">
        <button class="page-button previous-page" :data-page="state.currentPage - 1" @tap="onPageChange" :disabled="state.currentPage <= 1 || state.loading || !!state.pendingId || state.batchSaving">上一页</button>
        <picker class="page-picker" :range="state.pageOptions" :value="state.currentPage - 1" @change="onPagePick" :disabled="state.loading || !!state.pendingId || state.batchSaving">
          <view class="page-position">第 {{ state.currentPage }} / {{ state.pageCount }} 页 <text class="picker-arrow">⌄</text></view>
        </picker>
        <button class="page-button next-page" :data-page="state.currentPage + 1" @tap="onPageChange" :disabled="state.currentPage >= state.pageCount || state.loading || !!state.pendingId || state.batchSaving">下一页</button>
      </view>
      <view v-if="state.batchMode" class="guest-main-actions">
        <button class="button-secondary" @tap="cancelBatch" :disabled="state.batchSaving">退出批量</button>
        <button class="button-primary batch-edit-button" @tap="openBatchEditor" :disabled="!state.batchIds.length || state.loading || state.batchSaving">修改所选（{{ state.batchIds.length }} 组）</button>
      </view>
      <view v-else class="guest-main-actions">
        <button v-if="state.type === 'guests'" class="button-secondary batch-start-button" @tap="startBatch" :disabled="!state.allCount || state.loading || !!state.pendingId">批量修改状态</button>
        <button class="button-primary add-button" @tap="openAdd" :disabled="(state.loading || !!state.pendingId)">＋ 添加{{ state.config.singular }}</button>
      </view>
    </view>
  </template>
</view>

<view v-if="state.editorOpen" class="editor-mask" @tap.stop="closeEditor" @touchmove.stop="stopTap">
  <view class="editor-sheet" @tap.stop="stopTap">
    <view class="editor-heading">
      <view>
        <view class="eyebrow">{{ state.personal ? '个人筹备记录' : '家庭共同维护' }}</view>
        <view class="editor-title">{{ state.editingId ? '编辑' : '添加' }}{{ state.config.singular }}</view>
      </view>
      <button class="close-editor" @tap="closeEditor" :disabled="(state.saving)" aria-label="关闭编辑">×</button>
    </view>
    <scroll-view class="editor-scroll" scroll-y enhanced :show-scrollbar="(false)">
      <view class="editor-body">
        <view v-for="(field, index) in state.fields" :key="field.key" class="field form-field">
          <view class="label">{{ field.label }}<text v-if="field.required" class="required-mark"> *</text></view>
          <input v-if="field.kind === 'text' || field.kind === 'phone' || field.kind === 'number' || field.kind === 'decimal'" class="input form-input" :value="(state.form[field.key])" :type="(field.kind === 'number' || field.kind === 'phone' ? 'number' : field.kind === 'decimal' ? 'digit' : 'text')" :maxlength="(field.kind === 'number' || field.kind === 'decimal' ? 12 : field.max)" :placeholder="(field.placeholder || '请输入')" :data-key="(field.key)" @input="onInput" :disabled="(state.saving)" />
          <textarea v-else-if="field.kind === 'textarea'" class="input form-textarea" :value="(state.form[field.key])" :maxlength="(field.max)" :placeholder="(field.placeholder)" :data-key="(field.key)" @input="onInput" :disabled="(state.saving)" auto-height />
          <view v-else-if="field.kind === 'date' || field.kind === 'time'" class="date-field-row">
            <picker :mode="(field.kind)" :value="(state.form[field.key])" :data-key="(field.key)" @change="onPicker" :disabled="(state.saving)" class="date-picker">
              <view :class="'input picker-value ' + (!state.form[field.key] ? 'placeholder' : '')">{{ state.form[field.key] || (field.kind === 'date' ? '选择日期' : '选择时间') }}<text class="picker-arrow">⌄</text></view>
            </picker>
            <button v-if="!field.required && state.form[field.key]" class="clear-date" :data-key="(field.key)" @tap="clearDate" :disabled="(state.saving)">清除</button>
          </view>
          <picker v-else-if="field.kind === 'select' || field.kind === 'member'" :range="(field.options)" range-key="label" :value="(field.selected)" :data-key="(field.key)" @change="onPicker" :disabled="(state.saving)">
            <view class="input picker-value">{{ field.display }}<text class="picker-arrow">⌄</text></view>
          </picker>
          <view v-else-if="field.kind === 'switch'" class="switch-line">
            <text class="muted">{{ state.form[field.key] ? '是' : '否' }}</text>
            <switch :checked="(state.form[field.key])" :data-key="(field.key)" @change="onSwitch" color="#984354" :disabled="(state.saving)" />
          </view>
          <view v-else-if="field.kind === 'guests'" class="guest-picker">
            <view class="guest-picker-hint">已选择 {{ field.selectedCount }} 人（按宾客同行人数计算）</view>
            <checkbox-group @change="onGuestsChange">
              <label v-for="(guest, index) in field.choices" :key="guest.id" class="guest-choice">
                <checkbox :value="(guest.id)" :checked="(guest.checked)" color="#984354" :disabled="(state.saving)" />
                <view class="guest-choice-name">{{ guest.name }}<text class="guest-choice-detail">{{ guest.partySize }} 人{{ guest.notAttending ? ' · 已确认不出席，可取消分配' : guest.needsLodging ? ' · 需住宿' : ' · 未标记需要住宿，可取消分配' }}</text></view>
              </label>
            </checkbox-group>
            <view v-if="!field.choices.length" class="muted guest-picker-hint">暂无可安排住宿的亲友。请先在宾客名单中勾选“需要安排住宿”，已确认不出席的亲友不会显示。</view>
          </view>
        </view>
        <view v-if="state.draftError" class="draft-error">{{ state.draftError }}</view>
        <button v-if="state.editorConflict" class="button-secondary" @tap="reloadEditor" :disabled="(state.saving)">重新载入最新记录</button>
        <view v-if="state.type === 'guests'" class="muted form-help">人数包含同行亲友。请根据与亲友的确认结果手动更新出席状态；修改人数可能影响已安排的桌位。</view>
      </view>
    </scroll-view>
    <view class="editor-footer">
      <button class="button-secondary cancel-button" @tap="closeEditor" :disabled="(state.saving)">取消</button>
      <button class="button-primary save-button" @tap="save" :loading="(state.saving)" :disabled="(state.saving || state.editorConflict)">{{ state.saving ? '正在保存' : '保存' }}</button>
    </view>
  </view>
</view>

<view v-if="state.batchEditorOpen" class="editor-mask batch-editor-mask" @tap.stop="closeBatchEditor" @touchmove.stop="stopTap">
  <view class="editor-sheet" @tap.stop="stopTap">
    <view class="editor-heading">
      <view><view class="eyebrow">已选择 {{ state.batchIds.length }} 组 · {{ state.batchPeople }} 人</view><view class="editor-title">批量修改状态</view></view>
      <button class="close-editor" @tap="closeBatchEditor" :disabled="state.batchSaving" aria-label="关闭批量修改">×</button>
    </view>
    <scroll-view class="editor-scroll" scroll-y enhanced :show-scrollbar="false">
      <view class="editor-body">
        <scroll-view class="batch-selected-names" scroll-y><view class="batch-names-content">{{ state.batchNames }}</view></scroll-view>
        <view class="muted batch-hint">只修改选定的项目，其余保持原样。</view>
        <view v-for="field in state.batchFields" :key="field.key" class="field form-field">
          <view class="label">{{ field.label }}</view>
          <picker class="batch-field-picker" :range="field.options" range-key="label" :value="field.selected" :data-key="field.key" @change="onBatchPicker" :disabled="state.batchSaving || state.batchConflict">
            <view class="input picker-value">{{ field.display }}<text class="picker-arrow">⌄</text></view>
          </picker>
        </view>
        <view v-if="state.batchForm.attendance === 'no'" class="muted batch-hint">标记为不出席后，会取消所选宾客原有的桌位安排。</view>
        <view v-if="state.batchForm.needsLodging === false || state.batchForm.attendance === 'no'" class="muted batch-hint">已有住宿安排会保留，可到「亲友住宿」调整。</view>
        <view v-if="state.batchError" class="draft-error">{{ state.batchError }}</view>
        <button v-if="state.batchConflict" class="button-secondary batch-restart-button" @tap="restartBatch" :disabled="state.batchSaving || state.loading">重新载入并重新选择</button>
      </view>
    </scroll-view>
    <view class="editor-footer">
      <button class="button-secondary cancel-button" @tap="closeBatchEditor" :disabled="state.batchSaving">返回选择</button>
      <button class="button-primary save-button batch-save-button" @tap="saveBatch" :loading="state.batchSaving" :disabled="state.batchSaving || state.batchConflict || state.loading">{{ state.batchSaving ? '正在保存' : '应用修改' }}</button>
    </view>
  </view>
</view>

</template>

<script lang="ts">
import { defineComponent, nextTick } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';
import catalog from '../../utils/catalog';

const GUEST_PAGE_SIZE = 10;

function makeBatchFields(form) {
    const keep = { value: '', label: '保持原样' };
    return [
        { key: 'attendance', label: '出席状态', options: [keep, ...catalog.guests.fields.find(field => field.key === 'attendance').options] },
        { key: 'needsLodging', label: '住宿需求', options: [keep, { value: true, label: '需要住宿' }, { value: false, label: '不需要住宿' }] },
        { key: 'side', label: '亲友分组', options: [keep, ...catalog.guests.fields.find(field => field.key === 'side').options] }
    ].map(field => {
        const selected = Math.max(0, field.options.findIndex(option => option.value === form[field.key]));
        return { ...field, selected, display: field.options[selected].label };
    });
}

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


export default defineComponent({
  data() { return { state: {
    type: 'tasks', config: catalog.tasks, loading: true, error: '', noGroup: false,
    query: '', filter: 'all', rows: [], stats: [], total: 0, allCount: 0,
    currentPage: 1, pageCount: 1, pageOptions: [],
    batchMode: false, batchEditorOpen: false, batchIds: [], batchPeople: 0, batchNames: '', batchPageSelected: false,
    batchForm: { attendance: '', needsLodging: '', side: '' }, batchFields: [], batchError: '', batchConflict: false, batchSaving: false,
    editorOpen: false, editingId: '', form: {}, fields: [], saving: false,
    pendingId: '', draftError: '', editorConflict: false, lodgingUnassigned: 0
  } as Record<string, any>, runtime: {} as Record<string, any> }; },
onLoad(options) {
    const type = Object.prototype.hasOwnProperty.call(catalog, options.type) ? options.type : 'tasks';
    updateState(this.state, { type, config: catalog[type] });
    wx.setNavigationBarTitle({ title: catalog[type].title });
},
onShow() { this.load(); },
onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
 methods: {
async load() {
    if (this.runtime._loading)
        return;
    this.runtime._loading = true;
    updateState(this.state, { loading: true, error: '', noGroup: false });
    try {
        const group = await service.getGroup();
        if (this.runtime._group && this.runtime._group.id !== group.id) {
            updateState(this.state, { currentPage: 1 });
            this.resetBatch();
        }
        this.runtime._group = group;
        this.runtime._revision = this.runtime._group.revision;
        this.renderRecords();
        if (this.state.editorOpen)
            this.renderFields();
    }
    catch (error) {
        if (['GROUP_DELETED', 'FORBIDDEN', 'NOT_FOUND', 'NO_GROUP'].includes(error.code)) {
            this.resetBatch();
            this.runtime._group = null;
            updateState(this.state, { rows: [], stats: [], form: {}, fields: [], editorOpen: false, noGroup: true, currentPage: 1, pageCount: 1, pageOptions: [], total: 0, allCount: 0 });
        }
        updateState(this.state, { error: error.message || '暂时无法读取，请稍后重试', noGroup: ['NO_GROUP', 'GROUP_DELETED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code) });
    }
    finally {
        this.runtime._loading = false;
        updateState(this.state, { loading: false });
    }
},
async refreshAfterMutation(result) {
    const candidate = result && (result.group || (result.profile ? result : null));
    this.runtime._group = candidate || service.getCachedGroup();
    if (!this.runtime._group)
        this.runtime._group = await service.getGroup();
    this.runtime._revision = this.runtime._group.revision;
    this.renderRecords();
},
renderRecords() {
    const group = this.runtime._group;
    if (!group)
        return;
    const { type, query, filter } = this.state;
    this.state.personal = group.mode === 'personal';
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
        }
        else if (type === 'items') {
            row.statusLabel = optionsText(catalog.items.fields, 'status', record.status);
            row.statusClass = record.status === 'ready' ? 'status-done' : '';
            row.details = ['数量 ' + record.quantity, row.person];
        }
        else if (type === 'vendors') {
            row.statusLabel = optionsText(catalog.vendors.fields, 'status', record.status);
            row.statusClass = record.status === 'booked' ? 'status-done' : '';
            row.details = [record.category || '服务类别未填写', record.contact || '联系人未填写'];
            row.quoteLabel = Number(record.quote) > 0 ? '报价 ¥' + Number(record.quote).toLocaleString('zh-CN') : '报价待确认';
        }
        else if (type === 'guests') {
            row.batchChecked = this.state.batchIds.includes(record.id);
            row.statusLabel = optionsText(catalog.guests.fields, 'attendance', record.attendance);
            row.statusClass = record.attendance === 'yes' ? 'status-done' : record.attendance === 'no' ? 'status-muted' : '';
            const table = (group.tables || []).find(item => item.id === record.tableId);
            row.details = [optionsText(catalog.guests.fields, 'side', record.side), String(record.partySize) + ' 人', record.relation || ''];
            row.seatLabel = table ? table.name : '尚未排桌';
        }
        else if (type === 'timeline') {
            row.statusLabel = record.time;
            row.statusClass = 'status-time';
            row.details = [record.place || '地点待定', row.person];
        }
        else if (type === 'lodgings') {
            const assigned = guests.filter(guest => (record.guestIds || []).includes(guest.id));
            row.statusLabel = assigned.length ? '已分配 ' + countPeople(assigned) + ' 人' : '待分配宾客';
            row.statusClass = assigned.length ? 'status-done' : '';
            row.details = [record.room || '房间待定', dateLabel(record.checkIn) + ' — ' + dateLabel(record.checkOut)];
            row.guestNames = assigned.map(guest => guest.name + (guest.attendance === 'no' ? '（已确认不出席）' : '')).join('、');
            row.searchText += ' ' + row.guestNames.toLowerCase();
        }
        row.details = row.details.filter(Boolean);
        return row;
    }).filter(row => {
        if (query && !row.searchText.includes(query.trim().toLowerCase()))
            return false;
        if (filter === 'all')
            return true;
        if (filter === 'mine')
            return row.assigneeId === group.selfId;
        if (type === 'tasks')
            return filter === 'overdue' ? row.overdue : filter === 'done' ? row.done : !row.done;
        if (type === 'items' || type === 'vendors')
            return row.status === filter;
        if (type === 'guests')
            return filter === 'lodging' ? row.needsLodging && row.attendance !== 'no' : row.attendance === filter;
        if (type === 'lodgings')
            return !(row.guestIds || []).length;
        return true;
    });
    if (type === 'tasks')
        rows.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    if (type === 'timeline')
        rows.sort((a, b) => a.time.localeCompare(b.time));
    if (type === 'lodgings')
        rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    let stats;
    if (type === 'tasks') {
        const completed = source.filter(item => item.done).length;
        stats = [{ label: '全部事项', value: source.length }, { label: '已经完成', value: completed }, { label: '完成进度', value: (source.length ? Math.round(completed / source.length * 100) : 0) + '%' }];
    }
    else if (type === 'guests') {
        stats = [{ label: '受邀亲友', value: countPeople(source) + ' 人' }, { label: '确认出席', value: countPeople(source.filter(guest => guest.attendance === 'yes')) + ' 人' }, { label: '待确认', value: source.filter(guest => guest.attendance === 'pending').length + ' 组' }];
    }
    else if (type === 'items') {
        stats = [{ label: '物品种类', value: source.length }, { label: '已经买好', value: source.filter(item => item.status === 'ordered').length }, { label: '全部备齐', value: source.filter(item => item.status === 'ready').length }];
    }
    else if (type === 'vendors') {
        stats = [{ label: '候选商家', value: source.length }, { label: '已经沟通', value: source.filter(item => item.status === 'contacted').length }, { label: '已经预订', value: source.filter(item => item.status === 'booked').length }];
    }
    else if (type === 'timeline') {
        stats = [{ label: '当天环节', value: source.length }, { label: '已分工', value: source.filter(item => item.assigneeId).length }, { label: '待分工', value: source.filter(item => !item.assigneeId).length }];
    }
    else {
        const assignedIds = source.reduce((ids, lodging) => ids.concat(lodging.guestIds || []), []);
        const unassigned = guests.filter(guest => guest.needsLodging && guest.attendance !== 'no' && !assignedIds.includes(guest.id));
        stats = [{ label: '住宿安排', value: source.length }, { label: '已安排亲友', value: countPeople(guests.filter(guest => assignedIds.includes(guest.id))) + ' 人' }, { label: '待安排', value: countPeople(unassigned) + ' 人' }];
        updateState(this.state, { lodgingUnassigned: countPeople(unassigned) });
    }
    const total = rows.length;
    this.runtime._filteredGuestIds = type === 'guests' ? rows.map(row => row.id) : [];
    const pageCount = type === 'guests' ? Math.max(1, Math.ceil(total / GUEST_PAGE_SIZE)) : 1;
    const currentPage = Math.min(Math.max(1, this.state.currentPage), pageCount);
    const visibleRows = type === 'guests' ? rows.slice((currentPage - 1) * GUEST_PAGE_SIZE, currentPage * GUEST_PAGE_SIZE) : rows;
    updateState(this.state, {
        rows: visibleRows, stats, total, allCount: source.length, currentPage, pageCount,
        batchPageSelected: visibleRows.length > 0 && visibleRows.every(row => this.state.batchIds.includes(row.id)),
        batchPeople: countPeople(guests.filter(guest => this.state.batchIds.includes(guest.id))),
        batchNames: guests.filter(guest => this.state.batchIds.includes(guest.id)).map(guest => guest.name).join('、'),
        pageOptions: type === 'guests' ? Array.from({ length: pageCount }, (_, index) => '第 ' + (index + 1) + ' 页') : []
    });
},
onSearch(event) {
    if (this.state.batchSaving || this.state.batchEditorOpen) return;
    const query = event.detail.value;
    if (query !== this.state.query) this.clearBatchSelection();
    updateState(this.state, { query, currentPage: 1 }); this.renderRecords();
},
onFilter(event) {
    if (this.state.batchSaving || this.state.batchEditorOpen) return;
    const filter = event.currentTarget.dataset.value;
    if (filter !== this.state.filter) this.clearBatchSelection();
    updateState(this.state, { filter, currentPage: 1 }); this.renderRecords();
},
scrollToGuestList() {
    nextTick(() => wx.pageScrollTo({ scrollTop: 0, duration: 200 }));
},
goToPage(value) {
    if (this.state.type !== 'guests' || this.state.loading || this.state.saving || this.state.pendingId || this.state.editorOpen || this.state.batchEditorOpen || this.state.batchSaving)
        return;
    const requested = Number(value);
    if (!Number.isInteger(requested))
        return;
    const currentPage = Math.min(Math.max(1, requested), this.state.pageCount);
    if (currentPage === this.state.currentPage)
        return;
    updateState(this.state, { currentPage });
    this.renderRecords();
    this.scrollToGuestList();
},
onPageChange(event) { this.goToPage(event.currentTarget.dataset.page); },
onPagePick(event) { this.goToPage(Number(event.detail.value) + 1); },
resetBatch() {
    this.runtime._batchEpoch = (this.runtime._batchEpoch || 0) + 1;
    updateState(this.state, {
        batchMode: false, batchEditorOpen: false, batchIds: [], batchPeople: 0, batchNames: '', batchPageSelected: false,
        batchForm: { attendance: '', needsLodging: '', side: '' }, batchFields: [], batchError: '', batchConflict: false, batchSaving: false
    });
    delete this.runtime._batchRevision;
    delete this.runtime._batchGroupId;
},
startBatch() {
    if (this.state.type !== 'guests' || !this.runtime._group || this.state.loading || this.state.saving || this.state.pendingId || this.state.editorOpen || this.state.batchMode)
        return;
    this.resetBatch();
    this.runtime._batchRevision = this.runtime._revision;
    this.runtime._batchGroupId = this.runtime._group.id;
    updateState(this.state, { batchMode: true, batchFields: makeBatchFields(this.state.batchForm) });
    this.renderRecords();
},
cancelBatch() {
    if (this.state.batchSaving) return;
    this.resetBatch();
    this.renderRecords();
},
canSelectBatch() {
    return this.state.batchMode && !this.state.loading && !this.state.batchSaving && !this.state.batchEditorOpen;
},
toggleBatchGuest(event) {
    if (!this.canSelectBatch()) return;
    const id = event.currentTarget.dataset.id;
    if (!(this.runtime._group.guests || []).some(guest => guest.id === id)) return;
    const selected = this.state.batchIds.includes(id);
    updateState(this.state, { batchIds: selected ? this.state.batchIds.filter(value => value !== id) : this.state.batchIds.concat(id) });
    this.renderRecords();
},
toggleBatchPage() {
    if (!this.canSelectBatch()) return;
    const ids = this.state.rows.map(row => row.id);
    const batchIds = this.state.batchPageSelected
        ? this.state.batchIds.filter(id => !ids.includes(id))
        : [...new Set([...this.state.batchIds, ...ids])];
    updateState(this.state, { batchIds });
    this.renderRecords();
},
selectFilteredGuests() {
    if (!this.canSelectBatch()) return;
    updateState(this.state, { batchIds: [...(this.runtime._filteredGuestIds || [])] });
    this.renderRecords();
},
clearBatchSelection() {
    if (!this.state.batchMode || this.state.batchSaving || this.state.batchEditorOpen) return;
    updateState(this.state, { batchIds: [] });
    this.renderRecords();
},
openBatchEditor() {
    if (!this.canSelectBatch() || !this.state.batchIds.length) return;
    updateState(this.state, { batchEditorOpen: true, batchFields: makeBatchFields(this.state.batchForm) });
},
closeBatchEditor() {
    if (this.state.batchSaving) return;
    updateState(this.state, { batchEditorOpen: false });
},
onBatchPicker(event) {
    if (!this.state.batchEditorOpen || this.state.batchSaving || this.state.batchConflict) return;
    const key = event.currentTarget.dataset.key;
    const field = this.state.batchFields.find(item => item.key === key);
    const option = field && field.options[Number(event.detail.value)];
    if (!option) return;
    updateState(this.state, { ['batchForm.' + key]: option.value, batchError: '' });
    updateState(this.state, { batchFields: makeBatchFields(this.state.batchForm) });
},
async restartBatch() {
    if (this.state.batchSaving || this.state.loading) return;
    await this.load();
    if (this.state.error || !this.runtime._group) return;
    this.resetBatch();
    updateState(this.state, { currentPage: 1 });
    this.startBatch();
    this.scrollToGuestList();
},
async saveBatch() {
    if (!this.state.batchMode || this.state.batchSaving || this.state.batchConflict || this.state.loading) return;
    if (!this.state.batchIds.length) {
        updateState(this.state, { batchError: '请先选择要修改的宾客' });
        return;
    }
    const changes = {};
    for (const key of ['attendance', 'needsLodging', 'side']) {
        if (this.state.batchForm[key] !== '') changes[key] = this.state.batchForm[key];
    }
    if (!Object.keys(changes).length) {
        updateState(this.state, { batchError: '请至少选择一项要修改的状态' });
        return;
    }
    const batchEpoch = this.runtime._batchEpoch;
    const batchGroupId = this.runtime._batchGroupId;
    updateState(this.state, { batchSaving: true, batchError: '' });
    try {
        if (service.getGroupId() !== batchGroupId) {
            const error = Object.assign(new Error('当前婚礼已切换，请重新选择宾客'), { code: 'GROUP_CHANGED' });
            throw error;
        }
        const guestIds = [...this.state.batchIds];
        const result = await service.mutate('guests.batchUpdate', { guestIds, changes }, this.runtime._batchRevision);
        if (this.runtime._batchEpoch !== batchEpoch) return;
        if (service.getGroupId() !== batchGroupId) {
            this.resetBatch();
            await this.load();
            return;
        }
        await this.refreshAfterMutation(result);
        if (this.runtime._batchEpoch !== batchEpoch) return;
        this.resetBatch();
        this.renderRecords();
        wx.showToast({ title: '已修改 ' + guestIds.length + ' 组', icon: 'success' });
    }
    catch (error) {
        if (this.runtime._batchEpoch !== batchEpoch) return;
        updateState(this.state, { batchError: error.message || '保存失败，选择和修改内容已保留，请重试' });
        if (['CONFLICT', 'REVISION_CONFLICT'].includes(error.code)) {
            updateState(this.state, { batchConflict: true });
            await this.load();
            if (this.state.batchMode) updateState(this.state, { batchError: '名单已被更新，本次未覆盖任何记录。你的选择和修改内容已保留，请重新载入并重新选择。' });
        }
        else if (['GROUP_CHANGED', 'GROUP_DELETED', 'FORBIDDEN', 'NOT_FOUND', 'NO_GROUP'].includes(error.code)) {
            this.resetBatch();
            await this.load();
            wx.showToast({ title: error.message, icon: 'none' });
        }
    }
    finally {
        if (this.runtime._batchEpoch === batchEpoch) updateState(this.state, { batchSaving: false });
    }
},
openAdd() {
    if (!this.runtime._group || this.state.saving || this.state.pendingId || this.state.batchMode)
        return;
    const form = JSON.parse(JSON.stringify(this.state.config.defaults));
    if (this.state.type === 'lodgings') {
        form.checkIn = this.runtime._group.profile.date || localDate();
        const date = new Date(form.checkIn + 'T12:00:00');
        date.setDate(date.getDate() + 1);
        form.checkOut = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    }
    this.runtime._editorRevision = this.runtime._revision;
    updateState(this.state, { form, editingId: '', editorOpen: true, draftError: '', editorConflict: false });
    this.renderFields();
},
openEdit(event) {
    if (this.state.batchMode) { this.toggleBatchGuest(event); return; }
    if (this.state.saving || this.state.pendingId)
        return;
    const record = (this.runtime._group[this.state.type] || []).find(item => item.id === event.currentTarget.dataset.id);
    if (!record)
        return;
    const form = {};
    Object.keys(this.state.config.defaults).forEach(key => { form[key] = record[key] === undefined ? this.state.config.defaults[key] : record[key]; });
    this.runtime._editorRevision = this.runtime._revision;
    updateState(this.state, { form: JSON.parse(JSON.stringify(form)), editingId: record.id, editorOpen: true, draftError: '', editorConflict: false });
    this.renderFields();
},
renderFields() {
    const group = this.runtime._group;
    if (!group)
        return;
    const fields = this.state.config.fields.map(field => {
        const result = Object.assign({}, field, { value: this.state.form[field.key] });
        if (field.kind === 'member')
            result.options = [{ value: '', label: '暂不分配' }].concat((group.members || []).map(member => ({ value: member.id, label: member.nickname })));
        if (field.kind === 'member' || field.kind === 'select') {
            result.selected = Math.max(0, result.options.findIndex(item => item.value === result.value));
            result.display = result.options[result.selected].label;
        }
        if (field.kind === 'guests') {
            result.choices = (group.guests || []).filter(guest => (guest.needsLodging && guest.attendance !== 'no') || (result.value || []).includes(guest.id)).map(guest => ({
                id: guest.id, name: guest.name, partySize: guest.partySize,
                needsLodging: guest.needsLodging, notAttending: guest.attendance === 'no', checked: (result.value || []).includes(guest.id)
            }));
            result.selectedCount = countPeople((group.guests || []).filter(guest => (result.value || []).includes(guest.id)));
        }
        return result;
    });
    updateState(this.state, { fields });
},
onInput(event) {
    if (this.state.saving)
        return;
    updateState(this.state, { ['form.' + event.currentTarget.dataset.key]: event.detail.value, draftError: '' });
},
onPicker(event) {
    if (this.state.saving)
        return;
    const key = event.currentTarget.dataset.key;
    const field = this.state.fields.find(item => item.key === key);
    const value = field.kind === 'select' || field.kind === 'member' ? field.options[Number(event.detail.value)].value : event.detail.value;
    updateState(this.state, { ['form.' + key]: value, draftError: '' });
    this.renderFields();
},
clearDate(event) {
    if (this.state.saving)
        return;
    updateState(this.state, { ['form.' + event.currentTarget.dataset.key]: '', draftError: '' });
    this.renderFields();
},
onSwitch(event) {
    if (this.state.saving)
        return;
    updateState(this.state, { ['form.' + event.currentTarget.dataset.key]: event.detail.value, draftError: '' });
},
onGuestsChange(event) {
    if (this.state.saving)
        return;
    updateState(this.state, { 'form.guestIds': event.detail.value, draftError: '' });
    this.renderFields();
},
closeEditor() {
    if (this.state.saving)
        return;
    updateState(this.state, { editorOpen: false, draftError: '' });
},
stopTap() { },
validateForm() {
    const record: Record<string, any> = {};
    for (const key of Object.keys(this.state.config.defaults)) {
        const value = this.state.form[key];
        record[key] = typeof value === 'string' ? value.trim() : value;
    }
    for (const field of this.state.config.fields) {
        const value = record[field.key];
        if (field.required && (value === '' || value === undefined || value === null))
            throw new Error('请填写' + field.label);
        if (field.kind === 'number' || field.kind === 'decimal') {
            const numeric = value === '' ? 0 : Number(value);
            if (!Number.isFinite(numeric) || numeric < field.min || numeric > field.max || (field.kind === 'number' && !Number.isInteger(numeric))) {
                throw new Error(field.label + '应为 ' + field.min + ' 至 ' + field.max + (field.kind === 'number' ? ' 的整数' : ' 之间的数字'));
            }
            record[field.key] = numeric;
        }
    }
    if (this.state.type === 'lodgings' && record.checkOut <= record.checkIn)
        throw new Error('退房日期应晚于入住日期');
    if (this.state.editingId)
        record.id = this.state.editingId;
    return record;
},
async save() {
    if (this.state.saving || this.state.editorConflict || this.state.batchMode)
        return;
    let record;
    try {
        record = this.validateForm();
    }
    catch (error) {
        updateState(this.state, { draftError: error.message });
        return;
    }
    updateState(this.state, { saving: true, draftError: '' });
    try {
        const result = await service.mutate('records.save', { type: this.state.type, record }, this.runtime._editorRevision);
        await this.refreshAfterMutation(result);
        if (this.state.type === 'guests' && !this.state.editingId) {
            updateState(this.state, {
                query: '', filter: 'all',
                currentPage: Math.max(1, Math.ceil((this.runtime._group.guests || []).length / GUEST_PAGE_SIZE))
            });
            this.renderRecords();
            this.scrollToGuestList();
        }
        updateState(this.state, { editorOpen: false });
        wx.showToast({ title: '已保存', icon: 'success' });
    }
    catch (error) {
        updateState(this.state, { draftError: error.message || '保存失败，内容已保留，请重试' });
        if (error.code === 'CONFLICT' || error.code === 'REVISION_CONFLICT') {
            updateState(this.state, { editorConflict: true });
            await this.load();
            updateState(this.state, { draftError: '其他成员更新了群组，你的填写内容已保留。请先重新载入最新记录，再编辑保存，避免覆盖家人的修改。' });
        }
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
async reloadEditor() {
    if (this.state.saving)
        return;
    const answer = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => wx.showModal({
        title: '重新载入最新记录', content: '重新载入会放弃当前未保存的填写内容，并打开家人更新后的记录。是否继续？',
        confirmText: '重新载入', success: resolve, fail: () => resolve({ confirm: false, cancel: true, content: String(), errMsg: '' })
    }));
    if (!answer.confirm)
        return;
    const id = this.state.editingId;
    updateState(this.state, { saving: true });
    try {
        this.runtime._group = await service.getGroup();
        this.runtime._revision = this.runtime._group.revision;
        this.renderRecords();
        updateState(this.state, { saving: false });
        if (id && !(this.runtime._group[this.state.type] || []).some(record => record.id === id)) {
            updateState(this.state, { editorOpen: false });
            wx.showToast({ title: '这条记录已被删除', icon: 'none' });
        }
        else if (id)
            this.openEdit({ currentTarget: { dataset: { id } } });
        else
            this.openAdd();
    }
    catch (error) {
        updateState(this.state, { draftError: error.message || '重新载入失败，当前内容仍保留' });
    }
    finally {
        updateState(this.state, { saving: false });
    }
},
async toggleDone(event) {
    if (this.state.pendingId || this.state.saving)
        return;
    const item = (this.runtime._group.tasks || []).find(record => record.id === event.currentTarget.dataset.id);
    const expectedRevision = this.runtime._revision;
    if (!item)
        return;
    const record: Record<string, any> = { id: item.id };
    Object.keys(catalog.tasks.defaults).forEach(key => { record[key] = item[key] === undefined ? catalog.tasks.defaults[key] : item[key]; });
    record.done = !record.done;
    updateState(this.state, { pendingId: item.id });
    try {
        await this.refreshAfterMutation(await service.mutate('records.save', { type: 'tasks', record }, expectedRevision));
    }
    catch (error) {
        service.showError(error);
        await this.load();
    }
    finally {
        updateState(this.state, { pendingId: '' });
    }
},
async advanceItem(event) {
    if (this.state.pendingId || this.state.saving)
        return;
    const item = (this.runtime._group.items || []).find(record => record.id === event.currentTarget.dataset.id);
    const expectedRevision = this.runtime._revision;
    if (!item || item.status === 'ready')
        return;
    const record: Record<string, any> = { id: item.id };
    Object.keys(catalog.items.defaults).forEach(key => { record[key] = item[key] === undefined ? catalog.items.defaults[key] : item[key]; });
    record.status = item.status === 'pending' ? 'ordered' : 'ready';
    updateState(this.state, { pendingId: item.id });
    try {
        await this.refreshAfterMutation(await service.mutate('records.save', { type: 'items', record }, expectedRevision));
        wx.showToast({ title: record.status === 'ready' ? '物品已备齐' : '已标记购买', icon: 'success' });
    }
    catch (error) {
        service.showError(error);
        await this.load();
    }
    finally {
        updateState(this.state, { pendingId: '' });
    }
},
async remove(event) {
    if (this.state.pendingId || this.state.saving || this.state.batchMode)
        return;
    const id = event.currentTarget.dataset.id;
    const record = (this.runtime._group[this.state.type] || []).find(item => item.id === id);
    const expectedRevision = this.runtime._revision;
    if (!record)
        return;
    const response = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(resolve => wx.showModal({
        title: '删除' + this.state.config.singular,
        content: '确定删除“' + (record.title || record.name || record.hotel) + '”吗？' + (this.state.type === 'guests' ? '该宾客的排桌和住宿关联也将清除。' : this.state.personal ? '' : '群组成员也会同步看到此次修改。'),
        confirmText: '删除', confirmColor: '#a64050', success: resolve, fail: () => resolve({ confirm: false, cancel: true, content: String(), errMsg: '' })
    }));
    if (!response.confirm)
        return;
    updateState(this.state, { pendingId: id });
    try {
        await this.refreshAfterMutation(await service.mutate('records.delete', { type: this.state.type, id }, expectedRevision));
        wx.showToast({ title: '已删除', icon: 'success' });
    }
    catch (error) {
        service.showError(error);
        await this.load();
    }
    finally {
        updateState(this.state, { pendingId: '' });
    }
},
callVendor(event) {
    const phoneNumber = event.currentTarget.dataset.phone;
    if (phoneNumber)
        wx.makePhoneCall({ phoneNumber, fail: () => { } });
},
goGroup() { wx.navigateTo({ url: '/pages/group/index' }); },
goSeats() { wx.navigateTo({ url: '/pages/seating/index' }); }
}
});
</script>

<style>
.manage-page { padding-bottom: 190rpx; }
.manage-page-paginated { padding-bottom: 290rpx; }
.page-heading { padding: 12rpx 0 30rpx; }
.eyebrow { color: #a26570; font-size: 22rpx; letter-spacing: 3rpx; margin-bottom: 12rpx; }
.stats-bar { display: flex; padding: 28rpx 8rpx; background: #f2e8e4; border-radius: 24rpx; margin-bottom: 24rpx; }
.stat { flex: 1; text-align: center; border-right: 1rpx solid #e4d4ce; }
.stat:last-child { border: 0; }
.stat-value { color: #843c4b; font-size: 36rpx; font-weight: 600; }
.stat-label { color: #937970; font-size: 22rpx; margin-top: 10rpx; }
.soft-notice { display: flex; align-items: center; justify-content: space-between; color: #8a6b62; font-size: 24rpx; margin: 12rpx 0 24rpx; line-height: 1.7; }
.text-action { background: transparent; color: #984354; font-size: 24rpx; padding: 0 0 0 12rpx; margin: 0; line-height: 1.6; flex-shrink: 0; }
.text-action::after, .mini-action::after, .check-button::after, .close-editor::after, .clear-date::after { border: none; }
.search-box { display: flex; align-items: center; background: #fff; border: 1rpx solid #ecdfd9; border-radius: 18rpx; padding: 0 24rpx; height: 88rpx; }
.search-symbol { font-size: 40rpx; color: #ab8f84; margin-right: 14rpx; }
.search-input { flex: 1; font-size: 26rpx; color: #453b37; }
.filter-scroll { width: 100%; margin: 24rpx 0 16rpx; white-space: nowrap; }
.filter-row { display: inline-flex; padding: 2rpx 0 8rpx; }
.filter-chip { display: inline-block; background: #eee6e0; color: #896d62; border-radius: 40rpx; font-size: 24rpx; padding: 14rpx 26rpx; margin-right: 12rpx; }
.filter-active { color: #fffaf6; background: #984354; }
.list-caption { font-size: 22rpx; color: #9a847a; margin: 0 0 20rpx 4rpx; }
.record-card { margin-bottom: 20rpx; padding: 28rpx; }
.record-top { display: flex; align-items: flex-start; gap: 16rpx; }
.record-main { min-width: 0; flex: 1; }
.record-title { font-size: 30rpx; font-weight: 600; color: #4f3937; line-height: 1.5; word-break: break-all; }
.record-complete .record-title { color: #95877f; text-decoration: line-through; }
.record-details { font-size: 23rpx; color: #9a8177; line-height: 1.8; margin-top: 7rpx; }
.record-status { flex-shrink: 0; color: #a2794e; background: #faf0e2; font-size: 21rpx; line-height: 1.5; padding: 7rpx 13rpx; border-radius: 10rpx; max-width: 170rpx; }
.status-done { color: #56785e; background: #edf2e9; }
.status-urgent { color: #b04d4f; background: #f8e8e5; }
.status-muted { color: #9a938e; background: #f1efed; }
.status-time { font-size: 28rpx; color: #984354; background: #f5e9e9; font-weight: 600; }
.check-button { flex-shrink: 0; width: 44rpx; height: 44rpx; min-width: 44rpx; border-radius: 50%; border: 2rpx solid #d9c8be; background: #fffdfb; padding: 0; line-height: 40rpx; color: #fff; font-size: 28rpx; margin: 2rpx 0 0; }
.is-checked { background: #8a9a7a; border-color: #8a9a7a; }
.record-note { font-size: 24rpx; color: #8a766f; line-height: 1.7; background: #faf7f3; padding: 16rpx 20rpx; border-radius: 12rpx; margin-top: 20rpx; white-space: pre-wrap; word-break: break-word; }
.extra-line { display: flex; align-items: center; flex-wrap: wrap; gap: 18rpx; color: #887064; font-size: 24rpx; margin-top: 18rpx; line-height: 1.6; }
.phone-link { color: #984354; }
.small-tag { color: #96714c; background: #f7efdf; border-radius: 6rpx; padding: 1rpx 9rpx; font-size: 21rpx; }
.record-actions { display: flex; align-items: center; margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid #f1eae4; gap: 8rpx; }
.mini-action { background: transparent; padding: 8rpx 14rpx; margin: 0; line-height: 1.4; color: #8e776d; font-size: 24rpx; border-radius: 10rpx; }
.accent-action { color: #984354; background: #f7edeb; }
.delete-action { color: #b39b93; }
.action-spacer { flex: 1; }
.empty-mark { font-size: 56rpx; color: #c0a297; margin-bottom: 20rpx; }
.empty-help { font-size: 24rpx; margin-top: 14rpx; }
.error-title { font-size: 32rpx; color: #735149; margin-bottom: 18rpx; }
.error-description { margin-bottom: 30rpx; line-height: 1.8; }
.bottom-action { position: fixed; left: 0; right: 0; bottom: 0; padding: 22rpx 32rpx; padding-bottom: calc(22rpx + env(safe-area-inset-bottom)); background: rgba(252, 248, 243, .96); border-top: 1rpx solid #ece1db; z-index: 10; }
.guest-pagination { display: flex; align-items: center; gap: 16rpx; margin-bottom: 18rpx; }
.guest-main-actions { display: flex; gap: 16rpx; }
.guest-main-actions > button { flex: 1; min-width: 0; white-space: nowrap; padding-left: 14rpx; padding-right: 14rpx; }
.batch-selection-bar { background: #f3eae4; border-radius: 18rpx; padding: 22rpx; margin-bottom: 24rpx; }
.batch-selection-summary { color: #843c4b; font-size: 27rpx; font-weight: 600; }
.batch-selection-actions { display: flex; flex-wrap: wrap; gap: 6rpx; margin: 10rpx -12rpx 0; }
.batch-selection-actions .mini-action { color: #984354; }
.batch-hint { font-size: 23rpx; line-height: 1.7; margin-top: 12rpx; }
.batch-checkbox { flex-shrink: 0; padding-top: 4rpx; }
.batch-choice { display: flex; align-items: center; min-height: 60rpx; }
.batch-selected-names { width: 100%; height: 130rpx; color: #6f574e; font-size: 25rpx; line-height: 1.8; background: #f7f2ed; border-radius: 14rpx; word-break: break-all; }
.batch-names-content { padding: 18rpx; }
.page-button { margin: 0; padding: 0 24rpx; line-height: 68rpx; border-radius: 14rpx; font-size: 25rpx; color: #984354; background: #f2e8e4; flex-shrink: 0; }
.page-button::after { border: none; }
.page-button[disabled] { color: #b5a59b; background: #f3eee8; }
.page-picker { flex: 1; min-width: 0; }
.page-position { display: flex; align-items: center; justify-content: center; gap: 10rpx; color: #896d62; font-size: 24rpx; line-height: 68rpx; white-space: nowrap; }
.add-button { width: 100%; }
.editor-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: rgba(50, 32, 30, .45); z-index: 100; display: flex; align-items: flex-end; }
.editor-sheet { width: 100%; max-height: 92vh; border-radius: 34rpx 34rpx 0 0; background: #fffcf8; overflow: hidden; display: flex; flex-direction: column; }
.editor-heading { display: flex; align-items: center; justify-content: space-between; padding: 32rpx 36rpx 26rpx; border-bottom: 1rpx solid #eee4de; }
.editor-title { font-size: 36rpx; font-weight: 600; color: #543c39; }
.close-editor { font-size: 48rpx; width: 64rpx; height: 64rpx; line-height: 58rpx; background: #f3ece6; color: #a07d72; padding: 0; margin: 0; border-radius: 50%; }
.editor-scroll { height: 62vh; }
.editor-body { padding: 28rpx 36rpx 40rpx; }
.form-field { margin-bottom: 28rpx; }
.required-mark { color: #b05766; }
.form-input { box-sizing: border-box; height: 88rpx; width: 100%; font-size: 28rpx; background: #f7f2ed; color: #493d38; }
.form-textarea { box-sizing: border-box; min-height: 140rpx; width: 100%; padding: 24rpx; background: #f7f2ed; color: #493d38; font-size: 28rpx; line-height: 1.6; }
.date-field-row { display: flex; align-items: center; gap: 12rpx; }
.date-picker { flex: 1; }
.picker-value { display: flex; align-items: center; justify-content: space-between; min-height: 88rpx; box-sizing: border-box; background: #f7f2ed; font-size: 28rpx; }
.picker-arrow { color: #aa8e80; font-size: 30rpx; }
.placeholder { color: #b09d91; }
.clear-date { padding: 0 14rpx; margin: 0; font-size: 24rpx; color: #9b7c70; background: transparent; }
.switch-line { display: flex; justify-content: space-between; align-items: center; min-height: 74rpx; padding: 0 8rpx; font-size: 26rpx; }
.guest-picker { border: 1rpx solid #ece1d8; border-radius: 16rpx; padding: 12rpx 20rpx; }
.guest-picker-hint { font-size: 23rpx; color: #aa8c7b; line-height: 1.7; padding: 10rpx 0 18rpx; }
.guest-choice { display: flex; align-items: center; padding: 20rpx 0; border-top: 1rpx solid #f0e9e2; }
.guest-choice-name { font-size: 28rpx; margin-left: 12rpx; color: #5c4840; }
.guest-choice-detail { display: block; color: #a38b7b; margin-top: 5rpx; font-size: 23rpx; }
.draft-error { background: #faeae6; color: #a84f4f; font-size: 25rpx; border-radius: 12rpx; padding: 20rpx; line-height: 1.7; margin: 12rpx 0; }
.form-help { font-size: 23rpx; line-height: 1.7; margin-top: 18rpx; }
.editor-footer { display: flex; gap: 20rpx; padding: 22rpx 36rpx; padding-bottom: calc(22rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #eee4de; }
.cancel-button { width: 30%; margin: 0; }
.save-button { flex: 1; margin: 0; }

</style>
