import { AmapError } from "@/lib/amap";
import { allowServerIpFallback, publicClientIp } from "@/lib/client-ip";
import { locate, mapShopsNear, wantsIpFallback } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseCoord(searchParams.get("lat"));
  const lng = parseCoord(searchParams.get("lng"));
  const location = searchParams.get("near") ?? undefined;
  const cityBias = searchParams.get("city") ?? undefined;
  const keywords = searchParams.get("q")?.trim() || undefined;
  const radiusKm = clampRadius(Number(searchParams.get("radiusKm")));
  const allowIp = wantsIpFallback({ location, lat, lng });
  const { origin, error } = await locate({
    location,
    lat,
    lng,
    cityBias,
    allowIp,
    clientIp: allowIp ? publicClientIp(request.headers) : undefined,
    allowSelfIp: allowIp ? allowServerIpFallback(request.headers) : false,
  });
  if (error || !origin) {
    return NextResponse.json({ shops: [], error: error ?? "先定位或写个地点，再看地图上的店。" });
  }
  try {
    const shops = await mapShopsNear(origin, radiusKm, keywords, cityBias);
    return NextResponse.json({
      shops,
      origin,
      note: shops.length
        ? "这些是高德上的店，不是你的收藏。点收入才会进店库、进推荐。"
        : keywords
          ? `这附近高德没搜到「${keywords}」。换个词或放大距离。`
          : "这附近高德暂时没吐餐饮店。",
    });
  } catch (caught) {
    if (caught instanceof AmapError) return NextResponse.json({ shops: [], error: caught.message });
    throw caught;
  }
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.min(8, Math.max(1, value));
}

function parseCoord(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
