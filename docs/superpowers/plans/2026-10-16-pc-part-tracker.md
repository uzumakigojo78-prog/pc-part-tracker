# PC Part Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PC-part price tracker — a GitHub Actions scraper that publishes static JSON, and one React app shipped as a GitHub Pages PWA (iPhone) and a Capacitor APK (Android) with Search, Build (3D), Watchlist and Settings (CSV backup) tabs.

**Architecture:** `scraper/` (Node + TS) reads `scraper/catalog.json`, fetches offers per retailer adapter, and writes `data/index.json`, `data/parts/<id>.json`, `data/history/<id>.json`. `app/` (React + Vite + TS) fetches that JSON over HTTPS, keeps personal data in IndexedDB, and on Android adds a native WorkManager backup plugin plus a Capacitor Background Runner for price-drop notifications. `shared/types.ts` is the contract between the two.

**Tech Stack:** TypeScript, Node 22, Vitest, React 19, Vite, react-router (HashRouter), `idb`, Fuse.js, Recharts, three + @react-three/fiber + @react-three/drei, vite-plugin-pwa, Capacitor (latest stable) + @capacitor/background-runner, Kotlin (WorkManager, MediaStore), Playwright, cheerio, robots-parser, aws4.

**Spec:** `docs/superpowers/specs/2026-10-16-pc-part-tracker-design.md`

## Global Constraints

- Retailer whitelist: `newegg`, `amazon`, `ebay` only. eBay listings must be condition `new` and seller feedback `>= 98`%.
- Offers match catalog parts by retailer reference only — never by title.
- Polite fetching: User-Agent `PCPartTrackerBot/1.0 (+https://github.com/<owner>/pc-part-tracker)`, `>= 2000` ms between requests to the same host, obey `robots.txt`.
- Scrape schedule: 4×/day, `cron: '17 */6 * * *'`.
- History points older than 730 days are dropped.
- Secrets live only in GitHub Actions secrets: `AMAZON_PAAPI_ACCESS_KEY`, `AMAZON_PAAPI_SECRET_KEY`, `AMAZON_PARTNER_TAG`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Never in the repo or the app bundle.
- Builder slots, in order: `cpu, cooler, motherboard, ram, gpu, storage, psu, case`. Category `prebuilt` is searchable but has no slot.
- Tabs, in order: Search · Build · Watchlist · Settings.
- Backup frequency `off | daily | weekly`; time of day `HH:MM` local. On Android the time is labeled "approximately".
- Android backup folder: `Documents/PCPartTracker/backup-YYYY-MM-DD/`.
- CSV is RFC 4180: `watchlist.csv` (partId, model, addedAt, priceWhenAdded, targetPrice), `builds.csv` (buildName, slot, partId, model, price), `price_history.csv` (partId, date, retailer, price — watched parts only, export-only).
- Import rejects the whole file on any bad row, and replaces data only after the user confirms.
- Android `minSdkVersion 29` (MediaStore `RELATIVE_PATH` requires API 29).
- USD, US retailers, English copy.

**Plan decisions that refine the spec** (flag in review if unwanted):
- Spec §4.5 had `@capacitor/background-runner` writing the CSVs. The runner has no filesystem API, so a small Kotlin WorkManager plugin (`ScheduledBackup`) writes the files; the runner only refreshes prices and posts notifications.
- Amazon product pages have no reliable JSON-LD, so the Amazon adapter uses PA-API only and is skipped (logged) without keys. eBay uses the Browse API (keys required). Newegg uses JSON-LD from product pages.

## Review Focus

1. Price text like `"$1,299.99"`, `"1299"`, `""`, or a missing offer → `parsePrice` returns a number or `null`, never `NaN`; a `null` price yields no offer and no history point. (Task 2)
2. Model names with commas, double quotes or newlines (e.g. `Corsair 32GB (2x16GB) "Vengeance", DDR5`) → CSV export then import round-trips them exactly. (Task 7)
3. A watched or built part that disappears from `index.json` → stays listed as "No longer tracked"; the build total excludes it instead of showing `NaN`. (Tasks 8, 10)
4. First launch while offline with no cache → empty state with Retry, not a crash or blank screen. (Tasks 6, 9)
5. iPhone app not opened for several days past a daily backup → one "Backup due" banner on next open (not one per missed day), cleared after export. (Tasks 8, 12)

---

## File Structure

```
pc-part-tracker/
  shared/types.ts                     # contract between scraper and app
  scraper/
    package.json, tsconfig.json
    catalog.json                      # tracked parts (seed ~100)
    src/price.ts                      # parsePrice
    src/jsonld.ts                     # extractJsonLdProduct
    src/normalize.ts                  # isCredible, toOffer, buildIndexEntry
    src/history.ts                    # appendHistory
    src/fetch.ts                      # politeFetch
    src/adapters/{index,newegg,amazon,ebay}.ts
    src/run.ts                        # run() + CLI main
    test/*.test.ts, test/fixtures/*
  data/                               # generated; committed by the Action
  app/
    package.json, vite.config.ts, capacitor.config.ts, index.html
    src/main.tsx, src/App.tsx         # router + tab bar
    src/lib/db.ts                     # IndexedDB stores
    src/lib/data.ts                   # fetchJson with cache fallback
    src/lib/useIndex.ts               # shared index.json context
    src/lib/search.ts                 # searchParts
    src/lib/watch.ts                  # watchStatus, alertsFor
    src/lib/build.ts                  # SLOTS, Slot, buildTotal
    src/lib/csv.ts                    # toCsv, parseCsv, exportBackup, parseBackup
    src/lib/schedule.ts               # nextBackupAt, isBackupDue
    src/platform/index.ts             # web vs native: saveBackup, syncNative, collectBackup
    src/features/search/{SearchPage,PartPage,PriceChart}.tsx
    src/features/builder/{BuilderPage,BuildScene}.tsx, layout.ts
    src/features/watchlist/WatchlistPage.tsx
    src/features/settings/{SettingsPage,BackupBanner}.tsx
    src/runner/runner.ts              # background-runner script (bundled by esbuild)
    android/app/src/main/java/<pkg>/{ScheduledBackupPlugin,BackupWorker}.kt
    e2e/smoke.spec.ts
  .github/workflows/{scrape,pages,apk}.yml
```

