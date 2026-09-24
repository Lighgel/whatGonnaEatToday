"use client";

import { useCallback, useEffect, useState } from "react";
import { ChipRow } from "../chip-row";
import { MapsLink } from "../maps-link";
import { VisitForm } from "../visit-form";
import type { Place, PlaceFacets, PlaceStatus } from "@/lib/types";

const emptyFacets: PlaceFacets = { cuisines: [], areas: [], tags: [] };

const STATUS_CHIPS: { value: PlaceStatus | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "want", label: "还想再去" },
  { value: "neutral", label: "一般" },
  { value: "skip", label: "不想再去" },
];

export function PlacesPanel() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [facets, setFacets] = useState<PlaceFacets>(emptyFacets);
  const [text, setText] = useState("黄记煌\n某烧烤, 烧烤, 周五, 辣\n潮汕牛肉火锅, 火锅, 聚餐");
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState<PlaceStatus | "">("");
  const [tag, setTag] = useState("");
  const [near, setNear] = useState("");
  const [cityBias, setCityBias] = useState("大连");
  const [geoNote, setGeoNote] = useState("");
  const [radiusKm, setRadiusKm] = useState("3");
  const [dishDraft, setDishDraft] = useState<Record<string, string>>({});
  const [openVisits, setOpenVisits] = useState<Record<string, boolean>>({});
  const [loggingId, setLoggingId] = useState("");

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cuisine) params.set("cuisine", cuisine);
    if (area) params.set("area", area);
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    if (near.trim()) {
      params.set("near", near.trim());
      if (radiusKm) params.set("radiusKm", radiusKm);
      if (cityBias.trim()) params.set("city", cityBias.trim());
    }
    const query = params.toString();
    const response = await fetch(query ? `/api/places?${query}` : "/api/places");
    const data = (await response.json()) as {
      places: Place[];
      facets?: PlaceFacets;
      error?: string;
      origin?: { label: string };
    };
    setPlaces(data.places ?? []);
    setGeoNote(data.error ? data.error : data.origin ? `识别为 ${data.origin.label}` : "");
    if (data.facets) setFacets(data.facets);
  }, [q, cuisine, area, status, tag, near, radiusKm, cityBias]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh();
    }, q || near ? 400 : 0);
    return () => window.clearTimeout(handle);
  }, [refresh, q]);

  async function importText() {
    const response = await fetch("/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: "manual" }),
    });
    const data = (await response.json()) as { imported?: number };
    setMessage(`已导入 ${data.imported ?? 0} 家（重名会跳过）`);
    await refresh();
  }

  async function mark(place: Place, nextStatus: Place["status"], visited = false) {
    const next: Place = {
      ...place,
      status: nextStatus,
      lastVisitedAt: visited ? new Date().toISOString() : place.lastVisitedAt,
    };
    await fetch("/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place: next }),
    });
    await refresh();
  }

  async function saveDish(place: Place) {
    const name = (dishDraft[place.id] ?? "").trim();
    if (!name) return;
    await fetch("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: place.id, name }),
    });
    setDishDraft((current) => ({ ...current, [place.id]: "" }));
    await refresh();
  }

  const filteredEmpty = places.length === 0 && Boolean(q.trim() || cuisine || area || status || tag || near.trim());

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-[#fffaf3] p-5 shadow-sm">
        <p className="text-sm text-[#6b5e55]">
          每行一家。可以是「店名」或「店名, 标签, 标签」。没有标签的店很难筛出来，导入后建议补上。
        </p>
        <textarea
          className="mt-3 min-h-36 w-full rounded-2xl border border-[#ead9c8] bg-white p-4"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="mt-3 rounded-full bg-[#c45c26] px-5 py-2 text-white" onClick={importText}>
          导入到店库
        </button>
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <input
          className="w-full rounded-2xl border border-[#ead9c8] bg-[#fffaf3] px-4 py-3"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜店名、菜、备注、地址、菜系"
        />
        <ChipRow
          label="状态"
          options={STATUS_CHIPS}
          selected={status}
          onSelect={(value) => setStatus(value as PlaceStatus | "")}
        />
        <ChipRow
          label="菜系"
          options={[
            { value: "", label: "全部菜系" },
            ...takeFacet(facets.cuisines, cuisine, 14).map((item) => ({ value: item, label: item })),
          ]}
          selected={cuisine}
          onSelect={setCuisine}
        />
        <ChipRow
          label="区域"
          options={[
            { value: "", label: "全部区域" },
            ...takeFacet(facets.areas, area, 10).map((item) => ({ value: item, label: item })),
          ]}
          selected={area}
          onSelect={setArea}
        />
        <ChipRow
          label="标签"
          options={[
            { value: "", label: "全部标签" },
            ...takeFacet(facets.tags, tag, 16).map((item) => ({ value: item, label: item })),
          ]}
          selected={tag}
          onSelect={setTag}
        />
        <label className="mt-4 block text-sm text-[#6b5e55]">附近地点</label>
        <input
          className="mt-1 w-full rounded-2xl border border-[#ead9c8] px-4 py-3"
          value={near}
          onChange={(event) => setNear(event.target.value)}
          placeholder="任何地点，留空则不按距离筛"
        />
        <label className="mt-4 block text-sm text-[#6b5e55]">优先城市</label>
        <input
          className="mt-1 w-full rounded-2xl border border-[#ead9c8] px-4 py-3"
          value={cityBias}
          onChange={(event) => setCityBias(event.target.value)}
          placeholder="地点有歧义时用来分辨，留空就不偏向"
        />
        {geoNote ? <p className="mt-2 text-sm text-[#6b5e55]">{geoNote}</p> : null}
        {near ? (
          <ChipRow
            label="附近多远"
            options={[
              { value: "1", label: "1 公里" },
              { value: "3", label: "3 公里" },
              { value: "5", label: "5 公里" },
              { value: "8", label: "8 公里" },
            ]}
            selected={radiusKm}
            onSelect={setRadiusKm}
          />
        ) : null}
      </div>

      {filteredEmpty ? (
        <p className="rounded-3xl bg-white p-5 text-sm text-[#6b5e55] shadow-sm">
          没有符合条件的店。清掉筛选，或给店补上标签后再搜。
        </p>
      ) : (
        <ul className="space-y-3">
          {places.map((place) => (
            <li key={place.id} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{place.name}</h2>
                <span className="text-sm text-[#6b5e55]">{place.source}</span>
              </div>
              <p className="mt-1 text-sm text-[#6b5e55]">
                {[place.area, place.cuisine, place.tags.join(" · ")].filter(Boolean).join(" · ") || "无标签"}
              </p>
              {place.dishes?.length ? (
                <p className="mt-2 text-sm text-[#4a3f38]">招牌：{place.dishes.map((dish) => dish.name).join(" · ")}</p>
              ) : null}
              {place.lastVisitedAt ? (
                <p className="mt-1 text-sm text-[#6b5e55]">上次去过 {formatDay(place.lastVisitedAt)}</p>
              ) : null}
              {place.notes ? <p className="mt-2 text-sm text-[#6b5e55] line-clamp-3">{place.notes}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <MapsLink place={place} />
                <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => mark(place, "want")}>
                  还想再去
                </button>
                <button
                  className="rounded-full bg-[#f3e6d8] px-3 py-1"
                  onClick={() => setLoggingId(loggingId === place.id ? "" : place.id)}
                  type="button"
                >
                  今天去了
                </button>
                <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => mark(place, "skip")}>
                  不想再去
                </button>
                {place.visits?.length ? (
                  <button
                    className="rounded-full bg-[#f3e6d8] px-3 py-1"
                    onClick={() =>
                      setOpenVisits((current) => ({ ...current, [place.id]: !current[place.id] }))
                    }
                    type="button"
                  >
                    {openVisits[place.id] ? "收起到店" : `到店 ${place.visits.length} 次`}
                  </button>
                ) : null}
              </div>
              {loggingId === place.id ? (
                <VisitForm
                  place={place}
                  onCancel={() => setLoggingId("")}
                  onSaved={() => {
                    setLoggingId("");
                    void refresh();
                  }}
                />
              ) : null}
              {openVisits[place.id] && place.visits?.length ? (
                <ul className="mt-3 space-y-2 text-sm text-[#6b5e55]">
                  {place.visits.map((visit) => (
                    <li key={visit.id}>
                      <span>{formatDay(visit.visitedAt)}</span>
                      {visit.keep ? ` · ${keepLabel(visit.keep)}` : ""}
                      {visit.dishes?.length ? ` · ${visit.dishes.join("、")}` : ""}
                      {visit.note ? ` · ${visit.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveDish(place);
                }}
              >
                <input
                  className="min-w-0 flex-1 rounded-full border border-[#ead9c8] px-3 py-1 text-sm"
                  value={dishDraft[place.id] ?? ""}
                  onChange={(event) =>
                    setDishDraft((current) => ({ ...current, [place.id]: event.target.value }))
                  }
                  placeholder="加一道菜，比如海肠捞饭"
                />
                <button className="rounded-full bg-[#f3e6d8] px-3 py-1 text-sm" type="submit">
                  记下
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function takeFacet(items: string[], selected: string, limit: number): string[] {
  const head = items.slice(0, limit);
  if (selected && !head.includes(selected)) return [selected, ...head.slice(0, limit - 1)];
  return head;
}

function keepLabel(keep: PlaceStatus): string {
  if (keep === "skip") return "不想再去";
  if (keep === "neutral") return "一般";
  return "还想再去";
}
