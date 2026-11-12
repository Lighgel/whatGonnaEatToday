function apiBase() {
  const app = getApp();
  return String(app.globalData.apiBase || "http://127.0.0.1:3847").replace(/\/$/, "");
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase()}${path}`,
      method: options.method || "GET",
      data: options.data,
      timeout: options.timeout || 60000,
      header: { "Content-Type": "application/json" },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error((res.data && res.data.error) || "请求失败"));
      },
      fail(error) {
        reject(new Error(error.errMsg || "连不上店库。先打开电脑上的 FridayBite，并在「设置」里填对接口地址。"));
      },
    });
  });
}

module.exports = { request, apiBase };
