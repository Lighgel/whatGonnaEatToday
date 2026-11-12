const { request } = require("../../utils/request");
const { wgs84ToGcj02 } = require("../../utils/geo");
const { openBadge, tripLabel, originLabel } = require("../../utils/format");

const MAX_REROLLS = 3;
const FOOD_QUICK = ["火锅", "烧烤", "海鲜", "日料", "面"];

function shapeResults(results) {
  return (results || []).map((item, index) => {
    const place = item.place || {};
    const dishes = (place.dishes || []).slice(0, 3).map((dish) => dish.name);
    const sub = [
      place.amapRating != null ? String(place.amapRating) : "",
      place.amapCost != null ? `¥${place.amapCost}` : "",
      place.openTime || "",
      place.area || "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      ...item,
      id: place.id,
      index: String(index + 1).padStart(2, "0"),
      trip: tripLabel(item),
      openBadge: openBadge(place.openTime),
      sub,
      dishes: dishes.join(" · "),
    };
  });
}

Page({
  data: {
    location: "",
    keywords: "",
    mood: "",
    cityBias: "大连",
    radiusKm: "3",
    radii: [
      { value: "", label: "不限" },
      { value: "1", label: "1 km" },
      { value: "3", label: "3 km" },
      { value: "5", label: "5 km" },
      { value: "8", label: "8 km" },
    ],
    foods: FOOD_QUICK,
    results: [],
    origin: null,
    originText: "",
    weatherHint: "",
    nearby: true,
    error: "",
    shareHint: "",
    lat: null,
    lng: null,
    fromIp: false,
    locating: false,
    busy: "",
    primaryLabel: "找收藏",
    amapLabel: "搜高德",
    showMore: false,
    fillMissing: 0,
    libraryTotal: 0,
    missingCoords: 0,
    mapShops: [],
    mapNote: "",
    mapBusy: false,
    rerolls: 0,
    rerollLabel: "",
    seenIds: [],
  },
  onShow() {
    wx.startAccelerometer({ interval: "normal" });
    this.refreshPrimary();
    request("/api/places/enrich")
      .then((stats) => this.setData({ fillMissing: stats.missing || 0, libraryTotal: stats.total || 0 }))
      .catch(() => undefined);
  },
  onHide() {
    wx.stopAccelerometer();
  },
  onUnload() {
    wx.stopAccelerometer();
  },
  onAccelerometerChange(res) {
    if (this.data.busy || this.data.locating) return;
    const mag = Math.hypot(res.x, res.y, res.z);
    if (mag > 22) this.spin();
  },
  refreshPrimary() {
    let primaryLabel = "找收藏";
    if (this.data.locating || this.data.busy === "here") primaryLabel = "在找…";
    const amapLabel = this.data.mapBusy ? "在搜…" : "搜高德";
    this.setData({ primaryLabel, amapLabel });
  },
  onLocation(event) {
    const location = event.detail.value;
    const patch = { location };
    if (location.trim() !== "我的位置") {
      patch.lat = null;
      patch.lng = null;
      patch.fromIp = false;
    }
    this.setData(patch);
    this.refreshPrimary();
  },
  onKeywords(event) {
    this.setData({ keywords: event.detail.value });
    this.refreshPrimary();
  },
  onMood(event) {
    this.setData({ mood: event.detail.value });
  },
  onCity(event) {
    this.setData({ cityBias: event.detail.value });
  },
  setFood(event) {
    const value = event.currentTarget.dataset.value;
    this.setData({ keywords: this.data.keywords === value ? "" : value });
    this.refreshPrimary();
  },
  onRadius(event) {
    const radiusKm = event.currentTarget.dataset.value;
    this.setData({ radiusKm });
    if (!this.data.location.trim() && this.data.lat == null) return;
    this.ask({
      here: this.data.lat != null || this.data.fromIp || this.data.location.trim() === "我的位置",
      radiusKm,
    });
  },
  toggleMore() {
    this.setData({ showMore: !this.data.showMore });
  },
  searchHere() {
    const typed = (this.data.location || "").trim();
    if (typed && typed !== "我的位置") {
      this.ask({ location: typed, here: true, dropGps: true, fromIp: false });
      return;
    }
    this.useGps();
  },
  useGps() {
    this.setData({ locating: true, error: "" });
    this.refreshPrimary();
    wx.getLocation({
      type: "wgs84",
      success: (pos) => {
        this.setData({
          lat: pos.latitude,
          lng: pos.longitude,
          location: "我的位置",
          fromIp: false,
          locating: false,
        });
        this.ask({
          lat: pos.latitude,
          lng: pos.longitude,
          location: "我的位置",
          here: true,
          fromIp: false,
        });
      },
      fail: () => {
        const typed = (this.data.location || "").trim();
        if (typed && typed !== "我的位置") {
          this.setData({ locating: false });
          this.ask({ location: typed, here: true, dropGps: true, fromIp: false });
          return;
        }
        this.setData({ location: "我的位置", lat: null, lng: null, fromIp: false });
        this.ask({ location: "我的位置", here: true, dropGps: true, fromIp: false });
      },
    });
  },
  pick() {
    this.ask({});
  },
  daily() {
    this.ask({ daily: true, here: this.hasHere() });
  },
  spin() {
    const now = Date.now();
    if (this.lastSpinAt && now - this.lastSpinAt < 2500) return;
    this.lastSpinAt = now;
    wx.vibrateShort({ type: "medium" });
    this.ask({ spin: true, here: this.hasHere() });
  },
  reroll() {
    if (this.data.rerolls >= MAX_REROLLS) return;
    this.ask({ extraExclude: this.data.seenIds, here: this.hasHere() });
  },
  hasHere() {
    return this.data.lat != null || this.data.fromIp || (this.data.location || "").trim() === "我的位置";
  },
  ask(extra) {
    const dropGps = extra.dropGps === true;
    const loc = extra.location != null ? extra.location : this.data.location;
    const fromIp = loc === "我的位置" && (extra.fromIp != null ? extra.fromIp : this.data.fromIp);
    const daily = extra.daily === true;
    const spin = extra.spin === true;
    const here = extra.here === true;
    const radius = extra.radiusKm != null ? extra.radiusKm : this.data.radiusKm;
    const extraExclude = extra.extraExclude || [];
    this.setData({
      error: "",
      shareHint: "",
      mapShops: [],
      mapNote: "",
      busy: spin ? "spin" : daily ? "daily" : here ? "here" : "pick",
      locating: here && this.data.locating,
    });
    this.refreshPrimary();
    wx.showLoading({ title: spin ? "在转…" : daily ? "在定…" : "在挑…" });
    request("/api/recommend", {
      method: "POST",
      data: {
        mood: this.data.mood,
        keywords: this.data.keywords,
        location: loc || undefined,
        radiusKm: ((loc || "").trim() || this.data.lat != null) && radius ? Number(radius) : undefined,
        lat: dropGps ? undefined : extra.lat != null ? extra.lat : this.data.lat,
        lng: dropGps ? undefined : extra.lng != null ? extra.lng : this.data.lng,
        here,
        daily,
        spin,
        fromIp: fromIp || undefined,
        cityBias: this.data.cityBias.trim() || undefined,
        excludeIds: extraExclude,
      },
    })
      .then((data) => {
        wx.hideLoading();
        this.setData({ locating: false, busy: "" });
        if (data.error) {
          this.setData({
            results: [],
            error: data.error,
            origin: null,
            originText: "",
            weatherHint: (data.weather && data.weather.hint) || "",
          });
          this.refreshPrimary();
          return;
        }
        const origin = data.origin || null;
        const results = shapeResults(data.results);
        const rerolls = extraExclude.length ? this.data.rerolls + 1 : 0;
        this.setData({
          results,
          origin,
          originText: origin ? originLabel(origin) : "",
          nearby: data.nearby !== false,
          weatherHint: (data.weather && data.weather.hint) || "",
          missingCoords: data.missingCoords || 0,
          error: results.length
            ? ""
            : data.missingCoords
              ? `${data.missingCoords} 家没坐标`
              : "没有店",
          fromIp: Boolean(origin && origin.fromIp),
          location: origin && origin.fromIp ? "我的位置" : this.data.location,
          lat: origin && origin.fromIp ? origin.lat : this.data.lat,
          lng: origin && origin.fromIp ? origin.lng : this.data.lng,
          rerolls,
          rerollLabel: rerolls >= MAX_REROLLS ? "换完了" : "换一批",
          seenIds: extraExclude.length
            ? [...new Set([...this.data.seenIds, ...results.map((item) => item.id)])]
            : results.map((item) => item.id),
        });
        this.refreshPrimary();
        if (data.nearby === false && origin) this.loadMapShops();
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ error: error.message, locating: false, busy: "" });
        this.refreshPrimary();
      });
  },
  loadMapShops() {
    this.setData({ mapBusy: true, mapNote: "" });
    this.refreshPrimary();
    const params = [];
    if (this.data.lat != null && this.data.lng != null) {
      params.push(`lat=${this.data.lat}`, `lng=${this.data.lng}`);
    } else if (this.data.origin) {
      params.push(`lat=${this.data.origin.lat}`, `lng=${this.data.origin.lng}`);
    } else if ((this.data.location || "").trim() && this.data.location !== "我的位置") {
      params.push(`near=${encodeURIComponent(this.data.location.trim())}`);
    } else {
      params.push("near=我的位置");
    }
    if (this.data.radiusKm) params.push(`radiusKm=${this.data.radiusKm}`);
    if (this.data.cityBias.trim()) params.push(`city=${encodeURIComponent(this.data.cityBias.trim())}`);
    if ((this.data.keywords || "").trim()) params.push(`q=${encodeURIComponent(this.data.keywords.trim())}`);
    request(`/api/map-shops?${params.join("&")}`)
      .then((data) => {
        this.setData({
          mapShops: data.shops || [],
          mapNote: data.error || data.note || "",
          mapBusy: false,
        });
        this.refreshPrimary();
      })
      .catch(() => {
        this.setData({ mapNote: "地图店没拉到。", mapBusy: false });
        this.refreshPrimary();
      });
  },
  saveMapShop(event) {
    const poiId = event.currentTarget.dataset.id;
    const shop = this.data.mapShops.find((item) => item.poiId === poiId);
    if (!shop) return;
    request("/api/places", { method: "POST", data: { shop } })
      .then((data) => {
        if (data.error) {
          this.setData({ mapNote: data.error });
          return;
        }
        this.setData({
          mapShops: this.data.mapShops.filter((item) => item.poiId !== poiId),
          mapNote: `已收入 ${shop.name}`,
        });
      })
      .catch(() => this.setData({ mapNote: "没存上。" }));
  },
  copyShare() {
    const names = this.data.results.map((item) => item.place.name).join("、");
    wx.setClipboardData({
      data: names,
      success: () => this.setData({ shareHint: "店名已复制，发给朋友就能看到这几家。" }),
    });
  },
  openMap(event) {
    const row = this.data.results.find((item) => item.id === event.currentTarget.dataset.id);
    const shop = this.data.mapShops.find((item) => item.poiId === event.currentTarget.dataset.id);
    const place = row ? row.place : shop;
    if (!place || place.lat == null || place.lng == null) {
      wx.showToast({ title: "这家还没有坐标", icon: "none" });
      return;
    }
    const gcj = wgs84ToGcj02(place.lat, place.lng);
    wx.openLocation({
      latitude: gcj.lat,
      longitude: gcj.lng,
      name: place.name,
      address: place.address || place.area || place.label || "",
    });
  },
  mark(event) {
    const { id, status } = event.currentTarget.dataset;
    const row = this.data.results.find((item) => item.id === id);
    if (!row) return;
    const place = { ...row.place, status };
    request("/api/places", { method: "POST", data: { place } })
      .then(() => {
        if (status === "skip") {
          this.setData({ results: this.data.results.filter((item) => item.id !== id) });
        }
      })
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },
  visited(event) {
    const id = event.currentTarget.dataset.id;
    request("/api/visits", { method: "POST", data: { placeId: id, keep: "want" } }).catch((error) =>
      wx.showToast({ title: error.message, icon: "none" }),
    );
  },
  goPlaces() {
    wx.switchTab({ url: "/pages/places/places" });
  },
});
