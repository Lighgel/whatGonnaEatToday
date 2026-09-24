import { recommend } from "@/lib/recommend";
import { locate, placesNear } from "@/lib/store";
import type { RecommendRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = ((await request.json()) ?? {}) as RecommendRequest;
  const { origin, error } = await locate({
    location: body.location,
    lat: body.lat,
    lng: body.lng,
    cityBias: body.cityBias,
  });
  if (error) return NextResponse.json({ results: [], error });
  const places = await placesNear(
    {
      cuisine: body.cuisine,
      area: body.area,
      tag: body.tag,
      radiusKm: origin ? body.radiusKm : undefined,
    },
    origin,
  );
  const results = recommend(places, {
    ...body,
    lat: origin?.lat,
    lng: origin?.lng,
    location: origin?.label ?? body.location,
  });
  return NextResponse.json({ results, origin });
}
