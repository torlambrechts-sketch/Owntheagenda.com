// Small, dependency-free export helpers. `toCsv` is pure (unit-tested);
// `downloadText` is the browser side-effect that hands the file to the user.

// RFC 4180-ish: quote a field when it contains a comma, quote or newline, and
// double any embedded quotes. null/undefined render as empty.
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// Trigger a client-side download of text content. No-op outside the browser.
export function downloadText(filename: string, mime: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A filesystem-safe slug for filenames.
export function fileSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export";
}
