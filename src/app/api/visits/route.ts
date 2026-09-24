import { logVisit } from "@/lib/store";
import type { PlaceStatus, VisitLogRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const STATUSES = new Set<PlaceStatus>(["want", "neutral", "skip"]);

export async function POST(request: Request) {
  const body = ((await request.json()) ?? {}) as VisitLogRequest;
  if (!body.placeId) {
    return NextResponse.json({ error: "需要 placeId" }, { status: 400 });
  }
  const keep = body.keep && STATUSES.has(body.keep) ? body.keep : "want";
  const places = await logVisit({
    placeId: body.placeId,
    dishes: body.dishes,
    note: body.note,
    keep,
  });
  return NextResponse.json({ places });
}
