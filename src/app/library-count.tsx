"use client";

import { useEffect, useState } from "react";

export function LibraryCount({ variant }: { variant: "hero" | "inline" }) {
  const [total, setTotal] = useState<number>();

  useEffect(() => {
    void fetch("/api/places/enrich")
      .then((response) => response.json())
      .then((stats: { total?: number }) => setTotal(stats.total ?? 0))
      .catch(() => undefined);
  }, []);

  if (total == null) return null;
  if (variant === "inline") {
    return <>店库现在 {total} 家。</>;
  }
  return (
    <div className="mt-4">
      <p className="text-[44px] font-semibold leading-none tracking-tight">{total}</p>
      <p className="mt-2 text-[15px] text-[#7a6c62]">家已经导入</p>
    </div>
  );
}
