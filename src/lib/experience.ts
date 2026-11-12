import type { Place, Visit } from "./types";

export function visitAverageRating(place: Place): number | undefined {
  const ratings = (place.visits ?? [])
    .map((visit) => visit.rating)
    .filter((value): value is number => Number.isFinite(value));
  if (!ratings.length) return undefined;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

export function latestVisit(place: Place): Visit | undefined {
  return place.visits?.[0];
}

export function experienceScore(place: Place, now = Date.now()): number {
  const visits = place.visits ?? [];
  const latest = visits[0];
  let score = 0;
  const avg = visitAverageRating(place);
  if (avg != null) score += (avg - 3) * 10;
  if (place.status === "want") score += 6;
  else if (place.status === "neutral") score += 1;
  if (latest?.note?.trim()) score += 4;
  if (latest?.dishes?.length) score += 2;
  if (curatorNote(place)) score += 3;
  if (place.amapRating != null && place.amapRating >= 4.5) score += 1;
  if (!visits.length) {
    return score;
  }
  const days = (now - Date.parse(latest?.visitedAt ?? "")) / 86_400_000;
  if (Number.isFinite(days)) {
    if (days < 7) score -= 12;
    else if (days > 21 && (place.status === "want" || (avg != null && avg >= 4))) score += 4;
  }
  return score;
}

export function ratingLabel(place: Place): string | undefined {
  const avg = visitAverageRating(place);
  if (avg == null) return undefined;
  return `你评 ${trimRating(avg)}`;
}

export function amapFacts(place: Place): string | undefined {
  const tag = place.amapTag
    ? place.amapTag
        .split(/[,，、]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("、")
    : "";
  const parts = [
    place.tel,
    place.amapRating != null ? `高德 ${place.amapRating}` : null,
    place.amapCost != null ? `人均约 ${place.amapCost}` : null,
    place.openTime,
    tag ? `招牌 ${tag}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

export function experienceReason(place: Place): string {
  const latest = latestVisit(place);
  const avg = visitAverageRating(place);
  const scoreLabel = avg != null ? `你给过 ${trimRating(avg)} 分` : undefined;
  const note = latest?.note?.trim();
  const dishes = latest?.dishes?.slice(0, 2).join("、");
  if (note && scoreLabel) return `${scoreLabel}：「${clip(note, 42)}」`;
  if (note) return `你记过：「${clip(note, 48)}」`;
  if (scoreLabel && dishes) return `${scoreLabel}，点过${dishes}。`;
  if (scoreLabel) return `${scoreLabel}。`;
  const excerpt = curatorNote(place);
  if (excerpt) return `店库摘记：${excerpt}`;
  if (place.status === "want") return "还没记下这一顿，你标过想再去。";
  return "店库里有这家，还没有你的到店评价。";
}

export function curatorNote(place: Place): string | undefined {
  const notes = place.notes?.trim();
  if (!notes) return undefined;
  return clip(notes.replace(/^大爷点评[：:]/, "大爷点评："), 48);
}

function trimRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