---

### Task 1: Repo scaffold and shared types

**Files:**
- Create: `.gitignore`, `README.md` (stub), `shared/types.ts`, `scraper/package.json`, `scraper/tsconfig.json`, `app/` (Vite react-ts template)

**Interfaces:**
- Produces (`shared/types.ts`):
```ts
export type Category = 'cpu'|'cooler'|'motherboard'|'ram'|'gpu'|'storage'|'psu'|'case'|'prebuilt';
export type RetailerId = 'newegg'|'amazon'|'ebay';
export interface RetailerRef { retailer: RetailerId; productId: string; url: string }
export interface CatalogPart { id: string; category: Category; brand: string; model: string;
  specs: Record<string, string>; image?: string; refs: RetailerRef[] }
export interface RawListing { retailer: RetailerId; productId: string; url: string;
  price: number | null; inStock: boolean; rating: number | null; ratingCount: number | null;
  condition?: 'new'|'used'|'refurbished'; sellerFeedbackPct?: number }
export interface Offer { retailer: RetailerId; price: number; url: string; inStock: boolean;
  rating: number | null; ratingCount: number | null; fetchedAt: string }
export interface IndexEntry { id: string; category: Category; brand: string; model: string;
  image?: string; lowestPrice: number | null; lowestRetailer: RetailerId | null;
  rating: number | null; ratingCount: number | null; updatedAt: string }
export interface PartDetail extends Omit<CatalogPart, 'refs'> { offers: Offer[]; updatedAt: string }
export interface HistoryPoint { date: string; retailer: RetailerId; price: number }
```

- [ ] **Step 1:** `git init` in `pc-part-tracker/`; `.gitignore`: `node_modules`, `dist`, `app/android/app/build`, `*.keystore`, `.env*`.
- [ ] **Step 2:** Write `shared/types.ts` exactly as above.
- [ ] **Step 3:** `npm create vite@latest app -- --template react-ts`; `npm i -D vitest jsdom fake-indexeddb @testing-library/react @testing-library/user-event`; in `vite.config.ts` set `base: './'` (works on the Pages subpath and inside Capacitor) and `test.environment: 'jsdom'`.
- [ ] **Step 4:** `scraper/package.json`: `"type": "module"`, scripts `test: vitest run`, `scrape: tsx src/run.ts`; deps `cheerio robots-parser aws4`; dev deps `vitest tsx typescript @types/node`.
- [ ] **Step 5:** Verify: `npx vitest run --passWithNoTests` exits 0 in both `app/` and `scraper/`; `npm run build` in `app/` succeeds.
- [ ] **Step 6:** Commit: `chore: scaffold repo, app, scraper and shared types`.

---

### Task 2: Scraper parsing — price, JSON-LD, normalization

**Files:**
- Create: `scraper/src/price.ts`, `scraper/src/jsonld.ts`, `scraper/src/normalize.ts`
- Test: `scraper/test/{price,jsonld,normalize}.test.ts`, `scraper/test/fixtures/newegg-product.html` (a real Newegg page trimmed to its JSON-LD script)

**Interfaces:**
- Consumes: `shared/types.ts`
- Produces:
  - `parsePrice(text: string | number | null | undefined): number | null`
  - `extractJsonLdProduct(html: string): { price: number | null; inStock: boolean; rating: number | null; ratingCount: number | null } | null`
  - `isCredible(l: RawListing): boolean`
  - `toOffer(l: RawListing, fetchedAt: string): Offer | null`
  - `buildIndexEntry(part: CatalogPart, offers: Offer[], updatedAt: string): IndexEntry`

