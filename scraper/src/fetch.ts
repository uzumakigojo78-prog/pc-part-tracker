export const USER_AGENT = 'PCPartTrackerBot/1.0 (+https://github.com/<owner>/pc-part-tracker)';
const MIN_GAP_MS = 2000;
const lastByHost = new Map<string, number>();

export const redact = (s: string) => s.replace(/apiKey=[^&\s"']*/g, 'apiKey=REDACTED');

export async function politeFetch(
  url: string,
  init?: RequestInit,
  deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<Response> {
  const { fetch: f = fetch, sleep = (ms) => new Promise<void>(r => setTimeout(r, ms)), now = Date.now } = deps;
  const host = new URL(url).host;
  const last = lastByHost.get(host);
  if (last !== undefined && now() - last < MIN_GAP_MS) await sleep(MIN_GAP_MS - (now() - last));
  lastByHost.set(host, now());
  const headers = new Headers(init?.headers);
  headers.set('User-Agent', USER_AGENT);
  return f(url, { ...init, headers });
}
