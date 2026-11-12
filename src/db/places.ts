import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { readFile } from "fs/promises";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { localJsonFile, saoFile, seedFile } from "./paths";
import { distanceKm, withinRadius, type Origin } from "@/lib/geo";
import { locateSavedPlace } from "@/lib/geocode";
import { AmapError, fetchShopDetail, matchShopForPlace } from "@/lib/amap";
import { mergeNotes, parseNotePaste } from "@/lib/parse";
import type { Dish, Place, PlaceFacets, PlaceFilter, PlaceSource, PlaceStatus, ShopCandidate, Visit } from "@/lib/types";

type Database = LibSQLDatabase<typeof schema>;

const STATUSES = new Set<PlaceStatus>(["want", "neutral", "skip"]);
const SOURCES = new Set<PlaceSource>(["meituan", "douyin", "manual", "map", "list"]);

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export async function bootstrapPlacesIfEmpty(db: Database): Promise<void> {
  const seed = (await readJson(seedFile)) ?? [];
  const local = await readJson(localJsonFile);
  const sao = (await readJson(saoFile)) ?? [];
  const merged = mergeSaoPlaces(mergeSeedAndLocal(seed, local), sao);
  if (!merged.length) return;
  await db.transaction(async (tx) => {
    for (const place of merged) {
      await writePlace(tx, place, { recordVisit: false });
    }
  });
}

function mergeSeedAndLocal(seed: Place[], local: Place[] | null): Place[] {
  if (!local) return seed;
  const kept = local.filter((place) => !place.id.startsWith("seed-"));
  const byId = new Map(kept.map((place) => [place.id, place]));
  for (const place of seed) {
    if (!byId.has(place.id)) byId.set(place.id, place);
  }
  return [...byId.values()];
}

function compactName(name: string): string {
  return normalizeName(name).replace(/[（）()·・\-]/g, "");
}

function mergeSaoPlaces(base: Place[], sao: Place[]): Place[] {
  const merged = [...base];
  for (const incoming of sao) {
    const key = compactName(incoming.name);
    const hit = merged.find((place) => {
      const existing = compactName(place.name);
      return existing === key || existing.includes(key) || key.includes(existing);
    });
    if (hit) {
      hit.tags = [...new Set([...hit.tags, ...incoming.tags])];
      hit.notes = [hit.notes, incoming.notes].filter(Boolean).join(" ｜ ") || hit.notes;
      if (incoming.status === "skip") hit.status = "skip";
      else if (incoming.status === "want" && hit.status === "neutral") hit.status = "want";
      continue;
    }
    merged.push({ ...incoming, source: incoming.source || "douyin" });
  }
  return merged;
}

export async function queryPlaces(db: Database, filter: PlaceFilter = {}): Promise<Place[]> {
  const conditions = placeConditions(filter);
  const rows = conditions.length
    ? await db
        .select()
        .from(schema.places)
        .where(and(...conditions))
        .orderBy(desc(schema.places.createdAt), schema.places.name)
    : await db.select().from(schema.places).orderBy(desc(schema.places.createdAt), schema.places.name);

  if (!rows.length) return [];

  const tagRows = await db
    .select({
      placeId: schema.placeTags.placeId,
      name: schema.tags.name,
    })
    .from(schema.placeTags)
    .innerJoin(schema.tags, eq(schema.placeTags.tagId, schema.tags.id));

  const tagsByPlace = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByPlace.get(row.placeId) ?? [];
    list.push(row.name);
    tagsByPlace.set(row.placeId, list);
  }

  const ids = rows.map((row) => row.id);
  const [dishRows, visitRows] = await Promise.all([
    db.select().from(schema.dishes).where(inArray(schema.dishes.placeId, ids)),
    db
      .select()
      .from(schema.visits)
      .where(inArray(schema.visits.placeId, ids))
      .orderBy(desc(schema.visits.visitedAt)),
  ]);

  const dishesByPlace = new Map<string, Dish[]>();
  for (const row of dishRows) {
    const list = dishesByPlace.get(row.placeId) ?? [];
    list.push({
      id: row.id,
      placeId: row.placeId,
      name: row.name,
      notes: row.notes ?? undefined,
    });
    dishesByPlace.set(row.placeId, list);
  }

  const visitsByPlace = new Map<string, Visit[]>();
  for (const row of visitRows) {
    const list = visitsByPlace.get(row.placeId) ?? [];
    if (list.length >= 5) continue;
    list.push({
      id: row.id,
      placeId: row.placeId,
      visitedAt: row.visitedAt,
      note: row.note ?? undefined,
      dishes: parseDishesEaten(row.dishesEaten),
      keep: STATUSES.has(row.keep as PlaceStatus) ? (row.keep as PlaceStatus) : undefined,
      rating: row.rating ?? undefined,
      perCapita: row.perCapita ?? undefined,
    });
    visitsByPlace.set(row.placeId, list);
  }

  const mapped = rows.map((row) =>
    toPlace(row, tagsByPlace.get(row.id) ?? [], dishesByPlace.get(row.id) ?? [], visitsByPlace.get(row.id) ?? []),
  );
  const origin = originFromFilter(filter);
  if (!origin) return mapped;
  const nearby = mapped.filter((place) => withinRadius(place, origin, filter.radiusKm));
  nearby.sort(
    (a, b) =>
      (distanceKm(a, origin) ?? Number.POSITIVE_INFINITY) - (distanceKm(b, origin) ?? Number.POSITIVE_INFINITY),
  );
  return nearby;
}

