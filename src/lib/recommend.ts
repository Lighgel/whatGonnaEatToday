import { experienceReason, experienceScore, visitAverageRating } from "./experience";
import { distanceKm, formatDistance, withinRadius, type Origin } from "./geo";
import { closedLast, isOpenNow } from "./hours";
import type { Place, RecommendRequest, RecommendResult } from "./types";

const MOOD_TAGS: Record<string, string[]> = {
  累: ["快", "面", "粉", "米饭", "家常", "近"],
  疲惫: ["快", "面", "粉", "家常"],
  开心: ["火锅", "烧烤", "聚餐", "甜品", "日料", "海鲜"],
  庆祝: ["火锅", "烧烤", "聚餐", "日料", "西餐", "海鲜"],
  想辣: ["辣", "川菜", "湘菜", "冒菜", "麻辣", "火锅"],
  清淡: ["清淡", "粤菜", "日料", "粥", "沙拉", "蒸"],
  想吃肉: ["烤肉", "烧烤", "牛肉", "卤味", "汉堡", "牛舌"],
  想吃面: ["面", "粉", "拉面", "米线", "回勺面"],
  下雨: ["火锅", "面", "粉", "黄焖鸡", "家常"],
  冷: ["火锅", "面", "粉", "羊肉汤", "家常"],
  热: ["清淡", "日料", "凉", "面"],
  周五: ["火锅", "烧烤", "聚餐", "炸鸡", "啤酒", "海鲜"],
  海鲜: ["海鲜", "海肠", "海胆", "扇贝", "生蚝", "蚬子"],
  烧烤: ["烧烤", "烤肉", "串", "啤酒"],
  聚餐: ["聚餐", "海鲜", "火锅", "烧烤"],
};

const FOOD_WORDS = [
  "海鲜",
  "烧烤",
  "火锅",
  "日料",
  "烤肉",
  "面",
  "辣",
  "清淡",
  "家常",
  "甜品",
  "饺子",
  "焖子",
  "烧肉",
  "粉",
  "西餐",
  "牛排",
  "海肠",
  "海胆",
  "牛舌",
  "聚餐",
  "咖喱",
  "烤鱼",
  "羊肉汤",
  "快",
  "寿司",
  "刺身",
];

const FOOD_SYNONYMS: Record<string, string[]> = {
  烧烤: ["烧烤", "烤肉", "烧肉", "串"],
  烤肉: ["烤肉", "烧烤", "烧肉"],
  日料: ["日料", "寿司", "刺身", "回转"],
  火锅: ["火锅", "涮"],
  海鲜: ["海鲜", "海肠", "海胆", "扇贝", "生蚝", "蚬子"],
  面: ["面", "粉", "拉面", "米线"],
};

export function selectCandidates(places: Place[], request: RecommendRequest): Place[] {
  const foodNeedles = parseFoodNeedles(request.keywords);
  const excluded = new Set(request.excludeIds ?? []);
  return places.filter(
    (place) =>
      place.status !== "skip" && !excluded.has(place.id) && (!foodNeedles.length || matchesFood(place, foodNeedles)),
  );
}

