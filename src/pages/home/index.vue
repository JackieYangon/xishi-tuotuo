<template>
<view class="container">
  <view class="between brand"><view><text class="brand-name">喜事妥妥</text><view class="muted">一家人，一起把喜事办妥</view></view><button class="family-button" @tap="group">家庭群组 ›</button></view>
  <view v-if="state.loading" class="empty">正在取回婚礼安排…</view>
  <view v-else-if="state.error" class="card empty"><view class="title">暂时未能同步</view><view>{{ state.error }}</view><view class="actions"><button class="button-secondary" @tap="group">选择群组</button><button class="button-primary" @tap="load">再试一次</button></view></view>
  <view v-else-if="!state.group" class="welcome">
    <view class="welcome-seal">囍</view><view class="title"><view>从今天起，</view><view>好好准备我们的婚礼。</view></view><view class="subtitle"><view>邀请另一半和父母，</view><view>一起安排每一件值得期待的小事。</view></view><button class="button-primary" @tap="group">创建或加入婚礼群组</button>
    <view class="welcome-features">备婚事项 · 亲友邀请 · 圆桌排座 · 当天流程</view>
  </view>
  <template v-else>
    <view class="hero"><view class="hero-decoration">囍</view><text class="eyebrow">OUR WEDDING</text><view class="couple">{{ state.group.profile.bride || '新娘' }}<text class="amp"> &amp; </text>{{ state.group.profile.groom || '新郎' }}</view><view class="hero-date">{{ state.group.profile.date || '婚期还在商量中' }} · {{ state.group.profile.venue || '一起期待好日子' }}</view><view class="countdown"><text>{{ state.daysLabel }}</text><view v-if="state.showDays"><text class="days">{{ state.days }}</text><text> 天</text></view></view><button class="hero-link" @tap="invitation">看看我们的请柬 ↗</button></view>
    <view class="card progress-card" @tap="tasks"><view class="between"><view><view class="section-title">筹备进度</view><view class="muted">已完成 {{ state.stats.done }} / {{ state.stats.total }} 件事项</view></view><view class="progress-number">{{ state.stats.percent }}<text>%</text></view></view><view class="progress-track"><view class="progress-fill" :style="'width: ' + (state.stats.percent) + '%;'"></view></view><view class="muted small">每完成一件，离安心的婚礼就近一步</view></view>
    <view class="mini-stats"><view><text>{{ state.group.members.length }}</text> 位家人一起筹备</view><view><text>{{ state.confirmed }}</text> 位亲友确认出席</view></view>
    <view class="between"><view class="section-title">一起准备</view><text class="muted">重要的事，都在这里</text></view>
    <view class="module-grid"><view class="module" v-for="(item, index) in state.modules" :key="item.title" :data-index="(index)" @tap="openModule"><view class="module-icon">{{ item.icon }}</view><view class="module-title">{{ item.title }}</view><view class="module-subtitle">{{ item.subtitle }}</view></view></view>
    <view class="between"><view class="section-title">接下来做什么</view><button class="button-text" @tap="tasks">查看全部 ›</button></view><view class="card upcoming"><view v-if="!state.upcoming.length" class="empty">事项都安排好了，给彼此一个拥抱吧。</view><view v-for="(item, index) in state.upcoming" :key="item.id" class="task-row" @tap="tasks"><view class="task-dot"></view><view class="task-main"><view>{{ item.title }}</view><view class="muted">{{ item.dueDate || '时间待定' }} · {{ item.assignee }}</view></view><text class="muted">›</text></view></view>
  </template>
  <view class="footer">喜事妥妥 · v{{ state.version }}</view>
</view>

</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { updateState } from '../../utils/state';
import service from '../../utils/service';
import imported0 from '../../utils/presentation';
const { progress, countdown } = imported0;
import imported1 from '../../version.json';
const { version } = imported1;
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

