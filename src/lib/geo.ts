export type Coords = {
  lat: number;
  lng: number;
};

export type Origin = Coords & {
  label: string;
  adcode?: string;
  fromIp?: boolean;
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

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

const EARTH_A = 6378245;
const EARTH_EE = 0.006693421622965943;

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function offsetLat(lng: number, lat: number): number {
  let value = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  value += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(lat * Math.PI) + 40 * Math.sin((lat / 3) * Math.PI)) * 2) / 3;
  value += ((160 * Math.sin((lat / 12) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30)) * 2) / 3;
  return value;
}

function offsetLng(lng: number, lat: number): number {
  let value = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  value += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(lng * Math.PI) + 40 * Math.sin((lng / 3) * Math.PI)) * 2) / 3;
  value += ((150 * Math.sin((lng / 12) * Math.PI) + 300 * Math.sin((lng / 30) * Math.PI)) * 2) / 3;
  return value;
}

export function wgs84ToGcj02(coord: Coords): Coords {
  if (outOfChina(coord.lat, coord.lng)) return coord;
  let dLat = offsetLat(coord.lng - 105, coord.lat - 35);
  let dLng = offsetLng(coord.lng - 105, coord.lat - 35);
  const radLat = (coord.lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((EARTH_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: coord.lat + dLat, lng: coord.lng + dLng };
}

export function gcj02ToWgs84(coord: Coords): Coords {
  if (outOfChina(coord.lat, coord.lng)) return coord;
  const gcj = wgs84ToGcj02(coord);
  return { lat: coord.lat * 2 - gcj.lat, lng: coord.lng * 2 - gcj.lng };
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
