export function parsePrice(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  const n = typeof text === 'number' ? text
    : Number((/^\s*-/.test(text) ? '-' : '') + text.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
