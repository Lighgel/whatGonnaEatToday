import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Place } from "./types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "places.local.json");
const seedFile = path.join(dataDir, "places.seed.json");

export async function listPlaces(): Promise<Place[]> {
  const local = await readJson(dataFile);
  if (local) return local;
  const seed = await readJson(seedFile);
  if (seed) {
    await savePlaces(seed);
    return seed;
  }
  return [];
}

export async function savePlaces(places: Place[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(places, null, 2), "utf8");
}

export async function upsertPlace(place: Place): Promise<Place[]> {
  const places = await listPlaces();
  const index = places.findIndex((item) => item.id === place.id);
  if (index >= 0) places[index] = place;
  else places.unshift(place);
  await savePlaces(places);
  return places;
}

export async function addPlaces(newPlaces: Place[]): Promise<Place[]> {
  const places = await listPlaces();
  const existing = new Set(places.map((item) => normalizeName(item.name)));
  for (const place of newPlaces) {
    if (existing.has(normalizeName(place.name))) continue;
    places.unshift(place);
    existing.add(normalizeName(place.name));
  }
  await savePlaces(places);
  return places;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

async function readJson(file: string): Promise<Place[] | null> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Place[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
