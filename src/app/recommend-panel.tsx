"use client";

import { useState } from "react";
import type { RecommendResult } from "@/lib/types";

export function RecommendPanel() {
  const [mood, setMood] = useState("周五，有点累");
  const [keywords, setKeywords] = useState("想吃辣");
  const [results, setResults] = useState<RecommendResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask(daily = false) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, keywords, daily }),
      });
      const data = (await response.json()) as { results?: RecommendResult[] };
      setResults(data.results ?? []);
    } catch {
      setError("推荐失败，先确认 npm run dev 还在跑。");
    } finally {
      setLoading(false);
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
        <label className="mt-4 block text-sm text-[#6b5e55]">想吃的关键字</label>
        <input
          className="mt-1 w-full rounded-2xl border border-[#ead9c8] bg-white px-4 py-3"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="辣、面、火锅、清淡、人均不高"
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
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="space-y-3">
        {results.map((item) => (
          <article key={item.place.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">{item.place.name}</h2>
              <span className="text-sm text-[#6b5e55]">{item.place.area ?? "未填区域"}</span>
            </div>
            <p className="mt-2 text-[#4a3f38]">{item.reason}</p>
            <p className="mt-3 text-sm text-[#6b5e55]">
              {(item.place.tags ?? []).join(" · ") || "还没打标签"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
