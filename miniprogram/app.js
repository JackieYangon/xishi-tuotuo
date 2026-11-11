const config = require('./config.local');
App({
  globalData: { cloudReady: false, cloud: null, ready: null },
  onLaunch() {
    this.globalData.ready = this.initializeCloud();
  },
  async initializeCloud() {
    if (!wx.cloud || !config.envId || config.envId.includes('YOUR_')) return false;
    try {
      const client = config.resourceAppid ? new wx.cloud.Cloud({ resourceAppid: config.resourceAppid, resourceEnv: config.envId }) : wx.cloud;
      await client.init(config.resourceAppid ? {} : { env: config.envId, traceUser: true });
      this.globalData.cloud = client;
      this.globalData.cloudReady = true;
      return true;
    } catch (_) { this.globalData.cloudReady = false; return false; }
  }
});
