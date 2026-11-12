import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { fetchLiveWeather, reverseArea } from "./amap";
import type { Origin } from "./geo";

type Database = LibSQLDatabase<typeof schema>;

export type WeatherHint = {
  weather: string;
  temperature: number;
  city: string;
  mood: string;
  hint: string;
};

const TTL_MS = 30 * 60_000;

export async function weatherFor(db: Database, origin: Origin): Promise<WeatherHint | undefined> {
  const adcode = origin.adcode || (await reverseArea(origin)).adcode;
  if (!adcode) return undefined;
  const cached = await readWeather(db, adcode);
  if (cached) return cached;
  const live = await fetchLiveWeather(adcode);
  if (!live) return undefined;
  const hint = toHint(live);
  await writeWeather(db, adcode, hint);
  return hint;
}

function toHint(live: { weather: string; temperature: number; city: string }): WeatherHint {
  const weather = live.weather;
  const temperature = live.temperature;
  let mood = "";
  let hint = `今天${weather}${Number.isFinite(temperature) ? ` ${temperature}°C` : ""}`;
  if (/雨|雪|雷/.test(weather)) {
    mood = "下雨";
    hint = `今天${weather}，偏向火锅和面`;
  } else if (temperature >= 28) {
    mood = "清淡";
    hint = `现在 ${temperature}°C，偏向清淡`;
  } else if (temperature <= 5) {
    mood = "冷";
    hint = `现在 ${temperature}°C，偏向热汤热面`;
  }
  return { weather, temperature, city: live.city, mood, hint };
}

async function readWeather(db: Database, adcode: string): Promise<WeatherHint | undefined> {
  const key = `amap-weather\n${adcode}`;
  const row = (await db.select().from(schema.geocodes).where(eq(schema.geocodes.query, key)).limit(1))[0];
  if (!row?.label || !row.updatedAt) return undefined;
  if (Date.now() - Date.parse(row.updatedAt) > TTL_MS) return undefined;
  try {
    const parsed = JSON.parse(row.label) as WeatherHint;
    if (parsed.weather && parsed.hint) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeWeather(db: Database, adcode: string, hint: WeatherHint): Promise<void> {
  const key = `amap-weather\n${adcode}`;
  await db
    .insert(schema.geocodes)
    .values({
      query: key,
      lat: hint.temperature,
      lng: 0,
      label: JSON.stringify(hint),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.geocodes.query,
      set: { lat: hint.temperature, label: JSON.stringify(hint), updatedAt: new Date().toISOString() },
    });
}
