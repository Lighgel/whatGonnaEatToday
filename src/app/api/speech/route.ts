import { transcribeWav as transcribeLinux } from "@/lib/linux-speech";
import { transcribeWav as transcribeWindows } from "@/lib/windows-speech";
import { NextRequest, NextResponse } from "next/server";

const transcribeWav = process.platform === "win32" ? transcribeWindows : transcribeLinux;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "没有录音。" }, { status: 400 });
  }
  if (file.size < 800) {
    return NextResponse.json({ error: "说得太短了。" }, { status: 400 });
  }
  try {
    const text = await transcribeWav(Buffer.from(await file.arrayBuffer()));
    if (!text) return NextResponse.json({ error: "没听清，再说一次。" }, { status: 400 });
    return NextResponse.json({ text });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "没听清，再说一次。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
