"use client";

import { useEffect, useState } from "react";
import type { Place } from "@/lib/types";

export function PlacesPanel() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [text, setText] = useState("黄记煌\n某烧烤, 烧烤, 周五, 辣\n潮汕牛肉火锅, 火锅, 聚餐");
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/places");
    const data = (await response.json()) as { places: Place[] };
    setPlaces(data.places);
  }

  useEffect(() => {
    void refresh();
  }, []);

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

  async function mark(place: Place, status: Place["status"], visited = false) {
    const next: Place = {
      ...place,
      status,
      lastVisitedAt: visited ? new Date().toISOString() : place.lastVisitedAt,
    };
    await fetch("/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place: next }),
    });
    await refresh();
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-[#fffaf3] p-5 shadow-sm">
        <p className="text-sm text-[#6b5e55]">每行一家。可以是「店名」或「店名, 标签, 标签」。</p>
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

      <ul className="space-y-3">
        {places.map((place) => (
          <li key={place.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">{place.name}</h2>
              <span className="text-sm text-[#6b5e55]">{place.source}</span>
            </div>
            <p className="mt-1 text-sm text-[#6b5e55]">{place.tags.join(" · ") || "无标签"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => mark(place, "want")}>
                还想再去
              </button>
              <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => mark(place, "want", true)}>
                今天去了
              </button>
              <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => mark(place, "skip")}>
                不想再去
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
