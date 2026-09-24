"use client";

import { useEffect, useState } from "react";
import { ChipRow } from "./chip-row";
import { MapsLink } from "./maps-link";
import { VisitForm } from "./visit-form";
import { formatDistance } from "@/lib/geo";
import type { Place, PlaceFacets, RecommendResult } from "@/lib/types";

const emptyFacets: PlaceFacets = { cuisines: [], areas: [], tags: [] };
const MAX_REROLLS = 3;
const RADIUS_OPTIONS = [
  { value: "", label: "不限距离" },
  { value: "1", label: "1 公里" },
  { value: "3", label: "3 公里" },
  { value: "5", label: "5 公里" },
  { value: "8", label: "8 公里" },
];

export function RecommendPanel() {
  const [mood, setMood] = useState("周五晚上，想好好吃一顿");
  const [keywords, setKeywords] = useState("");
  const [cityBias, setCityBias] = useState("大连");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState("3");
  const [originLat, setOriginLat] = useState<number>();
  const [originLng, setOriginLng] = useState<number>();
  const [locating, setLocating] = useState(false);
  const [cuisine, setCuisine] = useState("");
  const [area, setArea] = useState("");
  const [tag, setTag] = useState("");
  const [facets, setFacets] = useState<PlaceFacets>(emptyFacets);
  const [results, setResults] = useState<RecommendResult[]>([]);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [daily, setDaily] = useState(false);
  const [rerolls, setRerolls] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loggingId, setLoggingId] = useState("");
  const [resolved, setResolved] = useState<{ label: string; lat: number; lng: number }>();

  useEffect(() => {
    void fetch("/api/places")
      .then((response) => response.json())
      .then((data: { facets?: PlaceFacets }) => {
        if (data.facets) setFacets(data.facets);
      });
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("这台设备没有定位，改填地点。");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOriginLat(position.coords.latitude);
        setOriginLng(position.coords.longitude);
        setLocation("我的位置");
        setLocating(false);
      },
      () => {
        setError("没拿到定位，改填星海广场这种地点。");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  async function ask(nextDaily: boolean, extraExclude: string[] = []) {
    setLoading(true);
    setError("");
    try {
      const excludeIds = extraExclude.length ? extraExclude : [];
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood,
          keywords,
          daily: nextDaily,
          cuisine: cuisine || undefined,
          area: area || undefined,
          tag: tag || undefined,
          excludeIds,
          location: location.trim() || undefined,
          radiusKm: location.trim() && radiusKm ? Number(radiusKm) : undefined,
          lat: originLat,
          lng: originLng,
          cityBias: cityBias.trim() || undefined,
        }),
      });
      const data = (await response.json()) as {
        results?: RecommendResult[];
        error?: string;
        origin?: { label: string; lat: number; lng: number };
      };
      if (data.error) {
        setResults([]);
        setResolved(undefined);
        setError(data.error);
        return;
      }
      setResolved(data.origin);
      const next = data.results ?? [];
      setDaily(nextDaily);
      setResults(next);
      if (!extraExclude.length) {
        setSeenIds(next.map((item) => item.place.id));
        setRerolls(0);
      } else {
        setSeenIds((current) => [...new Set([...current, ...next.map((item) => item.place.id)])]);
      }
      if (!next.length) setError("这一轮没有店了。换个类型、放大距离，或清掉地点。");
    } catch {
      setError("推荐失败，先确认 npm run dev 还在跑。");
    } finally {
      setLoading(false);
    }
  }

  async function reroll() {
    if (rerolls >= MAX_REROLLS) return;
    setRerolls((value) => value + 1);
    await ask(daily, seenIds);
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
    if (status === "skip") {
      setResults((current) => current.filter((item) => item.place.id !== place.id));
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-[#fffaf3] p-5 shadow-sm">
        <label className="block text-sm text-[#6b5e55]">现在什么心情</label>
        <input
          className="mt-1 w-full rounded-2xl border border-[#ead9c8] bg-white px-4 py-3"
          value={mood}
          onChange={(event) => setMood(event.target.value)}
          placeholder="累、开心、庆祝、下雨..."
        />
        <label className="mt-4 block text-sm text-[#6b5e55]">想吃什么</label>
        <input
          className="mt-1 w-full rounded-2xl border border-[#ead9c8] bg-white px-4 py-3"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="火锅、烧烤，或任何菜"
        />
        <label className="mt-4 block text-sm text-[#6b5e55]">优先城市</label>
        <input
          className="mt-1 w-full rounded-2xl border border-[#ead9c8] bg-white px-4 py-3"
          value={cityBias}
          onChange={(event) => setCityBias(event.target.value)}
          placeholder="地点有歧义时用来分辨，留空就不偏向任何城市"
        />
        <label className="mt-4 block text-sm text-[#6b5e55]">在哪附近</label>
        <div className="mt-1 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-2xl border border-[#ead9c8] bg-white px-4 py-3"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              if (event.target.value.trim() !== "我的位置") {
                setOriginLat(undefined);
                setOriginLng(undefined);
              }
            }}
            placeholder="任何地点，比如星海广场、外滩"
          />
          <button
            className="shrink-0 rounded-2xl border border-[#c45c26] px-3 py-2 text-sm text-[#c45c26]"
            type="button"
            onClick={useMyLocation}
            disabled={locating}
          >
            {locating ? "定位中" : "我的位置"}
          </button>
        </div>
        {resolved ? <p className="mt-2 text-sm text-[#6b5e55]">识别为 {resolved.label}</p> : null}
        <ChipRow label="附近多远" options={RADIUS_OPTIONS} selected={radiusKm} onSelect={setRadiusKm} />
        <ChipRow
          label="菜系"
          options={[
            { value: "", label: "不限菜系" },
            ...takeFacet(facets.cuisines, cuisine, 10).map((item) => ({ value: item, label: item })),
          ]}
          selected={cuisine}
          onSelect={setCuisine}
        />
        <ChipRow
          label="区域"
          options={[
            { value: "", label: "不限区域" },
            ...takeFacet(facets.areas, area, 8).map((item) => ({ value: item, label: item })),
          ]}
          selected={area}
          onSelect={setArea}
        />
        <ChipRow
          label="标签"
          options={[
            { value: "", label: "不限标签" },
            ...takeFacet(facets.tags, tag, 12).map((item) => ({ value: item, label: item })),
          ]}
          selected={tag}
          onSelect={setTag}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-[#c45c26] px-5 py-2 text-white disabled:opacity-60"
            onClick={() => ask(false)}
            disabled={loading}
          >
            {loading ? "在挑..." : "给我 3 家"}
          </button>
          <button
            className="rounded-full border border-[#c45c26] px-5 py-2 text-[#c45c26]"
            onClick={() => ask(true)}
            disabled={loading}
          >
            今日一推，别让我选
          </button>
          {results.length ? (
            <button
              className="rounded-full border border-[#ead9c8] px-5 py-2 text-[#4a3f38] disabled:opacity-40"
              onClick={() => void reroll()}
              disabled={loading || rerolls >= MAX_REROLLS}
            >
              {rerolls >= MAX_REROLLS ? "换完了" : `换一批（剩 ${MAX_REROLLS - rerolls} 次）`}
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="space-y-3">
        {results.map((item) => (
          <article key={item.place.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">{item.place.name}</h2>
              <span className="text-sm text-[#6b5e55]">
                {item.distanceKm != null ? formatDistance(item.distanceKm) : (item.place.area ?? "未填区域")}
              </span>
            </div>
            <p className="mt-2 text-[#4a3f38]">{item.reason}</p>
            {item.place.dishes?.length ? (
              <p className="mt-2 text-sm text-[#4a3f38]">
                招牌：{item.place.dishes.map((dish) => dish.name).join(" · ")}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-[#6b5e55]">
              {[item.place.area, (item.place.tags ?? []).slice(0, 4).join(" · ")].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <MapsLink place={item.place} from={resolved} />
              <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => void mark(item.place, "want")}>
                还想再去
              </button>
              <button
                className="rounded-full bg-[#f3e6d8] px-3 py-1"
                onClick={() => setLoggingId(loggingId === item.place.id ? "" : item.place.id)}
              >
                今天去了
              </button>
              <button className="rounded-full bg-[#f3e6d8] px-3 py-1" onClick={() => void mark(item.place, "skip")}>
                不想再去
              </button>
            </div>
            {loggingId === item.place.id ? (
              <VisitForm
                place={item.place}
                onCancel={() => setLoggingId("")}
                onSaved={(keep) => {
                  setLoggingId("");
                  if (keep === "skip") {
                    setResults((current) => current.filter((row) => row.place.id !== item.place.id));
                  }
                }}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function takeFacet(items: string[], selected: string, limit: number): string[] {
  const head = items.slice(0, limit);
  if (selected && !head.includes(selected)) return [selected, ...head.slice(0, limit - 1)];
  return head;
}
