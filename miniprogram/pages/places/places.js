const { request, apiBase } = require("../../utils/request");
const { wgs84ToGcj02 } = require("../../utils/geo");
const { formatDistance, ratingLabel } = require("../../utils/format");

function shopNamesFromText(text) {
  const lines = String(text || "")
    .split(/[\n\r,，、;；]+/)
    .map((line) => line.replace(/^[\d\s.、]+/, "").trim())
    .filter((line) => /[\u4e00-\u9fff]{2,}/.test(line) && line.length <= 20);
  const unique = [];
  lines.forEach((line) => {
    if (!unique.includes(line)) unique.push(line);
  });
  return unique.slice(0, 8);
}

function splitSpokenShops(text) {
  const parts = String(text || "")
    .split(/[，,、。；;\n]+|(?:然后|还有|以及)/)
    .map((part) => part.replace(/^(是|叫|这家|那家|一个|一家)/, "").trim())
    .filter((part) => part.length >= 2);
  const unique = [];
  parts.forEach((part) => {
    if (!unique.includes(part)) unique.push(part);
  });
  const names = unique.length ? unique : [String(text || "").trim()];
  return names.filter((part) => part.length >= 2).slice(0, 8);
}

Page({
  data: {
    q: "",
    near: "",
    radiusKm: "3",
    radii: [
      { value: "1", label: "1 km" },
      { value: "3", label: "3 km" },
      { value: "5", label: "5 km" },
      { value: "8", label: "8 km" },
    ],
    places: [],
    geoNote: "",
    error: "",
    lat: null,
    lng: null,
    nearby: true,
    missingCoords: 0,
    fill: { missing: 0, filled: 0, unmatched: 0, total: 0 },
    enriching: false,
    shopQuery: "",
    shopHits: [],
    shopBusy: false,
    shopMessage: "",
    savingPoi: "",
    listening: false,
    reading: false,
  },
  onShow() {
    this.load();
    this.loadFill();
  },
  onQ(event) {
    this.setData({ q: event.detail.value });
  },
  onShopQuery(event) {
    this.setData({ shopQuery: event.detail.value });
  },
  findShops() {
    const queries = splitSpokenShops(this.data.shopQuery || "");
    if (!queries.length) {
      this.setData({ shopMessage: "至少写两个字的店名或品类。" });
      return;
    }
    this.setData({ shopBusy: true, shopMessage: queries.length > 1 ? `在高德对这 ${queries.length} 家…` : "" });
    const hits = [];
    const seen = {};
    const missed = [];
    const pull = (index) => {
      if (index >= queries.length) {
        const heard = queries.length > 1 ? `听成 ${queries.join("、")}。` : "";
        let shopMessage = "";
        if (!hits.length) shopMessage = `${heard}没对上`;
        else if (missed.length) shopMessage = `${heard}对上 ${hits.length} 家，没对上：${missed.join("、")}`;
        else if (heard) shopMessage = heard;
        this.setData({ shopHits: hits, shopBusy: false, shopMessage });
        return;
      }
      request(`/api/shops?q=${encodeURIComponent(queries[index])}&city=${encodeURIComponent("大连")}`)
        .then((data) => {
          const shops = data.shops || [];
          if (!shops.length) missed.push(queries[index]);
          shops.forEach((shop) => {
            if (seen[shop.poiId]) return;
            seen[shop.poiId] = true;
            hits.push(shop);
          });
          pull(index + 1);
        })
        .catch(() => this.setData({ shopBusy: false, shopMessage: "高德没连上。" }));
    };
    pull(0);
  },
  toggleVoice() {
    const recorder = wx.getRecorderManager();
    if (!this._voiceBound) {
      recorder.onStop((res) => this.uploadVoice(res.tempFilePath));
      recorder.onError(() => this.setData({ listening: false, shopMessage: "麦克风没开。" }));
      this._voiceBound = true;
    }
    if (this.data.listening) {
      recorder.stop();
      return;
    }
    wx.authorize({
      scope: "scope.record",
      success: () => {
        this.setData({ listening: true, shopMessage: "" });
        recorder.start({
          duration: 30000,
          sampleRate: 16000,
          numberOfChannels: 1,
          format: "wav",
        });
      },
      fail: () => this.setData({ shopMessage: "麦克风没开。" }),
    });
  },
  uploadVoice(filePath) {
    this.setData({ listening: false, shopBusy: true, shopMessage: "" });
    wx.uploadFile({
      url: `${apiBase()}/api/speech`,
      filePath,
      name: "file",
      timeout: 60000,
      success: (res) => {
        let data = {};
        try {
          data = JSON.parse(res.data || "{}");
        } catch (error) {
          data = {};
        }
        if (res.statusCode >= 300 || data.error || !data.text) {
          this.setData({ shopBusy: false, shopMessage: data.error || "没听清，再说一次。" });
          return;
        }
        this.setData({ shopBusy: false, shopQuery: data.text, shopMessage: data.text }, () => this.findShops());
      },
      fail: () => this.setData({ shopBusy: false, shopMessage: "语音没传上去。先打开电脑上的 FridayBite。" }),
    });
  },
  pickShopImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        this.readShopImage(file.tempFilePath);
      },
    });
  },
  readShopImage(filePath) {
    this.setData({ reading: true, shopMessage: "" });
    wx.uploadFile({
      url: `${apiBase()}/api/ocr`,
      filePath,
      name: "file",
      timeout: 60000,
      success: (res) => {
        let data = {};
        try {
          data = JSON.parse(res.data || "{}");
        } catch (error) {
          data = {};
        }
        const text = shopNamesFromText(data.text).join("，");
        if (res.statusCode >= 300 || data.error || !text) {
          this.setData({ reading: false, shopMessage: data.error || "图里没认出店名。" });
          return;
        }
        this.setData({ reading: false, shopQuery: text, shopMessage: text }, () => this.findShops());
      },
      fail: () => this.setData({ reading: false, shopMessage: "图没传上去。先打开电脑上的 FridayBite。" }),
    });
  },
  saveShop(event) {
    const poiId = event.currentTarget.dataset.id;
    const shop = this.data.shopHits.find((item) => item.poiId === poiId);
    if (!shop) return;
    this.setData({ savingPoi: poiId });
    request("/api/places", { method: "POST", data: { shop } })
      .then((data) => {
        this.setData({
          savingPoi: "",
          shopHits: this.data.shopHits.filter((item) => item.poiId !== poiId),
          shopMessage: data.error
            ? data.error
            : data.existed
              ? `已在店库 ${shop.name}`
              : `已收入 ${shop.name}。`,
        });
        this.load();
        this.loadFill();
      })
      .catch(() => this.setData({ savingPoi: "", shopMessage: "没存上，再试一次。" }));
  },
  onNear(event) {
    this.setData({ near: event.detail.value, lat: null, lng: null });
  },
  onRadius(event) {
    this.setData({ radiusKm: event.currentTarget.dataset.value });
    if (this.data.near.trim() || this.data.lat != null) this.load();
  },
  loadFill() {
    request("/api/places/enrich")
      .then((stats) => {
        this.setData({
          fill: {
            missing: stats.missing || 0,
            filled: stats.filled || 0,
            unmatched: stats.unmatched || 0,
            total: stats.total || 0,
          },
        });
      })
      .catch(() => undefined);
  },
  useHere() {
    wx.getLocation({
      type: "wgs84",
      success: (pos) => {
        this.setData({ lat: pos.latitude, lng: pos.longitude, near: "我的位置" });
        this.load();
      },
      fail: () => {
        this.setData({ lat: null, lng: null, near: "我的位置" });
        this.load();
      },
    });
  },
  load() {
    const query = [];
    if (this.data.q.trim()) query.push(`q=${encodeURIComponent(this.data.q.trim())}`);
    if (this.data.lat != null && this.data.lng != null) {
      query.push(`lat=${this.data.lat}`);
      query.push(`lng=${this.data.lng}`);
      query.push(`radiusKm=${this.data.radiusKm || 3}`);
      query.push("city=大连");
    } else if (this.data.near.trim()) {
      query.push(`near=${encodeURIComponent(this.data.near.trim())}`);
      query.push(`radiusKm=${this.data.radiusKm || 3}`);
      query.push("city=大连");
    }
    const path = query.length ? `/api/places?${query.join("&")}` : "/api/places";
    this.setData({ error: "" });
    wx.showLoading({ title: "在找…" });
    request(path)
      .then((data) => {
        wx.hideLoading();
        const travel = data.travel || {};
        const places = (data.places || []).map((place) => {
          const trip = travel[place.id];
          const rating = ratingLabel(place);
          const dishes = (place.dishes || []).slice(0, 6).map((dish) => dish.name);
          return {
            ...place,
            ratingText: rating || "",
            tripText:
              trip && trip.durationMin != null
                ? `${trip.travelMode === "walk" ? "步行" : "驾车"} ${trip.durationMin} 分钟${
                    trip.distanceKm != null ? ` · ${formatDistance(trip.distanceKm)}` : ""
                  }`
                : "",
            tagLine: [place.area, place.cuisine].filter(Boolean).join(" · "),
            dishLine: dishes.slice(0, 3).join(" · "),
            noteLine: place.notes ? String(place.notes).replace(/\s+/g, " ") : "",
          };
        });
        this.setData({
          places,
          geoNote: data.error ? data.error : data.origin ? `识别为 ${data.origin.label}` : "",
          error: data.error || "",
          nearby: data.nearby !== false,
          missingCoords: data.missingCoords || 0,
        });
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ error: error.message });
      });
  },
  enrich() {
    if (this.data.enriching || !this.data.fill.missing) return;
    this.setData({ enriching: true });
    request("/api/places/enrich", {
      method: "POST",
      data: { city: "大连", limit: 8 },
    })
      .then(() => {
        this.setData({ enriching: false });
        this.loadFill();
        this.load();
      })
      .catch((error) => {
        this.setData({ enriching: false, error: error.message });
      });
  },
  call(event) {
    const tel = event.currentTarget.dataset.tel;
    if (!tel) {
      wx.showToast({ title: "没有电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: String(tel).split(";")[0].trim() });
  },
  openMap(event) {
    const id = event.currentTarget.dataset.id;
    const place = this.data.places.find((item) => item.id === id);
    if (!place || place.lat == null || place.lng == null) {
      wx.showToast({ title: "这家还没有坐标", icon: "none" });
      return;
    }
    const gcj = wgs84ToGcj02(place.lat, place.lng);
    wx.openLocation({
      latitude: gcj.lat,
      longitude: gcj.lng,
      name: place.name,
      address: place.address || place.area || "",
    });
  },
  mark(event) {
    const { id, status } = event.currentTarget.dataset;
    const place = this.data.places.find((item) => item.id === id);
    if (!place) return;
    request("/api/places", { method: "POST", data: { place: { ...place, status } } }).then(() => this.load());
  },
  visited(event) {
    const id = event.currentTarget.dataset.id;
    request("/api/visits", { method: "POST", data: { placeId: id, keep: "want" } }).then(() => this.load());
  },
});
