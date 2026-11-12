import { AmapError } from "@/lib/amap";
import { amapStats, enrichShops } from "@/lib/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await amapStats());
}

export async function POST(request: Request) {
  const body = ((await request.json()) ?? {}) as { placeId?: string; city?: string; limit?: number };
  try {
    const result = await enrichShops({
      placeId: body.placeId,
      cityBias: body.city?.trim() || "大连",
      limit: body.placeId ? 1 : (body.limit ?? 8),
    });
    const stats = await amapStats();
    return NextResponse.json({
      updated: result.updated,
      missedNames: result.unmatched,
      remaining: result.remaining,
      missing: stats.missing,
      filled: stats.filled,
      unmatched: stats.unmatched,
      total: stats.total,
    });
  } catch (caught) {
    if (caught instanceof AmapError) {
      return NextResponse.json({ updated: [], unmatched: [], remaining: 0, error: caught.message });
    }
    throw caught;
  }
}
