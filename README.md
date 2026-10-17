# PC Part Tracker

A personal app for researching and tracking PC parts (CPUs, GPUs, RAM, motherboards,
storage, PSUs, cases, coolers and prebuilt PCs).

- **Search** a model and see offers from Best Buy, Amazon and eBay in one place, with
  ratings, specs and a price-history chart that grows over time.
- **Build** a PC part by part, with a running total and a 3D preview.
- **Watchlist** parts and set a target price (Android notifies you when a price drops).
- **Settings**: back up your watchlist, builds and price history as CSV files, and
  import them again. Android can back up on a schedule; iPhone backs up on demand.

There is no server and no account. A GitHub Actions job (`scraper/`) fetches prices a few
times a day and commits them as JSON under `data/`; the app (`app/`) reads that JSON from
GitHub Pages. Your watchlist and builds stay on your device.

- Website: https://uzumakigojo78-prog.github.io/pc-part-tracker/
- Android APKs: https://github.com/uzumakigojo78-prog/pc-part-tracker/releases

## Install

### Android

1. Open the [Releases page](https://github.com/uzumakigojo78-prog/pc-part-tracker/releases)
   on your phone and download the latest `pc-part-tracker-<version>.apk`.
2. Open the downloaded file. Android asks you to allow installs from this source
   (your browser or Files app): allow it, then tap **Install**.
3. To update, install a newer APK over the old one.

If a release only has a `...-debug.apk` file, it was built without release signing (see
[Release signing](#release-signing-android)). Each debug build is signed with a different
throwaway key, so Android will refuse to install it over another build: uninstall the app
first (export a backup before you do, then import it after).

### iPhone

1. Open https://uzumakigojo78-prog.github.io/pc-part-tracker/ in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch it from the home screen icon. It works offline with the last data it loaded.

iPhone backups are not automatic (a web app can't run on a schedule on iOS). Use
**Settings → Export now** regularly. When Safari can't use the share sheet it downloads
the three CSV files one after another, and may ask "Allow multiple downloads?" the
first time: tap **Allow**, or you will only get `watchlist.csv`.

## One-time GitHub setup

1. **Enable Pages:** repository **Settings → Pages → Source: GitHub Actions**. The
   `Deploy Pages` workflow then publishes the app on every push to `main` and after
   every scrape. Do this before the first push to `main`, or re-run the failed
   `Deploy Pages` run afterwards.
2. **Add secrets:** **Settings → Secrets and variables → Actions → New repository
   secret**. Every secret is optional; a missing retailer key just means that
   retailer is skipped.

   | Secret | Used for |
   | --- | --- |
   | `BESTBUY_API_KEY` | Best Buy Products API (scraper and `find-refs`) |
   | `AMAZON_PAAPI_ACCESS_KEY` | Amazon Product Advertising API |
   | `AMAZON_PAAPI_SECRET_KEY` | Amazon Product Advertising API |
   | `AMAZON_PARTNER_TAG` | Amazon Associates partner tag |
   | `EBAY_CLIENT_ID` | eBay Browse API |
   | `EBAY_CLIENT_SECRET` | eBay Browse API |
   | `ANDROID_KEYSTORE_BASE64` | Release keystore, base64-encoded |
   | `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
   | `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
   | `ANDROID_KEY_PASSWORD` | Key password |

### Release signing (Android)

Without the four `ANDROID_*` secrets the APK workflow still runs, but it attaches a
debug APK and prints a warning. To get properly signed, updatable releases, create a
keystore once (needs a JDK for `keytool`) and keep it and its passwords somewhere safe;
losing it means users must uninstall to get later versions:

```sh
keytool -genkeypair -v -keystore release.keystore -alias pcparttracker \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore > release.keystore.b64   # macOS: base64 -i release.keystore
```

Add the contents of `release.keystore.b64` as `ANDROID_KEYSTORE_BASE64`, the passwords you
chose as `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`, and `pcparttracker` as
`ANDROID_KEY_ALIAS`. Never commit the keystore (`*.keystore` is gitignored). Switching
from debug to release builds also needs one uninstall, since the signing key changes.

### Publishing an APK

Push a tag starting with `v`:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

The `Android APK` workflow builds the web app, runs the Kotlin unit tests, builds the APK
and attaches it to a GitHub Release for that tag. Running the workflow by hand
(**Actions → Android APK → Run workflow**) builds an APK as a downloadable workflow
artifact without creating a release.

## Prices: API keys and retailer refs

Out of the box every part shows "no offers yet". Prices appear once both of these exist:

1. **API keys** for at least one retailer (secrets above).
2. **Refs** in `scraper/catalog.json`, which tie each part to a retailer's product. All
   93 catalog parts currently have `"refs": []`.

To find Best Buy SKUs, run locally with your key:

```sh
cd scraper && npm ci
BESTBUY_API_KEY=... npm run find-refs
```

This writes `scraper/catalog.candidates.json` (gitignored) with up to three candidate
products per part. It never edits the catalog: check each candidate is the exact model
(not a bundle, a different memory size or a refurbished unit) before copying it into
`refs`. Amazon refs use the ASIN as `productId`, eBay refs the Browse API item id; add those by hand.

### Adding a part

Add an entry to `scraper/catalog.json`:

```json
{
  "id": "nvidia-geforce-rtx-4070",
  "category": "gpu",
  "brand": "NVIDIA",
  "model": "GeForce RTX 4070",
  "specs": { "memory": "12 GB", "length": "244 mm" },
  "refs": [
    { "retailer": "bestbuy", "productId": "<Best Buy SKU>", "url": "<product page URL>" }
  ]
}
```

- `id`: lowercase letters, digits and hyphens, unique.
- `category`: one of `cpu`, `cooler`, `motherboard`, `ram`, `gpu`, `storage`, `psu`,
  `case`, `prebuilt`.
- `retailer`: `bestbuy`, `amazon` or `ebay`. `image` (a URL) is optional.

The next scrape (every 6 hours, or **Actions → Scrape → Run workflow**) picks it up.

## Retailer terms and blocking

The scraper only uses each retailer's official API, at a few requests per run. You are
responsible for each API's terms (attribution, caching limits). Amazon revokes
Product Advertising API access for Associates accounts without recent qualifying
sales; if that happens Amazon prices simply stop updating. GitHub pauses scheduled
workflows after 60 days without repository activity; the scraper's own data commits
normally keep it active.

## Android device check (to do)

These checks need a real Android phone and have **not been run yet**. Build and install
a debug APK (needs a JDK 21 and the Android SDK), or install one from a workflow run:

```sh
cd app && npm ci && npm run build:android
cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Export now:** Settings → Export now; the files appear in Files → Documents →
      PCPartTracker → `backup-<today>`.
- [ ] **Scheduled backup:** set a daily backup 3 minutes ahead. In Android Studio's
      Background Task Inspector confirm `pc-backup` is enqueued; wait for it (or run it)
      and confirm a new backup folder.
- [ ] **Price-drop notification:** watch a part with a target price above its current
      price, run the price runner's worker from the inspector, and confirm a
      notification arrives.

## Development

```sh
cd app && npm ci
cp -r ../data public/  # dev server reads ./data/ (public/data is gitignored)
npm run dev
npm test               # unit tests (vitest)
npx playwright install chromium
npm run e2e            # smoke test on an iPhone 13 viewport against e2e/fixtures/data

cd scraper && npm ci && npm test
```
