import { existsSync } from "fs";
import { resolve } from "path";
import { createClient, type Client, type InValue } from "@libsql/client";
import { dbFile } from "./paths";

const TABLES = ["places", "tags", "place_tags", "dishes", "visits", "geocodes", "place_sources"] as const;

const FILL_COLS = [
  "lat",
  "lng",
  "address",
  "cuisine",
  "area",
  "amap_poi_id",
  "tel",
  "amap_rating",
  "amap_cost",
  "open_time",
  "amap_tag",
  "amap_status",
] as const;

export async function importBundledLibrary(client: Client): Promise<number | undefined> {
  const bundled = process.env.FRIDAYBITE_BUNDLED_DB;
  if (!bundled || !existsSync(bundled)) return;
  if (resolve(bundled) === resolve(dbFile)) return;

  const source = createClient({ url: `file:${bundled.replace(/\\/g, "/")}` });
  try {
    const remoteN = Number((await source.execute("select count(*) as n from places")).rows[0].n);
    const localN = Number((await client.execute("select count(*) as n from places")).rows[0].n);
    if (!remoteN || remoteN <= localN) return localN;

    await client.execute("PRAGMA foreign_keys = OFF");
    for (const table of TABLES) {
      const result = await source.execute(`SELECT * FROM ${table}`);
      const cols = result.columns;
      if (!cols.length || !result.rows.length) continue;
      const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      const stmts = result.rows.map((row) => ({
        sql,
        args: cols.map((col) => row[col] as InValue),
      }));
      for (let i = 0; i < stmts.length; i += 200) {
        await client.batch(stmts.slice(i, i + 200), "write");
      }
    }

    const setClause = FILL_COLS.map((col) => `${col} = COALESCE(${col}, ?)`).join(", ");
    const bundledPlaces = await source.execute(
      `SELECT id, ${FILL_COLS.join(", ")} FROM places WHERE amap_poi_id IS NOT NULL AND amap_poi_id != ''`,
    );
    const updates = bundledPlaces.rows.map((row) => ({
      sql: `UPDATE places SET ${setClause} WHERE id = ? AND (amap_poi_id IS NULL OR amap_poi_id = '')`,
      args: [...FILL_COLS.map((col) => row[col] as InValue), row.id as InValue],
    }));
    for (let i = 0; i < updates.length; i += 200) {
      await client.batch(updates.slice(i, i + 200), "write");
    }
    await client.execute("PRAGMA foreign_keys = ON");
    return Number((await client.execute("select count(*) as n from places")).rows[0].n);
  } finally {
    source.close();
  }
}
