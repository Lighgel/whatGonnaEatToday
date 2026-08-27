import type { Place, PlaceSource } from "./types";

export function parsePlaceText(raw: string, source: PlaceSource = "manual"): Place[] {
  const now = new Date().toISOString();
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split(/[,，\t]/).map((part) => part.trim()).filter(Boolean);
      const name = parts[0] ?? line;
      const tags = parts.slice(1).filter((part) => part !== name);
      return {
        id: crypto.randomUUID(),
        name,
        tags,
        source,
        status: "want" as const,
        createdAt: now,
        notes: tags.length ? undefined : "从粘贴导入，建议补标签",
      };
    });
}
