"use client";

import { useEffect, useRef, useState } from "react";
import { ChipRow } from "./chip-row";
import { MapsLink } from "./maps-link";
import { PlaceSearch } from "./place-search";
import { SpinRitual } from "./spin-ritual";
import { VisitForm } from "./visit-form";
import Link from "next/link";
import { amapFacts, ratingLabel } from "@/lib/experience";
import { openBadge } from "@/lib/hours";
import { formatDistance } from "@/lib/geo";
import type { Place, PlaceFacets, RecommendResult, ShopCandidate } from "@/lib/types";

const emptyFacets: PlaceFacets = { cuisines: [], areas: [], tags: [] };
const MAX_REROLLS = 3;
const RADIUS_OPTIONS = [
  { value: "", label: "不限" },
  { value: "1", label: "1 km" },
  { value: "3", label: "3 km" },
  { value: "5", label: "5 km" },
  { value: "8", label: "8 km" },
];
const FOOD_QUICK = ["火锅", "烧烤", "海鲜", "日料", "面"];

export function RecommendPanel() {
  const [mood, setMood] = useState("");
  const [showMore, setShowMore] = useState(false);
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
  const [resolved, setResolved] = useState<{ label: string; lat: number; lng: number; fromIp?: boolean }>();
  const [nearby, setNearby] = useState(true);
  const [missingCoords, setMissingCoords] = useState(0);
  const [busy, setBusy] = useState<"" | "here" | "pick" | "daily" | "spin">("");
  const [fillMissing, setFillMissing] = useState(0);
  const [weatherHint, setWeatherHint] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [showSpin, setShowSpin] = useState(false);
  const [pool, setPool] = useState<string[]>([]);
  const [mapShops, setMapShops] = useState<ShopCandidate[]>([]);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapNote, setMapNote] = useState("");
  const [shareHint, setShareHint] = useState("");
  const [savingPoi, setSavingPoi] = useState("");
  const lastSpinAt = useRef(0);

  useEffect(() => {
    void fetch("/api/places")
      .then((response) => response.json())
      .then((data: { facets?: PlaceFacets }) => {
        if (data.facets) setFacets(data.facets);
      });
    void fetch("/api/places/enrich")
      .then((response) => response.json())
      .then((stats: { missing?: number }) => setFillMissing(stats.missing ?? 0))
      .catch(() => undefined);
  }, []);

  function searchHere() {
    const typed = location.trim();
    if (typed && typed !== "我的位置") {
      setOriginLat(undefined);
      setOriginLng(undefined);
      void ask(false, [], { location: typed, here: true, dropGps: true, fromIp: false });
      return;
    }
    useGps();
  }

  function useGps() {
    setLocating(true);
    setError("");
    if (!navigator.geolocation) {
      void askIpFallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setOriginLat(lat);
        setOriginLng(lng);
        setLocation("我的位置");
        setLocating(false);
        void ask(false, [], { lat, lng, location: "我的位置", here: true, fromIp: false });
      },
      () => {
        const typed = location.trim();
        if (typed && typed !== "我的位置") {
          setLocating(false);
          void ask(false, [], { location: typed, here: true, dropGps: true, fromIp: false });
          return;
        }
        void askIpFallback();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  async function askIpFallback() {
    setLocation("我的位置");
    setOriginLat(undefined);
    setOriginLng(undefined);
    try {
      await ask(false, [], { location: "我的位置", here: true, dropGps: true, fromIp: false });
    } finally {
      setLocating(false);
    }
  }

  async function ask(
    nextDaily: boolean,
    extraExclude: string[] = [],
    override?: {
      lat?: number;
      lng?: number;
      location?: string;
      here?: boolean;
      radiusKm?: string;
      dropGps?: boolean;
      spin?: boolean;
      fromIp?: boolean;
    },
  ) {
    const here = override?.here ?? false;
    const spin = override?.spin === true;
    const dropGps = override?.dropGps === true;
    const lat = dropGps ? undefined : (override?.lat ?? originLat);
    const lng = dropGps ? undefined : (override?.lng ?? originLng);
    const loc = override?.location ?? location;
    const fromIp =
      loc.trim() === "我的位置" && (override?.fromIp ?? resolved?.fromIp === true);
    const radius = override?.radiusKm ?? radiusKm;
    setBusy(spin ? "spin" : nextDaily ? "daily" : here ? "here" : "pick");
    setLoading(true);
    setError("");
    setShareHint("");
    setMapShops([]);
    setMapNote("");
    if (spin) {
      setSpinning(true);
      setShowSpin(true);
    } else {
      setShowSpin(false);
    }
    try {
      const excludeIds = extraExclude.length ? extraExclude : [];
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood,
          keywords,
          daily: nextDaily,
          spin,
          here,
          cuisine: cuisine || undefined,
          area: area || undefined,
          tag: tag || undefined,
          excludeIds,
          location: loc.trim() || undefined,
          radiusKm: (loc.trim() || lat != null) && radius ? Number(radius) : undefined,
          lat,
          lng,
          cityBias: cityBias.trim() || undefined,
          fromIp: fromIp || undefined,
        }),
      });
      const data = (await response.json()) as {
        results?: RecommendResult[];
        error?: string;
        nearby?: boolean;
        missingCoords?: number;
        origin?: { label: string; lat: number; lng: number; fromIp?: boolean };
        weather?: { hint?: string };
        pool?: string[];
      };
      setWeatherHint(data.weather?.hint ?? "");
      if (data.error) {
        setResults([]);
        setResolved(undefined);
        setNearby(true);
        setPool([]);
        setError(data.error);
        return;
      }
      setResolved(data.origin);
      if (data.origin?.fromIp) {
        setOriginLat(data.origin.lat);
        setOriginLng(data.origin.lng);
        setLocation("我的位置");
      }
      setNearby(data.nearby !== false);
      setMissingCoords(data.missingCoords ?? 0);
      setPool(data.pool ?? []);
      const next = data.results ?? [];
      setDaily(nextDaily);
      if (spin) await new Promise((resolve) => window.setTimeout(resolve, 1600));
      setResults(next);
      if (!extraExclude.length) {
        setSeenIds(next.map((item) => item.place.id));
        setRerolls(0);
      } else {
        setSeenIds((current) => [...new Set([...current, ...next.map((item) => item.place.id)])]);
      }
      if (!next.length) {
        setError(
          data.missingCoords
            ? `${data.missingCoords} 家没坐标`
            : "没有店",
        );
      }
      if (data.nearby === false && data.origin) {
        void loadMapShops({ lat: data.origin.lat, lng: data.origin.lng });
      }
    } catch {
      setError("推荐失败");
    } finally {
      setLoading(false);
      setBusy("");
      setSpinning(false);
    }
  }

  async function reroll() {
    if (rerolls >= MAX_REROLLS) return;
    setRerolls((value) => value + 1);
    await ask(daily, seenIds);
  }

  async function spinOnce() {
    const now = Date.now();
    if (now - lastSpinAt.current < 2500) return;
    lastSpinAt.current = now;
    const here = originLat != null || resolved?.fromIp === true || location.trim() === "我的位置";
    await ask(false, [], { spin: true, here, lat: originLat, lng: originLng, location });
  }

  async function loadMapShops(originOverride?: { lat: number; lng: number }) {
    const lat = originOverride?.lat ?? originLat ?? resolved?.lat;
    const lng = originOverride?.lng ?? originLng ?? resolved?.lng;
    if (lat == null && lng == null && !location.trim()) {
      setMapNote("先写地点");
      return;
    }
    setMapBusy(true);
    setMapNote("");
    try {
      const params = new URLSearchParams();
      if (lat != null && lng != null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      } else if (location.trim() && location !== "我的位置") {
        params.set("near", location.trim());
      } else if (location.trim() === "我的位置") {
        params.set("near", "我的位置");
      }
      if (radiusKm) params.set("radiusKm", radiusKm);
      if (cityBias.trim()) params.set("city", cityBias.trim());
      if (keywords.trim()) params.set("q", keywords.trim());
      const response = await fetch(`/api/map-shops?${params}`);
      const data = (await response.json()) as { shops?: ShopCandidate[]; note?: string; error?: string };
      setMapShops(data.shops ?? []);
      setMapNote(data.error || data.note || "");
    } catch {
      setMapNote("地图店没拉到。");
    } finally {
      setMapBusy(false);
    }
  }

  async function saveMapShop(shop: ShopCandidate) {
    setSavingPoi(shop.poiId);
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        setMapNote(data.error);
        return;
      }
      setMapShops((current) => current.filter((item) => item.poiId !== shop.poiId));
      setMapNote(`已收入 ${shop.name}`);
    } catch {
      setMapNote("没存上。");
    } finally {
      setSavingPoi("");
    }
  }

  async function copyShare() {
    const ids = results.map((item) => item.place.id).join(",");
    if (!ids) return;
    const url = `${window.location.origin}/share?ids=${ids}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint("已复制");
    } catch {
      setShareHint(url);
    }
  }

  useEffect(() => {
    function onMotion(event: DeviceMotionEvent) {
      const acc = event.accelerationIncludingGravity;
      if (!acc || loading || spinning) return;
      const mag = Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0);
      if (mag > 24) void spinOnce();
    }
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [loading, spinning, originLat, originLng, location, mood, keywords]);

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

  const hasPlace = Boolean(location.trim() || originLat != null);
  const primaryLabel = locating || busy === "here" ? "在找…" : "找收藏";

  return (
    <section className="space-y-4">
      {fillMissing > 0 ? (
        <Link href="/places" className="block rounded-full bg-[#1c1612] px-4 py-3 text-center text-sm text-[#fffcf7]">
          补详情 · 还剩 {fillMissing}
        </Link>
      ) : null}
      <div className="rounded-[28px] bg-[var(--card)] p-5 shadow-[0_12px_40px_rgba(80,40,10,0.08)]">
        <div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <PlaceSearch
                value={location}
                cityBias={cityBias}
                placeholder="地点"
                onChange={(next) => {
                  setLocation(next);
                  if (next.trim() !== "我的位置") {
                    setOriginLat(undefined);
                    setOriginLng(undefined);
                  }
                }}
                onPick={(tip) => {
                  setLocation(tip.name);
                  if (tip.lat != null && tip.lng != null) {
                    setOriginLat(tip.lat);
                    setOriginLng(tip.lng);
                  }
                }}
              />
              <button
                className="shrink-0 rounded-2xl bg-[#efe4d6] px-3 py-3 text-sm text-[#4a3f38]"
                type="button"
                onClick={useGps}
                disabled={locating || loading}
              >
                {locating ? "定位中" : "定位"}
              </button>
            </div>
            {resolved ? (
              <p className="mt-2 text-sm text-[#c45c26]">{resolved.label.split(" · ")[0]}</p>
            ) : null}
            {weatherHint ? <p className="mt-1 text-sm text-[#c45c26]">{weatherHint}</p> : null}
            <ChipRow
              options={RADIUS_OPTIONS}
              selected={radiusKm}
              onSelect={(value) => {
                setRadiusKm(value);
                if (!location.trim() && originLat == null) return;
                void ask(false, [], {
                  here: originLat != null || resolved?.fromIp === true || location.trim() === "我的位置",
                  lat: originLat,
                  lng: originLng,
                  location,
                  radiusKm: value,
                });
              }}
            />
          </div>
        </div>

        <div className="my-5 h-px bg-[#ead9c8]" />

        <div>
          <div className="min-w-0 flex-1">
            <input
              className="fb-input"
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void (hasPlace ? searchHere() : ask(false));
              }}
              placeholder="吃什么"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {FOOD_QUICK.map((item) => {
                const active = keywords === item;
                return (
                  <button
                    key={item}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      active ? "bg-[#1c1612] text-white" : "bg-[#efe4d6] text-[#4a3f38]"
                    }`}
                    type="button"
                    onClick={() => setKeywords(active ? "" : item)}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="my-5 h-px bg-[#ead9c8]" />

        <div>
          <div className="min-w-0 flex-1">
            <button className="fb-primary" onClick={searchHere} disabled={loading || locating} type="button">
              {primaryLabel}
            </button>
            <button
              className="mt-3 w-full rounded-full bg-[#efe4d6] px-4 py-3 text-sm text-[#1c1612] disabled:opacity-50"
              type="button"
              disabled={mapBusy || locating}
              onClick={() => void loadMapShops()}
            >
              {mapBusy ? "在搜…" : "搜高德"}
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <button className="fb-ghost" type="button" onClick={() => ask(false)} disabled={loading}>
                {busy === "pick" ? "在挑…" : "挑 3 家"}
              </button>
              <button className="fb-ghost" type="button" onClick={() => ask(true)} disabled={loading}>
                {busy === "daily" ? "在定…" : "今天一家"}
              </button>
              <button className="fb-ghost" type="button" onClick={() => void spinOnce()} disabled={loading}>
                {busy === "spin" ? "在转…" : "转一转"}
              </button>
              {results.length ? (
                <button
                  className="fb-ghost disabled:opacity-40"
                  type="button"
                  onClick={() => void reroll()}
                  disabled={loading || rerolls >= MAX_REROLLS}
                >
                  {rerolls >= MAX_REROLLS ? "换完了" : "换一批"}
                </button>
              ) : null}
              {results.length >= 2 ? (
                <button className="fb-ghost" type="button" onClick={() => void copyShare()} disabled={loading}>
                  发给朋友
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <button className="mt-5 text-xs text-[#7a6c62]" type="button" onClick={() => setShowMore((value) => !value)}>
          {showMore ? "收起" : "筛选"}
        </button>
        {showMore ? (
          <div className="mt-3 rounded-2xl bg-[#f7efe6] p-4">
            <input className="fb-input" value={mood} onChange={(event) => setMood(event.target.value)} placeholder="心情" />
            <input className="fb-input mt-2" value={cityBias} onChange={(event) => setCityBias(event.target.value)} placeholder="城市" />
            <ChipRow
              label="菜系"
              options={[
                { value: "", label: "不限" },
                ...takeFacet(facets.cuisines, cuisine, 8).map((item) => ({ value: item, label: item })),
              ]}
              selected={cuisine}
              onSelect={setCuisine}
            />
            <ChipRow
              label="区域"
              options={[
                { value: "", label: "不限" },
                ...takeFacet(facets.areas, area, 6).map((item) => ({ value: item, label: item })),
              ]}
              selected={area}
              onSelect={setArea}
            />
            <ChipRow
              label="标签"
              options={[
                { value: "", label: "不限" },
                ...takeFacet(facets.tags, tag, 10).map((item) => ({ value: item, label: item })),
              ]}
              selected={tag}
              onSelect={setTag}
            />
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {shareHint ? <p className="mt-2 text-sm text-[#c45c26]">{shareHint}</p> : null}
      </div>

      {showSpin ? <SpinRitual names={pool} spinning={spinning} winner={results[0]?.place.name} /> : null}

      {nearby === false && (resolved || originLat != null || location.trim()) ? (
        <div className="rounded-[24px] bg-white px-5 py-4 text-sm leading-relaxed text-[#7a6c62] shadow-sm">
          <p>附近没有收藏。</p>
          {mapNote ? <p className="mt-2 text-xs">{mapNote}</p> : null}
        </div>
      ) : mapNote ? (
        <p className="px-1 text-xs text-[#7a6c62]">{mapNote}</p>
      ) : null}
      {missingCoords > 0 ? (
        <p className="px-1 text-xs text-[#7a6c62]">{missingCoords} 家没坐标</p>
      ) : null}

      {!spinning && results.length ? (
        <p className="px-1 pt-2 text-xs tracking-wide text-[#7a6c62]">收藏 · {results.length}</p>
      ) : null}

      <div className="space-y-3">
        {!spinning &&
          results.map((item, index) => (
          <article
            key={item.place.id}
            className={`rounded-[24px] bg-white p-5 shadow-[0_8px_30px_rgba(80,40,10,0.06)] ${item.closed ? "opacity-55" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[#7a6c62]">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{item.place.name}</h2>
                {openBadge(item.place.openTime) ? (
                  <p className="mt-1 text-xs text-[#7a6c62]">{openBadge(item.place.openTime)}</p>
                ) : null}
                {ratingLabel(item.place) ? (
                  <p className="mt-1 text-sm text-[#c45c26]">{ratingLabel(item.place)}</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full bg-[#fff1e4] px-3 py-1 text-sm text-[#c45c26]">{tripLabel(item)}</span>
            </div>
            {item.place.status === "want" && !ratingLabel(item.place) ? (
              <p className="mt-2 text-sm text-[#c45c26]">你标过还想再去</p>
            ) : null}
            <p className="mt-2 text-[15px] leading-relaxed text-[#4a3f38]">{item.reason}</p>
            {amapFacts(item.place) ? (
              <p className="mt-2 text-xs text-[#7a6c62]">{amapFacts(item.place)}</p>
            ) : null}
            {item.place.dishes?.length ? (
              <p className="mt-2 text-sm text-[#4a3f38]">
                招牌 {item.place.dishes.slice(0, 6).map((dish) => dish.name).join(" · ")}
                {item.place.dishes.length > 6 ? "…" : ""}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-[#7a6c62]">
              {[item.place.area, (item.place.tags ?? []).slice(0, 4).join(" · ")].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <MapsLink place={item.place} from={resolved} />
              <button className="rounded-full bg-[#efe4d6] px-3 py-1.5" onClick={() => void mark(item.place, "want")}>
                还想再去
              </button>
              <button
                className="rounded-full bg-[#efe4d6] px-3 py-1.5"
                onClick={() => setLoggingId(loggingId === item.place.id ? "" : item.place.id)}
              >
                今天去了
              </button>
              <button className="rounded-full bg-[#efe4d6] px-3 py-1.5" onClick={() => void mark(item.place, "skip")}>
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

      {mapShops.length ? (
        <div className="space-y-3">
          <p className="px-1 pt-2 text-xs tracking-wide text-[#7a6c62]">
            高德 · {mapShops.length}
          </p>
          {mapShops.map((shop) => (
            <article key={shop.poiId} className="rounded-[24px] border border-[#ead9c8] bg-[#fffaf3] p-5">
              <h2 className="text-lg font-semibold tracking-tight">{shop.name}</h2>
              <p className="mt-1 text-xs text-[#7a6c62]">{shop.label}</p>
              <p className="mt-1 text-xs text-[#7a6c62]">
                {[
                  shop.rating != null ? `高德 ${shop.rating}` : null,
                  shop.cost != null ? `人均约 ${shop.cost}` : null,
                  shop.tel,
                  shop.openTime,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <MapsLink place={shop} from={resolved} />
                <button
                  className="rounded-full bg-[#1c1612] px-3 py-1.5 text-white disabled:opacity-50"
                  type="button"
                  disabled={savingPoi === shop.poiId}
                  onClick={() => void saveMapShop(shop)}
                >
                  {savingPoi === shop.poiId ? "在收…" : "收入店库"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function tripLabel(item: RecommendResult): string {
  if (item.durationMin != null && item.travelMode) {
    const how = item.travelMode === "walk" ? "步行" : "驾车";
    const distance = item.distanceKm != null ? ` · ${formatDistance(item.distanceKm)}` : "";
    return `${how} ${item.durationMin} 分钟${distance}`;
  }
  if (item.distanceKm != null) return formatDistance(item.distanceKm);
  return item.place.area ?? "未填区域";
}

function takeFacet(items: string[], selected: string, limit: number): string[] {
  const head = items.slice(0, limit);
  if (selected && !head.includes(selected)) return [selected, ...head.slice(0, limit - 1)];
  return head;
}
