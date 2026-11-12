import { spawn } from "child_process";
import { unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const PYTHON = process.env.FRIDAYBITE_PPOCR_PYTHON || "/opt/fridaybite/ocr-venv/bin/python";
const SCRIPT = process.env.FRIDAYBITE_PPOCR_SCRIPT || "/opt/fridaybite/scripts/ppocr.py";

export async function recognizeImageFile(bytes: Buffer, ext = ".jpg"): Promise<string> {
  const file = path.join(os.tmpdir(), `fridaybite-ocr-${Date.now()}${ext}`);
  await writeFile(file, bytes);
  try {
    return cleanOcr(await runPaddle(file));
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function runPaddle(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT, file], {
      env: { ...process.env, FLAGS_use_mkldnn: "1", OMP_NUM_THREADS: "2" },
    });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("图里没认出字。")));
    }, 90000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.on("error", () => {
      finish(() => reject(new Error("服务器还没装好文字识别。")));
    });
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          const missing = /No such file|ModuleNotFoundError|paddleocr/i.test(err);
          reject(new Error(missing ? "服务器还没装好文字识别。" : "图里没认出字。"));
          return;
        }
        const mark = out.lastIndexOf("FRIDAYBITE_JSON:");
        if (mark < 0) {
          reject(new Error("图里没认出字。"));
          return;
        }
        const json = out.slice(mark + "FRIDAYBITE_JSON:".length).split(/\r?\n/, 1)[0];
        try {
          const parsed = JSON.parse(json) as { text?: string };
          resolve(cleanOcr(parsed.text || ""));
        } catch {
          reject(new Error("图里没认出字。"));
        }
      });
    });
  });
}

function cleanOcr(raw: string) {
  return raw.replace(/\f/g, "\n").replace(/\r/g, "").trim();
}
