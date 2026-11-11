'use strict';

const CATEGORIES = [
  { value: 'all', label: '全部筹备资料' }, { value: 'overview', label: '婚礼简况' },
  { value: 'tasks', label: '事项清单' }, { value: 'items', label: '物品清单' },
  { value: 'vendors', label: '商家联系' }, { value: 'guests', label: '宾客名单' },
  { value: 'seating', label: '座位安排' }, { value: 'timeline', label: '当天流程' },
  { value: 'lodgings', label: '住宿安排' }
];
const labels = {
  sides: { bride: '女方亲友', groom: '男方亲友', shared: '共同亲友' },
  attendance: { pending: '待回复', yes: '确认出席', no: '不出席' },
  items: { pending: '待准备', ordered: '已购买 / 待到货', ready: '已备齐' },
  vendors: { pending: '待联系', contacted: '已沟通', booked: '已预订' }
};
const array = value => Array.isArray(value) ? value.filter(entry => entry && typeof entry === 'object') : [];
const value = entry => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean' ? String(entry) : '';
const size = guest => Number.isInteger(guest.partySize) && guest.partySize > 0 ? guest.partySize : 1;
const sum = guests => guests.reduce((total, guest) => total + size(guest), 0);

function buildSheets(group, options) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error('请先创建或加入婚礼群组');
  options = options || {};
  const category = options.category || 'all';
  if (!CATEGORIES.some(entry => entry.value === category)) throw new Error('请选择有效的导出类别');
  const phones = options.includePhones === true;
  const notes = options.includeNotes === true;
  const guests = array(group.guests);
  const members = array(group.members);
  const tables = array(group.tables);
  const lodgings = array(group.lodgings);
  const tasks = array(group.tasks);
  const profile = group.profile && typeof group.profile === 'object' ? group.profile : {};
  const memberName = id => { const member = members.find(entry => entry.id === id); return member ? value(member.nickname) : '未分工'; };
  const tableName = guest => { const table = tables.find(entry => entry.id === guest.tableId); return table && guest.attendance !== 'no' ? value(table.name) : '未排桌'; };
  const lodgingNames = id => lodgings.filter(room => Array.isArray(room.guestIds) && room.guestIds.includes(id)).map(room => [value(room.hotel), value(room.room)].filter(Boolean).join(' / ')).join('；');
  const sheets = [];
  function add(key, name, headers, rows, widths) {
    if (category === 'all' || category === key) sheets.push({ name, rows: [headers].concat(rows), widths });
  }
  function optional(headers, rows, records, reply) {
    if (phones) { headers.push('联系电话'); rows.forEach((row, index) => row.push(value(records[index].phone))); }
    if (notes) {
      headers.push('内部备注'); rows.forEach((row, index) => row.push(value(records[index].note)));
      if (reply) { headers.push('回执留言'); rows.forEach((row, index) => row.push(value(records[index].replyNote))); }
    }
    return { headers, rows };
  }
  const completed = tasks.filter(task => task.done === true).length;
  add('overview', '婚礼简况', ['项目', '内容'], [
    ['婚礼名称', value(profile.title)], ['新娘', value(profile.bride)], ['新郎', value(profile.groom)],
    ['婚礼日期', value(profile.date)], ['婚礼场地', value(profile.venue)], ['详细地址', value(profile.address)],
    ['筹备成员', members.map(member => [value(member.nickname), value(member.role)].filter(Boolean).join(' · ')).join('；')],
    ['事项完成', completed + ' / ' + tasks.length], ['筹备进度', (tasks.length ? Math.round(completed / tasks.length * 100) : 0) + '%'],
    ['受邀人数（含同行）', sum(guests)], ['确认出席人数', sum(guests.filter(guest => guest.attendance === 'yes'))],
    ['待回复人数', sum(guests.filter(guest => guest.attendance !== 'yes' && guest.attendance !== 'no'))]
  ], [25, 65]);
  const taskHeaders = ['事项', '截止日期', '负责人', '状态'];
  const taskRows = tasks.map(task => [value(task.title), value(task.dueDate), memberName(task.assigneeId), task.done ? '已完成' : '待完成']);
  if (notes) { taskHeaders.push('内部备注'); taskRows.forEach((row, index) => row.push(value(tasks[index].note))); }
  add('tasks', '事项清单', taskHeaders, taskRows);
  const items = array(group.items);
  const itemHeaders = ['物品', '数量', '准备状态', '负责人'];
  const itemRows = items.map(item => [value(item.name), value(item.quantity), labels.items[item.status] || '待准备', memberName(item.assigneeId)]);
  if (notes) { itemHeaders.push('内部备注'); itemRows.forEach((row, index) => row.push(value(items[index].note))); }
  add('items', '物品清单', itemHeaders, itemRows);
  const vendors = array(group.vendors);
  const vendor = optional(['商家', '服务类别', '联系人', '报价（元）', '联系状态'], vendors.map(entry => [value(entry.name), value(entry.category), value(entry.contact), value(entry.quote), labels.vendors[entry.status] || '待联系']), vendors);
  add('vendors', '商家联系', vendor.headers, vendor.rows);
  const guest = optional(['宾客 / 家庭', '亲友分组', '关系', '人数（含同行）', '出席状态', '需要住宿', '桌位', '住宿安排'], guests.map(entry => [value(entry.name), labels.sides[entry.side] || '共同亲友', value(entry.relation), size(entry), labels.attendance[entry.attendance] || '待回复', entry.needsLodging ? '是' : '否', tableName(entry), lodgingNames(entry.id)]), guests, true);
  add('guests', '宾客名单', guest.headers, guest.rows);
  const seatHeaders = ['桌名', '容量', '已安排人数', '剩余座位', '宾客 / 家庭', '人数（含同行）', '出席状态'];
  if (phones) seatHeaders.push('联系电话');
  if (notes) seatHeaders.push('内部备注', '回执留言');
  const seatRows = [];
  function seatRow(base, guest) {
    const row = base.concat(guest ? [value(guest.name), size(guest), labels.attendance[guest.attendance] || '待回复'] : ['', '', '']);
    if (phones) row.push(guest ? value(guest.phone) : '');
    if (notes) row.push(guest ? value(guest.note) : '', guest ? value(guest.replyNote) : '');
    seatRows.push(row);
  }
  tables.forEach(table => {
    const seated = guests.filter(entry => entry.tableId === table.id && entry.attendance !== 'no');
    const used = sum(seated);
    const capacity = Number.isFinite(table.capacity) ? table.capacity : 0;
    const base = [value(table.name), capacity, used, Math.max(0, capacity - used)];
    if (seated.length) seated.forEach(entry => seatRow(base, entry));
    else seatRow(base);
  });
  guests.filter(entry => entry.attendance !== 'no' && !tables.some(table => table.id === entry.tableId)).forEach(entry => seatRow(['未排桌', '', '', ''], entry));
  add('seating', '座位安排', seatHeaders, seatRows);
  const timeline = array(group.timeline).slice().sort((a, b) => value(a.time).localeCompare(value(b.time)));
  const timelineHeaders = ['时间', '环节', '地点', '负责人'];
  const timelineRows = timeline.map(entry => [value(entry.time), value(entry.title), value(entry.place), memberName(entry.assigneeId)]);
  if (notes) { timelineHeaders.push('内部备注'); timelineRows.forEach((row, index) => row.push(value(timeline[index].note))); }
  add('timeline', '当天流程', timelineHeaders, timelineRows);
  const roomHeaders = ['酒店', '房间 / 房型', '入住日期', '退房日期', '入住宾客', '安排人数（含同行）'];
  if (phones) roomHeaders.push('宾客联系电话');
  if (notes) roomHeaders.push('内部备注');
  const roomRows = lodgings.map(room => {
    const ids = Array.isArray(room.guestIds) ? room.guestIds : [];
    const assigned = guests.filter(entry => ids.includes(entry.id));
    const row = [value(room.hotel), value(room.room), value(room.checkIn), value(room.checkOut), assigned.map(entry => value(entry.name) + (entry.attendance === 'no' ? '（不出席）' : '')).join('、'), sum(assigned)];
    if (phones) row.push(assigned.filter(entry => entry.phone).map(entry => value(entry.name) + '：' + value(entry.phone)).join('；'));
    if (notes) row.push(value(room.note));
    return row;
  });
  add('lodgings', '住宿安排', roomHeaders, roomRows);
  return sheets;
}

module.exports = { buildSheets, CATEGORIES };
