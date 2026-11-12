const { request } = require("../../utils/request");

Page({
  data: {
    apiBase: "http://127.0.0.1:3847",
    note: "",
    error: "",
    glmKey: "",
    speechReady: false,
    speechTail: "",
    speechNote: "",
    speechError: "",
    speechBusy: false,
  },
  onShow() {
    const app = getApp();
    this.setData({ apiBase: app.globalData.apiBase, note: "", error: "" });
    this.loadSpeechKey();
  },
  loadSpeechKey() {
    request("/api/speech/key")
      .then((data) => {
        this.setData({
          speechReady: Boolean(data.configured),
          speechTail: data.tail || "",
        });
      })
      .catch(() => undefined);
  },
  onGlmKey(event) {
    this.setData({ glmKey: event.detail.value });
  },
  saveGlmKey() {
    const key = (this.data.glmKey || "").trim();
    if (!key) {
      this.setData({ speechError: "先贴上智谱 API Key。", speechNote: "" });
      return;
    }
    this.setData({ speechBusy: true, speechError: "", speechNote: "" });
    request("/api/speech/key", { method: "POST", data: { key } })
      .then((data) => {
        if (data.error) {
          this.setData({ speechBusy: false, speechError: data.error, speechNote: "" });
          return;
        }
        this.setData({
          speechBusy: false,
          glmKey: "",
          speechReady: true,
          speechTail: data.tail || "",
          speechNote: "已接上",
          speechError: "",
        });
      })
      .catch((error) => this.setData({ speechBusy: false, speechError: error.message, speechNote: "" }));
  },
  onBase(event) {
    this.setData({ apiBase: event.detail.value });
  },
  save() {
    const apiBase = this.data.apiBase.trim().replace(/\/$/, "") || "http://127.0.0.1:3847";
    getApp().globalData.apiBase = apiBase;
    wx.setStorageSync("apiBase", apiBase);
    this.setData({ apiBase, note: "已保存。", error: "" });
  },
  ping() {
    this.save();
    request("/api/health")
      .then((data) => {
        if (!data.ok) {
          this.setData({ error: "接口有回应，但不是店库。", note: "" });
          return;
        }
        const lan = (data.lan || []).join("、");
        this.setData({
          note: lan ? `已连通。电脑局域网：${lan}` : "已连通本机店库。",
          error: "",
        });
      })
      .catch((error) => this.setData({ error: error.message, note: "" }));
  },
});
