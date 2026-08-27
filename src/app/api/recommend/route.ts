import { recommend } from "@/lib/recommend";
import { listPlaces } from "@/lib/store";
import type { RecommendRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = ((await request.json()) ?? {}) as RecommendRequest;
  const places = await listPlaces();
  const results = recommend(places, body);
  return NextResponse.json({ results });
}
