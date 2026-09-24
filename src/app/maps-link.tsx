"use client";

import { mapsUrl } from "@/lib/maps";
import type { Coords } from "@/lib/geo";
import type { Place } from "@/lib/types";

export function MapsLink({ place, from }: { place: Place; from?: Coords }) {
  return (
    <a className="rounded-full bg-[#f3e6d8] px-3 py-1" href={mapsUrl(place, from)} target="_blank" rel="noreferrer">
      导航
    </a>
  );
}
