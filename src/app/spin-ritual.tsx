"use client";

import { useEffect, useState } from "react";

export function SpinRitual({
  names,
  spinning,
  winner,
}: {
  names: string[];
  spinning: boolean;
  winner?: string;
}) {
  const [shown, setShown] = useState(winner || names[0] || "");

  useEffect(() => {
    if (!spinning || names.length < 2) {
      if (winner) setShown(winner);
      return;
    }
    let index = 0;
    const handle = window.setInterval(() => {
      index = (index + 1) % names.length;
      setShown(names[index]);
    }, 90);
    return () => window.clearInterval(handle);
  }, [spinning, names, winner]);

  if (!shown) return null;

  return (
    <div className="rounded-[28px] bg-[#1c1612] px-5 py-8 text-center text-[#fffcf7]">
      <p className="text-xs tracking-[0.22em] text-[#d9cbbd]">{spinning ? "在转" : "转到这家"}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{shown}</p>
    </div>
  );
}
