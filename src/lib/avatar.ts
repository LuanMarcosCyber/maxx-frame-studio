/**
 * Generates initials from a name.
 * - 1 word: first 2 letters
 * - 2+ words: first letter of first 2 words
 * - Always uppercase
 */
export function getInitials(name?: string | null): string {
  const src = (name || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
