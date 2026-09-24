"use client";

import { useState } from "react";
import type { Place, PlaceStatus } from "@/lib/types";

const KEEP_OPTIONS: { value: PlaceStatus; label: string }[] = [
  { value: "want", label: "还想再去" },
  { value: "neutral", label: "一般" },
  { value: "skip", label: "不想再去" },
];

export function VisitForm({
  place,
  onSaved,
  onCancel,
}: {
  place: Place;
  onSaved: (keep: PlaceStatus) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState<PlaceStatus>("want");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(name: string) {
    setSelected((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    const extraDishes = extra
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: place.id,
          dishes: [...selected, ...extraDishes],
          note,
          keep,
        }),
      });
      if (!response.ok) {
        setError("没记上，再试一次。");
        return;
      }
      onSaved(keep);
    } catch {
      setError("没记上，再试一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#ead9c8] bg-[#fffaf3] p-4">
      <p className="text-sm text-[#6b5e55]">记下这一餐 · {place.name}</p>
      {place.dishes?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {place.dishes.map((dish) => {
            const active = selected.includes(dish.name);
            return (
              <button
                key={dish.id}
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${
                  active ? "bg-[#c45c26] text-white" : "bg-white text-[#4a3f38]"
                }`}
                onClick={() => toggle(dish.name)}
              >
                {dish.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#6b5e55]">还没有招牌菜，下面自己填也行。</p>
      )}
      <input
        className="mt-3 w-full rounded-2xl border border-[#ead9c8] bg-white px-3 py-2 text-sm"
        value={extra}
        onChange={(event) => setExtra(event.target.value)}
        placeholder="还点了什么，逗号分开"
      />
      <textarea
        className="mt-2 min-h-20 w-full rounded-2xl border border-[#ead9c8] bg-white p-3 text-sm"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="这一顿怎么样"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {KEEP_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${
              keep === option.value ? "bg-[#c45c26] text-white" : "bg-white text-[#4a3f38]"
            }`}
            onClick={() => setKeep(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-full bg-[#c45c26] px-4 py-1.5 text-sm text-white disabled:opacity-60"
          onClick={() => void save()}
          disabled={saving}
          type="button"
        >
          {saving ? "在记..." : "记下"}
        </button>
        <button className="rounded-full bg-white px-4 py-1.5 text-sm" onClick={onCancel} type="button">
          取消
        </button>
      </div>
    </div>
  );
}