export function recommend(places: Place[], request: RecommendRequest): RecommendResult[] {
  const query = `${request.mood ?? ""} ${request.keywords ?? ""}`.trim();
  const moodTags = expandQuery(query);
  const foodNeedles = parseFoodNeedles(request.keywords);
  const origin = coordsOrigin(request);
  const radiusKm = origin ? request.radiusKm : undefined;
  const now = Date.now();
  const scored = selectCandidates(places, request)
    .filter((place) => !origin || withinRadius(place, origin, radiusKm))
    .map((place) => {
      const km = origin ? distanceKm(place, origin) : undefined;
      const haystack = [
        place.name,
        place.cuisine,
        place.area,
        place.address,
        place.notes,
        ...place.tags,
        ...(place.dishes ?? []).map((dish) => dish.name),
        ...(place.visits ?? []).flatMap((visit) => [visit.note, ...(visit.dishes ?? [])]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      let score = 1;
      for (const tag of moodTags) {
        if (haystack.includes(tag.toLowerCase())) score += 3;
      }
      score += foodScore(place, foodNeedles);
      score += experienceScore(place, now);
      if (km != null) score += Math.max(0, 4 - km * 0.4);
      const reason = buildReason(place, moodTags, request, origin, km);
      return { place, score, reason, distanceKm: km, closed: isOpenNow(place.openTime) === false };
    })
    .sort((a, b) => {
      const shut = closedLast(a.place, b.place);
      if (shut) return shut;
      if (origin) {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (Math.abs(da - db) > 0.4) return da - db;
      }
      return b.score - a.score;
    });

  const unique = scored.filter(
    (item, index, list) => list.findIndex((other) => other.place.id === item.place.id) === index,
  );

  if (request.spin) {
    const pool = unique.slice(0, 12);
    const winner = pickWeighted(pool);
    return winner ? [{ ...winner, reason: spinReason(winner.place, origin, winner.distanceKm) }] : [];
  }
  if (request.daily) {
    const winner = pickWeighted(unique);
    return winner ? [winner] : [];
  }
  return unique.slice(0, 3);
}

export function spinPoolNames(places: Place[], request: RecommendRequest): string[] {
  return selectCandidates(places, request)
    .slice()
    .sort((a, b) => closedLast(a, b) || experienceScore(b) - experienceScore(a))
    .slice(0, 12)
    .map((place) => place.name);
}

export function pickWeighted<T extends { place: Place }>(items: T[], now = Date.now()): T | undefined {
  if (!items.length) return undefined;
  const weights = items.map((item) => dailyWeight(item.place, now));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return items[0];
  let needle = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    needle -= weights[index];
    if (needle <= 0) return items[index];
  }
  return items[items.length - 1];
}

export function dailyWeight(place: Place, now = Date.now()): number {
  const rating = visitAverageRating(place) ?? place.amapRating ?? 3.2;
  let weight = Math.max(0.6, rating) ** 2;
  if (place.status === "want") weight *= 1.35;
  if (isOpenNow(place.openTime) === false) weight *= 0.12;
  const latest = place.visits?.[0]?.visitedAt ?? place.lastVisitedAt;
  if (latest) {
    const days = (now - Date.parse(latest)) / 86_400_000;
    if (Number.isFinite(days) && days < 7) weight *= 0.18;
  }
  return weight;
}

function spinReason(place: Place, origin?: Origin, km?: number): string {
  const near = origin && km != null ? `距${origin.label.split(" · ")[0]} ${formatDistance(km)}。` : "";
  return `${near}转盘落到这家。${experienceReason(place)}`.trim();
}

function parseFoodNeedles(keywords?: string): string[] {
  if (!keywords?.trim()) return [];
  const needles = new Set<string>();
  for (const part of keywords.split(/[\s,，、]+/)) {
    const word = part.trim();
    if (word.length < 2) continue;
    needles.add(word);
    for (const extra of FOOD_SYNONYMS[word] ?? []) needles.add(extra);
  }
  return [...needles];
}

function foodHaystack(place: Place): string {
  return [
    place.name,
    place.cuisine,
    ...(place.tags ?? []),
    ...(place.dishes ?? []).map((dish) => dish.name),
    ...(place.visits ?? []).flatMap((visit) => visit.dishes ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFood(place: Place, needles: string[]): boolean {
  const hay = foodHaystack(place);
  return needles.some((needle) => hay.includes(needle.toLowerCase()));
}

function foodScore(place: Place, needles: string[]): number {
  if (!needles.length) return 0;
  let score = 0;
  const cuisine = (place.cuisine ?? "").toLowerCase();
  const tags = (place.tags ?? []).join(" ").toLowerCase();
  const dishes = (place.dishes ?? []).map((dish) => dish.name).join(" ").toLowerCase();
  const name = place.name.toLowerCase();
  for (const needle of needles) {
    const word = needle.toLowerCase();
    if (cuisine.includes(word)) score += 8;
    else if (tags.includes(word)) score += 6;
    else if (dishes.includes(word)) score += 5;
    else if (name.includes(word)) score += 4;
  }
  return score;
}

function coordsOrigin(request: RecommendRequest): Origin | undefined {
  if (!Number.isFinite(request.lat) || !Number.isFinite(request.lng)) return undefined;
  return { lat: request.lat as number, lng: request.lng as number, label: request.location?.trim() || "这里" };
}

function expandQuery(text: string): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const part of text.split(/[\s,，、]+/)) {
    if (part.trim()) tags.add(part.trim());
  }
  for (const [mood, mapped] of Object.entries(MOOD_TAGS)) {
    if (text.includes(mood)) {
      tags.add(mood);
      for (const tag of mapped) tags.add(tag);
    }
  }
  for (const word of FOOD_WORDS) {
    if (text.includes(word)) tags.add(word);
  }
  return [...tags];
}

function buildReason(
  place: Place,
  moodTags: string[],
  request: RecommendRequest,
  origin?: Origin,
  km?: number,
): string {
  const hay = [
    place.name,
    place.cuisine,
    ...(place.tags ?? []),
    ...(place.dishes ?? []).map((dish) => dish.name),
    ...(place.visits ?? []).flatMap((visit) => [visit.note, ...(visit.dishes ?? [])]),
  ].join(" ");
  const hits = [...new Set(moodTags.filter((tag) => tag.length >= 2 && hay.includes(tag)))];
  const memory = experienceReason(place);
  const dishNames = (place.dishes ?? []).map((dish) => dish.name).slice(0, 2);
  const dishHint = dishNames.length ? ` 可点${dishNames.join("、")}。` : "";
  const nearHint = origin && km != null ? `距${origin.label} ${formatDistance(km)}。` : "";
  if (request.daily) {
    const shut = isOpenNow(place.openTime) === false ? "现在关门，先看看别的也行。" : "";
    return `${nearHint}今天就定 ${place.name}。${shut}${memory}${dishHint}`.trim();
  }
  if (hits.length) return `${nearHint}${memory} 对得上「${hits.slice(0, 3).join(" / ")}」。${dishHint}`.trim();
  return `${nearHint}${memory}${dishHint}`.trim();
}
