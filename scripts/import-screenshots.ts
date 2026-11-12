import fs from "node:fs";
import { readFile } from "fs/promises";
import path from "path";
import { getDb } from "../src/db/client";
import { amapFillStats, enrichMissingPlaces, normalizeName, queryPlaces, resetUnmatchedPlaces, upsertPlaceRow } from "../src/db/places";
import type { Place, PlaceSource } from "../src/lib/types";

type ShotRecord = {
  name: string;
  source: "meituan" | "douyin";
  cuisine?: string;
  area?: string;
  tags?: string[];
  match?: string[];
  flag?: string;
};

const SOURCE_TAG: Record<ShotRecord["source"], string> = {
  meituan: "美团收藏",
  douyin: "抖音想去",
};

function loadLocalEnv(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

function compact(name: string): string {
  return normalizeName(name)
    .replace(/[（）()\[\]【】·・\-.、&]/g, "")
    .replace(/店$/, "");
}

function parseShopName(name: string): { stem: string; branch: string; compact: string } {
  const raw = name.trim();
  const matched = raw.match(/^(.*?)[（(]([^）)]+)[）)]\s*$/);
  const stemRaw = (matched ? matched[1] : raw).trim();
  const branchRaw = (matched ? matched[2] : "").trim();
  return {
    stem: compact(stemRaw).replace(/店$/, ""),
    branch: compact(branchRaw).replace(/(店|总店|总)$/g, ""),
    compact: compact(raw),
  };
}

