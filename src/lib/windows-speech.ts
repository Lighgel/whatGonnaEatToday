import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import os from "os";
import path from "path";

const SCRIPT = `
param([string]$Path)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$culture = New-Object System.Globalization.CultureInfo "zh-CN"
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine $culture
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.SetInputToWaveFile($Path)
$result = $engine.Recognize([TimeSpan]::FromSeconds(20))
$engine.Dispose()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($result) { Write-Output $result.Text }
`;

export async function transcribeWav(bytes: Buffer): Promise<string> {
  const stamp = Date.now();
  const file = path.join(os.tmpdir(), `fridaybite-speech-${stamp}.wav`);
  const script = path.join(os.tmpdir(), `fridaybite-speech-${stamp}.ps1`);
  await writeFile(file, bytes);
  await writeFile(script, SCRIPT, "utf8");
  try {
    return (await runSpeech(script, file)).replace(/\r/g, "").trim();
  } finally {
    await unlink(file).catch(() => undefined);
    await unlink(script).catch(() => undefined);
  }
}

function runSpeech(script: string, file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", script, "-Path", file],
      { windowsHide: true },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString("utf8");
    });
    child.on("error", () => reject(new Error("这台电脑转不了语音。")));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || "没听清，再说一次。"));
        return;
      }
      resolve(out.trim());
    });
  });
}
