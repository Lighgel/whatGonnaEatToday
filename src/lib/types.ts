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
  dishes?: Dish[];
  visits?: Visit[];
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
};

export type RecommendResult = {
  place: Place;
  reason: string;
  score: number;
  distanceKm?: number;
};

export type VisitLogRequest = {
  placeId: string;
  dishes?: string[];
  note?: string;
  keep?: PlaceStatus;
};
