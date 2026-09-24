import { addPlaces, listPlaceFacets, listPlaces, locate, placesNear, upsertPlace } from "@/lib/store";
import { parsePlaceText } from "@/lib/parse";
import type { Place, PlaceSource, PlaceStatus } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const STATUSES = new Set<PlaceStatus>(["want", "neutral", "skip"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status") ?? undefined;
  const status = statusParam && STATUSES.has(statusParam as PlaceStatus) ? (statusParam as PlaceStatus) : undefined;
  const near = searchParams.get("near") ?? undefined;
  const cityBias = searchParams.get("city") ?? undefined;
  const lat = parseCoord(searchParams.get("lat"));
  const lng = parseCoord(searchParams.get("lng"));
  const filter = {
    q: searchParams.get("q") ?? undefined,
    cuisine: searchParams.get("cuisine") ?? undefined,
    area: searchParams.get("area") ?? undefined,
    status,
    tag: searchParams.get("tag") ?? undefined,
    radiusKm: parseRadius(searchParams.get("radiusKm")),
  };
  const facets = await listPlaceFacets();
  if (!near && lat == null) {
    const places = await listPlaces(filter);
    return NextResponse.json({ places, facets });
  }
  const { origin, error } = await locate({ location: near, lat, lng, cityBias });
  if (error || !origin) return NextResponse.json({ places: [], facets, error: error ?? "没认出这个地点" });
  const places = await placesNear(filter, origin);
  return NextResponse.json({ places, facets, origin });
}

function parseRadius(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseCoord(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    place?: Place;
    text?: string;
    source?: PlaceSource;
  };
  if (body.text) {
    const parsed = parsePlaceText(body.text, body.source ?? "manual");
    const places = await addPlaces(parsed);
    return NextResponse.json({ places, imported: parsed.length });
  }
  if (body.place) {
    const places = await upsertPlace(body.place);
    return NextResponse.json({ places });
  }
  return NextResponse.json({ error: "需要 place 或 text" }, { status: 400 });
}
