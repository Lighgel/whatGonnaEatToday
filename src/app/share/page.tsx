import { MapsLink } from "../maps-link";
import { amapFacts } from "@/lib/experience";
import { listPlaces } from "@/lib/store";

export const runtime = "nodejs";

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const wanted = (ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const places = wanted.length ? (await listPlaces()).filter((place) => wanted.includes(place.id)) : [];

  return (
    <main>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">分享</h1>
      {places.length ? (
        <ul className="mt-8 space-y-3">
          {places.map((place, index) => (
            <li key={place.id} className="rounded-[24px] bg-white p-5 shadow-[0_8px_30px_rgba(80,40,10,0.06)]">
              <p className="text-xs text-[#7a6c62]">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{place.name}</h2>
              {amapFacts(place) ? <p className="mt-2 text-xs text-[#7a6c62]">{amapFacts(place)}</p> : null}
              {place.notes ? <p className="mt-2 text-sm leading-relaxed text-[#4a3f38]">{place.notes}</p> : null}
              <p className="mt-2 text-sm text-[#7a6c62]">
                {[place.area, (place.tags ?? []).slice(0, 4).join(" · ")].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-4">
                <MapsLink place={place} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-[24px] bg-white px-5 py-4 text-sm text-[#7a6c62] shadow-sm">
          没有店。
        </p>
      )}
    </main>
  );
}
