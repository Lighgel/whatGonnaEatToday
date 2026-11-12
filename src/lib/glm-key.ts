import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

export function glmEnvFile(): string {
  if (process.env.FRIDAYBITE_ENV_FILE?.trim()) return process.env.FRIDAYBITE_ENV_FILE.trim();
  const root = process.env.FRIDAYBITE_ROOT || process.cwd();
  return path.join(root, ".env.local");
}

export function currentGlmKey(): string {
  const fromEnv = process.env.GLM_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = glmEnvFile();
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^GLM_API_KEY=(.*)$/);
    if (!match) continue;
    const value = match[1].trim().replace(/^["']|["']$/g, "");
    if (value) process.env.GLM_API_KEY = value;
    return value;
  }
  return "";
}

export function saveGlmKey(raw: string): string {
  const key = raw.trim();
  if (!key || key === "你的智谱密钥") throw new Error("把智谱开放平台里的 API Key 贴进来。");
  if (key.length < 12 || /[\r\n\s]/.test(key)) throw new Error("这不像一把完整的密钥。");
  const file = glmEnvFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  let found = false;
  const next = lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      if (!line.startsWith("GLM_API_KEY=")) return line;
      found = true;
      return `GLM_API_KEY=${key}`;
    });
  if (!found) next.push(`GLM_API_KEY=${key}`);
  writeFileSync(file, `${next.join("\n")}\n`, "utf8");
  process.env.GLM_API_KEY = key;
  return key.slice(-4);
}
