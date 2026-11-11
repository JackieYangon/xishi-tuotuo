const service = require('../../utils/service');
const { progress, countdown } = require('../../utils/presentation');
const { version } = require('../../version');
const modules = [
  { type: 'tasks', icon: '✓', title: '备婚事项', subtitle: '一件件，安心完成' },
  { type: 'items', icon: '礼', title: '物品清单', subtitle: '买好、备齐、不遗漏' },
  { type: 'vendors', icon: '约', title: '婚礼商家', subtitle: '联系与报价放一起' },
  { type: 'guests', icon: '客', title: '亲友宾客', subtitle: '请柬与出席回复' },
  { path: 'seating', icon: '圆', title: '圆桌排座', subtitle: '每一位，都有好位置' },
  { type: 'timeline', icon: '时', title: '当天流程', subtitle: '把重要时刻安排好' },
  { type: 'lodgings', icon: '宿', title: '亲友住宿', subtitle: '远道而来，妥帖安顿' },
  { path: 'export', icon: '表', title: '导出与分享', subtitle: '交给家人和婚礼团队' }
];
Page({
  data: { version, modules, loading: true, group: null, error: '', stats: {}, upcoming: [], daysLabel: '', days: 0 },
  onShow() { this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() {
    this.setData({ loading: true, error: '' });
    if (!service.getGroupId()) { this.setData({ loading: false, group: null }); return; }
    try {
      const group = await service.getGroup();
      const days = countdown(group.profile.date);
      const members = Object.fromEntries(group.members.map(member => [member.id, member.nickname]));
      const upcoming = group.tasks.filter(task => !task.done).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 3)
        .map(task => ({ ...task, assignee: members[task.assigneeId] || '待分工' }));
      this.setData({ group, stats: progress(group.tasks), upcoming, days: Math.abs(days || 0),
        daysLabel: days === null ? '一起期待婚礼' : days > 0 ? '距离婚礼还有' : days === 0 ? '今天，我们结婚啦' : '幸福已经开始',
        showDays: days !== null && days !== 0, confirmed: group.guests.filter(g => g.attendance === 'yes').reduce((n, g) => n + g.partySize, 0),
        itemsReady: group.items.filter(item => item.status === 'ready').length });
    } catch (error) {
      if (['FORBIDDEN', 'NOT_FOUND'].includes(error.code)) service.setGroup(null);
      this.setData({ error: error.message, group: null });
    } finally { this.setData({ loading: false }); }
  },
  group() { wx.navigateTo({ url: '/pages/group/index' }); },
  openModule(event) {
    const module = modules[event.currentTarget.dataset.index];
    wx.navigateTo({ url: module.type ? '/pages/manage/index?type=' + module.type : '/pages/' + module.path + '/index' });
  },
  tasks() { wx.navigateTo({ url: '/pages/manage/index?type=tasks' }); },
  invitation() { wx.navigateTo({ url: '/pages/invitation/index?mode=preview' }); }
});
