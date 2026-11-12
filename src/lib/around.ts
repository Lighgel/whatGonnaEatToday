import { AmapError, measureLegs, type Leg } from "./amap";
import { experienceReason, experienceScore } from "./experience";
import { distanceKm, formatDistance, formatDuration, type Origin } from "./geo";
import { closedLast, isOpenNow } from "./hours";
import { pickWeighted } from "./recommend";
import type { Place, RecommendResult } from "./types";

const WALK_LIMIT_SECONDS = 30 * 60;

export async function aroundSavedPlaces(
  places: Place[],
  origin: Origin,
  options: { radiusKm?: number; limit: number; farLimit: number; mode?: "list" | "daily" | "spin" },
): Promise<{ results: RecommendResult[]; nearby: boolean; missingCoords: number; pool?: string[] }> {
  const missingCoords = places.filter((place) => distanceKm(place, origin) == null).length;
  const ranked = places
    .map((place) => ({ place, km: distanceKm(place, origin) }))
    .filter((item): item is { place: Place; km: number } => item.km != null)
    .sort((a, b) => a.km - b.km);
  const radius = options.radiusKm && options.radiusKm > 0 ? options.radiusKm : undefined;
  const loose = radius ? ranked.filter((item) => item.km <= radius * 1.8 + 0.2) : ranked;
  const pool = (loose.length ? loose : ranked).slice(0, 25);
  const legs = await routePool(origin, pool);
  const measured = pool
    .map((item, index) => ({ ...item, leg: legs[index] }))
    .filter((item): item is { place: Place; km: number; leg: Leg } => Boolean(item.leg));
  if (pool.length > 0 && measured.length === 0) throw new AmapError("高德没有算出这些店的路程。");
  const inside = measured.filter((item) => !radius || item.leg.meters / 1000 <= radius + 0.05);
  const nearby = inside.length > 0;
  const ordered = (nearby ? inside : measured)
    .slice()
    .sort((a, b) => closedLast(a.place, b.place) || byExperienceThenTrip(a, b));
  const mode = options.mode ?? "list";
  if (mode === "daily" || mode === "spin") {
    const picked = ordered.slice(0, mode === "spin" ? 12 : ordered.length);
    const winner = pickWeighted(picked);
    return {
      nearby,
      missingCoords,
      pool: picked.map((item) => item.place.name),
      results: winner ? [toResult(winner.place, winner.leg, origin, mode)] : [],
    };
  }
  const chosen = ordered.slice(0, nearby ? options.limit : options.farLimit);
  return {
    nearby,
    missingCoords,
    results: chosen.map((item) => toResult(item.place, item.leg, origin, mode)),
  };
}

async function routePool(origin: Origin, pool: Array<{ place: Place; km: number }>): Promise<Array<Leg | undefined>> {
  const legs: Array<Leg | undefined> = pool.map(() => undefined);
  const walkIndexes = pool.map((item, index) => (item.km <= 5 ? index : -1)).filter((index) => index >= 0);
  const walked = await measureLegs(
    origin,
    walkIndexes.map((index) => point(pool[index].place)),
    "walk",
  );
  walkIndexes.forEach((index, offset) => {
    const leg = walked[offset];
    if (leg && leg.seconds <= WALK_LIMIT_SECONDS) legs[index] = leg;
  });
  const driveIndexes = legs
    .map((leg, index) => (pool[index] && !leg ? index : -1))
    .filter((index) => index >= 0);
  const driven = await measureLegs(
    origin,
    driveIndexes.map((index) => point(pool[index].place)),
    "drive",
  );
  driveIndexes.forEach((index, offset) => {
    if (driven[offset]) legs[index] = driven[offset];
  });
  return legs;
}

function toResult(place: Place, leg: Leg, origin: Origin, mode: "list" | "daily" | "spin" = "list"): RecommendResult {
  const km = leg.meters / 1000;
  const how = leg.mode === "walk" ? "步行" : "驾车";
  const shut = isOpenNow(place.openTime) === false ? "现在关门。" : "";
  const lead =
    mode === "spin"
      ? "转盘落到这家。"
      : mode === "daily"
        ? `今天就定 ${place.name}。`
        : `${how} ${formatDuration(leg.seconds)}，路程 ${formatDistance(km)}。从${origin.label.split(" · ")[0]}出发。`;
  return {
    place,
    score: experienceScore(place),
    distanceKm: km,
    durationMin: Math.max(1, Math.round(leg.seconds / 60)),
    travelMode: leg.mode,
    closed: isOpenNow(place.openTime) === false,
    reason: `${lead}${shut}${experienceReason(place)}`.trim(),
  };
}

function byExperienceThenTrip(
  a: { place: Place; leg: Leg; km: number },
  b: { place: Place; leg: Leg; km: number },
): number {
  const gap = experienceScore(b.place) - experienceScore(a.place);
  if (Math.abs(gap) >= 4) return gap;
  return a.leg.seconds - b.leg.seconds || a.km - b.km;
}

function point(place: Place): { lat: number; lng: number } {
  return { lat: place.lat as number, lng: place.lng as number };
}
