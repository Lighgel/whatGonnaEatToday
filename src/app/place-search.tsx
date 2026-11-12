"use client";

import { useEffect, useState } from "react";
import type { PlaceSuggestion } from "@/lib/types";

export function PlaceSearch({
  value,
  onChange,
  onPick,
  cityBias,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick?: (item: PlaceSuggestion) => void;
  cityBias?: string;
  placeholder?: string;
}) {
  const [tips, setTips] = useState<PlaceSuggestion[]>([]);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    const text = value.trim();
    if (text.length < 2 || text === "我的位置" || text === picked) {
      setTips([]);
      return;
    }
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams({ q: text });
      if (cityBias?.trim()) params.set("city", cityBias.trim());
      void fetch(`/api/suggest?${params}`)
        .then((response) => response.json())
        .then((data: { suggestions?: PlaceSuggestion[] }) => setTips(data.suggestions ?? []))
        .catch(() => setTips([]));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [value, cityBias]);

  return (
    <div className="min-w-0 flex-1">
      <input
        className="fb-input"
        value={value}
        onChange={(event) => {
          setPicked("");
          onChange(event.target.value);
        }}
        placeholder={placeholder}
      />
      {tips.length ? (
        <div className="mt-2 overflow-hidden rounded-2xl border border-[#ead9c8] bg-white">
          {tips.map((tip) => (
            <button
              key={tip.label}
              className="block w-full border-b border-[#f3e6d8] px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-[#fff7ee]"
              type="button"
              onClick={() => {
                setPicked(tip.name);
                setTips([]);
                onChange(tip.name);
                onPick?.(tip);
              }}
            >
              {tip.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
