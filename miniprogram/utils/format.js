function formatDistance(km) {
  if (km < 0.15) return "不到 200 米";
  if (km < 1) return `${Math.round(km * 1000)} 米`;
  return `${km.toFixed(1)} 公里`;
}

function openBadge(openTime) {
  if (!openTime || !String(openTime).trim()) return "";
  const ranges = [...String(openTime).matchAll(/(\d{1,2}):(\d{2})\s*[-–~到至]\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return "";
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = ranges.some((match) => {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (end > start) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  });
  return open ? "营业中" : "现在关门";
}

function visitAverageRating(place) {
  const ratings = (place.visits || []).map((visit) => visit.rating).filter((value) => Number.isFinite(value));
  if (!ratings.length) return undefined;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function trimRating(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ratingLabel(place) {
  const avg = visitAverageRating(place);
  if (avg == null) return "";
  return `你评 ${trimRating(avg)}`;
}

function amapFacts(place) {
  const tag = place.amapTag
    ? String(place.amapTag)
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
  return parts.length ? parts.join(" · ") : "";
}

function tripLabel(item) {
  if (item.durationMin != null && item.travelMode) {
    const how = item.travelMode === "walk" ? "步行" : "驾车";
    const distance = item.distanceKm != null ? ` · ${formatDistance(item.distanceKm)}` : "";
    return `${how} ${item.durationMin} 分钟${distance}`;
  }
  if (item.distanceKm != null) return formatDistance(item.distanceKm);
  return item.place.area || "未填区域";
}

function originLabel(origin) {
  if (!origin || !origin.label) return "";
  return String(origin.label).split(" · ")[0];
}

module.exports = { formatDistance, openBadge, ratingLabel, amapFacts, tripLabel, originLabel };
