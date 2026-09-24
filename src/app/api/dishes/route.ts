import { addDish } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { placeId?: string; name?: string; notes?: string };
  if (!body.placeId || !body.name?.trim()) {
    return NextResponse.json({ error: "需要 placeId 和 name" }, { status: 400 });
  }
  const dish = await addDish(body.placeId, body.name, body.notes);
  return NextResponse.json({ dish });
}
