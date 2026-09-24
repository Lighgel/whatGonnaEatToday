import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { readFile } from "fs/promises";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { localJsonFile, saoFile, seedFile } from "./paths";
import { distanceKm, withinRadius, type Origin } from "@/lib/geo";
import { geocode, placeQuery } from "@/lib/geocode";
import type { Dish, Place, PlaceFacets, PlaceFilter, PlaceSource, PlaceStatus, Visit } from "@/lib/types";

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
    const query = placeQuery(place);
    const hit = query ? await geocode(db, query, cityBias) : undefined;
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
  input: { placeId: string; dishes?: string[]; note?: string; keep?: PlaceStatus },
): Promise<void> {
  const visitedAt = new Date().toISOString();
  const keep = input.keep && STATUSES.has(input.keep) ? input.keep : "want";
  const dishes = [...new Set((input.dishes ?? []).map((name) => name.trim()).filter(Boolean))];
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
  });
  for (const name of dishes) {
    await addDishRow(db, input.placeId, name);
  }
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
      },
    });

  await db.delete(schema.placeTags).where(eq(schema.placeTags.placeId, place.id));
  const uniqueTags = [...new Set((place.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  for (const name of uniqueTags) {
    const tagId = await ensureTag(db, name);
    await db.insert(schema.placeTags).values({ placeId: place.id, tagId }).onConflictDoNothing();
  }

  if (place.url || place.source) {
    await db
      .insert(schema.placeSources)
      .values({
        id: crypto.randomUUID(),
        placeId: place.id,
        source: values.source,
        externalId: null,
        url: place.url ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.placeSources.placeId, schema.placeSources.source],
        set: { url: place.url ?? null },
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
