import path from "path";

const root = process.env.FRIDAYBITE_ROOT || process.cwd();

export const dataDir = process.env.FRIDAYBITE_DATA_DIR || path.join(root, "data");
export const dbFile = path.join(dataDir, "fridaybite.db");
export const seedFile = path.join(root, "data", "places.seed.json");
export const saoFile = path.join(root, "data", "sao-dalian.json");
export const localJsonFile = path.join(dataDir, "places.local.json");
export const migrationsDir = path.join(root, "drizzle");

export function dbFileUrl(): string {
  return `file:${dbFile.replace(/\\/g, "/")}`;
}
