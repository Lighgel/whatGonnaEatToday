import { aroundSavedPlaces } from "@/lib/around";
import { AmapError } from "@/lib/amap";
import { allowServerIpFallback, publicClientIp } from "@/lib/client-ip";
import { recommend, selectCandidates, spinPoolNames } from "@/lib/recommend";
import { listPlaces, locate, wantsIpFallback, weatherAt } from "@/lib/store";
import type { RecommendRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = ((await request.json()) ?? {}) as RecommendRequest;
  const allowIp = wantsIpFallback(body);
  const { origin, error } = await locate({
    location: body.location,
    lat: body.lat,
    lng: body.lng,
    cityBias: body.cityBias,
    allowIp,
    fromIp: body.fromIp,
    clientIp: allowIp ? publicClientIp(request.headers) : undefined,
    allowSelfIp: allowIp ? allowServerIpFallback(request.headers) : false,
  });
  if (error) return NextResponse.json({ results: [], error });
  const weather = origin ? await weatherAt(origin) : undefined;
  const mood = body.mood?.trim() || weather?.mood || "";
  const next: RecommendRequest = { ...body, mood };
  const filter = { cuisine: body.cuisine, area: body.area, tag: body.tag };
  const mode = body.spin ? "spin" : body.daily ? "daily" : "list";
  try {
    const places = await listPlaces(filter);
    if (!origin) {
      return NextResponse.json({
        results: recommend(places, next),
        weather,
        pool: body.spin ? spinPoolNames(places, next) : undefined,
      });
    }
    const around = await aroundSavedPlaces(selectCandidates(places, next), origin, {
      radiusKm: body.radiusKm,
      limit: mode === "list" ? (body.here ? 8 : 3) : 1,
      farLimit: mode === "list" ? 3 : 1,
      mode,
    });
    return NextResponse.json({ ...around, origin, weather });
  } catch (caught) {
    if (caught instanceof AmapError) return NextResponse.json({ results: [], error: caught.message, weather });
    throw caught;
  }
}
