const { app, BrowserWindow, dialog, session, shell } = require("electron");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.FRIDAYBITE_PORT || 3847);
let child;
let logFile;
let lastServerError = "";

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    if (logFile) fs.appendFileSync(logFile, line);
  } catch {
    /* ignore */
  }
  console.error(message);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const name = match[1].trim();
    if (process.env[name]) continue;
    process.env[name] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

function lanUrls() {
  const urls = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const item of addrs || []) {
      if (item.family === "IPv4" && !item.internal) urls.push(`http://${item.address}:${PORT}`);
    }
  }
  return urls;
}

function waitForServer(proc, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      proc?.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onExit = (code) => {
      const detail = lastServerError.trim().split(/\r?\n/).slice(-8).join("\n");
      finish(new Error(detail || `后台退出（${code}）。`));
    };
    proc?.once("exit", onExit);
    const ping = () => {
      if (settled) return;
      http
        .get(`http://127.0.0.1:${PORT}/api/health`, (response) => {
          response.resume();
          if (response.statusCode === 200) finish();
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) finish(new Error(lastServerError.trim() || "FridayBite 后台没有起来。"));
      else setTimeout(ping, 400);
    };
    ping();
  });
}

function stopServer() {
  if (!child || child.killed) return;
  const pid = child.pid;
  child = undefined;
  if (process.platform === "win32" && pid) {
    spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid);
  } catch {
    /* ignore */
  }
}

function standaloneReady(dir) {
  return (
    fs.existsSync(path.join(dir, "server.js")) &&
    fs.existsSync(path.join(dir, "runtime-node.exe")) &&
    fs.existsSync(path.join(dir, "node_modules", "next"))
  );
}

function ensureStandalone() {
  const dir = path.join(app.getPath("userData"), "runtime", app.getVersion());
  if (standaloneReady(dir)) return dir;
  const zip = path.join(process.resourcesPath, "standalone.zip");
  if (!fs.existsSync(zip)) throw new Error("安装包缺后台压缩包。请安装 FridayBite-Setup-0.1.11。");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  const result = spawnSync(tar, ["-xf", zip, "-C", dir], { windowsHide: true });
  if (result.status !== 0 || !standaloneReady(dir)) {
    throw new Error("第一次准备后台失败。");
  }
  return dir;
}

function startServer() {
  const packaged = app.isPackaged;
  const projectRoot = packaged ? ensureStandalone() : path.join(__dirname, "..");
  const userData = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(userData, { recursive: true });
  logFile = path.join(app.getPath("userData"), "fridaybite.log");
  lastServerError = "";

  loadEnv(path.join(app.getPath("userData"), ".env.local"));
  loadEnv(path.join(projectRoot, ".env.local"));

  const bundledDb = path.join(projectRoot, "data", "fridaybite.db");
  const userDb = path.join(userData, "fridaybite.db");
  const seed = bundledDb;
  if (!fs.existsSync(userDb) && fs.existsSync(seed)) fs.copyFileSync(seed, userDb);

  const envFile = path.join(app.getPath("userData"), ".env.local");
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: "0.0.0.0",
    FRIDAYBITE_DATA_DIR: userData,
    FRIDAYBITE_ENV_FILE: envFile,
    FRIDAYBITE_DESKTOP: "1",
    ...(fs.existsSync(seed) ? { FRIDAYBITE_BUNDLED_DB: seed } : {}),
  };

  if (packaged) {
    const standalone = projectRoot;
    const serverJs = path.join(standalone, "server.js");
    const nodeBin = path.join(standalone, "runtime-node.exe");
    log(`standalone=${standalone}`);
    env.FRIDAYBITE_ROOT = standalone;
    env.NODE_ENV = "production";
    env.NODE_PATH = path.join(standalone, "node_modules");
    child = spawn(nodeBin, [serverJs], {
      cwd: standalone,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    env.FRIDAYBITE_ROOT = projectRoot;
    child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  child.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    lastServerError = `${lastServerError}\n${text}`.slice(-4000);
    log(text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    lastServerError = `${lastServerError}\n${text}`.slice(-4000);
    log(text);
  });
  child.on("exit", (code) => log(`server exited ${code}`));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 860,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith(`http://localhost:${PORT}`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  void win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "geolocation" || permission === "media" || permission === "microphone");
  });
  let splash;
  try {
    const runtimeDir = path.join(app.getPath("userData"), "runtime", app.getVersion());
    if (app.isPackaged && !standaloneReady(runtimeDir)) {
      splash = new BrowserWindow({
        width: 320,
        height: 120,
        frame: false,
        resizable: false,
        center: true,
        backgroundColor: "#1c1612",
      });
      await splash.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          "<body style=\"margin:0;background:#1c1612;color:#fffcf7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh\">正在准备</body>",
        )}`,
      );
    }
    startServer();
    await waitForServer(child);
    splash?.close();
    log(`lan ${lanUrls().join(" ") || "none"}`);
    createWindow();
  } catch (error) {
    splash?.close();
    log(error instanceof Error ? error.stack || error.message : String(error));
    dialog.showErrorBox(
      "FridayBite 打不开",
      `${error instanceof Error ? error.message : error}\n日志：${logFile || ""}`,
    );
    stopServer();
    app.quit();
  }
});

app.on("before-quit", () => stopServer());
app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});