- [ ] **Step 1: Write failing tests**
```ts
// price.test.ts
expect(parsePrice('$1,299.99')).toBe(1299.99);
expect(parsePrice('1299')).toBe(1299);
expect(parsePrice(349.5)).toBe(349.5);
expect(parsePrice('')).toBeNull();
expect(parsePrice('Out of stock')).toBeNull();
expect(parsePrice(undefined)).toBeNull();
expect(parsePrice('-5')).toBeNull();
expect(parsePrice(0)).toBeNull();

// jsonld.test.ts — expected values are the ones in the saved fixture
expect(extractJsonLdProduct(fixture('newegg-product.html')))
  .toEqual({ price: FIXTURE_PRICE, inStock: true, rating: FIXTURE_RATING, ratingCount: FIXTURE_COUNT });
expect(extractJsonLdProduct('<html></html>')).toBeNull();
expect(extractJsonLdProduct('<script type="application/ld+json">{bad json</script>')).toBeNull();
// Product inside "@graph" is found; offers as an array → lowest price; AggregateOffer uses lowPrice

// normalize.test.ts
const base = { retailer: 'ebay', productId: '1', url: 'u', price: 100, inStock: true, rating: null, ratingCount: null } as const;
expect(isCredible({ ...base, condition: 'new', sellerFeedbackPct: 98 })).toBe(true);
expect(isCredible({ ...base, condition: 'new', sellerFeedbackPct: 97.9 })).toBe(false);
expect(isCredible({ ...base, condition: 'used', sellerFeedbackPct: 100 })).toBe(false);
expect(isCredible({ ...base, condition: 'new' })).toBe(false);          // eBay without feedback
expect(isCredible({ ...base, retailer: 'newegg' })).toBe(true);
expect(toOffer({ ...base, retailer: 'newegg', price: null }, 't')).toBeNull();
// buildIndexEntry: lowest in-stock offer wins; if none in stock, lowest overall; no offers → lowestPrice/lowestRetailer null;
// rating = ratingCount-weighted mean across offers with ratings, ratingCount = sum
```
- [ ] **Step 2:** Run `cd scraper && npx vitest run` — expect FAIL (modules missing).
- [ ] **Step 3:** Implement. `parsePrice`: numbers pass through; strings strip all but digits, `.` and leading `-`, then `Number()`; return `null` unless finite and `> 0`. `extractJsonLdProduct`: cheerio over every `script[type="application/ld+json"]`, `JSON.parse` in try/catch, first node with `@type` `Product` (also inside `@graph` and arrays), `availability` containing `InStock`, `aggregateRating.ratingValue` and `reviewCount ?? ratingCount`.
- [ ] **Step 4:** Run `npx vitest run` — expect PASS.
- [ ] **Step 5:** Commit: `feat(scraper): price, JSON-LD and normalization`.

---

### Task 3: Scraper fetching and retailer adapters

**Files:**
- Create: `scraper/src/fetch.ts`, `scraper/src/adapters/{index,newegg,amazon,ebay}.ts`
- Test: `scraper/test/{fetch,adapters}.test.ts`, `scraper/test/fixtures/{ebay-item.json,amazon-getitems.json}`

**Interfaces:**
- Consumes: Task 2 `extractJsonLdProduct`, `parsePrice`
- Produces:
  - `interface RetailerAdapter { id: RetailerId; enabled(): boolean; fetchOffer(ref: RetailerRef): Promise<RawListing | null> }`
  - `class BlockedByRobotsError extends Error`
  - `politeFetch(url: string, init?: RequestInit, deps?: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }): Promise<Response>`
  - `createAdapters(env: NodeJS.ProcessEnv, f?: typeof politeFetch): RetailerAdapter[]`

