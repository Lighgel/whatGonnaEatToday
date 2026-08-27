import type { Place, RecommendRequest, RecommendResult } from "./types";

const MOOD_TAGS: Record<string, string[]> = {
  累: ["快", "面", "粉", "米饭", "家常", "近"],
  疲惫: ["快", "面", "粉", "家常"],
  开心: ["火锅", "烧烤", "聚餐", "甜品", "日料"],
  庆祝: ["火锅", "烧烤", "聚餐", "日料", "西餐"],
  想辣: ["辣", "川菜", "湘菜", "冒菜", "麻辣"],
  清淡: ["清淡", "粤菜", "日料", "粥", "沙拉"],
  想吃肉: ["烤肉", "烧烤", "牛肉", "卤味", "汉堡"],
  想吃面: ["面", "粉", "拉面", "米线"],
  下雨: ["火锅", "面", "粉", "黄焖鸡", "家常"],
  周五: ["火锅", "烧烤", "聚餐", "炸鸡", "啤酒"],
};

export function recommend(places: Place[], request: RecommendRequest): RecommendResult[] {
  const query = `${request.mood ?? ""} ${request.keywords ?? ""}`.trim();
  const tokens = tokenize(query);
  const moodTags = tokens.flatMap((token) => MOOD_TAGS[token] ?? [token]);
  const now = Date.now();
  const scored = places
    .filter((place) => place.status !== "skip")
    .map((place) => {
      const haystack = [place.name, place.cuisine, place.area, place.notes, ...place.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      let score = 1;
      for (const tag of moodTags) {
        if (haystack.includes(tag.toLowerCase())) score += 3;
      }
      if (place.status === "want") score += 2;
      if (place.lastVisitedAt) {
        const days = (now - Date.parse(place.lastVisitedAt)) / 86_400_000;
        if (days < 7) score -= 4;
        else if (days > 30) score += 1;
      }
      if (request.daily) score += Math.random();
      const reason = buildReason(place, moodTags, request);
      return { place, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  const unique = scored.filter((item, index, list) =>
    list.findIndex((other) => other.place.id === item.place.id) === index,
  );

  if (request.daily) return unique.slice(0, 1);
  return unique.slice(0, 3);
}

function tokenize(text: string): string[] {
  if (!text) return ["周五"];
  return text
    .split(/[\s,，、]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildReason(place: Place, moodTags: string[], request: RecommendRequest): string {
  const hits = moodTags.filter((tag) =>
    [place.name, place.cuisine, ...(place.tags ?? [])].some((value) =>
      value?.toLowerCase().includes(tag.toLowerCase()),
    ),
  );
  if (request.daily && place.status === "want") return `你标过还想再去，今天就定 ${place.name}。`;
  if (hits.length) return `匹配到「${hits.slice(0, 3).join(" / ")}」，比较贴你现在想吃的。`;
  if (place.notes) return place.notes;
  return `来自你的收藏，最近还没去过。`;
}
