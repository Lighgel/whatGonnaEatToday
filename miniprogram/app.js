App({
  onLaunch() {
    const stored = wx.getStorageSync("apiBase");
    this.globalData.apiBase = stored || "http://127.0.0.1:3847";
  },
  globalData: {
    apiBase: "http://127.0.0.1:3847",
  },
});
