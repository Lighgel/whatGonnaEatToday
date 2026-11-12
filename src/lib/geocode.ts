import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { AmapError, findPlace, findSavedPlace, geocodeAddress, locateByIp, reverseArea } from "./amap";
import { publicIpv4 } from "./client-ip";
import type { Coords, Origin } from "./geo";

const IP_TTL_MS = 30 * 60_000;

type Database = LibSQLDatabase<typeof schema>;

export async function geocode(db: Database, query: string, cityBias?: string): Promise<Origin | undefined> {
  const text = query.trim();
  if (!text) return undefined;
  const bias = cityBias?.trim() || "";
  const cacheKey = ["amap", text, bias].filter(Boolean).join("\n");
  const cached = await readCache(db, cacheKey);
  const cachedAdcode = (await readCache(db, `${cacheKey}\nadcode`))?.label;
  if (cached) return { ...cached, adcode: cachedAdcode || cached.adcode };
  const hit = (await findPlace(text, bias)) ?? (await geocodeAddress(text, bias));
  if (!hit) return undefined;
  await writeCache(db, cacheKey, hit);
  if (hit.adcode) await writeCache(db, `${cacheKey}\nadcode`, { ...hit, label: hit.adcode });
  return hit;
}

export async function describeHere(db: Database, coord: Coords): Promise<Origin> {
  const cacheKey = `amap-regeo\n${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}`;
  const cached = await readCache(db, cacheKey);
  const adcode = (await readCache(db, `${cacheKey}\nadcode`))?.label;
  if (cached) return { ...coord, label: cached.label, adcode: adcode || cached.adcode };
  const area = await reverseArea(coord);
  const origin = { ...coord, label: area.label, adcode: area.adcode };
  await writeCache(db, cacheKey, origin);
  if (area.adcode) await writeCache(db, `${cacheKey}\nadcode`, { ...origin, label: area.adcode });
  return origin;
}

export async function locateSavedPlace(
  db: Database,
  place: { name: string; area?: string; address?: string },
  cityBias?: string,
): Promise<Origin | undefined> {
  const bias = cityBias?.trim() || "";
  const cacheKey = ["amap-poi", place.name.trim(), place.address?.trim() || "", bias].filter(Boolean).join("\n");
  const cached = await readCache(db, cacheKey);
  if (cached) return cached;
  try {
    const byName = await findSavedPlace(place.name, bias);
    const address = [place.address, place.area].map((part) => (typeof part === "string" ? part.trim() : "")).filter(Boolean).join(" ");
    const hit = byName ?? (address ? await geocodeAddress(address, bias) : undefined);
    if (!hit) return undefined;
    await writeCache(db, cacheKey, hit);
    return hit;
  } catch (error) {
    if (error instanceof AmapError && /没有返回结果/.test(error.message)) return undefined;
    throw error;
  }
}

export function placeQuery(place: { name: string; area?: string; address?: string }): string {
  return [place.name, place.address, place.area].map((part) => (typeof part === "string" ? part.trim() : "")).filter(Boolean).join(" ");
}

export async function originFromIp(
  db: Database,
  clientIp?: string,
  fallbackToSelf = false,
): Promise<Origin | undefined> {
  const candidates: Array<string | undefined> = [];
  if (clientIp) {
    candidates.push(clientIp);
  } else if (fallbackToSelf) {
    const self = await publicIpv4();
    candidates.push(self);
  } else {
    candidates.push(undefined);
  }
  for (const ip of candidates) {
    const key = `amap-ip\n${ip || "omit"}`;
    const cached = await readCache(db, key, IP_TTL_MS);
    const cachedAdcode = (await readCache(db, `${key}\nadcode`, IP_TTL_MS))?.label;
    if (cached) return { ...cached, adcode: cachedAdcode || cached.adcode, fromIp: true };
    const hit = await locateByIp(ip);
    if (!hit) continue;
    await writeCache(db, key, hit);
    if (hit.adcode) await writeCache(db, `${key}\nadcode`, { ...hit, label: hit.adcode });
    return hit;
  }
  return undefined;
}

async function readCache(db: Database, cacheKey: string, maxAgeMs?: number): Promise<Origin | undefined> {
  const cached = await db.select().from(schema.geocodes).where(eq(schema.geocodes.query, cacheKey)).limit(1);
  const row = cached[0];
  if (row?.lat == null || row.lng == null || !row.label) return undefined;
  if (maxAgeMs != null) {
    const at = Date.parse(row.updatedAt ?? "");
    if (!Number.isFinite(at) || Date.now() - at > maxAgeMs) return undefined;
  }
  return { lat: row.lat, lng: row.lng, label: row.label };
}

async function writeCache(db: Database, cacheKey: string, origin: Origin): Promise<void> {
  await db
    .insert(schema.geocodes)
    .values({
      query: cacheKey,
      lat: origin.lat,
      lng: origin.lng,
      label: origin.label,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.geocodes.query,
      set: { lat: origin.lat, lng: origin.lng, label: origin.label, updatedAt: new Date().toISOString() },
    });
}
