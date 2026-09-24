import type { Coords } from "./geo";
import type { Place } from "./types";

export function mapsUrl(place: Place, from?: Coords): string {
  if (from && place.lat != null && place.lng != null) {
    return `https://uri.amap.com/navigation?from=${from.lng},${from.lat},起点&to=${place.lng},${place.lat},${encodeURIComponent(place.name)}&mode=walk&coordinate=wgs84&callnative=1`;
  }
  const keyword = [place.name, place.address, place.area].filter(Boolean).join(" ");
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&callnative=1`;
}
