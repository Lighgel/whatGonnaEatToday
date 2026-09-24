import path from "path";

export const dataDir = path.join(process.cwd(), "data");
export const dbFile = path.join(dataDir, "fridaybite.db");
export const seedFile = path.join(dataDir, "places.seed.json");
export const saoFile = path.join(dataDir, "sao-dalian.json");
export const localJsonFile = path.join(dataDir, "places.local.json");
export const migrationsDir = path.join(process.cwd(), "drizzle");

export function dbFileUrl(): string {
  return `file:${dbFile.replace(/\\/g, "/")}`;
}