function originFromFilter(filter: PlaceFilter): Origin | undefined {
  if (!Number.isFinite(filter.lat) || !Number.isFinite(filter.lng)) return undefined;
  return { lat: filter.lat as number, lng: filter.lng as number, label: filter.near?.trim() || "这里" };
}

export async function ensurePlaceCoords(
  db: Database,
  places: Place[],
  cityBias?: string,
): Promise<Place[]> {
  const next: Place[] = [];
  for (const place of places) {
    if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      next.push(place);
      continue;
    }
    let hit;
    try {
      hit = place.name.trim() ? await locateSavedPlace(db, place, cityBias) : undefined;
    } catch (error) {
      console.warn(`skip ${place.name}: ${error instanceof Error ? error.message : error}`);
      next.push(place);
      continue;
    }
    if (!hit) {
      next.push(place);
      continue;
    }
    await db.update(schema.places).set({ lat: hit.lat, lng: hit.lng }).where(eq(schema.places.id, place.id));
    next.push({ ...place, lat: hit.lat, lng: hit.lng });
  }
  return next;
}

export async function queryFacets(db: Database): Promise<PlaceFacets> {
  const [cuisineRows, areaRows, tagRows] = await Promise.all([
    db
      .selectDistinct({ cuisine: schema.places.cuisine })
      .from(schema.places)
      .orderBy(schema.places.cuisine),
    db.selectDistinct({ area: schema.places.area }).from(schema.places).orderBy(schema.places.area),
    db
      .select({ name: schema.tags.name, uses: count(schema.placeTags.placeId) })
      .from(schema.tags)
      .innerJoin(schema.placeTags, eq(schema.tags.id, schema.placeTags.tagId))
      .groupBy(schema.tags.name)
      .orderBy(desc(count(schema.placeTags.placeId)), schema.tags.name),
  ]);

  return {
    cuisines: cuisineRows.map((row) => row.cuisine).filter((value): value is string => Boolean(value)),
    areas: areaRows.map((row) => row.area).filter((value): value is string => Boolean(value)),
    tags: tagRows.map((row) => row.name),
  };
}

export async function upsertPlaceRow(db: Database, place: Place): Promise<void> {
  const existing = await db
    .select({ lastVisitedAt: schema.places.lastVisitedAt })
    .from(schema.places)
    .where(eq(schema.places.id, place.id))
    .limit(1);
  const previousVisit = existing[0]?.lastVisitedAt ?? undefined;
  const recordVisit = Boolean(place.lastVisitedAt && place.lastVisitedAt !== previousVisit);
  await writePlace(db, place, { recordVisit });
}

export async function addDishRow(
  db: Database,
  placeId: string,
  name: string,
  notes?: string,
): Promise<Dish | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const found = await db
    .select()
    .from(schema.dishes)
    .where(and(eq(schema.dishes.placeId, placeId), eq(schema.dishes.name, trimmed)))
    .limit(1);
  if (found[0]) {
    return {
      id: found[0].id,
      placeId: found[0].placeId,
      name: found[0].name,
      notes: found[0].notes ?? undefined,
    };
  }
  const dish: Dish = {
    id: crypto.randomUUID(),
    placeId,
    name: trimmed,
    notes: notes?.trim() || undefined,
  };
  await db.insert(schema.dishes).values({
    id: dish.id,
    placeId,
    name: dish.name,
    notes: dish.notes ?? null,
  });
  return dish;
}

