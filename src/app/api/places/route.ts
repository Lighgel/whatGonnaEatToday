import { aroundSavedPlaces } from "@/lib/around";
import { AmapError } from "@/lib/amap";
import { allowServerIpFallback, publicClientIp } from "@/lib/client-ip";
import { addPlaces, attachNote, attachNotes, listPlaceFacets, listPlaces, locate, saveShop, upsertPlace, wantsIpFallback } from "@/lib/store";
import { parsePlaceText } from "@/lib/parse";
import type { Place, PlaceSource, PlaceStatus, ShopCandidate } from "@/lib/types";
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
  const allowIp = wantsIpFallback({ location: near, lat, lng });
  const { origin, error } = await locate({
    location: near,
    lat,
    lng,
    cityBias,
    allowIp,
    clientIp: allowIp ? publicClientIp(request.headers) : undefined,
    allowSelfIp: allowIp ? allowServerIpFallback(request.headers) : false,
  });
  if (error || !origin) return NextResponse.json({ places: [], facets, error: error ?? "没认出这个地点" });
  try {
    const around = await aroundSavedPlaces(await listPlaces(filter), origin, {
      radiusKm: filter.radiusKm,
      limit: 40,
      farLimit: 5,
    });
    const travel = Object.fromEntries(
      around.results.map((item) => [
        item.place.id,
        { durationMin: item.durationMin, travelMode: item.travelMode, distanceKm: item.distanceKm },
      ]),
    );
    return NextResponse.json({
      places: around.results.map((item) => item.place),
      facets,
      origin,
      nearby: around.nearby,
      missingCoords: around.missingCoords,
      travel,
    });
  } catch (caught) {
    if (caught instanceof AmapError) return NextResponse.json({ places: [], facets, error: caught.message });
    throw caught;
  }
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
    notesText?: string;
    note?: string;
    placeId?: string;
    source?: PlaceSource;
    shop?: ShopCandidate;
  };
  if (body.notesText?.trim()) {
    const result = await attachNotes(body.notesText);
    return NextResponse.json(result);
  }
  if (body.placeId && body.note?.trim()) {
    const result = await attachNote(body.placeId, body.note);
    return NextResponse.json(result);
  }
  if (body.shop?.poiId && body.shop.name) {
    const saved = await saveShop(body.shop);
    return NextResponse.json({
      places: saved.places,
      imported: 1,
      existed: saved.existed,
    });
  }
  if (body.text) {
    const parsed = parsePlaceText(body.text, body.source ?? "manual");
    const places = await addPlaces(parsed);
    return NextResponse.json({ places, imported: parsed.length });
  }
  if (body.place) {
    const places = await upsertPlace(body.place);
    return NextResponse.json({ places });
  }
  return NextResponse.json({ error: "需要 shop、place、text 或摘记" }, { status: 400 });
}
