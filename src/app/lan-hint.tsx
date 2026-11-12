"use client";

import { useEffect, useState } from "react";

export function LanHint() {
  const [hint, setHint] = useState("");

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((data: { desktop?: boolean; lan?: string[] }) => {
        if (!data.desktop) return;
        setHint((data.lan ?? []).join("  "));
      })
      .catch(() => undefined);
  }, []);

  if (!hint) return null;
  return <p className="mb-4 text-xs leading-relaxed text-[#7a6c62]">{hint}</p>;
}
