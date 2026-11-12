export type PlaceSource = "meituan" | "douyin" | "manual" | "map" | "list";

export type PlaceStatus = "want" | "neutral" | "skip";

export type Dish = {
  id: string;
  placeId: string;
  name: string;
  notes?: string;
};

export type Visit = {
  id: string;
  placeId: string;
  visitedAt: string;
  note?: string;
  dishes?: string[];
  keep?: PlaceStatus;
  rating?: number;
  perCapita?: number;
};

export type Place = {
  id: string;
  name: string;
  tags: string[];
  cuisine?: string;
  area?: string;
  address?: string;
  priceLevel?: number;
  notes?: string;
  source: PlaceSource;
  url?: string;
  status: PlaceStatus;
  lastVisitedAt?: string;
  createdAt: string;
  lat?: number;
  lng?: number;
  amapPoiId?: string;
  tel?: string;
  amapRating?: number;
  amapCost?: number;
  openTime?: string;
  amapTag?: string;
  amapStatus?: string;
  dishes?: Dish[];
  visits?: Visit[];
};

export type ShopCandidate = {
  poiId: string;
  name: string;
  label: string;
  address?: string;
  area?: string;
  tel?: string;
  cuisine?: string;
  tags: string[];
  rating?: number;
  cost?: number;
  openTime?: string;
  feature?: string;
  lat: number;
  lng: number;
};

export type PlaceFilter = {
  q?: string;
  cuisine?: string;
  area?: string;
  status?: PlaceStatus;
  tag?: string;
  near?: string;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  cityBias?: string;
};

export type PlaceFacets = {
  cuisines: string[];
  areas: string[];
  tags: string[];
};

export type RecommendRequest = {
  mood?: string;
  keywords?: string;
  daily?: boolean;
  cuisine?: string;
  area?: string;
  tag?: string;
  excludeIds?: string[];
  location?: string;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  cityBias?: string;
  here?: boolean;
  spin?: boolean;
  fromIp?: boolean;
};

export type PlaceSuggestion = {
  name: string;
  label: string;
  lat?: number;
  lng?: number;
};

export type TravelMode = "walk" | "drive";

export type RecommendResult = {
  place: Place;
  reason: string;
  score: number;
  distanceKm?: number;
  durationMin?: number;
  travelMode?: TravelMode;
  closed?: boolean;
};

export type VisitLogRequest = {
  placeId: string;
  dishes?: string[];
  note?: string;
  keep?: PlaceStatus;
  rating?: number;
  perCapita?: number;
};
