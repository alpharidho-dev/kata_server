// Parse hashtag dari text
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const regex = /#([a-zA-Z0-9_]+)/g;
  const matches = [...text.matchAll(regex)];
  const tags = matches.map((m) => m[1].toLowerCase());
  return [...new Set(tags)]; // hapus duplikat
}

// Normalize satu tag (buat input manual dari FE)
export function normalizeTag(input: string): string {
  return input.toLowerCase().replace(/^#/, "").trim();
}