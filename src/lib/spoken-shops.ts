/** Split one spoken phrase into shop names. Punctuation and “然后/还有/以及” separate names; “和” stays inside a name. */
export function splitSpokenShops(text: string): string[] {
  const parts = text
    .split(/[，,、。；;\n]+|(?:然后|还有|以及)/)
    .map((part) => part.replace(/^(是|叫|这家|那家|一个|一家)/, "").trim())
    .filter((part) => part.length >= 2);
  const unique = [...new Set(parts)];
  const names = unique.length ? unique : [text.trim()];
  return names.filter((part) => part.length >= 2).slice(0, 8);
}