function branchesCompatible(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function namesMatch(existingName: string, incomingName: string, aliases: string[] = []): boolean {
  const incomingNames = [incomingName, ...aliases];
  const existing = parseShopName(existingName);
  for (const candidate of incomingNames) {
    if (normalizeName(existingName) === normalizeName(candidate)) return true;
    const incoming = parseShopName(candidate);
    if (!existing.compact || !incoming.compact) continue;
    if (existing.compact === incoming.compact) return true;
    if (existing.stem.length >= 2 && existing.stem === incoming.stem && branchesCompatible(existing.branch, incoming.branch)) {
      return true;
    }
  }
  return false;
}

function mergeNotes(previous: string | undefined, next: string | undefined): string | undefined {
  const left = previous?.trim() ?? "";
  const right = next?.trim() ?? "";
  if (!right) return left || undefined;
  if (!left) return right;
  if (left.includes(right) || right.includes(left)) return left.length >= right.length ? left : right;
  return `${left} ｜ ${right}`;
}

function pickText(left?: string, right?: string): string | undefined {
  const a = left?.trim() ?? "";
  const b = right?.trim() ?? "";
  if (!a) return b || undefined;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function recordTags(record: ShotRecord): string[] {
  const tags = [...(record.tags ?? []), SOURCE_TAG[record.source]];
  if (record.cuisine) tags.push(record.cuisine);
  if (record.area) tags.push(record.area);
  if (record.flag) tags.push(record.flag);
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function recordNote(record: ShotRecord): string {
  const origin = record.source === "meituan" ? "美团收藏截图导入" : "抖音想去清单导入";
  return record.flag ? `${origin} ｜ ${record.flag}` : origin;
}

function mergeIncoming(records: ShotRecord[]): ShotRecord[] {
  const merged: ShotRecord[] = [];
  for (const record of records) {
    const hit = merged.find(
      (item) =>
        namesMatch(item.name, record.name, record.match ?? []) ||
        namesMatch(record.name, item.name, item.match ?? []),
    );
    if (!hit) {
      merged.push({
        ...record,
        tags: recordTags(record),
        match: [...(record.match ?? [])],
      });
      continue;
    }
    hit.tags = [...new Set([...recordTags(hit), ...recordTags(record)])];
    hit.match = [...new Set([...(hit.match ?? []), ...(record.match ?? [])])];
    hit.cuisine = pickText(hit.cuisine, record.cuisine);
    hit.area = pickText(hit.area, record.area);
    hit.flag = pickText(hit.flag, record.flag);
    if (record.source === "meituan") hit.source = "meituan";
    if (record.name.length > hit.name.length) hit.name = record.name;
  }
  return merged;
}

function mergePlace(existing: Place, incoming: ShotRecord): Place {
  const source: PlaceSource =
    existing.source === "list" || existing.source === "manual" ? incoming.source : existing.source;
  return {
    ...existing,
    tags: [...new Set([...existing.tags, ...recordTags(incoming)])],
    cuisine: existing.cuisine ?? incoming.cuisine,
    area: existing.area ?? incoming.area,
    notes: mergeNotes(existing.notes, recordNote(incoming)),
    source,
    status: existing.status === "skip" ? "skip" : "want",
  };
}

function toPlace(record: ShotRecord, now: string): Place {
  return {
    id: crypto.randomUUID(),
    name: record.name,
    tags: recordTags(record),
    cuisine: record.cuisine,
    area: record.area,
    notes: recordNote(record),
    source: record.source,
    status: "want",
    createdAt: now,
  };
}

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function dumpCounts() {
  const db = await getDb();
  const after = await queryPlaces(db);
  const tagged = after.filter((place) => place.tags.includes("美团收藏") || place.tags.includes("抖音想去"));
  const stats = await amapFillStats(db);
  const payload = {
    total: after.length,
    screenshotTagged: tagged.length,
    meituan: tagged.filter((place) => place.tags.includes("美团收藏")).length,
    douyin: tagged.filter((place) => place.tags.includes("抖音想去")).length,
    missingNames: after
      .filter((place) => place.amapStatus !== "unmatched" && place.amapStatus !== "ok" && !(place.amapPoiId && (place.tel || place.amapRating != null)))
      .map((place) => place.name),
    ...stats,
  };
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

async function enrichAll(cityBias: string, once: boolean): Promise<void> {
  if (!process.env.AMAP_KEY) {
    console.log("skip enrich: AMAP_KEY missing");
    return;
  }
  const db = await getDb();
  let guard = 0;
  let previous = Number.POSITIVE_INFINITY;
  const max = once ? 1 : 80;
  while (guard < max) {
    guard += 1;
    try {
      const result = await enrichMissingPlaces(db, cityBias, { limit: 6 });
      console.log(
        JSON.stringify({
          batch: guard,
          updated: result.updated.length,
          unmatched: result.unmatched.length,
          remaining: result.remaining,
          names: result.updated.slice(0, 4),
        }),
      );
      if (result.remaining === 0) break;
      if (result.remaining >= previous && result.updated.length === 0) break;
      previous = result.remaining;
    } catch (error) {
      console.error(JSON.stringify({ batch: guard, error: String(error) }));
      if (String(error).includes("额度")) break;
      if (String(error).includes("CUQPS")) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      if (once) throw error;
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

async function importScreenshots() {
  const files = ["screenshot-meituan.json", "screenshot-douyin.json"].map((name) =>
    path.join(process.cwd(), "data", name),
  );
  const raw: ShotRecord[] = [];
  for (const file of files) {
    raw.push(...(JSON.parse(await readFile(file, "utf8")) as ShotRecord[]));
  }
  const records = mergeIncoming(raw);
  const now = new Date().toISOString();
  const db = await getDb();
  const existing = await queryPlaces(db);
  const pool = [...existing];
  let updated = 0;
  let inserted = 0;

  for (const record of records) {
    const hit =
      pool.find((place) => namesMatch(place.name, record.name, record.match ?? [])) ??
      pool.find((place) => normalizeName(place.name) === normalizeName(record.name));
    if (hit) {
      const merged = mergePlace(hit, record);
      await upsertPlaceRow(db, merged);
      Object.assign(hit, merged);
      updated += 1;
      continue;
    }
    const place = toPlace(record, now);
    try {
      await upsertPlaceRow(db, place);
      pool.push(place);
      inserted += 1;
    } catch (error) {
      const fresh = await queryPlaces(db);
      const existingHit = fresh.find((item) => normalizeName(item.name) === normalizeName(record.name));
      if (!existingHit) throw error;
      const merged = mergePlace(existingHit, record);
      await upsertPlaceRow(db, merged);
      pool.push(merged);
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        incoming: records.length,
        inserted,
        updated,
      },
      null,
      2,
    ),
  );
}

async function main() {
  loadLocalEnv();
  const statsOnly = argFlag("--stats-only");
  const enrichOnce = argFlag("--enrich-once");
  const retryUnmatched = argFlag("--retry-unmatched");
  const enrichOnly = argFlag("--enrich-only") || enrichOnce;
  const enrich = enrichOnce || enrichOnly || retryUnmatched || (!argFlag("--no-enrich") && !statsOnly);

  if (statsOnly) {
    await dumpCounts();
    return;
  }
  if (!enrichOnly && !retryUnmatched) await importScreenshots();
  if (retryUnmatched) {
    const db = await getDb();
    const reset = await resetUnmatchedPlaces(db);
    console.log(JSON.stringify({ resetUnmatched: reset }));
  }
  await dumpCounts();
  if (enrich) await enrichAll("大连", enrichOnce);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
