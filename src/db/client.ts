import { mkdir } from "fs/promises";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { count } from "drizzle-orm";
import * as schema from "./schema";
import { dataDir, dbFileUrl, migrationsDir } from "./paths";
import { bootstrapPlacesIfEmpty } from "./places";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let ready: Promise<Database> | undefined;

export function getDb(): Promise<Database> {
  if (!ready) ready = initDb();
  return ready;
}

async function initDb(): Promise<Database> {
  await mkdir(dataDir, { recursive: true });
  const client = createClient({ url: dbFileUrl() });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsDir });
  const [{ value }] = await db.select({ value: count() }).from(schema.places);
  if (value === 0) await bootstrapPlacesIfEmpty(db);
  return db;
}
