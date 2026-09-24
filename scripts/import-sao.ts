import { readFile } from "fs/promises";
import path from "path";
import { getDb } from "../src/db/client";
import { normalizeName, queryPlaces, upsertPlaceRow } from "../src/db/places";
import type { Place, PlaceSource, PlaceStatus } from "../src/lib/types";

type SaoRecord = Place & { match?: string[] };

const STATUSES = new Set<PlaceStatus>(["want", "neutral", "skip"]);

function compact(name: string): string {
  return normalizeName(name).replace(/[（）()·・\-]/g, "");
}

function isMatch(existing: Place, incoming: SaoRecord): boolean {
  const existingKey = compact(existing.name);
  const names = [incoming.name, ...(incoming.match ?? [])];
  return names.some((name) => {
    const key = compact(name);
    if (!key) return false;
    return existingKey === key || existingKey.includes(key) || key.includes(existingKey);
  });
}

function mergeNotes(previous: string | undefined, next: string | undefined): string | undefined {
  const left = previous?.trim() ?? "";
  const right = next?.trim() ?? "";
  if (!right) return left || undefined;
  if (!left) return right;
  if (left.includes(right) || right.includes(left)) return left.length >= right.length ? left : right;
  return `${left} ｜ ${right}`;
}

function mergePlace(existing: Place, incoming: SaoRecord): Place {
  const incomingWinsSkip = incoming.status === "skip" && existing.status !== "skip";
  const incomingWinsWant = incoming.status === "want" && existing.status === "neutral";
  return {
    ...existing,
    tags: [...new Set([...existing.tags, ...incoming.tags])],
    cuisine: existing.cuisine ?? incoming.cuisine,
    area: existing.area ?? incoming.area,
    address: existing.address ?? incoming.address,
    priceLevel: existing.priceLevel ?? incoming.priceLevel,
    notes: mergeNotes(existing.notes, incoming.notes),
    source: existing.source === "list" ? "douyin" : existing.source,
    status: incomingWinsSkip || incomingWinsWant ? incoming.status : existing.status,
  };
}

function toPlace(record: SaoRecord, now: string): Place {
  return {
    id: record.id,
    name: record.name,
    tags: record.tags,
    cuisine: record.cuisine,
    area: record.area,
    address: record.address,
    priceLevel: record.priceLevel,
    notes: record.notes,
    source: (record.source ?? "douyin") as PlaceSource,
    url: record.url,
    status: STATUSES.has(record.status) ? record.status : "want",
    createdAt: record.createdAt ?? now,
  };
}

async function main() {
  const file = path.join(process.cwd(), "data", "sao-dalian.json");
  const records = JSON.parse(await readFile(file, "utf8")) as SaoRecord[];
  const now = new Date().toISOString();
  const db = await getDb();
  const existing = await queryPlaces(db);

  let updated = 0;
  let inserted = 0;
  const used = new Set<string>();

  for (const record of records) {
    const hit = existing.find((place) => !used.has(place.id) && isMatch(place, record));
    if (hit) {
      used.add(hit.id);
      await upsertPlaceRow(db, mergePlace(hit, record));
      updated += 1;
      continue;
    }
    await upsertPlaceRow(db, toPlace(record, now));
    inserted += 1;
  }

  const after = await queryPlaces(db);
  const fromSao = after.filter((place) => place.tags.includes("大爷点评"));
  console.log(
    JSON.stringify(
      {
        records: records.length,
        inserted,
        updated,
        total: after.length,
        taggedSao: fromSao.length,
        want: fromSao.filter((place) => place.status === "want").length,
        skip: fromSao.filter((place) => place.status === "skip").length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
