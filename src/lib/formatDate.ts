export function formatDate(value: string, locale?: string): string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    const ms = trimmed.length <= 10 ? n * 1000 : n;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale);
}
