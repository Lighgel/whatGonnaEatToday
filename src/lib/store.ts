import { getDb } from "@/db/client";
import {
  addDishRow,
  addPlaceRows,
  logVisitRow,
  normalizeName,
  queryFacets,
  queryPlaces,
  upsertPlaceRow,
} from "@/db/places";
import { distanceKm, withinRadius, type Origin } from "./geo";
import { geocode } from "./geocode";
import type { Dish, Place, PlaceFacets, PlaceFilter, PlaceStatus } from "./types";

export { normalizeName };

export async function listPlaces(filter: PlaceFilter = {}): Promise<Place[]> {
  const db = await getDb();
  return queryPlaces(db, filter);
}

export async function locate(input: {
  location?: string;
  lat?: number;
  lng?: number;
  cityBias?: string;
}): Promise<{ origin?: Origin; error?: string }> {
  if (Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    return {
      origin: {
        lat: input.lat as number,
        lng: input.lng as number,
        label: input.location?.trim() || "我的位置",
      },
    };
  }
  const text = input.location?.trim();
  if (!text) return {};
  const db = await getDb();
  const origin = await geocode(db, text, input.cityBias);
  if (!origin) return { error: "没认出这个地点" };
  return { origin };
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

export async function addDish(placeId: string, name: string, notes?: string): Promise<Dish | null> {
  const db = await getDb();
  return addDishRow(db, placeId, name, notes);
}

export async function logVisit(input: {
  placeId: string;
  dishes?: string[];
  note?: string;
  keep?: PlaceStatus;
}): Promise<Place[]> {
  const db = await getDb();
  await logVisitRow(db, input);
  return queryPlaces(db);
}
