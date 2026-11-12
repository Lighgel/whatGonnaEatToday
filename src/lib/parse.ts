import type { Place, PlaceSource } from "./types";

export type NoteClip = {
  name: string;
  note: string;
};

const NOISE_LINE =
  /^(https?:\/\/|复制此链接|打开抖音|打开小红书|打开看看|分享视频|#|@|抖音|v\.douyin|xhslink)/i;
const NOT_A_SHOP = /^(大爷点评|店库摘记|摘记|必吃榜|置顶)/;

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

export function mergeNotes(previous?: string, next?: string): string | undefined {
  const left = previous?.trim() ?? "";
  const right = next?.trim() ?? "";
  if (!right) return left || undefined;
  if (!left) return right;
  if (left.includes(right) || right.includes(left)) return left.length >= right.length ? left : right;
  return `${left} ｜ ${right}`;
}

export function parseNotePaste(raw: string, knownNames: string[] = []): NoteClip[] {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return [];
  const fromKnown = knownNames.length ? splitByKnownNames(text, knownNames) : [];
  if (fromKnown.length) return fromKnown;
  return splitByBlocks(text);
}

function splitByKnownNames(text: string, knownNames: string[]): NoteClip[] {
  const hits = locateKnownNames(text, knownNames);
  if (!hits.length) return [];
  const clips: NoteClip[] = [];
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    const next = hits[index + 1];
    const note = cleanNote(text.slice(hit.end, next?.start ?? text.length));
    if (note.length >= 6) clips.push({ name: hit.name, note });
  }
  return clips;
}

function locateKnownNames(text: string, knownNames: string[]): Array<{ name: string; start: number; end: number }> {
  const ranked = [...knownNames].sort((left, right) => right.length - left.length);
  const taken = new Array<boolean>(text.length).fill(false);
  const hits: Array<{ name: string; start: number; end: number }> = [];
  for (const name of ranked) {
    for (const needle of nameVariants(name)) {
      let from = 0;
      while (from < text.length) {
        const start = text.indexOf(needle, from);
        if (start < 0) break;
        const end = start + needle.length;
        const overlap = taken.slice(start, end).some(Boolean);
        if (!overlap) {
          hits.push({ name, start, end });
          taken.fill(true, start, end);
        }
        from = end;
      }
    }
  }
  hits.sort((left, right) => left.start - right.start);
  return hits;
}

function nameVariants(name: string): string[] {
  const core = name.replace(/[（(].*?[）)]/g, "").replace(/(总店|分店)$/g, "").trim();
  return [...new Set([name, core].filter((item) => item.length >= 3))].sort((left, right) => right.length - left.length);
}

function splitByBlocks(text: string): NoteClip[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const clips: NoteClip[] = [];
  if (blocks.length > 1) {
    for (const block of blocks) {
      const clip = clipFromBlock(block);
      if (clip) clips.push(clip);
    }
    return clips;
  }
  const lines = usableLines(text);
  const one = lines.length === 1 ? clipFromLine(lines[0]) : undefined;
  if (one) return [one];
  let current: { name: string; parts: string[] } | undefined;
  for (const line of lines) {
    const shop = looksLikeShopName(line);
    if (shop) {
      if (current) {
        const note = cleanNote(current.parts.join("\n"));
        if (note.length >= 6) clips.push({ name: current.name, note });
      }
      current = { name: shop, parts: [] };
      continue;
    }
    if (current) current.parts.push(line);
  }
  if (current) {
    const note = cleanNote(current.parts.join("\n"));
    if (note.length >= 6) clips.push({ name: current.name, note });
  }
  return clips;
}

function clipFromBlock(block: string): NoteClip | undefined {
  const lines = usableLines(block);
  if (!lines.length) return undefined;
  if (lines.length === 1) return clipFromLine(lines[0]);
  const name = looksLikeShopName(lines[0]);
  const note = cleanNote(lines.slice(name ? 1 : 0).join("\n"));
  if (!name || note.length < 6) return undefined;
  return { name, note };
}

function clipFromLine(line: string): NoteClip | undefined {
  const parts = line.split(/\s*[|｜]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && looksLikeShopName(parts[0])) {
    const note = cleanNote(parts.slice(1).join(" "));
    if (note.length >= 6) return { name: parts[0], note };
  }
  const colon = line.match(/^(.{2,40}?)[：:]\s*(.{6,})$/);
  if (colon && looksLikeShopName(colon[1])) {
    const note = cleanNote(colon[2]);
    if (note.length >= 6) return { name: colon[1].trim(), note };
  }
  return undefined;
}

function looksLikeShopName(value: string): string | undefined {
  const name = value.replace(/^【.*?】/, "").trim();
  if (!name || name.length > 40 || NOT_A_SHOP.test(name) || NOISE_LINE.test(name)) return undefined;
  if (/[。！？]/.test(name)) return undefined;
  return name;
}

function usableLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !NOISE_LINE.test(line));
}

function cleanNote(raw: string): string {
  return usableLines(raw)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
