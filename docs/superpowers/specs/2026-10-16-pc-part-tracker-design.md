# PC Part Tracker — Design Spec

Date: 2026-10-16
Status: Draft, awaiting review

## 1. Purpose

A personal app for researching and tracking computer parts (CPUs, GPUs, RAM,
motherboards, storage, PSUs, cases, coolers, prebuilt computers). Search for a
model, see listings from credible retailers in one place with price history,
ratings and specs, plan a build with a 3D preview, bookmark parts to watch
their price, and back up all personal data as CSV.

**Users:** the owner, on an Android phone (APK) and an iPhone (website).
**Success:** searching a model shows current offers from whitelisted retailers,
a price chart that grows over time, ratings and specs; builds and the watchlist
survive app restarts and can be exported to CSV on a schedule (Android) or on
demand (iPhone).

### Stated by the user
- Sources: Amazon, Newegg, and "Jawa" (read as eBay — confirm).
- Search results only from credible sources.
- Price history, ratings, model and specs, cleanly laid out, simple navigation.
- Tabs: Search, PC Builder with 3D render, Watchlist (bookmarks with price
  tracking), Settings (timed local CSV backups).
- Ship as an Android APK and a website for iPhone, published on GitHub.

### Assumptions (correct me)
- Single user, no accounts, no server; personal data stays on the device.
- Prices refresh a few times per day, not in real time.
- English, USD, US retailers.
- No compatibility checking in the builder (socket, wattage, clearance) in v1.

## 2. Architecture

One TypeScript codebase, two shells:

```
                   GitHub repository
 ┌─────────────────────────────────────────────────────────┐
 │ scraper/  ──(GitHub Actions cron, 4×/day)──► data/*.json │
 │ app/      ──(Actions: build)──► GitHub Pages (website)   │
 │                              └► Release asset (APK)      │
 └─────────────────────────────────────────────────────────┘
          data/*.json served by GitHub Pages
                         │  fetch over HTTPS
            ┌────────────┴────────────┐
       iPhone Safari PWA        Android APK (Capacitor)
       IndexedDB storage        IndexedDB storage
       on-demand CSV export     scheduled CSV export + notifications
```

- **Frontend:** React + Vite + TypeScript, installable PWA (manifest + service
  worker caching the app shell and last fetched data for offline use).
- **Android:** Capacitor wraps the same web build into an APK.
- **3D:** Three.js via `@react-three/fiber` and `@react-three/drei`.
- **Charts:** Recharts for price history.
- **Storage:** IndexedDB on both platforms (via `idb`). One storage module, no
  separate SQLite path — Capacitor's WebView IndexedDB persists across restarts.
- **Data pipeline:** Node scripts in `scraper/`, run by a scheduled GitHub
  Action, committing JSON to `data/`.

## 3. Data pipeline (`scraper/`)

### 3.1 Sources
Each retailer is an adapter implementing:

```ts
interface RetailerAdapter {
  id: 'newegg' | 'amazon' | 'ebay';
  fetchOffer(ref: RetailerRef): Promise<RawListing | null>;
}
```

Order of preference per retailer:
1. Official / affiliate API when the owner has keys (Amazon Product
   Advertising API, eBay Browse API). Keys are stored as GitHub Actions
   secrets, never in the repo or app.
2. Public structured data on product pages (JSON-LD `Product` / `Offer` /
   `AggregateRating`) fetched politely: identified User-Agent, ≥2 s between
   requests, respects `robots.txt`.

An adapter that fails (blocked, layout change, HTTP error) logs a warning and
returns nothing for that part; the run still commits data from the other
adapters. A run where every adapter fails exits non-zero so the Action shows
red.

### 3.2 What gets tracked
The catalog is `scraper/catalog.json`: a list of tracked parts (category,
brand, canonical model, specs, and per-retailer references — product ID or
URL). v1 seeds it with ~100 popular parts across categories. Search in the
app covers this catalog. Adding parts means editing `catalog.json` and
pushing; tracking arbitrary parts from inside the app is out of scope for v1
(§9).

### 3.3 Normalization
Each `RawListing` becomes an `Offer` attached to the catalog part whose
retailer reference fetched it — never by fuzzy title matching, so
wrong-product listings can't appear. Credibility rule: only whitelisted
retailers; for eBay, only "new" condition listings from sellers with ≥98%
positive feedback.

### 3.4 Output files (`data/`)
- `data/index.json` — every part: `id, category, brand, model, image,
  lowestPrice, lowestRetailer, rating, ratingCount, updatedAt`. This is the
  search index (kept small; loaded once).
- `data/parts/<id>.json` — full detail: specs and current `offers[]`
  (`retailer, price, url, inStock, rating, ratingCount, fetchedAt`).
- `data/history/<id>.json` — append-only `[{date, retailer, price}]`, one
  point per retailer per run; points older than 2 years are dropped.

## 4. App

### 4.1 Navigation
Bottom tab bar (top on wide screens), four tabs: **Search · Build · Watchlist
· Settings**. Part detail is a pushed screen reachable from any tab.

