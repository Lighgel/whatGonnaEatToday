"use client";

import { mapsUrl } from "@/lib/maps";
import type { Coords } from "@/lib/geo";
import type { Place } from "@/lib/types";

export function MapsLink({
  place,
  from,
}: {
  place: Pick<Place, "name"> & { lat?: number; lng?: number; address?: string; area?: string };
  from?: Coords;
}) {
  return (
    <a
      className="rounded-full bg-[#1c1612] px-4 py-1.5 text-white"
      href={mapsUrl(place, from)}
      target="_blank"
      rel="noreferrer"
    >
      导航
    </a>
  );
}
