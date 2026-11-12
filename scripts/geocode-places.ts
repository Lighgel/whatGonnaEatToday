import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/client";
import { ensurePlaceCoords, queryPlaces } from "../src/db/places";

function loadLocalEnv(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  const cityBias = process.argv[2]?.trim() || undefined;
  const db = await getDb();
  const places = await queryPlaces(db);
  const missing = places.filter((place) => place.lat == null || place.lng == null).length;
  console.log(`missing ${missing} / ${places.length}`);
  const located = await ensurePlaceCoords(db, places, cityBias);
  const withCoords = located.filter((place) => place.lat != null && place.lng != null).length;
  const stillMissing = located.filter((place) => place.lat == null || place.lng == null);
  console.log(`geocoded ${withCoords} / ${places.length}`);
  if (stillMissing.length) {
    console.log(`unresolved ${stillMissing.length}`);
    for (const place of stillMissing.slice(0, 15)) console.log(`- ${place.name}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
