import { recognizeImageFile as recognizeLinux } from "@/lib/linux-ocr";
import { recognizeImageFile as recognizeWindows } from "@/lib/windows-ocr";
import { NextRequest, NextResponse } from "next/server";

const recognizeImageFile = process.platform === "win32" ? recognizeWindows : recognizeLinux;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "没有图片。" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "图片太大。" }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  const ext = name.endsWith(".png") ? ".png" : ".jpg";
  try {
    const text = await recognizeImageFile(Buffer.from(await file.arrayBuffer()), ext);
    if (!text) return NextResponse.json({ error: "图里没认出字。" }, { status: 400 });
    return NextResponse.json({ text });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "没认出字。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