- [ ] **Step 1: Write failing tests** (inject fake fetch/sleep/now; fixtures for responses):
```ts
// politeFetch: second call to the same host sleeps so calls are >= 2000ms apart; different hosts don't wait
// politeFetch: robots.txt disallows the path → rejects with BlockedByRobotsError; robots.txt 404 → allowed
// politeFetch: sends the User-Agent from Global Constraints
// newegg.fetchOffer → RawListing with the fixture's price and rating
// ebay.fetchOffer maps getItem fixture: condition 'new', sellerFeedbackPct = Number(seller.feedbackPercentage), price = parsePrice(price.value)
// amazon.fetchOffer maps GetItems fixture: price = Offers.Listings[0].Price.Amount, inStock from Availability.Type === 'Now'
// amazon.enabled() / ebay.enabled() false when their env keys are missing; newegg always true
// every adapter returns null (does not throw) on HTTP 404 or 503
```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. `politeFetch` keeps per-host parsed `robots.txt` (robots-parser) and last-request timestamp. Newegg: `GET ref.url` → `extractJsonLdProduct`. eBay: client-credentials token from `https://api.ebay.com/identity/v1/oauth2/token` (scope `https://api.ebay.com/oauth/api_scope`, cached until expiry), then `GET https://api.ebay.com/buy/browse/v1/item/{productId}`. Amazon: PA-API 5 `GetItems` (`ItemIds: [productId]`, `PartnerTag`, resources `Offers.Listings.Price`, `Offers.Listings.Availability.Type`, `CustomerReviews.StarRating`, `CustomerReviews.Count`) to `https://webservices.amazon.com/paapi5/getitems`, signed with `aws4` (service `ProductAdvertisingAPI`, region `us-east-1`). API hosts skip robots.txt (they're APIs, not pages).
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(scraper): polite fetch and retailer adapters`.

---

### Task 4: Scraper run loop, history and seed catalog

**Files:**
- Create: `scraper/src/history.ts`, `scraper/src/run.ts`, `scraper/catalog.json`
- Test: `scraper/test/{history,run}.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3
- Produces:
  - `appendHistory(existing: HistoryPoint[], offers: Offer[], date: string): HistoryPoint[]`
  - `run(opts: { catalog: CatalogPart[]; adapters: RetailerAdapter[]; dataDir: string; now: Date }): Promise<{ succeeded: number; failed: number; skipped: number }>` — counts are per (part, ref) fetch.
  - CLI `npm run scrape`: exits `1` when `succeeded === 0`, else `0`.
  - Files: `data/index.json: IndexEntry[]`, `data/parts/<id>.json: PartDetail`, `data/history/<id>.json: HistoryPoint[]`.

- [ ] **Step 1: Write failing tests** (temp dir via `fs.mkdtemp` as `dataDir`):
```ts
// appendHistory adds one point per offer at `date`
// appendHistory drops points older than 730 days before `date`
// appendHistory replaces (not duplicates) a point with the same date+retailer (re-run safety)
// run: one adapter throws, one succeeds → files written from the success; failed === 1, succeeded === 1
// run: ref for a disabled adapter → skipped === 1, not failed
// run: part with zero offers → parts/<id>.json has offers: [], history file unchanged
// run: index.json has every catalog part, sorted by id
// run: all fetches fail → succeeded === 0
```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `run` (sequential; each `fetchOffer` in try/catch with `console.warn(part.id, retailer, err.message)`) and the CLI main (`dataDir` = repo-root `data/`). Write JSON with 2-space indent and a trailing newline. History `date` = `now.toISOString().slice(0, 10)`.
- [ ] **Step 4:** Write `catalog.json`: ~100 parts, at least 8 per builder slot plus a few `prebuilt`, each with a Newegg ref (item number + product URL). IDs are kebab-case `brand-model` (e.g. `amd-ryzen-7-9800x3d`). Spec keys: cpu `cores, threads, baseClock, boostClock, socket, tdp`; gpu `memory, lengthMm, tdp`; ram `capacity, type, speed, modules`; storage `capacity, interface, formFactor`; psu `wattage, efficiency, modular`; motherboard `socket, chipset, formFactor`; case `formFactor, maxGpuLengthMm`; cooler `type, heightMm`.
- [ ] **Step 5:** Run tests — PASS. Live smoke: `npm run scrape` locally (Newegg only); confirm most `data/index.json` entries have a non-null `lowestPrice`. Note blocked/failed parts in the README rather than fixing them here.
- [ ] **Step 6:** Commit: `feat(scraper): run loop, history and seed catalog` (include the generated `data/`).

---

### Task 5: Scrape and Pages workflows

**Files:**
- Create: `.github/workflows/scrape.yml`, `.github/workflows/pages.yml`

**Interfaces:**
- Produces: the Pages site `https://<owner>.github.io/pc-part-tracker/`, serving the app with data at `./data/`.

- [ ] **Step 1:** `pages.yml`: triggers `push` (branch `main`, paths `app/**`, `shared/**`), `workflow_dispatch`, `workflow_call`. Top-level `concurrency: { group: pages, cancel-in-progress: false }` so two deploys never overlap. Checkout with `ref: main` (so a call right after a data commit sees the new data); in `app/`: `npm ci && npx vitest run && npm run build`; copy `data/` to `app/dist/data/`; deploy with `actions/upload-pages-artifact` + `actions/deploy-pages` (permissions `pages: write`, `id-token: write`).
- [ ] **Step 2:** `scrape.yml`: `schedule: - cron: '17 */6 * * *'` plus `workflow_dispatch`. Job `scrape` (`permissions: { contents: write }`), separate steps in `scraper/`: `npm ci`, `npx vitest run`, then `npm run scrape` — the Amazon/eBay secrets go in `env:` on the `npm run scrape` step only, never on the install step (install scripts must not see them). Commit `data/` as `github-actions[bot]` with message `chore(data): scrape <ISO timestamp>` only when `git status --porcelain data` is non-empty; then `git pull --rebase origin main && git push` (survives a push to `main` during the run). Job `deploy`: `needs: scrape`, `permissions: { pages: write, id-token: write }` (a called workflow only gets what the caller grants), `uses: ./.github/workflows/pages.yml`. (Pushes made with `GITHUB_TOKEN` don't trigger `push` workflows, hence the explicit call.)
- [ ] **Step 3:** Verify: `actionlint` reports no errors.
- [ ] **Step 4:** Commit: `ci: scheduled scrape and Pages deploy`.

---

### Task 6: App storage and data client

**Files:**
- Create: `app/src/lib/db.ts`, `app/src/lib/data.ts`, and the `Slot` type in `app/src/lib/build.ts` (`export const SLOTS = ['cpu','cooler','motherboard','ram','gpu','storage','psu','case'] as const; export type Slot = typeof SLOTS[number];` — Task 8 adds `buildTotal` to the same file)
- Test: `app/src/lib/{db,data}.test.ts`

**Interfaces:**
- Produces:
```ts
// db.ts
export interface WatchItem { partId: string; model: string; addedAt: string; priceWhenAdded: number | null;
  targetPrice: number | null }
export interface Build { buildId: string; name: string; slots: Partial<Record<Slot, string>>; updatedAt: string }
export interface Settings { backupFrequency: 'off'|'daily'|'weekly'; backupTime: string;
  lastBackupAt: string | null; lastBackupStatus: 'ok'|'failed'|null }
export const DEFAULT_SETTINGS: Settings; // { backupFrequency: 'off', backupTime: '09:00', lastBackupAt: null, lastBackupStatus: null }
export const watchlist: { all(): Promise<WatchItem[]>; put(w: WatchItem): Promise<void>; remove(partId: string): Promise<void> };
export const builds:    { all(): Promise<Build[]>; put(b: Build): Promise<void>; remove(buildId: string): Promise<void> };
export const settings:  { get(): Promise<Settings>; set(p: Partial<Settings>): Promise<Settings> };
export function replaceAll(w: WatchItem[], b: Build[]): Promise<void>; // one transaction
export function onChange(cb: () => void): () => void;                  // fires after any watchlist/builds write; returns unsubscribe
// data.ts
export const DATA_URL: string; // import.meta.env.VITE_DATA_URL ?? './data/'
export class OfflineError extends Error {}
export interface Fetched<T> { data: T; fetchedAt: string; stale: boolean }
export function fetchJson<T>(path: string): Promise<Fetched<T>>;
```

- [ ] **Step 1: Write failing tests** (`import 'fake-indexeddb/auto'`; mock `fetch`):
```ts
// watchlist put/all/remove round-trip; settings.get() on empty db === DEFAULT_SETTINGS; settings.set merges
// replaceAll leaves no previous rows
// onChange fires after put, remove and replaceAll; unsubscribe stops it
// fetchJson ok → stale false; body cached under DATA_URL + path
// fetchJson network error with cache → stale true, fetchedAt = cached time
// fetchJson network error, no cache → rejects OfflineError      (Review Focus 4)
// fetchJson HTTP 500 is treated like a network error
```
- [ ] **Step 2:** Run `cd app && npx vitest run src/lib` — expect FAIL.
- [ ] **Step 3:** Implement with `idb`: `openDB('pc-part-tracker', 1)`, stores `watchlist` (keyPath `partId`), `builds` (keyPath `buildId`), `settings`, `cache` (key = URL, value `{ body, fetchedAt }`).
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(app): IndexedDB stores and cached data client`.

---

### Task 7: CSV export and import

**Files:**
- Create: `app/src/lib/csv.ts`
- Test: `app/src/lib/csv.test.ts`

**Interfaces:**
- Consumes: `WatchItem`, `Build`, `Slot`, `SLOTS` (Task 6), `IndexEntry`, `HistoryPoint`
- Produces:
```ts
export function toCsv(rows: (string | number | null)[][]): string;   // CRLF; null → empty field
export function parseCsv(text: string): string[][];
export interface BackupFiles { 'watchlist.csv': string; 'builds.csv': string; 'price_history.csv': string }
export function exportBackup(w: WatchItem[], b: Build[], index: Map<string, IndexEntry>,
  history: Record<string, HistoryPoint[]>): BackupFiles;
export type ParsedBackup = { ok: true; watchlist: WatchItem[]; builds: Build[] } | { ok: false; errors: string[] };
export function parseBackup(watchlistCsv: string, buildsCsv: string): ParsedBackup;
```

- [ ] **Step 1: Write failing tests**
```ts
// toCsv quotes fields containing , " CR or LF and doubles inner quotes
// parseCsv(toCsv(rows)) deep-equals rows when a model is 'Corsair 32GB (2x16GB) "Vengeance", DDR5\nRGB'  (Review Focus 2)
// parseCsv accepts LF-only line endings, a trailing newline, and strips a leading UTF-8 BOM
// exportBackup headers exactly: 'partId,model,addedAt,priceWhenAdded,targetPrice' / 'buildName,slot,partId,model,price' / 'partId,date,retailer,price'
// builds.csv: one row per filled slot, price = index lowestPrice or empty; model from index or '' if untracked
// price_history.csv contains only watched part ids
// parseBackup(exportBackup(...)) restores an equal watchlist and builds (same names and slots)
// wrong watchlist header → ok:false, errors[0] contains 'watchlist.csv header'
// row 3 priceWhenAdded 'abc' → ok:false, an error contains 'watchlist.csv row 3', and no data is returned
// unknown slot 'fan' → ok:false; duplicate partId in watchlist.csv → ok:false
```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. `parseBackup` groups `builds.csv` rows by `buildName` into `Build`s with `buildId = crypto.randomUUID()` and `updatedAt = new Date().toISOString()`. Row numbers in errors are 1-based including the header.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(app): CSV backup export and validated import`.

---

### Task 8: Domain logic — search, watch status, build totals, backup schedule

**Files:**
- Create: `app/src/lib/search.ts`, `app/src/lib/watch.ts`, `app/src/lib/schedule.ts`
- Modify: `app/src/lib/build.ts` (add `buildTotal`)
- Test: `app/src/lib/{search,watch,build,schedule}.test.ts`

**Interfaces:**
- Produces:
```ts
// build.ts
export function buildTotal(b: Build, index: Map<string, IndexEntry>): { total: number; missing: Slot[] };
// search.ts
export type SortKey = 'relevance'|'price-asc'|'price-desc'|'rating';
export function searchParts(index: IndexEntry[], q: string, category: Category | null, sort: SortKey): IndexEntry[];
// watch.ts
export interface WatchStatus { current: number | null; change: number | null; changePct: number | null;
  belowTarget: boolean; untracked: boolean }
export function watchStatus(w: WatchItem, entry: IndexEntry | undefined): WatchStatus;
// Items worth notifying about: price below the last notified price (or no record yet) AND (belowTarget OR below priceWhenAdded).
export function alertsFor(items: WatchItem[], index: Map<string, IndexEntry>,
  lastNotified: Record<string, number>): WatchItem[];
// schedule.ts
export function nextBackupAt(s: Settings, now: Date): Date | null;
export function isBackupDue(s: Settings, now: Date): boolean; // nextBackupAt !== null && nextBackupAt <= now
```

- [ ] **Step 1: Write failing tests**
```ts
// searchParts: 'rtx 4070' finds 'NVIDIA GeForce RTX 4070 Super'; typo 'ryzn 9800' finds 'AMD Ryzen 7 9800X3D'
// searchParts: empty query → all parts in the category; price sorts put null prices last
// buildTotal: sums lowestPrice; a part missing from index or with null price is excluded and its slot listed in missing  (Review Focus 3)
// watchStatus: entry undefined → untracked true, current/change/changePct null                                        (Review Focus 3)
// watchStatus: priceWhenAdded 500, current 450 → change -50, changePct -10
// watchStatus: targetPrice 460, current 460 → belowTarget true
// alertsFor: target 460, current 450, lastNotified {} → alerted; same with lastNotified {id: 450} → NOT alerted (no repeat every run)
// alertsFor: lastNotified {id: 450}, current 440 → alerted again; untracked items never alerted
// nextBackupAt: frequency off → null
// nextBackupAt: daily 09:00, lastBackupAt null → today 09:00 (so due at 10:00, not due at 08:00)
// nextBackupAt: daily 09:00, last = today 09:01 → tomorrow 09:00
// nextBackupAt: weekly 09:00, last = 2026-10-10T09:00 local → 2026-10-17 09:00
// isBackupDue: daily, last 5 days ago → true; after settings.lastBackupAt = now → false                              (Review Focus 5)
```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. Search: Fuse.js over `brand`, `model` and a derived `${brand} ${model}` key, `threshold: 0.4`; `relevance` keeps Fuse order. Schedule: `lastBackupAt` null → today at `backupTime`; `daily` → first `backupTime` strictly after `lastBackupAt`; `weekly` → `backupTime` on the calendar date of `lastBackupAt` + 7 days. Local time via `Date` setters.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(app): search, watch status, build totals, backup schedule`.

---

### Task 9: App shell, Search tab and part detail

**Files:**
- Create: `app/src/App.tsx`, `app/src/lib/useIndex.ts`, `app/src/features/search/{SearchPage,PartPage,PriceChart}.tsx`, `app/src/styles.css`, `app/public/icons/{192,512}.png`
- Modify: `app/src/main.tsx`, `app/vite.config.ts` (add vite-plugin-pwa)
- Test: `app/src/features/search/SearchPage.test.tsx`

**Interfaces:**
- Consumes: `fetchJson`, `OfflineError`, `searchParts`, `watchlist`, `builds`
- Produces:
  - Routes (HashRouter): `#/search`, `#/part/:id`, `#/build`, `#/build/:buildId`, `#/watchlist`, `#/settings`; `/` → `#/search`.
  - Picker mode: `#/search?pickFor=<buildId>&slot=<slot>` filters to that category; choosing a result sets the slot and navigates to `#/build/<buildId>`.
  - `useIndex(): { index: IndexEntry[]; byId: Map<string, IndexEntry>; fetchedAt: string | null; stale: boolean; error: 'offline' | null; refresh(): Promise<void> }` from an `IndexProvider` in `App.tsx`.
  - `<PriceChart history={HistoryPoint[]} />` — one line per retailer; range buttons `30d | 90d | 1y | All`.
  - `formatPrice(n: number | null): string` in `app/src/lib/format.ts` → `'$1,299.99'` or `'—'`.

- [ ] **Step 1: Write failing test** (wrap in a mock `IndexProvider`): typing "4070" shows the matching row with `$589.99` and its retailer; tapping chip "GPU" filters to GPUs; `error: 'offline'` with empty index shows "You're offline" and a Retry button that calls `refresh` (Review Focus 4); `stale: true` shows "Offline — showing data from".
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. Tab bar: `<nav aria-label="Main">` with four `NavLink`s (icon + text label), fixed bottom under 768px wide and top otherwise, targets ≥ 44px. PartPage loads `parts/<id>.json` and `history/<id>.json`; shows image, offers table (retailer, price, stock, "View" link `target="_blank" rel="noopener noreferrer"`), chart, rating stars + count, specs table, Watch/Unwatch (creates `WatchItem` with `priceWhenAdded = lowestPrice`), "Add to build" (sheet listing builds + "New build"). PWA manifest: name "PC Part Tracker", `display: 'standalone'`, icons 192/512. The service worker precaches the app shell only — no `runtimeCaching` for `/data/`, because `fetchJson` owns data caching and a second cache would make "Refresh now" and the offline banner report stale data as fresh.
- [ ] **Step 4:** Run tests — PASS; in `npm run dev` click search → detail → back.
- [ ] **Step 5:** Commit: `feat(app): shell, search and part detail`.

---

### Task 10: PC Builder tab and 3D scene

**Files:**
- Create: `app/src/features/builder/{BuilderPage,BuildScene}.tsx`, `app/src/features/builder/layout.ts`
- Test: `app/src/features/builder/{layout.test.ts,BuilderPage.test.tsx}`

**Interfaces:**
- Consumes: `builds`, `SLOTS`, `buildTotal`, `useIndex`, `formatPrice`, picker route (Task 9)
- Produces:
  - `interface Box { slot: Slot; position: [number, number, number]; size: [number, number, number]; filled: boolean }`
  - `layoutFor(filled: Partial<Record<Slot, boolean>>, specs: Partial<Record<Slot, Record<string, string>>>): Box[]`
  - Units are centimetres (w × h × d). Case 21×46×45. Defaults: motherboard 30.5×24.4×0.2; CPU 4×4×0.5; cooler 12×15×12; RAM stick 13.3×3.1×0.4, count from `modules` (default 2); GPU 28×4×12, width from `lengthMm / 10` when numeric; PSU 15×8.6×14; storage 8×0.3×2.2. Positions are constants in `layout.ts`.

- [ ] **Step 1: Write failing tests**
```ts
// layoutFor returns at least one Box per slot; filled false for unfilled slots
// GPU size[0] === 33.6 when specs.gpu.lengthMm === '336'; 28 when missing or 'n/a'
// modules '4' → four 'ram' boxes; missing → two
// BuilderPage: "New build" creates "Build 1" (then "Build 2"); total shows formatPrice(sum)
// BuilderPage: slot part missing from index shows "No longer tracked" and is excluded from total   (Review Focus 3)
// BuilderPage: delete asks for confirmation before builds.remove
```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. BuilderPage: builds list (rename inline, delete with confirm) and editor with one row per slot (part + price, or "Choose…" → picker route; "Remove" per slot) and total. `BuildScene` loaded with `React.lazy` so three.js stays out of the initial bundle: `<Canvas>` + `OrbitControls` (touch orbit, pinch zoom), case `meshStandardMaterial` transparent `opacity: 0.15`, filled parts solid with one colour per slot, unfilled as drei `<Edges>` at `opacity: 0.3`. Canvas gets `aria-label="3D preview of build"`; the slot list remains the accessible source of truth.
- [ ] **Step 4:** Run — PASS; check rotate/zoom by hand in `npm run dev` with mobile emulation.
- [ ] **Step 5:** Commit: `feat(app): PC builder with procedural 3D preview`.

---

### Task 11: Watchlist tab

**Files:**
- Create: `app/src/features/watchlist/WatchlistPage.tsx`
- Test: `app/src/features/watchlist/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: `watchlist`, `watchStatus`, `useIndex`, `formatPrice`

- [ ] **Step 1: Write failing test:** rows show current price, price when added, and change `−$50.00 (−10.0%)` (negative change styled as a drop); at/below target shows badge "Target hit"; untracked shows "No longer tracked"; editing target saves via `watchlist.put`; negative target shows an inline error and doesn't save; Remove asks to confirm; empty state links to `#/search`.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. Target input `inputmode="decimal"`; blank means no target.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(app): watchlist tab`.

---

### Task 12: Settings tab, export/import and web backup reminder

**Files:**
- Create: `app/src/features/settings/{SettingsPage,BackupBanner}.tsx`, `app/src/platform/index.ts`
- Modify: `app/src/App.tsx` (render `BackupBanner` above the routes)
- Test: `app/src/features/settings/{SettingsPage,BackupBanner}.test.tsx`

**Interfaces:**
- Consumes: `settings`, `exportBackup`, `parseBackup`, `replaceAll`, `onChange`, `isBackupDue`, `fetchJson`, `useIndex`
- Produces (`platform/index.ts`):
```ts
export const isNative: () => boolean;  // Capacitor.isNativePlatform()
export function collectBackup(index: Map<string, IndexEntry>): Promise<BackupFiles>; // db + watched histories
export function saveBackup(files: BackupFiles, date: string): Promise<'saved' | 'shared' | 'downloaded'>;
export function syncNative(s: Settings, files: BackupFiles | null): Promise<void>;   // web: no-op; Task 13 fills native
```

- [ ] **Step 1: Write failing tests**
```ts
// Settings: frequency/time changes persist via settings.set; isNative true → label contains "approximately"
// Export now → saveBackup called; then lastBackupAt set and lastBackupStatus 'ok'
// saveBackup rejects → error toast; status 'failed' rendered as "Last backup failed"
// Import with a bad row → errors listed; replaceAll NOT called
// Import valid → confirm "Replace your watchlist and builds?" → replaceAll called with parsed data
// Settings shows last data refresh time and "Refresh now" calls useIndex().refresh
// BackupBanner: web + due → "Backup due — Export now"; after export it disappears; isNative true → never shown
// BackupBanner: daily backup last done 5 days ago → exactly one banner     (Review Focus 5)
```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. Web `saveBackup`: build three `File`s (`text/csv`); if `navigator.canShare?.({ files })` → `navigator.share({ files, title: 'PC Part Tracker backup <date>' })` → `'shared'`; else three `<a download>` clicks → `'downloaded'`. User cancelling the share sheet (`AbortError`) is not a failure and doesn't update `lastBackupAt`. Import: `<input type="file" multiple accept=".csv,text/csv">`, matching files by name; missing `watchlist.csv` or `builds.csv` is an error. Call `syncNative` on settings change and on `onChange`.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat(app): settings, CSV export/import and backup reminder`.

---

### Task 13: Android shell — scheduled backup and price notifications

**Files:**
- Create: `app/capacitor.config.ts`, `app/android/` (`npx cap add android`), `app/android/app/src/main/java/io/github/<owner>/pcparttracker/{ScheduledBackupPlugin,BackupWorker,BackupSchedule}.kt`, `app/android/app/src/test/java/io/github/<owner>/pcparttracker/BackupScheduleTest.kt`, `app/src/runner/runner.ts`
- Modify: `app/src/platform/index.ts` (native branches), `app/package.json` (script `build:runner`: esbuild `src/runner/runner.ts --bundle --format=iife --outfile=public/runners/runner.js`), `app/android/app/build.gradle` (`minSdkVersion 29`, WorkManager dependency), `MainActivity` (register plugin)
- Test: `app/src/runner/runner.test.ts`, `BackupScheduleTest.kt`

**Interfaces:**
- Consumes: `BackupFiles`, `Settings`, `WatchItem`, `alertsFor`
- Produces:
  - Capacitor `appId: 'io.github.<owner>.pcparttracker'`, `appName: 'PC Part Tracker'`, `webDir: 'dist'`; BackgroundRunner plugin config `{ label: 'io.github.<owner>.pcparttracker.prices', src: 'runners/runner.js', event: 'refreshPrices', repeat: true, interval: 360, autoStart: true }`.
  - APK build sets `VITE_DATA_URL=https://<owner>.github.io/pc-part-tracker/data/`.
  - Native plugin `ScheduledBackup`:
    - `schedule(opts: { frequency: 'off'|'daily'|'weekly'; time: string; files: BackupFiles | null }): Promise<void>`
    - `exportNow(opts: { files: BackupFiles }): Promise<{ folder: string }>`
    - `lastResult(): Promise<{ at: string | null; status: 'ok'|'failed'|null; error?: string }>`
  - Kotlin `object BackupSchedule { fun initialDelayMinutes(now: LocalDateTime, time: String): Long; fun folderName(date: LocalDate): String }`
  - Runner events: `syncWatchlist` (details `{ watchlist: WatchItem[], dataUrl: string }` → stored in `CapacitorKV`), `refreshPrices` (scheduled). The runner keeps its own `lastNotified: Record<partId, price>` in `CapacitorKV`; the app never reads it back.

- [ ] **Step 1: Write failing JS test** `runner.test.ts` (stub `CapacitorKV`, `CapacitorNotifications`, `fetch` on `globalThis`, then import the runner and invoke its `refreshPrices` handler): a watched item below target → exactly one notification whose body contains the model and new price; running `refreshPrices` again with the same prices → no new notification; fetch fails → no notification, KV unchanged; empty KV → no fetch.
- [ ] **Step 2:** Run — FAIL. Implement `runner.ts` importing `alertsFor` (bundled by esbuild; the runner has no IndexedDB, hence KV); after notifying, write each alerted item's current price into `lastNotified`. Run — PASS.
- [ ] **Step 3: Write failing Kotlin test** `BackupScheduleTest`: `initialDelayMinutes(LocalDateTime.of(2026,10,16,8,30), "09:00") == 30`; at 09:30 → `1410`; `folderName(LocalDate.of(2026,10,16)) == "Documents/PCPartTracker/backup-2026-10-16"`. Run `./gradlew test` — FAIL.
- [ ] **Step 4:** Implement. `schedule` stores `files` in `SharedPreferences` and enqueues a unique `PeriodicWorkRequest` `pc-backup` (24 h or 7 d, `setInitialDelay(initialDelayMinutes)`, `ExistingPeriodicWorkPolicy.UPDATE`); `off` cancels it. `BackupWorker` writes the three files through `MediaStore.Files` (`RELATIVE_PATH = folderName(today)`, MIME `text/csv`), records `{at, status, error}` in `SharedPreferences`, and returns `Result.failure()` on any exception (never swallowed). `exportNow` runs the same write immediately. Run `./gradlew test` — PASS.
- [ ] **Step 5:** Native branches in `platform/index.ts`: `saveBackup` → `exportNow` → `'saved'`; `syncNative` → `ScheduledBackup.schedule` + `BackgroundRunner.dispatchEvent({ label, event: 'syncWatchlist', details })`. Settings reads `lastResult()` so a failed scheduled run shows "Last backup failed". On first Watch, request notification permission (`BackgroundRunner.requestPermissions({ apis: ['notifications'] })`).
- [ ] **Step 6: Manual device check** (record results in README): `npm run build:runner && npm run build && npx cap sync android`, install the debug APK. (a) Export now → files appear in Files › Documents › PCPartTracker › backup-<today>. (b) Set daily backup 3 minutes ahead; in Android Studio's Background Task Inspector confirm `pc-backup` is enqueued, wait or run it, confirm a new folder. (c) Watch a part with a target above its price; run the runner's worker from the inspector; confirm a notification.
- [ ] **Step 7:** Commit: `feat(android): scheduled CSV backup and price-drop notifications`.

---

### Task 14: APK release workflow, end-to-end smoke tests, README

**Files:**
- Create: `.github/workflows/apk.yml`, `app/e2e/smoke.spec.ts`, `app/playwright.config.ts`, `app/e2e/fixtures/data/**` (a 6-part index with parts and history)
- Modify: `.github/workflows/pages.yml` (run Playwright before deploy), `README.md`

**Interfaces:**
- Consumes: everything above

- [ ] **Step 1: Write Playwright smoke** against `vite preview` with `VITE_DATA_URL` pointing at the fixture data, using the `iPhone 13` device descriptor: Search → type "4070" → open part → chart visible → Watch; Build → New build → Choose… for CPU via picker → total updates → `canvas` present; Watchlist lists the watched part; Settings → Export now downloads `watchlist.csv`.
- [ ] **Step 2:** Run `npx playwright test` — PASS (fix bugs it exposes in their owning files).
- [ ] **Step 3:** `apk.yml`: triggers `push` tags `v*` and `workflow_dispatch`; Node 22 + Temurin JDK 21; in `app/`: `npm ci && npm run build:runner && npm run build` with `VITE_DATA_URL` set, `npx cap sync android`; decode `ANDROID_KEYSTORE_BASE64` to a temp keystore in its own step; `./gradlew assembleRelease` with the signing secrets in `env:` on that step only (never on `npm ci`); upload `app-release.apk` to the GitHub Release via `softprops/action-gh-release`.
- [ ] **Step 4:** README: what the app does; Android install (download APK from Releases, allow install from unknown sources); iPhone install (open Pages URL in Safari → Share → Add to Home Screen); how to add parts to `catalog.json`; the secrets list; the retailer ToS / blocking note from spec §10; results of Task 13's manual check.
- [ ] **Step 5:** Verify `actionlint` clean; commit: `ci: APK release workflow, e2e smoke tests and README`.
