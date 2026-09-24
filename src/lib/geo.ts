export type Coords = {
  lat: number;
  lng: number;
};

export type Origin = Coords & {
  label: string;
};

export function haversineKm(a: Coords, b: Coords): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(km: number): string {
  if (km < 0.15) return "不到 200 米";
  if (km < 1) return `${Math.round(km * 1000)} 米`;
  return `${km.toFixed(1)} 公里`;
}

export function distanceKm(place: { lat?: number; lng?: number }, origin: Coords): number | undefined {
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return undefined;
  return haversineKm({ lat: place.lat as number, lng: place.lng as number }, origin);
}

export function withinRadius(place: { lat?: number; lng?: number }, origin: Coords, radiusKm?: number): boolean {
  if (!radiusKm || radiusKm <= 0) return true;
  const km = distanceKm(place, origin);
  if (km == null) return false;
  return km <= radiusKm + 0.05;
}