### 4.2 Search
- Text box with instant client-side fuzzy search of `index.json` (Fuse.js
  over brand + model), category filter chips, sort by price or rating.
- Result row: image, model, category, lowest current price and which
  retailer, star rating.
- **Part detail:** title + image, offers table (retailer, price, stock, link
  out), price-history line chart (one line per retailer; 30d / 90d / 1y /
  all), rating summary, specs table. Buttons: "Watch" and "Add to build".

### 4.3 PC Builder
- One slot per category: CPU, cooler, motherboard, RAM, GPU, storage, PSU,
  case. Tap a slot to pick from Search filtered to that category.
- Running total using each part's lowest current price.
- Multiple named builds saved locally.
- **3D view:** procedural scene — a translucent case box with motherboard,
  CPU + cooler, RAM sticks, GPU, PSU and drives as simple shapes at fixed
  positions. Empty slots render as dim outlines. Orbit and zoom by touch.
  Shape sizes are category defaults, except GPU length, which uses the spec
  value when present. Purely visual.

### 4.4 Watchlist
- List of watched parts: current lowest price, price when added, change
  (amount and %), optional target price.
- A watched part at/below its target shows "Target hit"; a price below the
  price when added is shown as a drop via the change column. On Android, the
  background task (§4.5) also notifies once per new low (not on every run)
  for parts at/below target or below their price when added.

### 4.5 Settings
- **Backup schedule:** off / daily / weekly, plus time of day.
  - **Android:** a Capacitor background task (`@capacitor/background-runner`)
    runs at the scheduled time, writes CSVs to
    `Documents/PCPartTracker/backup-YYYY-MM-DD/` via `@capacitor/filesystem`,
    and refreshes watchlist prices. Android may delay runs for battery
    optimization; the UI labels the time as approximate.
  - **iPhone (web):** browsers can't run scheduled jobs, so when the app is
    opened after a backup is due it shows a banner "Backup due — Export now",
    which shares/downloads the CSVs (Share sheet → Save to Files).
- **Export now** button (both platforms).
- **Import backup** from the CSVs (restores watchlist and builds), so a backup
  is actually restorable.
- Data: last refresh time and "Refresh now".

### 4.6 CSV format
Three files, RFC 4180 quoting:
- `watchlist.csv` — partId, model, addedAt, priceWhenAdded, targetPrice
- `builds.csv` — buildName, slot, partId, model, price
- `price_history.csv` — partId, date, retailer, price (watched parts only;
  export-only, not imported back since the server data is the source)

## 5. Local data model (IndexedDB)

| Store | Key | Fields |
|---|---|---|
| `watchlist` | partId | model, addedAt, priceWhenAdded, targetPrice? |
| `builds` | buildId | name, slots: {category → partId}, updatedAt |
| `settings` | key | backupFrequency, backupTime, lastBackupAt, lastBackupStatus |
| `cache` | url | JSON body, fetchedAt (offline fallback) |

## 6. Error handling

- Data fetch fails → show cached data with "Offline — showing data from
  <time>"; no cache → empty state with retry.
- A watched or built part missing from the latest index → keep the entry,
  show "No longer tracked".
- Backup write fails (permission denied, storage full) → error toast, and
  Settings shows "Last backup failed"; never silently skipped.
- Import validates headers and types per row and rejects the whole file with
  a message listing bad rows, rather than importing partially. Import
  replaces existing watchlist/builds only after the user confirms.

## 7. Build & release

- `npm run build` → `app/dist`, deployed to GitHub Pages by an Action on push
  to `main`; `data/` is published alongside.
- APK: an Action runs `npx cap sync android` and `./gradlew assembleRelease`,
  signs with a keystore from Actions secrets, and attaches the APK to a
  GitHub Release. Install by sideloading (Play Store out of scope).
- iPhone: open the Pages URL in Safari → Share → Add to Home Screen.

## 8. Testing

- **Scraper:** unit tests per adapter against saved HTML/JSON fixtures;
  normalizer tests for reference matching and the eBay credibility filter.
- **App logic (Vitest):** CSV export → import round-trip, price-drop and
  target detection, build totals, search filtering.
- **UI:** one Playwright smoke test per tab on the web build.
- **Manual:** install the APK on a real Android device and confirm the
  scheduled backup writes files and a notification fires.

## 9. Out of scope for v1

- Compatibility checks in the builder.
- Tracking parts not in the catalog from inside the app (needs on-demand
  scraping, i.e. a backend).
- Accounts, cloud sync, sharing builds.
- Real per-product 3D models.
- Native iOS app / App Store; Google Play listing.
- Non-US retailers and currencies.

## 10. Risks

- **Retailer blocking / terms of service:** Amazon and Newegg restrict
  scraping and block bots; adapters may break at any time. Mitigation: prefer
  official APIs, fail per adapter, keep the catalog modest and the request
  rate low. The owner is responsible for complying with each retailer's terms.
- **GitHub Actions:** scheduled workflows pause after 60 days without repo
  activity; the scraper's own data commits keep it active.
- **Repo growth:** history JSON grows over time; 2-year pruning bounds it.
- **iPhone backups are not automatic** — inherent to web apps on iOS.
