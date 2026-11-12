const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const drizzleSkip = new Set([
  "aws-data-api",
  "better-sqlite3",
  "bun-sql",
  "bun-sqlite",
  "d1",
  "durable-sqlite",
  "expo-sqlite",
  "gel",
  "gel-core",
  "knex",
  "kysely",
  "mysql-core",
  "mysql-proxy",
  "mysql2",
  "neon",
  "neon-http",
  "neon-serverless",
  "node-postgres",
  "op-sqlite",
  "pg-core",
  "pg-proxy",
  "pglite",
  "planetscale-serverless",
  "postgres-js",
  "prisma",
  "singlestore",
  "singlestore-core",
  "singlestore-proxy",
  "sql-js",
  "sqlite-proxy",
  "supabase",
  "tidb-serverless",
  "vercel-postgres",
  "xata-http",
]);

function skipFile(name) {
  if (name === "release") return true;
  if (name === "docs" || name === ".github" || name === "tests" || name === "test") return true;
  if (name.endsWith(".map") || name.endsWith(".md") || name.endsWith(".d.ts")) return true;
  if (name === "LICENSE" || name.startsWith("LICENSE.") || name === "CHANGELOG.md") return true;
  return false;
}

function copyDir(from, to, skipDirs = new Set()) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skipFile(entry.name) || skipDirs.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, dest, skipDirs);
    else fs.copyFileSync(source, dest);
  }
}

function walkJs(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

function aliasHashedExternals(standalone) {
  const hashed = new Set();
  const re = /["']((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+-[0-9a-f]{16})["']/gi;
  for (const file of walkJs(path.join(standalone, ".next"))) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = re.exec(text))) hashed.add(match[1]);
  }
  for (const name of hashed) {
    const real = name.replace(/-[0-9a-f]{16}$/i, "");
    const from = path.join(process.cwd(), "node_modules", ...real.split("/"));
    const to = path.join(standalone, "node_modules", ...name.split("/"));
    if (fs.existsSync(from)) copyDir(from, to);
  }
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("next build 没有生成 standalone/server.js");
}

copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(path.join(root, "drizzle"), path.join(standalone, "drizzle"));

copyDir(path.join(root, "node_modules", "@libsql"), path.join(standalone, "node_modules", "@libsql"));
copyDir(path.join(root, "node_modules", "libsql"), path.join(standalone, "node_modules", "libsql"));
copyDir(
  path.join(root, "node_modules", "drizzle-orm"),
  path.join(standalone, "node_modules", "drizzle-orm"),
  drizzleSkip,
);

if (!fs.existsSync(path.join(standalone, "node_modules", "next"))) {
  copyDir(path.join(root, "node_modules", "next"), path.join(standalone, "node_modules", "next"));
}
if (!fs.existsSync(path.join(standalone, "node_modules", "react"))) {
  copyDir(path.join(root, "node_modules", "react"), path.join(standalone, "node_modules", "react"));
}
if (!fs.existsSync(path.join(standalone, "node_modules", "react-dom"))) {
  copyDir(path.join(root, "node_modules", "react-dom"), path.join(standalone, "node_modules", "react-dom"));
}

aliasHashedExternals(standalone);

const dataTo = path.join(standalone, "data");
fs.mkdirSync(dataTo, { recursive: true });
for (const name of ["fridaybite.db", "places.seed.json", "sao-dalian.json"]) {
  const source = path.join(root, "data", name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dataTo, name));
}

const envLocal = path.join(root, ".env.local");
if (fs.existsSync(envLocal)) {
  fs.copyFileSync(envLocal, path.join(standalone, ".env.local"));
}

fs.rmSync(path.join(standalone, "release"), { recursive: true, force: true });
fs.copyFileSync(process.execPath, path.join(standalone, "runtime-node.exe"));

const required = [
  path.join("node_modules", "next"),
  path.join("node_modules", "@libsql", "client"),
  path.join("node_modules", "drizzle-orm"),
];
for (const rel of required) {
  if (!fs.existsSync(path.join(standalone, rel))) {
    throw new Error(`standalone 里没有 ${rel}，安装包会打不开。`);
  }
}

const zipDir = path.join(root, "pack");
const zip = path.join(zipDir, "standalone.zip");
fs.mkdirSync(zipDir, { recursive: true });
fs.rmSync(zip, { force: true });
const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
const packed = spawnSync(tar, ["-a", "-c", "-f", zip, "-C", standalone, "."], { stdio: "inherit" });
if (packed.status !== 0) throw new Error("standalone 没压成一个包，安装会很卡。");

console.log("standalone ready");
