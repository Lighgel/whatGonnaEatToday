import { addPlaces, listPlaces, upsertPlace } from "@/lib/store";
import { parsePlaceText } from "@/lib/parse";
import type { Place, PlaceSource } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ places: await listPlaces() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    place?: Place;
    text?: string;
    source?: PlaceSource;
  };
  if (body.text) {
    const parsed = parsePlaceText(body.text, body.source ?? "manual");
    const places = await addPlaces(parsed);
    return NextResponse.json({ places, imported: parsed.length });
  }
  if (body.place) {
    const places = await upsertPlace(body.place);
    return NextResponse.json({ places });
  }
  return NextResponse.json({ error: "需要 place 或 text" }, { status: 400 });
}
