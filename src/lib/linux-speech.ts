import { spawn } from "child_process";
import { unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const PYTHON = process.env.FRIDAYBITE_SENSEVOICE_PYTHON || "/opt/fridaybite/speech-venv/bin/python";
const SCRIPT = process.env.FRIDAYBITE_SENSEVOICE_SCRIPT || "/opt/fridaybite/scripts/sensevoice.py";

export async function transcribeWav(bytes: Buffer): Promise<string> {
  const file = path.join(os.tmpdir(), `fridaybite-speech-${Date.now()}.wav`);
  await writeFile(file, bytes);
  try {
    return cleanTranscript(await runSenseVoice(file));
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

function runSenseVoice(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT, file], {
      env: {
        ...process.env,
        MODELSCOPE_CACHE: "/opt/fridaybite/models/modelscope",
        OMP_NUM_THREADS: "2",
      },
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
      finish(() => reject(new Error("没听清，再说一次。")));
    }, 90000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.on("error", () => {
      finish(() => reject(new Error("服务器还没装好语音识别。")));
    });
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          const missing = /No such file|ModuleNotFoundError|funasr/i.test(err);
          reject(new Error(missing ? "服务器还没装好语音识别。" : "没听清，再说一次。"));
          return;
        }
        const parsed = readResult(out);
        if (!parsed) {
          reject(new Error("没听清，再说一次。"));
          return;
        }
        resolve(parsed);
      });
    });
  });
}

function readResult(raw: string) {
  const mark = raw.lastIndexOf("FRIDAYBITE_JSON:");
  if (mark < 0) return null;
  const json = raw.slice(mark + "FRIDAYBITE_JSON:".length).split(/\r?\n/, 1)[0];
  try {
    return cleanTranscript(String((JSON.parse(json) as { text?: string }).text || ""));
  } catch {
    return null;
  }
}

function cleanTranscript(raw: string) {
  return raw
    .replace(/<\|[^|>]*\|>/g, "")
    .replace(/\s+/g, "")
    .trim();
}