export async function logVisitRow(
  db: Database,
  input: { placeId: string; dishes?: string[]; note?: string; keep?: PlaceStatus; rating?: number; perCapita?: number },
): Promise<void> {
  const visitedAt = new Date().toISOString();
  const keep = input.keep && STATUSES.has(input.keep) ? input.keep : "want";
  const dishes = [...new Set((input.dishes ?? []).map((name) => name.trim()).filter(Boolean))];
  const rating = clampRating(input.rating);
  const perCapita = Number.isFinite(input.perCapita) && (input.perCapita as number) > 0 ? Math.round(input.perCapita as number) : null;
  await db
    .update(schema.places)
    .set({ lastVisitedAt: visitedAt, status: keep })
    .where(eq(schema.places.id, input.placeId));
  await db.insert(schema.visits).values({
    id: crypto.randomUUID(),
    placeId: input.placeId,
    visitedAt,
    note: input.note?.trim() || null,
    dishesEaten: dishes.length ? JSON.stringify(dishes) : null,
    keep,
    rating,
    perCapita,
  });
  for (const name of dishes) {
    await addDishRow(db, input.placeId, name);
  }
}

export async function saveShopCandidate(db: Database, shop: ShopCandidate): Promise<{ existed: boolean }> {
  const poiId = shop.poiId.trim();
  const nameKey = normalizeName(shop.name);
  if (!poiId || !nameKey) return { existed: false };
  const byPoi = await db.select().from(schema.places).where(eq(schema.places.amapPoiId, poiId)).limit(1);
  const byName = await db.select().from(schema.places).where(eq(schema.places.nameKey, nameKey)).limit(1);
  const existing = byPoi[0] ?? byName[0];
  const tags = [...new Set([...(shop.tags ?? []), shop.cuisine].filter((item): item is string => Boolean(item)))];
  if (existing) {
    await applyAmapDetails(db, existing, shop, { addTags: true });
    return { existed: true };
  }
  const place: Place = {
    id: crypto.randomUUID(),
    name: shop.name.trim(),
    tags,
    cuisine: shop.cuisine,
    area: shop.area,
    address: shop.address,
    source: "map",
    status: "want",
    createdAt: new Date().toISOString(),
    lat: shop.lat,
    lng: shop.lng,
    amapPoiId: poiId,
    tel: shop.tel,
    amapRating: shop.rating,
    amapCost: shop.cost,
    openTime: shop.openTime,
    priceLevel: shop.cost != null ? costToPriceLevel(shop.cost) : undefined,
  };
  await writePlace(db, place, { recordVisit: false });
  return { existed: false };
}

function clampRating(value?: number): number | null {
  if (!Number.isFinite(value)) return null;
  const stepped = Math.round((value as number) * 2) / 2;
  return Math.min(5, Math.max(0.5, stepped));
}

function costToPriceLevel(cost: number): number {
  if (cost < 40) return 1;
  if (cost < 80) return 2;
  if (cost < 150) return 3;
  return 4;
}

export function needsAmapDetails(place: Place): boolean {
  if (place.amapStatus === "unmatched") return false;
  if (place.amapStatus === "ok") return false;
  return true;
}

export async function resetUnmatchedPlaces(db: Database): Promise<number> {
  const rows = await db
    .select({ id: schema.places.id })
    .from(schema.places)
    .where(eq(schema.places.amapStatus, "unmatched"));
  if (!rows.length) return 0;
  await db.update(schema.places).set({ amapStatus: null }).where(eq(schema.places.amapStatus, "unmatched"));
  return rows.length;
}

export async function enrichPlaceRow(
  db: Database,
  place: Place,
  cityBias?: string,
  force = false,
): Promise<"updated" | "unmatched"> {
  if (place.name === "某烧烤") {
    const skip = (
      await db.select().from(schema.places).where(eq(schema.places.id, place.id)).limit(1)
    )[0];
    if (!skip) return "unmatched";
    await db.update(schema.places).set({ amapStatus: "unmatched" }).where(eq(schema.places.id, place.id));
    return "unmatched";
  }
  let shop = place.amapPoiId && !force ? await fetchShopDetail(place.amapPoiId) : undefined;
  if (!shop) {
    shop = await matchShopForPlace(place.name, cityBias, {
      area: place.area,
      cuisine: place.cuisine,
      tags: place.tags,
    });
  }
  const row = (
    await db.select().from(schema.places).where(eq(schema.places.id, place.id)).limit(1)
  )[0];
  if (!row) return "unmatched";
  if (!shop) {
    await db.update(schema.places).set({ amapStatus: "unmatched" }).where(eq(schema.places.id, place.id));
    return "unmatched";
  }
  await applyAmapDetails(db, row, shop, { addTags: false });
  return "updated";
}

