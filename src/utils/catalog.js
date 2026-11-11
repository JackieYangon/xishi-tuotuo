const option = (value, label) => ({ value, label });
const member = { key: 'assigneeId', label: '负责人', kind: 'member' };
const note = { key: 'note', label: '补充说明', kind: 'textarea', max: 1000, placeholder: '把需要大家知道的细节写在这里' };

const catalog = {
  tasks: {
    title: '事项清单', subtitle: '一件件完成，把期待慢慢变成现实。', singular: '事项',
    empty: '添加第一件待办，一起开始筹备吧', search: '搜索事项、负责人或备注',
    filters: [option('all', '全部'), option('pending', '待完成'), option('done', '已完成'), option('mine', '我负责'), option('overdue', '已到期')],
    fields: [
      { key: 'title', label: '事项名称', kind: 'text', required: true, max: 100, placeholder: '例如：确认婚宴菜单' },
      { key: 'dueDate', label: '计划完成日期', kind: 'date' }, member,
      { key: 'done', label: '已经完成', kind: 'switch' }, note
    ],
    defaults: { title: '', dueDate: '', assigneeId: '', done: false, note: '' }
  },
  items: {
    title: '婚礼物品', subtitle: '从采购到带齐，每一份心意都有着落。', singular: '物品',
    empty: '喜糖、红包、礼服……把要准备的物品记下来', search: '搜索物品、负责人或备注',
    filters: [option('all', '全部'), option('pending', '待准备'), option('ordered', '已购买'), option('ready', '已备齐')],
    fields: [
      { key: 'name', label: '物品名称', kind: 'text', required: true, max: 100, placeholder: '例如：伴手礼' },
      { key: 'quantity', label: '数量', kind: 'number', required: true, min: 1, max: 99999 },
      { key: 'status', label: '准备状态', kind: 'select', options: [option('pending', '待准备'), option('ordered', '已购买 / 待到货'), option('ready', '已备齐')] },
      member, note
    ],
    defaults: { name: '', quantity: 1, status: 'pending', assigneeId: '', note: '' }
  },
  vendors: {
    title: '商家联系', subtitle: '把联系人、方案与约定放在一起。', singular: '商家',
    empty: '添加酒店、摄影师或婚庆联系人', search: '搜索商家、类别或联系人',
    filters: [option('all', '全部'), option('pending', '待联系'), option('contacted', '已沟通'), option('booked', '已预订')],
    fields: [
      { key: 'name', label: '商家名称', kind: 'text', required: true, max: 100, placeholder: '填写酒店或商家名称' },
      { key: 'category', label: '服务类别', kind: 'text', max: 40, placeholder: '酒店、婚庆、摄影、摄像、化妆、司仪…' },
      { key: 'contact', label: '联系人', kind: 'text', max: 50, placeholder: '怎么称呼对方' },
      { key: 'phone', label: '联系电话', kind: 'phone', max: 30, placeholder: '手机或座机号码' },
      { key: 'quote', label: '商家报价（元，可选）', kind: 'decimal', min: 0, max: 99999999, placeholder: '仅记录该商家的报价，方便比较' },
      { key: 'status', label: '沟通进度', kind: 'select', options: [option('pending', '待联系'), option('contacted', '已沟通'), option('booked', '已预订')] }, note
    ],
    defaults: { name: '', category: '', contact: '', phone: '', quote: 0, status: 'pending', note: '' }
  },
  guests: {
    title: '宾客名单', subtitle: '每一位重要的人，都安排得妥妥当当。', singular: '宾客',
    empty: '从最亲近的人开始，添加第一位宾客', search: '搜索姓名、关系或电话',
    filters: [option('all', '全部'), option('pending', '待回复'), option('yes', '确认出席'), option('no', '不出席'), option('lodging', '需住宿')],
    fields: [
      { key: 'name', label: '宾客 / 家庭名称', kind: 'text', required: true, max: 60, placeholder: '例如：王叔叔一家' },
      { key: 'side', label: '亲友分组', kind: 'select', options: [option('groom', '男方亲友'), option('bride', '女方亲友'), option('shared', '共同亲友')] },
      { key: 'relation', label: '关系', kind: 'text', max: 40, placeholder: '亲戚、同事、同学、朋友…' },
      { key: 'phone', label: '联系电话', kind: 'phone', max: 30, placeholder: '方便婚礼当天联系' },
      { key: 'partySize', label: '出席人数（含同行亲友）', kind: 'number', required: true, min: 1, max: 30 },
      { key: 'attendance', label: '出席状态', kind: 'select', options: [option('pending', '待回复'), option('yes', '确认出席'), option('no', '不出席')] },
      { key: 'needsLodging', label: '需要安排住宿', kind: 'switch' }, note
    ],
    defaults: { name: '', side: 'shared', relation: '', phone: '', partySize: 1, attendance: 'pending', needsLodging: false, note: '', tableId: '' }
  },
  timeline: {
    title: '当天流程', subtitle: '知道下一步，安心享受这一天。', singular: '流程',
    empty: '从化妆、接亲到仪式，排好当天的时间表', search: '搜索环节、地点或负责人',
    filters: [option('all', '全部流程'), option('mine', '我负责')],
    fields: [
      { key: 'time', label: '开始时间', kind: 'time', required: true },
      { key: 'title', label: '环节名称', kind: 'text', required: true, max: 100, placeholder: '例如：迎宾 / 婚礼仪式' },
      { key: 'place', label: '地点', kind: 'text', max: 100, placeholder: '酒店宴会厅、新娘家…' },
      member, note
    ],
    defaults: { time: '09:00', title: '', place: '', assigneeId: '', note: '' }
  },
  lodgings: {
    title: '亲友住宿', subtitle: '远道而来的亲友，也能安心落脚。', singular: '住宿安排',
    empty: '安排酒店和房间，迎接远道而来的亲友', search: '搜索酒店、房号或入住人',
    filters: [option('all', '全部安排'), option('unassigned', '未分配宾客')],
    fields: [
      { key: 'hotel', label: '酒店名称', kind: 'text', required: true, max: 100, placeholder: '填写入住酒店' },
      { key: 'room', label: '房间 / 房型', kind: 'text', max: 40, placeholder: '例如：1208 / 双床房' },
      { key: 'checkIn', label: '入住日期', kind: 'date', required: true },
      { key: 'checkOut', label: '退房日期', kind: 'date', required: true },
      { key: 'guestIds', label: '入住宾客', kind: 'guests' }, note
    ],
    defaults: { hotel: '', room: '', checkIn: '', checkOut: '', guestIds: [], note: '' }
  }
};

export default catalog;