export default defineComponent({
  data() { return { state: { version, modules, loading: true, group: null, error: '', stats: {}, upcoming: [], daysLabel: '', days: 0 } as Record<string, any>, runtime: {} as Record<string, any> }; },
onShow() { this.load(); },
async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
 methods: {
async load() {
    updateState(this.state, { loading: true, error: '' });
    if (!service.getGroupId()) {
        updateState(this.state, { loading: false, group: null });
        return;
    }
    try {
        const group = await service.getGroup();
        const days = countdown(group.profile.date);
        const members = Object.fromEntries(group.members.map(member => [member.id, member.nickname]));
        const upcoming = group.tasks.filter(task => !task.done).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 3)
            .map(task => ({ ...task, assignee: members[task.assigneeId] || '待分工' }));
        updateState(this.state, { group, stats: progress(group.tasks), upcoming, days: Math.abs(days || 0),
            daysLabel: days === null ? '一起期待婚礼' : days > 0 ? '距离婚礼还有' : days === 0 ? '今天，我们结婚啦' : '幸福已经开始',
            showDays: days !== null && days !== 0, confirmed: group.guests.filter(g => g.attendance === 'yes').reduce((n, g) => n + g.partySize, 0),
            itemsReady: group.items.filter(item => item.status === 'ready').length });
    }
    catch (error) {
        if (['FORBIDDEN', 'NOT_FOUND', 'GROUP_DELETED'].includes(error.code))
            service.setGroup(null);
        updateState(this.state, { error: error.message, group: null });
    }
    finally {
        updateState(this.state, { loading: false });
    }
},
group() { wx.navigateTo({ url: '/pages/group/index' }); },
openModule(event) {
    const module = modules[event.currentTarget.dataset.index];
    wx.navigateTo({ url: module.type ? '/pages/manage/index?type=' + module.type : '/pages/' + module.path + '/index' });
},
tasks() { wx.navigateTo({ url: '/pages/manage/index?type=tasks' }); },
invitation() { wx.navigateTo({ url: '/pages/invitation/index?mode=preview' }); }
}
});
</script>

<style>
.brand { margin: 6rpx 0 34rpx; }.brand-name { font-size: 40rpx; font-weight: 700; letter-spacing: 3rpx; }.brand .muted { font-size: 23rpx; margin-top: 6rpx; }.family-button { background: #f0e6dd; color: #764b46; font-size: 24rpx; padding: 16rpx 20rpx; border-radius: 100rpx; }
.hero { position: relative; overflow: hidden; min-height: 380rpx; padding: 40rpx; border-radius: 30rpx; background: #88474c; color: #fff6ec; }.eyebrow { font-size: 21rpx; letter-spacing: 5rpx; color: #e0b9ad; }.couple { font-size: 42rpx; font-weight: 600; margin: 24rpx 0 6rpx; position: relative; }.amp { color: #d5ab96; font-family: Georgia,serif; font-style: italic; }.hero-date { color: #ead1c6; font-size: 24rpx; max-width: 500rpx; }.hero-decoration { position: absolute; right: -22rpx; top: -10rpx; font-size: 300rpx; font-family: serif; opacity: .06; }.countdown { margin-top: 32rpx; font-size: 24rpx; }.days { font-size: 72rpx; line-height: 1.3; font-family: Georgia,serif; }.hero-link { position: absolute; right: 30rpx; bottom: 32rpx; background: transparent; color: #f7dfce; font-size: 24rpx; padding: 10rpx; }
.progress-card { margin-top: 24rpx; }.progress-card .section-title { margin: 0 0 5rpx; }.progress-number { font-family: Georgia,serif; font-size: 62rpx; color: #945057; }.progress-number text { font-size: 28rpx; }.progress-track { height: 12rpx; background: #f2e8e1; border-radius: 10rpx; overflow: hidden; margin: 22rpx 0 14rpx; }.progress-fill { height: 100%; background: #a96869; border-radius: 10rpx; transition: width .35s; }.mini-stats { display: flex; justify-content: space-around; font-size: 23rpx; color: #8b7970; }.mini-stats text { font-weight: 600; font-size: 30rpx; color: #805654; margin-right: 6rpx; }
.module-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 18rpx; }.module { background: white; border: 1rpx solid #eee6dd; border-radius: 24rpx; padding: 26rpx; }.module-icon { width: 64rpx; height: 64rpx; border-radius: 20rpx; background: #f7ede6; color: #97575a; text-align: center; line-height: 64rpx; font-family: serif; font-size: 30rpx; }.module-title { font-size: 29rpx; font-weight: 600; margin-top: 14rpx; }.module-subtitle { font-size: 22rpx; color: #9b8880; margin-top: 4rpx; }.task-row { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 0; border-bottom: 1rpx solid #f4ede7; }.task-row:last-child { border: 0; }.task-main { flex: 1; }.task-dot { width: 20rpx; height: 20rpx; border: 2rpx solid #c8a8a0; border-radius: 50%; }.upcoming { padding-top: 4rpx; padding-bottom: 4rpx; }.footer { text-align: center; margin-top: 48rpx; font-size: 22rpx; color: #b5a398; }.welcome { text-align: center; padding: 60rpx 22rpx; }.welcome-seal { background: #954b50; color: #ffe8d5; width: 150rpx; height: 150rpx; line-height: 150rpx; font-size: 80rpx; border-radius: 45rpx; margin: 0 auto 48rpx; font-family: serif; }.welcome .subtitle { line-height: 1.9; margin: 28rpx 0 52rpx; }.welcome-features { font-size: 22rpx; color: #a18c80; margin-top: 32rpx; }

</style>