export async function enrichMissingPlaces(
  db: Database,
  cityBias: string | undefined,
  options: { placeId?: string; limit?: number },
): Promise<{ updated: string[]; unmatched: string[]; remaining: number; missing: number }> {
  const all = await queryPlaces(db);
  const targets = options.placeId
    ? all.filter((place) => place.id === options.placeId)
    : all.filter(needsAmapDetails);
  const batch = targets.slice(0, Math.max(1, Math.min(options.limit ?? 8, 12)));
  const updated: string[] = [];
  const unmatched: string[] = [];
  for (const place of batch) {
    try {
      const result = await enrichPlaceRow(db, place, cityBias, Boolean(options.placeId));
      if (result === "updated") updated.push(place.name);
      else unmatched.push(place.name);
    } catch (error) {
      if (error instanceof AmapError && (error.message.includes("额度") || error.message.includes("CUQPS"))) throw error;
      console.error(JSON.stringify({ enrichError: place.name, error: String(error) }));
      unmatched.push(place.name);
    }
  }
  const stats = await amapFillStats(db);
  return {
    updated,
    unmatched,
    remaining: stats.missing,
    missing: stats.missing,
  };
}

export async function amapFillStats(db: Database): Promise<{ missing: number; unmatched: number; filled: number; total: number }> {
  const rows = await db
    .select({
      amapPoiId: schema.places.amapPoiId,
      tel: schema.places.tel,
      amapRating: schema.places.amapRating,
      amapStatus: schema.places.amapStatus,
    })
    .from(schema.places);
  const total = rows.length;
  let filled = 0;
  let unmatched = 0;
  let missing = 0;
  for (const row of rows) {
    if (row.amapStatus === "unmatched") unmatched += 1;
    else if (row.amapStatus === "ok" || (row.amapPoiId && (row.tel || row.amapRating != null))) filled += 1;
    else missing += 1;
  }
  return { missing, unmatched, filled, total };
}

async function applyAmapDetails(
  db: Database,
  existing: typeof schema.places.$inferSelect,
  shop: ShopCandidate,
  options: { addTags: boolean },
): Promise<void> {
  const poiId = shop.poiId.trim();
  await db
    .update(schema.places)
    .set({
      amapPoiId: poiId,
      address: existing.address || shop.address || null,
      area: existing.area || shop.area || null,
      cuisine: existing.cuisine || shop.cuisine || null,
      tel: shop.tel ?? existing.tel,
      amapRating: shop.rating ?? existing.amapRating,
      amapCost: shop.cost ?? existing.amapCost,
      openTime: shop.openTime ?? existing.openTime,
      amapTag: shop.feature ?? existing.amapTag,
      amapStatus: "ok",
      priceLevel: existing.priceLevel ?? (shop.cost != null ? costToPriceLevel(shop.cost) : null),
      lat: shop.lat,
      lng: shop.lng,
    })
    .where(eq(schema.places.id, existing.id));
  await attachAmapSource(db, existing.id, poiId);
  if (shop.feature) {
    const existingDishes = await db.select({ id: schema.dishes.id }).from(schema.dishes).where(eq(schema.dishes.placeId, existing.id)).limit(1);
    if (!existingDishes[0]) {
      for (const name of shop.feature.split(/[,，、/|]/).map((part) => part.trim()).filter((part) => part.length >= 2)) {
        await addDishRow(db, existing.id, name);
      }
    }
  }
  if (!options.addTags) return;
  const tags = [...new Set([...(shop.tags ?? []), shop.cuisine].filter((item): item is string => Boolean(item)))];
  for (const name of tags) {
    const tagId = await ensureTag(db, name);
    await db.insert(schema.placeTags).values({ placeId: existing.id, tagId }).onConflictDoNothing();
  }
}

async function attachAmapSource(db: Database, placeId: string, poiId: string): Promise<void> {
  await db
    .insert(schema.placeSources)
    .values({
      id: crypto.randomUUID(),
      placeId,
      source: "map",
      externalId: poiId,
      url: null,
    })
    .onConflictDoUpdate({
      target: [schema.placeSources.placeId, schema.placeSources.source],
      set: { externalId: poiId },
    });
}

