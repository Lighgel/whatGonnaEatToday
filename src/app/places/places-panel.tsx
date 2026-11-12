"use client";

import { useCallback, useEffect, useState } from "react";
import { ChipRow } from "../chip-row";
import { MapsLink } from "../maps-link";
import { PlaceSearch } from "../place-search";
import { VisitForm } from "../visit-form";
import { SpeechKeyCard } from "../speech-key";
import { VoiceInput } from "../voice-input";
import { amapFacts, ratingLabel } from "@/lib/experience";
import { formatDistance } from "@/lib/geo";
import { splitSpokenShops } from "@/lib/spoken-shops";
import type { Place, PlaceFacets, PlaceStatus, ShopCandidate, TravelMode } from "@/lib/types";

const emptyFacets: PlaceFacets = { cuisines: [], areas: [], tags: [] };
let placesAutoFillStarted = false;

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
  const [notesText, setNotesText] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesLog, setNotesLog] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [noteEditingId, setNoteEditingId] = useState("");
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
  const [showImport, setShowImport] = useState(false);
  const [shopQuery, setShopQuery] = useState("");
  const [shopHits, setShopHits] = useState<ShopCandidate[]>([]);
  const [shopBusy, setShopBusy] = useState(false);
  const [savingPoi, setSavingPoi] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichingId, setEnrichingId] = useState("");
  const [fill, setFill] = useState({ missing: 0, filled: 0, unmatched: 0, total: 0 });
  const [fillLog, setFillLog] = useState("");
  const [fillKnown, setFillKnown] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [openVisits, setOpenVisits] = useState<Record<string, boolean>>({});
  const [loggingId, setLoggingId] = useState("");
  const [nearby, setNearby] = useState(true);
  const [missingCoords, setMissingCoords] = useState(0);
  const [origin, setOrigin] = useState<{ lat: number; lng: number }>();
  const [travel, setTravel] = useState<Record<string, { durationMin?: number; travelMode?: TravelMode; distanceKm?: number }>>(
    {},
  );

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
      nearby?: boolean;
      missingCoords?: number;
      travel?: Record<string, { durationMin?: number; travelMode?: TravelMode; distanceKm?: number }>;
      origin?: { label: string; lat: number; lng: number };
    };
    setPlaces(data.places ?? []);
    setNearby(data.nearby !== false);
    setMissingCoords(data.missingCoords ?? 0);
    setTravel(data.travel ?? {});
    setOrigin(data.origin);
    setGeoNote(data.error ? data.error : data.origin ? `识别为 ${data.origin.label}` : "");
    if (data.facets) setFacets(data.facets);
    void fetch("/api/places/enrich")
      .then((response) => response.json())
      .then((stats: { missing?: number; filled?: number; unmatched?: number; total?: number }) => {
        setFill({
          missing: stats.missing ?? 0,
          filled: stats.filled ?? 0,
          unmatched: stats.unmatched ?? 0,
          total: stats.total ?? 0,
        });
        setFillKnown(true);
      })
      .catch(() => undefined);
  }, [q, cuisine, area, status, tag, near, radiusKm, cityBias]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh();
    }, q || near ? 400 : 0);
    return () => window.clearTimeout(handle);
  }, [refresh, q]);

  async function findShops(raw?: string) {
    const q = (raw ?? shopQuery).trim();
    const queries = splitSpokenShops(q);
    if (!queries.length) {
      setMessage("至少写两个字的店名。");
      return;
    }
    setShopQuery(q);
    setShopBusy(true);
    setMessage(queries.length > 1 ? `在高德对这 ${queries.length} 家…` : "");
    try {
      const hits: ShopCandidate[] = [];
      const seen = new Set<string>();
      const missed: string[] = [];
      for (const name of queries) {
        const params = new URLSearchParams({ q: name });
        if (cityBias.trim()) params.set("city", cityBias.trim());
        const response = await fetch(`/api/shops?${params}`);
        const data = (await response.json()) as { shops?: ShopCandidate[]; error?: string };
        if (data.error && queries.length === 1) {
          setShopHits([]);
          setMessage(data.error);
          return;
        }
        const shops = data.shops ?? [];
        if (!shops.length) missed.push(name);
        for (const shop of shops) {
          if (seen.has(shop.poiId)) continue;
          seen.add(shop.poiId);
          hits.push(shop);
        }
      }
      setShopHits(hits);
      const heard = queries.length > 1 ? `听成 ${queries.join("、")}。` : "";
      if (!hits.length) setMessage(`${heard}没对上`);
      else if (missed.length) setMessage(`${heard}对上 ${hits.length}，没对上 ${missed.join("、")}`);
      else if (heard) setMessage(heard);
    } catch {
      setMessage("高德没连上。");
    } finally {
      setShopBusy(false);
    }
  }

  async function saveShop(shop: ShopCandidate) {
    setSavingPoi(shop.poiId);
    setMessage("");
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      const data = (await response.json()) as { existed?: boolean; error?: string };
      if (data.error) {
        setMessage(data.error);
        return;
      }
      setMessage(data.existed ? `已在店库 ${shop.name}` : `已收入 ${shop.name}`);
      setShopHits((current) => current.filter((item) => item.poiId !== shop.poiId));
      await refresh();
    } catch {
      setMessage("没存上，再试一次。");
    } finally {
      setSavingPoi("");
    }
  }

  async function enrichOnce(placeId?: string) {
    const response = await fetch("/api/places/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId, city: cityBias.trim() || "大连", limit: 8 }),
    });
    return (await response.json()) as {
      updated?: string[];
      missedNames?: string[];
      remaining?: number;
      missing?: number;
      filled?: number;
      unmatched?: number;
      total?: number;
      error?: string;
    };
  }

  async function enrichFromAmap(placeId?: string) {
    setEnriching(true);
    if (placeId) setEnrichingId(placeId);
    setMessage("");
    try {
      if (placeId) {
        const data = await enrichOnce(placeId);
        if (data.error) setFillLog(data.error);
        else if (data.updated?.length) setFillLog(`已补 ${data.updated.join("、")}`);
        else setFillLog("高德没对上这家店名。");
        await refresh();
        return;
      }
      let filledNow = 0;
      let missedNow = 0;
      for (let round = 0; round < 20; round += 1) {
        const data = await enrichOnce();
        if (data.error) {
          setFillLog(data.error);
          break;
        }
        filledNow += data.updated?.length ?? 0;
        missedNow += data.missedNames?.length ?? 0;
        setFill({
          missing: data.missing ?? 0,
          filled: data.filled ?? 0,
          unmatched: data.unmatched ?? 0,
          total: data.total ?? fill.total,
        });
        setFillLog(`已补 ${filledNow} 家${missedNow ? `，对不上 ${missedNow} 家` : ""}，还剩 ${data.missing ?? 0} 家`);
        if (!data.missing) break;
      }
      await refresh();
    } catch {
      setFillLog("补高德失败，稍后再试。");
    } finally {
      setEnriching(false);
      setEnrichingId("");
    }
  }

  useEffect(() => {
    if (!fillKnown || placesAutoFillStarted || fill.missing <= 0 || enriching) return;
    placesAutoFillStarted = true;
    void enrichFromAmap();
  }, [fillKnown, fill.missing, enriching]);

  async function pasteNotes(placeId?: string) {
    const note = (placeId ? (noteDraft[placeId] ?? "") : notesText).trim();
    if (!note) {
      setNotesLog("先贴一段店名和评语。");
      return;
    }
    setNotesBusy(true);
    setNotesLog("");
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(placeId ? { placeId, note } : { notesText: note }),
      });
      const data = (await response.json()) as { attached?: string[]; missed?: string[]; error?: string };
      if (data.error) {
        setNotesLog(data.error);
        return;
      }
      const attached = data.attached ?? [];
      const missed = data.missed ?? [];
      setNotesLog(
        [
          attached.length ? `已贴上 ${attached.join("、")}` : "没对上店库里的店名",
          missed.length ? `没对上：${missed.join("、")}` : "",
        ]
          .filter(Boolean)
          .join("。"),
      );
      if (placeId && attached.length) {
        setNoteDraft((current) => ({ ...current, [placeId]: "" }));
        setNoteEditingId("");
      }
      if (!placeId && attached.length) setNotesText("");
      await refresh();
    } catch {
      setNotesLog("没贴上，再试一次。");
    } finally {
      setNotesBusy(false);
    }
  }

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
    <section className="space-y-4">
      {fillKnown ? (
        <div>
          <p className="text-[44px] font-semibold leading-none tracking-tight">{fill.total}</p>
          <p className="mt-2 text-[15px] text-[#7a6c62]">
            家{places.length !== fill.total ? ` · 列出 ${places.length}` : ""}
          </p>
        </div>
      ) : null}
      <div className="rounded-[28px] bg-[#1c1612] p-5 text-[#fffcf7]">
        <p className="text-sm text-[#ead9c8]">
          详情 {fill.filled}/{fill.total}
          {fill.missing ? ` · 剩 ${fill.missing}` : ""}
          {fill.unmatched ? ` · 对不上 ${fill.unmatched}` : ""}
        </p>
        <button
          className="mt-4 w-full rounded-full bg-[#c45c26] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          type="button"
          disabled={enriching || fill.missing === 0}
          onClick={() => void enrichFromAmap()}
        >
          {enriching && !enrichingId ? "在补…" : fill.missing === 0 ? "已补完" : "补详情"}
        </button>
        {fillLog ? <p className="mt-2 text-xs text-[#ead9c8]">{fillLog}</p> : null}
      </div>
      <div className="rounded-[28px] bg-[var(--card)] p-5 shadow-[0_12px_40px_rgba(80,40,10,0.08)]">
        <textarea
          className="fb-input min-h-28"
          value={notesText}
          onChange={(event) => setNotesText(event.target.value)}
          placeholder="摘记"
        />
        <button
          className="mt-3 w-full rounded-full bg-[#1c1612] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          type="button"
          disabled={notesBusy || !notesText.trim()}
          onClick={() => void pasteNotes()}
        >
          {notesBusy && !noteEditingId ? "在对店名…" : "贴上摘记"}
        </button>
        {notesLog ? <p className="mt-2 text-sm text-[#c45c26]">{notesLog}</p> : null}
      </div>
      <div className="rounded-[28px] bg-[var(--card)] p-5 shadow-[0_12px_40px_rgba(80,40,10,0.08)]">
        <input
          className="fb-input"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="店名"
        />
        <div className="mt-3">
          <PlaceSearch
            value={near}
            cityBias={cityBias}
            placeholder="地点"
            onChange={setNear}
            onPick={(tip) => setNear(tip.name)}
          />
        </div>
        {geoNote ? <p className="mt-2 text-sm text-[#c45c26]">{geoNote}</p> : null}
        {near ? (
          <ChipRow
            options={[
              { value: "1", label: "1 km" },
              { value: "3", label: "3 km" },
              { value: "5", label: "5 km" },
              { value: "8", label: "8 km" },
            ]}
            selected={radiusKm}
            onSelect={setRadiusKm}
          />
        ) : null}
        <button className="mt-4 text-xs text-[#7a6c62]" type="button" onClick={() => setShowFilters((value) => !value)}>
          {showFilters ? "收起" : "筛选"}
        </button>
        {showFilters ? (
          <div className="mt-2">
            <ChipRow
              label="状态"
              options={STATUS_CHIPS}
              selected={status}
              onSelect={(value) => setStatus(value as PlaceStatus | "")}
            />
            <ChipRow
              label="菜系"
              options={[
                { value: "", label: "全部" },
                ...takeFacet(facets.cuisines, cuisine, 10).map((item) => ({ value: item, label: item })),
              ]}
              selected={cuisine}
              onSelect={setCuisine}
            />
            <ChipRow
              label="区域"
              options={[
                { value: "", label: "全部" },
                ...takeFacet(facets.areas, area, 8).map((item) => ({ value: item, label: item })),
              ]}
              selected={area}
              onSelect={setArea}
            />
            <ChipRow
              label="标签"
              options={[
                { value: "", label: "全部" },
                ...takeFacet(facets.tags, tag, 12).map((item) => ({ value: item, label: item })),
              ]}
              selected={tag}
              onSelect={setTag}
            />
            <input
              className="fb-input mt-3"
              value={cityBias}
              onChange={(event) => setCityBias(event.target.value)}
              placeholder="城市"
            />
          </div>
        ) : null}
        <button className="fb-primary mt-4" onClick={() => void refresh()} type="button">
          搜收藏
        </button>
      </div>

      <div className="rounded-[28px] bg-[var(--card)] p-5 shadow-[0_12px_40px_rgba(80,40,10,0.08)]">
        <SpeechKeyCard />
        <div className="mt-3 flex gap-2">
          <input
            className="fb-input"
            value={shopQuery}
            onChange={(event) => setShopQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void findShops();
            }}
            placeholder="店名"
          />
          <VoiceInput
            disabled={shopBusy}
            onText={(text) => {
              setMessage(`听成：${text}`);
              return findShops(text);
            }}
            onError={setMessage}
          />
          <button
            className="shrink-0 rounded-2xl bg-[#c45c26] px-4 py-3 text-sm text-white disabled:opacity-60"
            type="button"
            onClick={() => void findShops()}
            disabled={shopBusy}
          >
            {shopBusy ? "在找…" : "搜高德"}
          </button>
        </div>
        {shopHits.length ? (
          <ul className="mt-3 space-y-2">
            {shopHits.map((shop) => (
              <li key={shop.poiId} className="rounded-2xl bg-[#f7efe6] px-4 py-3">
                <p className="font-medium">{shop.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#7a6c62]">{shop.label}</p>
                <p className="mt-1 text-xs text-[#7a6c62]">
                  {[
                    shop.cuisine,
                    shop.rating != null ? `高德 ${shop.rating} 分` : null,
                    shop.cost != null ? `人均 ${shop.cost}` : null,
                    shop.tel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <button
                  className="mt-2 rounded-full bg-[#1c1612] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  type="button"
                  disabled={savingPoi === shop.poiId}
                  onClick={() => void saveShop(shop)}
                >
                  {savingPoi === shop.poiId ? "在收…" : "收入店库"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
        <button className="mt-4 text-sm text-[#7a6c62]" type="button" onClick={() => setShowImport((value) => !value)}>
          {showImport ? "收起" : "粘贴导入"}
        </button>
        {showImport ? (
          <>
            <textarea className="fb-input mt-2 min-h-24" value={text} onChange={(event) => setText(event.target.value)} placeholder="每行一家" />
            <button className="mt-3 rounded-full bg-[#efe4d6] px-4 py-2 text-sm" onClick={importText} type="button">
              导入
            </button>
          </>
        ) : null}
      </div>

      {near && nearby === false && places.length > 0 ? (
        <p className="rounded-[24px] bg-white px-5 py-4 text-sm leading-relaxed text-[#7a6c62] shadow-sm">
          附近没有收藏。
        </p>
      ) : null}
      {near && missingCoords > 0 ? (
        <p className="px-1 text-xs text-[#7a6c62]">{missingCoords} 家没坐标</p>
      ) : null}

      {filteredEmpty ? (
        <p className="rounded-[24px] bg-white px-5 py-4 text-sm text-[#7a6c62] shadow-sm">
          没有符合的店。
        </p>
      ) : (
        <ul className="space-y-3">
          {places.map((place) => (
            <li key={place.id} className="rounded-[24px] bg-white p-5 shadow-[0_8px_30px_rgba(80,40,10,0.06)]">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{place.name}</h2>
                <span className="text-xs text-[#7a6c62]">{ratingLabel(place) ?? place.source}</span>
              </div>
              {amapFacts(place) ? <p className="mt-1 text-xs text-[#7a6c62]">{amapFacts(place)}</p> : null}
              {travel[place.id]?.durationMin != null ? (
                <p className="mt-1 text-sm text-[#c45c26]">
                  {travel[place.id].travelMode === "walk" ? "步行" : "驾车"} {travel[place.id].durationMin} 分钟
                  {travel[place.id].distanceKm != null ? ` · ${formatDistance(travel[place.id].distanceKm as number)}` : ""}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-[#6b5e55]">
                {[place.area, place.cuisine, place.tags.join(" · ")].filter(Boolean).join(" · ") || "无标签"}
              </p>
              {place.dishes?.length ? (
                <p className="mt-2 text-sm text-[#4a3f38]">
                  招牌：{place.dishes.slice(0, 6).map((dish) => dish.name).join(" · ")}
                  {place.dishes.length > 6 ? "…" : ""}
                </p>
              ) : null}
              {place.lastVisitedAt ? (
                <p className="mt-1 text-sm text-[#6b5e55]">上次去过 {formatDay(place.lastVisitedAt)}</p>
              ) : null}
              {place.notes ? (
                <p className="mt-2 text-sm text-[#6b5e55] line-clamp-3">
                  {place.tags.includes("大爷点评") ? "大爷点评 · " : "店库摘记 · "}
                  {place.notes}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <MapsLink place={place} from={origin} />
                <button className="rounded-full bg-[#efe4d6] px-3 py-1.5" onClick={() => mark(place, "want")}>
                  还想再去
                </button>
                <button
                  className="rounded-full bg-[#efe4d6] px-3 py-1.5"
                  onClick={() => setLoggingId(loggingId === place.id ? "" : place.id)}
                  type="button"
                >
                  今天去了
                </button>
                <button className="rounded-full bg-[#efe4d6] px-3 py-1.5" onClick={() => mark(place, "skip")}>
                  不想再去
                </button>
                {place.amapStatus !== "ok" && place.amapStatus !== "unmatched" ? (
                  <button
                    className="rounded-full bg-[#efe4d6] px-3 py-1.5 disabled:opacity-50"
                    type="button"
                    disabled={enriching}
                    onClick={() => void enrichFromAmap(place.id)}
                  >
                    {enrichingId === place.id ? "在对高德…" : "补高德"}
                  </button>
                ) : null}
                <button
                  className="rounded-full bg-[#efe4d6] px-3 py-1.5"
                  type="button"
                  onClick={() => setNoteEditingId(noteEditingId === place.id ? "" : place.id)}
                >
                  {noteEditingId === place.id ? "收起摘记" : place.notes ? "补摘记" : "贴摘记"}
                </button>
                {place.visits?.length ? (
                  <button
                    className="rounded-full bg-[#efe4d6] px-3 py-1.5"
                    onClick={() =>
                      setOpenVisits((current) => ({ ...current, [place.id]: !current[place.id] }))
                    }
                    type="button"
                  >
                    {openVisits[place.id] ? "收起到店" : `到店 ${place.visits.length} 次`}
                  </button>
                ) : null}
              </div>
              {noteEditingId === place.id ? (
                <div className="mt-3">
                  <textarea
                    className="fb-input min-h-20"
                    value={noteDraft[place.id] ?? ""}
                    onChange={(event) =>
                      setNoteDraft((current) => ({ ...current, [place.id]: event.target.value }))
                    }
                    placeholder="摘记"
                  />
                  <button
                    className="mt-2 rounded-full bg-[#1c1612] px-4 py-2 text-sm text-white disabled:opacity-50"
                    type="button"
                    disabled={notesBusy || !(noteDraft[place.id] ?? "").trim()}
                    onClick={() => void pasteNotes(place.id)}
                  >
                    {notesBusy && noteEditingId === place.id ? "在贴…" : "写入摘记"}
                  </button>
                </div>
              ) : null}
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
                  className="fb-input min-w-0 flex-1 !rounded-full !px-4 !py-2 text-sm"
                  value={dishDraft[place.id] ?? ""}
                  onChange={(event) =>
                    setDishDraft((current) => ({ ...current, [place.id]: event.target.value }))
                  }
                  placeholder="加一道菜"
                />
                <button className="rounded-full bg-[#efe4d6] px-3 py-2 text-sm" type="submit">
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
