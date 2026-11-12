import { getDb } from "@/db/client";
import {
  addDishRow,
  addPlaceRows,
  amapFillStats,
  attachNotesFromText,
  attachNoteToPlace,
  enrichMissingPlaces,
  logVisitRow,
  normalizeName,
  queryFacets,
  queryPlaces,
  saveShopCandidate,
  upsertPlaceRow,
} from "@/db/places";
import { AmapError, searchAroundShops, searchShopCandidates as amapSearchShops, suggestPlaces as amapSuggest } from "./amap";
import { distanceKm, withinRadius, type Origin } from "./geo";
import { describeHere, geocode, originFromIp } from "./geocode";
import { weatherFor, type WeatherHint } from "./weather";
import type { Dish, Place, PlaceFacets, PlaceFilter, PlaceStatus, ShopCandidate } from "./types";

export { normalizeName };

export async function suggestLocations(query: string, cityBias?: string) {
  try {
    return await amapSuggest(query, cityBias);
  } catch (error) {
    if (error instanceof AmapError) return [];
    throw error;
  }
}

export async function searchShops(query: string, cityBias?: string): Promise<ShopCandidate[]> {
  return amapSearchShops(query, cityBias);
}

export async function saveShop(shop: ShopCandidate): Promise<{ places: Place[]; existed: boolean }> {
  const db = await getDb();
  const { existed } = await saveShopCandidate(db, shop);
  return { places: await queryPlaces(db), existed };
}

export async function enrichShops(input: { placeId?: string; cityBias?: string; limit?: number }) {
  const db = await getDb();
  return enrichMissingPlaces(db, input.cityBias, { placeId: input.placeId, limit: input.limit });
}

export async function amapStats() {
  const db = await getDb();
  return amapFillStats(db);
}

export async function listPlaces(filter: PlaceFilter = {}): Promise<Place[]> {
  const db = await getDb();
  return queryPlaces(db, filter);
}

export async function weatherAt(origin: Origin): Promise<WeatherHint | undefined> {
  const db = await getDb();
  try {
    return await weatherFor(db, origin);
  } catch {
    return undefined;
  }
}

export async function mapShopsNear(origin: Origin, radiusKm: number, keywords?: string, cityBias?: string) {
  const shops = await searchAroundShops(origin, radiusKm, keywords);
  if (shops.length || !keywords?.trim()) return shops;
  return amapSearchShops(keywords, cityBias?.trim() || undefined);
}

export function wantsIpFallback(input: {
  here?: boolean;
  fromIp?: boolean;
  location?: string;
  lat?: number;
  lng?: number;
}): boolean {
  if (input.fromIp) return true;
  if (Number.isFinite(input.lat) && Number.isFinite(input.lng)) return false;
  if (input.here) return true;
  return input.location?.trim() === "我的位置";
}

export async function locate(input: {
  location?: string;
  lat?: number;
  lng?: number;
  cityBias?: string;
  allowIp?: boolean;
  clientIp?: string;
  fromIp?: boolean;
  allowSelfIp?: boolean;
}): Promise<{ origin?: Origin; error?: string }> {
  const db = await getDb();
  const hasGps = Number.isFinite(input.lat) && Number.isFinite(input.lng);
  try {
    if (input.allowIp && (input.fromIp || !hasGps)) {
      const origin = await originFromIp(db, input.clientIp, input.allowSelfIp);
      if (origin) return { origin };
      return { error: "没拿到定位。请填个地点，比如高新万达、星海广场。" };
    }
    if (hasGps) {
      const origin = await describeHere(db, { lat: input.lat as number, lng: input.lng as number });
      return { origin };
    }
    const text = input.location?.trim();
    if (!text || text === "我的位置") return {};
    const origin = await geocode(db, text, input.cityBias);
    if (!origin) return { error: "没对上这个说法。换几个字，或点输入框下面的联想。" };
    return { origin };
  } catch (error) {
    if (error instanceof AmapError) return { error: error.message };
    throw error;
  }
}

export async function placesNear(filter: PlaceFilter, origin: Origin | undefined): Promise<Place[]> {
  const db = await getDb();
  const places = await queryPlaces(db, { ...filter, lat: undefined, lng: undefined, near: undefined });
  if (!origin) return places;
  const nearby = places.filter((place) => withinRadius(place, origin, filter.radiusKm));
  nearby.sort(
    (a, b) =>
      (distanceKm(a, origin) ?? Number.POSITIVE_INFINITY) - (distanceKm(b, origin) ?? Number.POSITIVE_INFINITY),
  );
  return nearby;
}

export async function listPlaceFacets(): Promise<PlaceFacets> {
  const db = await getDb();
  return queryFacets(db);
}

export async function upsertPlace(place: Place): Promise<Place[]> {
  const db = await getDb();
  await upsertPlaceRow(db, place);
  return queryPlaces(db);
}

export async function addPlaces(newPlaces: Place[]): Promise<Place[]> {
  const db = await getDb();
  await addPlaceRows(db, newPlaces);
  return queryPlaces(db);
}

export async function attachNotes(text: string) {
  const db = await getDb();
  return attachNotesFromText(db, text);
}

export async function attachNote(placeId: string, note: string) {
  const db = await getDb();
  return attachNoteToPlace(db, placeId, note);
}

export async function addDish(placeId: string, name: string, notes?: string): Promise<Dish | null> {
  const db = await getDb();
  return addDishRow(db, placeId, name, notes);
}

export async function logVisit(input: {
  placeId: string;
  dishes?: string[];
  note?: string;
  keep?: PlaceStatus;
  rating?: number;
  perCapita?: number;
}): Promise<Place[]> {
  const db = await getDb();
  await logVisitRow(db, input);
  return queryPlaces(db);
}
