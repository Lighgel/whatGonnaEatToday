import { currentGlmKey } from "./glm-key";

export class SpeechError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechError";
  }
}

const ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions";

export async function transcribeShopAudio(file: File): Promise<string> {
  const key = currentGlmKey();
  if (!key) {
    throw new SpeechError("先保存智谱 Key。");
  }
  if (file.size < 800) throw new SpeechError("没听清，再说一次。");
  if (file.size > 8 * 1024 * 1024) throw new SpeechError("这段太长了。店名说完就停，最长大约半分钟。");

  const filename = file.name.toLowerCase().endsWith(".mp3") ? "speech.mp3" : "speech.wav";
  const type = filename.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  const audio = new File([await file.arrayBuffer()], filename, { type });
  const form = new FormData();
  form.set("model", "glm-asr-2512");
  form.set("stream", "false");
  form.set(
    "prompt",
    "用户在口述要收入店库的餐馆名称，可能一次说多家。只转写听到的店名，不要补充解释。",
  );
  form.set("hotwords", JSON.stringify(["火锅", "烧烤", "海鲜", "日料", "面馆", "黄记煌", "海底捞"]));
  form.set("file", audio);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch {
    throw new SpeechError("智谱语音服务没连上。");
  }

  const body = (await response.json().catch(() => null)) as {
    text?: string;
    error?: { message?: string } | string;
  } | null;
  if (!response.ok) {
    if (response.status === 401) throw new SpeechError("智谱 Key 不对。检查 .env.local 里的 GLM_API_KEY。");
    const detail = typeof body?.error === "string" ? body.error : body?.error?.message;
    throw new SpeechError(detail ? `语音没转成文字：${detail}` : "语音没转成文字。");
  }
  const text = body?.text?.trim() ?? "";
  if (!text) throw new SpeechError("没听清，再说一次。");
  return text;
}
