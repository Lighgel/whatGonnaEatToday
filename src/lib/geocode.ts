import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import type { Origin } from "./geo";

type Database = LibSQLDatabase<typeof schema>;

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

let lastCall = 0;

export async function geocode(db: Database, query: string, cityBias?: string): Promise<Origin | undefined> {
  const text = query.trim();
  if (!text) return undefined;
  const bias = cityBias?.trim() || "";
  const cacheKey = bias ? `${text}\n${bias}` : text;
  const cached = await db.select().from(schema.geocodes).where(eq(schema.geocodes.query, cacheKey)).limit(1);
  if (cached[0]?.lat != null && cached[0].lng != null && cached[0].label) {
    return { lat: cached[0].lat, lng: cached[0].lng, label: cached[0].label };
  }

  const features = await searchPhoton(text);
  const hit = pick(features, bias);
  if (!hit) return undefined;
  await db
    .insert(schema.geocodes)
    .values({ query: cacheKey, lat: hit.lat, lng: hit.lng, label: hit.label, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: schema.geocodes.query,
      set: { lat: hit.lat, lng: hit.lng, label: hit.label, updatedAt: new Date().toISOString() },
    });
  return hit;
}

export function placeQuery(place: { name: string; area?: string; address?: string }): string {
  return [place.name, place.address, place.area].map((part) => part?.trim()).filter(Boolean).join(" ");
}

async function searchPhoton(query: string): Promise<PhotonFeature[]> {
  const wait = Math.max(0, 250 - (Date.now() - lastCall));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall = Date.now();
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  let response = await fetch(url, {
    headers: { "User-Agent": "FridayBite/0.1 (personal food picker)" },
    cache: "no-store",
  });
  for (let attempt = 0; attempt < 3 && !response.ok; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    lastCall = Date.now();
    response = await fetch(url, {
      headers: { "User-Agent": "FridayBite/0.1 (personal food picker)" },
      cache: "no-store",
    });
  }
  if (!response.ok) return [];
  const body = (await response.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

function pick(features: PhotonFeature[], cityBias: string): Origin | undefined {
  const parsed = features.map(toOrigin).filter((item): item is Origin => Boolean(item));
  if (!parsed.length) return undefined;
  if (!cityBias) return parsed[0];
  return parsed.find((item) => item.label.includes(cityBias)) ?? parsed[0];
}

function toOrigin(feature: PhotonFeature): Origin | undefined {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const props = feature.properties ?? {};
  const label = [props.name, props.street, props.district, props.city, props.county, props.state, props.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .filter((part, index, list) => list.indexOf(part) === index)
    .join(" · ");
  return { lat: lat as number, lng: lng as number, label: label || `${lat}, ${lng}` };
}
