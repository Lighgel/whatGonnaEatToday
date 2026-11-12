import { currentGlmKey, saveGlmKey } from "@/lib/glm-key";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const key = currentGlmKey();
  return NextResponse.json({ configured: Boolean(key), tail: key ? key.slice(-4) : "" });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { key?: string } | null;
  try {
    const tail = saveGlmKey(body?.key ?? "");
    return NextResponse.json({ configured: true, tail });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "没保存上。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