export async function attachNoteToPlace(
  db: Database,
  placeId: string,
  note: string,
): Promise<{ attached: string[]; missed: string[] }> {
  const places = await queryPlaces(db);
  const place = places.find((item) => item.id === placeId);
  if (!place) return { attached: [], missed: [placeId] };
  return writeAttachedNote(db, place, note);
}

export async function attachNotesFromText(
  db: Database,
  raw: string,
): Promise<{ attached: string[]; missed: string[] }> {
  const places = await queryPlaces(db);
  const clips = parseNotePaste(
    raw,
    places.map((place) => place.name),
  );
  const attached: string[] = [];
  const missed: string[] = [];
  const used = new Set<string>();
  for (const clip of clips) {
    const hit = places.find((place) => !used.has(place.id) && namesMatch(place.name, clip.name));
    if (!hit) {
      missed.push(clip.name);
      continue;
    }
    used.add(hit.id);
    const result = await writeAttachedNote(db, hit, clip.note);
    attached.push(...result.attached);
    hit.notes = mergeNotes(hit.notes, clip.note);
    if (/大爷点评/.test(clip.note) && !hit.tags.includes("大爷点评")) hit.tags = [...hit.tags, "大爷点评"];
  }
  return { attached, missed };
}

async function writeAttachedNote(
  db: Database,
  place: Place,
  note: string,
): Promise<{ attached: string[]; missed: string[] }> {
  const merged = mergeNotes(place.notes, note);
  if (!merged) return { attached: [], missed: [] };
  const tags = [...place.tags];
  if (/大爷点评/.test(note) && !tags.includes("大爷点评")) tags.push("大爷点评");
  await upsertPlaceRow(db, { ...place, notes: merged, tags });
  return { attached: [place.name], missed: [] };
}

function namesMatch(existing: string, incoming: string): boolean {
  const left = compactName(existing);
  const right = compactName(incoming);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  if (shorter.length < 4) return false;
  return left.includes(right) || right.includes(left);
}

export async function addPlaceRows(db: Database, newPlaces: Place[]): Promise<void> {
  const existing = await db.select({ nameKey: schema.places.nameKey }).from(schema.places);
  const keys = new Set(existing.map((row) => row.nameKey));
  for (const place of newPlaces) {
    const key = normalizeName(place.name);
    if (keys.has(key)) continue;
    keys.add(key);
    await writePlace(db, place, { recordVisit: Boolean(place.lastVisitedAt) });
  }
}

