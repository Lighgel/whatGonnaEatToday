import { suggestLocations } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const city = request.nextUrl.searchParams.get("city") ?? undefined;
  if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });
  const suggestions = await suggestLocations(q, city);
  return NextResponse.json({ suggestions });
}
