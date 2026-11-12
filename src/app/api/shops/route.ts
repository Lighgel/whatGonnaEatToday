import { AmapError } from "@/lib/amap";
import { searchShops } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const city = request.nextUrl.searchParams.get("city") ?? undefined;
  if (q.trim().length < 2) return NextResponse.json({ shops: [] });
  try {
    const shops = await searchShops(q, city);
    return NextResponse.json({ shops });
  } catch (caught) {
    if (caught instanceof AmapError) return NextResponse.json({ shops: [], error: caught.message });
    throw caught;
  }
}
