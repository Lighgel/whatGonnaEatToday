import { getDb } from "../src/db/client";
import { ensurePlaceCoords, queryPlaces } from "../src/db/places";

async function main() {
  const cityBias = process.argv[2]?.trim() || undefined;
  const db = await getDb();
  const places = await queryPlaces(db);
  const located = await ensurePlaceCoords(db, places, cityBias);
  const withCoords = located.filter((place) => place.lat != null && place.lng != null).length;
  console.log(`geocoded ${withCoords} / ${places.length}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