async function writePlace(
  db: Pick<Database, "insert" | "update" | "delete" | "select" | "query"> | Database,
  place: Place,
  options: { recordVisit: boolean },
): Promise<void> {
  const values = {
    id: place.id,
    name: place.name,
    nameKey: normalizeName(place.name),
    cuisine: place.cuisine ?? null,
    area: place.area ?? null,
    address: place.address ?? null,
    priceLevel: place.priceLevel ?? null,
    notes: place.notes ?? null,
    source: SOURCES.has(place.source) ? place.source : "manual",
    url: place.url ?? null,
    status: STATUSES.has(place.status) ? place.status : "want",
    lastVisitedAt: place.lastVisitedAt ?? null,
    createdAt: place.createdAt,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    amapPoiId: place.amapPoiId ?? null,
    tel: place.tel ?? null,
    amapRating: place.amapRating ?? null,
    amapCost: place.amapCost ?? null,
    openTime: place.openTime ?? null,
    amapTag: place.amapTag ?? null,
    amapStatus: place.amapStatus ?? null,
  };

  await db
    .insert(schema.places)
    .values(values)
    .onConflictDoUpdate({
      target: schema.places.id,
      set: {
        name: values.name,
        nameKey: values.nameKey,
        cuisine: values.cuisine,
        area: values.area,
        address: values.address,
        priceLevel: values.priceLevel,
        notes: values.notes,
        source: values.source,
        url: values.url,
        status: values.status,
        lastVisitedAt: values.lastVisitedAt,
        ...(place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : {}),
        ...(place.amapPoiId ? { amapPoiId: place.amapPoiId } : {}),
        ...(place.tel ? { tel: place.tel } : {}),
        ...(place.amapRating != null ? { amapRating: place.amapRating } : {}),
        ...(place.amapCost != null ? { amapCost: place.amapCost } : {}),
        ...(place.openTime ? { openTime: place.openTime } : {}),
        ...(place.amapTag ? { amapTag: place.amapTag } : {}),
        ...(place.amapStatus ? { amapStatus: place.amapStatus } : {}),
      },
    });

  await db.delete(schema.placeTags).where(eq(schema.placeTags.placeId, place.id));
  const uniqueTags = [...new Set((place.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  for (const name of uniqueTags) {
    const tagId = await ensureTag(db, name);
    await db.insert(schema.placeTags).values({ placeId: place.id, tagId }).onConflictDoNothing();
  }

  if (place.url || place.source || place.amapPoiId) {
    await db
      .insert(schema.placeSources)
      .values({
        id: crypto.randomUUID(),
        placeId: place.id,
        source: values.source,
        externalId: place.amapPoiId ?? null,
        url: place.url ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.placeSources.placeId, schema.placeSources.source],
        set: { url: place.url ?? null, externalId: place.amapPoiId ?? null },
      });
  }

  if (options.recordVisit && place.lastVisitedAt) {
    await db.insert(schema.visits).values({
      id: crypto.randomUUID(),
      placeId: place.id,
      visitedAt: place.lastVisitedAt,
      note: null,
    });
  }
}

async function ensureTag(
  db: Pick<Database, "insert" | "select">,
  name: string,
): Promise<string> {
  const found = await db.select({ id: schema.tags.id }).from(schema.tags).where(eq(schema.tags.name, name)).limit(1);
  if (found[0]) return found[0].id;
  const id = crypto.randomUUID();
  await db.insert(schema.tags).values({ id, name }).onConflictDoNothing();
  const again = await db.select({ id: schema.tags.id }).from(schema.tags).where(eq(schema.tags.name, name)).limit(1);
  return again[0]?.id ?? id;
}

function placeConditions(filter: PlaceFilter) {
  const conditions = [];
  const q = filter.q?.trim();
  if (q) {
    const pattern = containsPattern(q);
    conditions.push(
      or(
        like(schema.places.name, pattern),
        like(schema.places.notes, pattern),
        like(schema.places.address, pattern),
        like(schema.places.area, pattern),
        like(schema.places.cuisine, pattern),
        sql`exists (
          select 1 from dishes
          where dishes.place_id = ${schema.places.id}
            and dishes.name like ${pattern}
        )`,
      ),
    );
  }
  const cuisine = filter.cuisine?.trim();
  if (cuisine) conditions.push(eq(schema.places.cuisine, cuisine));
  const area = filter.area?.trim();
  if (area) conditions.push(like(schema.places.area, `${escapeLike(area)}%`));
  const status = filter.status;
  if (status && STATUSES.has(status)) conditions.push(eq(schema.places.status, status));
  const tag = filter.tag?.trim();
  if (tag) {
    conditions.push(
      sql`exists (
        select 1 from place_tags
        inner join tags on tags.id = place_tags.tag_id
        where place_tags.place_id = ${schema.places.id}
          and tags.name = ${tag}
      )`,
    );
  }
  return conditions;
}

function parseDishesEaten(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // fall through
  }
  return raw
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "");
}

function toPlace(
  row: typeof schema.places.$inferSelect,
  tags: string[],
  dishes: Dish[] = [],
  visits: Visit[] = [],
): Place {
  return {
    id: row.id,
    name: row.name,
    tags,
    cuisine: row.cuisine ?? undefined,
    area: row.area ?? undefined,
    address: row.address ?? undefined,
    priceLevel: row.priceLevel ?? undefined,
    notes: row.notes ?? undefined,
    source: SOURCES.has(row.source as PlaceSource) ? (row.source as PlaceSource) : "manual",
    url: row.url ?? undefined,
    status: STATUSES.has(row.status as PlaceStatus) ? (row.status as PlaceStatus) : "neutral",
    lastVisitedAt: row.lastVisitedAt ?? undefined,
    createdAt: row.createdAt,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    amapPoiId: row.amapPoiId ?? undefined,
    tel: row.tel ?? undefined,
    amapRating: row.amapRating ?? undefined,
    amapCost: row.amapCost ?? undefined,
    openTime: row.openTime ?? undefined,
    amapTag: row.amapTag ?? undefined,
    amapStatus: row.amapStatus ?? undefined,
    dishes,
    visits,
  };
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
