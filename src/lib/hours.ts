import type { Place } from "./types";

export function isOpenNow(openTime?: string, now = new Date()): boolean | undefined {
  if (!openTime?.trim()) return undefined;
  const ranges = [...openTime.matchAll(/(\d{1,2}):(\d{2})\s*[-–~到至]\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return undefined;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return ranges.some((match) => {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (end > start) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  });
}

export function openBadge(openTime?: string, now = new Date()): string | undefined {
  const open = isOpenNow(openTime, now);
  if (open === true) return "营业中";
  if (open === false) return "现在关门";
  return undefined;
}

export function closedLast(a: Place, b: Place): number {
  const left = isOpenNow(a.openTime) === false ? 1 : 0;
  const right = isOpenNow(b.openTime) === false ? 1 : 0;
  return left - right;
}
