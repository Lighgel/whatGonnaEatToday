export type PlaceSource = "meituan" | "douyin" | "manual" | "map";

export type PlaceStatus = "want" | "neutral" | "skip";

export type Place = {
  id: string;
  name: string;
  tags: string[];
  cuisine?: string;
  area?: string;
  priceLevel?: number;
  notes?: string;
  source: PlaceSource;
  url?: string;
  status: PlaceStatus;
  lastVisitedAt?: string;
  createdAt: string;
};

export type RecommendRequest = {
  mood?: string;
  keywords?: string;
  daily?: boolean;
};

export type RecommendResult = {
  place: Place;
  reason: string;
  score: number;
};
