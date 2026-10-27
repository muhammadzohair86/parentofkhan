# Parent Of Khan

Monorepo: `client/` (React + Vite + Tailwind + daisyUI) and `server/` (Express + Mongoose + MongoDB Atlas).

## 1. MongoDB Atlas setup (one time)
1. Create a free account and a cluster at https://cloud.mongodb.com.
2. **Database Access** > Add New Database User > username + password (Read and write to any database). Avoid special characters in the password, or URL-encode them.
3. **Network Access** > Add IP Address. Use "Add current IP address" for development. Atlas blocks everything else.
4. **Database** > Connect > Drivers > copy the `mongodb+srv://...` string. Replace `<password>` with your password and add the database name before the `?`, e.g. `.../parentsofkhan?retryWrites=true&w=majority`.
5. Create the backend env file and paste the string there (this is the ONLY place it goes):
   ```bash
   cd server
   cp .env.example .env      # then edit server/.env and set MONGODB_URI
   ```
   `server/.env` is git-ignored. Never put the URI in `client/`.

## 2. Run
Two terminals, from the repo root:
```bash
# one-time
npm run install:all           # or: cd server && npm install ; cd ../client && npm install

# optional: load clearly-labelled demo data (never overwrites existing records)
npm run seed

# terminal 1: API on http://localhost:5000
npm run dev:server

# terminal 2: storefront on http://localhost:5173 (proxies /api to the server)
npm run dev:client
```
Other commands: `npm run build` (frontend), `npm test` (backend unit tests), `npm run seed:remove` (deletes ONLY records flagged `isDemo`).

If you copied `client/.env.example` earlier and it contains `VITE_API_URL=http://localhost:5000/api`, delete that line (or leave it: CORS allows `http://localhost:5173`). If port 5000 is taken (macOS AirPlay uses it), change `PORT` in `server/.env` and set `VITE_PROXY_TARGET` in `client/.env`.

## 3. API (public catalog is read-only; auth uses an HttpOnly session cookie)
| Endpoint | Notes |
|---|---|
| `GET /api/health` | 200 when the database is connected, 503 otherwise |
| `GET /api/products` | `category`, `q` (min 2 chars; every word must match name, description, tags, a color or a category name), `sort` (`newest`, `price-asc`, `price-desc`), `featured`, `color`, `size`, `page`, `limit` (max 100) |
| `GET /api/products/featured` | same params, featured only |
| `GET /api/products/:slug` | 404 if missing, inactive, in an inactive category, or has no available color |
| `GET /api/categories` | `navbar=true`, `homepage=true` filters; ordered by `order` |
| `GET /api/categories/:slug` | 404 if missing or inactive |

| `POST /api/auth/signup` | `{ name, email, password }` (password 8-128 chars). Always creates a `customer`; any `role` in the body is ignored. 201 + session cookie |
| `POST /api/auth/login` | `{ email, password }`. 401 `INVALID_CREDENTIALS` for any failure. Rate limited (10 failed attempts / 15 min / IP) |
| `POST /api/auth/logout` | Deletes the server-side session and clears the cookie |
| `GET /api/auth/me` | The signed-in user, or `data: null` when anonymous |

| `GET /api/products/facets` | `category`, `q` (optional). Colors used by visible products: `[{ name, hex }]` (feeds the Shop color filter) |
| `GET /api/site/hero` | `{ desktopImage, mobileImage, alt }`; images are `null` when none is configured (storefront then uses `/assets/hero/*`) |
| `GET /api/site/features` | Active footer feature boxes, ordered. Built-in defaults are returned only while the collection is empty |
| `GET /api/site/payment-methods` | Active payment methods only: `{ name, logoUrl, altText }` |
| `POST /api/newsletter` | `{ email }`. 201 `subscribed`, 200 `already_subscribed`, 400 invalid, 429 rate limited (10/hour/IP). No public GET exists |
| `GET /api/admin/subscribers` | **Admin only** (`status`, `q`, `page`, `limit`) |
| `PATCH /api/admin/subscribers/:id` | **Admin only** `{ status: "subscribed" \| "unsubscribed" }` |
| `DELETE /api/admin/subscribers/:id` | **Admin only** |

Responses: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`.

## 4. Business rules implemented
- Products are printed on demand. Recorded stock (including 0) never hides a product or blocks a purchase. Stock is stored but only informational.
- A product is public only if: `active: true`, its category is active, and at least one color has `available !== false`. Colors with `available: false` are omitted.
- Public API has no create/update/delete endpoints. Admin comes in a later phase.

## 5. Data model notes
- Product: `name, slug, description, price, salePrice, category, frontImage, backImage, galleryImages, variants[{color, hex, sku, sizes[{size, stock}], images[], available}], featured, active, sortOrder, tags, seoTitle, seoDescription`.
- The API returns variant `sizes` as `{ S: 5, M: 0 }` and `variants[].images` as `[front, back, ...]`, which is what the storefront already uses.
- `effectivePrice` (sale price or price) is used for price sorting and is set on `save()/create()`. Later admin updates must use `save()`.
- Prices are USD dollars with at most 2 decimals. Checkout (later phase) should compute in cents on the server.
- Category: `name, slug, description, image, active, showOnHomepage, showInNavbar, order`.

## 6. Assets (`client/public/assets/`)
`brand/parentsofkhan.png` (navbar logo), `hero/hero.jpg` and optional `hero-mobile.jpg`, `products/<slug>-<color>-front.jpg` / `-back.jpg`. Missing files show labelled placeholders.

## 7. Authentication notes
- Passwords: scrypt (Node standard library), per-password random salt, parameters stored in the hash. Hashes are never returned by the API (`passwordHash` is `select: false`).
- Sessions: a random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` when `NODE_ENV=production`). Only the SHA-256 of the token is stored (`sessions` collection, 14-day expiry, auto-deleted by MongoDB). Logout really invalidates the session. No JWT secret is needed.
- CORS allows only `CLIENT_ORIGIN` with credentials; state-changing auth requests with a foreign `Origin` are rejected.
- Roles (`customer`, `admin`) live on the user record. `requireRole("admin")` exists for Phase 2 but no admin route exists yet. To create the first admin later, change `role` on your own user directly in Atlas.
- Behind a reverse proxy set `TRUST_PROXY=1`. In production keep the site and API on one registrable domain (e.g. `parentsofkhan.com` + `api.parentsofkhan.com`) so the Lax cookie is sent.

## 8. Site content (footer, hero) and newsletter
- Collections: `sitesettings` (one document, `key: "site"`, holds `hero`), `featureboxes`, `paymentmethods`, `subscribers` (unique normalized `email`).
- Images are stored as a URL or `/public/path` only (https or site-relative; validated). Nothing binary goes in MongoDB. There is no upload service yet, so host images anywhere over https or put them in `client/public/assets/`.
- Payment methods default to **inactive** and there are no seeded logos; nothing is shown until a real, accepted method with a real logo URL is enabled.
- `npm --prefix server run seed:site` creates the three default feature boxes and the settings document if missing. It is safe to re-run and never overwrites edits. The API also serves the defaults while no feature box exists, so it works without running it.
- Admin routes need a user with `role: "admin"`. Create one by signing up on the site, then: `npm --prefix server run make-admin -- you@example.com`.

## 9. Per-color images and the feature-box cap
- Each color variant has its own `images` array (`[front, back, ...extras]`). Cards, the quick-add sheet and the cart show the selected color's own images only. The product-level `frontImage`/`backImage`/`galleryImages` are treated as the **default (first) color's** images; other colors with no `images` show a placeholder in that color rather than another color's photo. Fill `variants[].images` for every extra color.
- At most 3 feature boxes can be active: the model rejects activating a 4th, and the public API returns at most 3. Admin writes must use `save()`/`create()` (not `updateOne`) so the rule runs.

## 10. Admin dashboard (Phase 2)
**Open it at `/admin`** (sign in at `/admin/login`). It is a separate lazy-loaded chunk and is not linked from the storefront.

**First-time setup (Master Admin)**
1. In `server/.env` set `MASTER_ADMIN_EMAIL` and `MASTER_ADMIN_INITIAL_PASSWORD` (12+ characters).
2. Start the server (it creates the account if no master exists) or run `npm --prefix server run bootstrap-admin`.
3. Sign in, then **delete the password line** from `.env`. It is never used again; re-running never resets an existing master's password.
- Only one master can exist (a unique database index enforces it). If the email already belongs to a customer account, nothing is created: the script will not promote an existing account.
- There is no API that creates a master admin. Sub-admins are created in **Team** by the master (or by a sub-admin with `team.manage`, within the limits below).
- Accounts that were `admin` before this phase are now sub-admins with **no permissions**; grant them access in Team.

**Permissions** (checked on the server for every request, from the current database record, so changes apply immediately):
`products.view|create|edit|delete`, `categories.view|create|edit|delete`, `orders.view|update`, `team.view|manage`, `newsletter.view|manage`. Any action implies `view` for its group. The master has everything. A sub-admin with `team.manage` may manage other sub-admins only: never themselves, never another team manager, and only with permissions they hold (never `team.manage`). Nobody can modify the master through the API. Deactivating a member or resetting their password signs them out everywhere; admin sessions last 8 hours.

**Images.** Uploads (JPEG/PNG/WebP, max 5 MB, type checked from the file bytes, names generated by the server) are saved to `UPLOAD_DIR` (default `server/uploads`) and served from `/api/uploads/...`; the product stores that URL. **Local disk is not durable on most hosts** (Render, Railway, Heroku, containers wipe it on deploy): put `UPLOAD_DIR` on a persistent volume and back it up, or move storage to S3/Cloudinary later (`lib/storage.js` is the only file to swap). If the site and API are on different domains, set `PUBLIC_UPLOAD_BASE_URL=https://api.yourdomain.com`.

**Orders.** The Order model, list/detail and status updates are built, but the storefront has no checkout yet, so the list is empty until a later phase creates orders. Statuses move pending → confirmed → printing → shipped → delivered (or cancelled), every change is recorded, and changing a status never marks an order paid.

### Cloudinary images, hero and subscribers (latest update)
- **Backend env (server/.env only):** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (all three or none), optional `CLOUDINARY_FOLDER`, `CLOUDINARY_MAX_DIMENSION`, `UPLOAD_MAX_MB`. **Frontend env (client/.env, optional):** `VITE_CLOUDINARY_CLOUD_NAME` only. The secret is never sent to the browser.
- **Uploads:** the admin form sends the file to the API, which checks permission, file type (from the bytes) and size, then uploads with the official `cloudinary` SDK (signed with the secret on the server). The public ID is the file's hash, so the same image is never stored twice; each file is recorded in the `mediaassets` collection (public ID, secure URL, size). Products keep storing the secure URL in the existing image fields, so old local paths keep working and no migration is needed.
- **Cleanup:** when an edit drops an image (or a product/category is deleted or the hero is changed) the old image is deleted from Cloudinary only if no product, category, hero setting or past order still references it, and only under `CLOUDINARY_FOLDER`. Images uploaded but never saved are left in place (they can be reused). Legacy `/assets/...` files are never deleted.
- **Delivery:** every Cloudinary image is served through `src/lib/cloudinary.js` and `components/OptimizedImage.jsx`: `f_auto` and `q_auto` as separate actions, `c_limit` with a width only (no upscaling, no distortion), from small fixed width lists, lazy-loaded except the first screen. Local and other-host images are not transformed.
- **Homepage hero:** Admin > Homepage. Empty images fall back to `/assets/hero/hero.jpg` and `hero-mobile.jpg`. Needs `site.view` / `site.edit`.
- **Subscribers:** Admin > Subscribers (search, status filter, counts, pagination, CSV export). Needs `newsletter.view`; unsubscribe/delete need `newsletter.manage`. Grant these in Team.

## 11. Shop page
- 20 products per page, server-side: `GET /api/products?page=&limit=20` returns `meta { page, limit, total, totalPages }`. `q`, `category`, `color`, `sort` and `page` all live in the URL; changing anything except the page resets to page 1.
- Phones: one toolbar row (Filter & Sort | search | 4-block / 6-block layout). Filter & Sort opens a right-side drawer that uses the same filter components and URL state as the desktop toolbar. The 6-block layout (3 per row) shows only the front image; the layout choice is remembered in `localStorage`.

## 12. Not done yet
Checkout, payments and order creation (the admin order screens are ready for them), a Subscribers screen in the dashboard (its API exists), admin screens for the hero image, feature boxes and payment logos (their write APIs are not built yet), external image storage, an audit log for team changes, unsubscribe links, contact-form persistence, a store-settings API, and the legal text of the policy pages. The checkout and contact UI say they are not connected rather than faking success.

## Shipping (NLS Xpress)

Shipping is calculated **only on the server** (`server/src/lib/shippingRules.js`, `checkoutQuote.js`); the storefront and admin display what the API returns. All of it is managed in **Admin > Shipping**.

**Free Shipping** — two independent switches: *domestic* (Domestic section) and *international* (International section). When on, the server computes a PKR 0 charge itself and checkout shows "Free Shipping". It never opens a destination that is disabled, unconfigured or missing rates.

**Domestic (Pakistan)** — editable amounts, fixed shape:
- billable weight ≤ 3 kg → **fixed charge** (initially PKR 300; also applies under 1 kg)
- billable weight > 3 kg → **fixed charge + ceil(billable kg − 3) × charge per additional KG** (initially PKR 100)
- billable weight = Σ(product packed weight × quantity) + packaging weight (once per parcel), summed in integer grams.

**International** — weight-based, per destination, all amounts entered by an admin (none are hardcoded). Each destination has *First KG price*, *Additional KG price* and *Flat Rate for shipments over 20 KG*, plus method name, currency (default PKR), delivery estimate and enabled flag.
- billable kg = weight rounded **up** to a whole kg (0.5 → 1, 2.2 → 3), including the international packaging weight
- ≤ 20 kg → first KG price + (billable kg − 1) × additional KG price
- \> 20 kg → the flat rate is the **entire** charge (nothing added)
- A destination with any missing/invalid rate is flagged "Incomplete" in admin and is **not offered at checkout** (and Free Shipping does not change that).
- A destination can be scoped to a city (e.g. Dubai only) or a whole country. Other cities are never assumed serviceable. One entry per country+city.

**Checkout** — the country list is built from `GET /api/shipping/options` (domestic if enabled + enabled, fully priced international destinations). Where only specific cities are configured the customer picks from those cities. A quote is requested only once the destination is complete, so incomplete selections never reach the server; newer selections cancel older requests.

**Currency** — product prices are USD and shipping is PKR. *PKR per 1 USD* (Admin > Shipping) converts shipping into the total (rounded up to the next cent). Without a rate, checkout shows subtotal and PKR shipping side by side with no combined total. Free Shipping needs no rate.

**Migration** (runs once at start-up, idempotent): existing international destinations are switched to the weight-based model with their rate fields left **blank** (the old fixed `price` is kept, untouched, for reference) and a United Kingdom destination is added, also blank. Domestic settings saved earlier keep their values and read as 300 / 100 for the new amounts. `npm run seed:shipping` runs the same step by hand.

**Permissions** — `shipping.view` / `shipping.edit` (per staff member under Team).

**API** — public: `GET /api/shipping/countries`, `GET /api/shipping/options`, `POST /api/checkout/quote` (prices a cart; rejects browser-supplied shipping/subtotal/total that differ from the server's). Admin: `GET /api/admin/shipping`, `PUT /api/admin/shipping/settings` (domestic + conversion rate), `PUT /api/admin/shipping/international-settings`, `POST|PATCH|DELETE /api/admin/shipping/destinations[/:id]`.

**Not included:** payments (no gateway, no Cash on Delivery), order placement, live courier API/booking/tracking. `/checkout` is a shipping-and-totals page only; "Place order" is disabled. `Order.shippingDetails` and `buildOrderPricing()` are ready to snapshot courier/destination/charge/estimate when order creation is built.

## Online payments (Safepay, Sandbox only)

Safepay is the only payment method (no Cash on Delivery, no other gateway). This build talks **only to Safepay's sandbox**: no real money moves. `SAFEPAY_ENV=production` is refused on purpose.

**Setup** — put your Sandbox credentials in `server/.env` (never in `client/`, never in a `VITE_` variable, never in git). Each of the three is a *different* value:

| Variable | Where to find it (Sandbox dashboard) |
|---|---|
| `SAFEPAY_PUBLIC_KEY` | Developers > API keys: Public key (starts with `sec_`) |
| `SAFEPAY_SECRET_KEY` | Developers > API keys: Secret key |
| `SAFEPAY_WEBHOOK_SECRET` | Developers > Endpoints > your endpoint > shared secret (NOT the API secret) |

Optionally `PUBLIC_SITE_URL` (where Safepay sends the customer back; defaults to the first `CLIENT_ORIGIN`). At start-up the server logs whether payments are enabled; a problem is reported by variable *name* only, never by value. With nothing configured the shop works and the Pay button is simply unavailable.

**Flow** — Pay button → `POST /api/checkout/pay` → the server re-prices the cart (products, NLS Xpress shipping, Free Shipping, exchange rate), rejects any amount the browser claims that differs, creates a **pending/unpaid order**, creates a Safepay session for that exact amount, and returns Safepay's hosted-checkout URL. Safepay sends the customer back to `/order/<orderNumber>/<token>`; that page asks our server for the status and the server asks Safepay (`GET /reporter/api/v1/payments/<tracker>`). **An order is marked paid only when Safepay itself reports the tracker ended for exactly the saved amount and currency.** Redirect URLs, query strings and webhook payloads are never proof by themselves.

**Currency** — the order total is in USD (product prices are USD; PKR shipping is converted with the admin's PKR-per-USD rate, rounded up to the cent). Safepay supports USD, so the customer is charged **exactly the USD total shown**, in minor units (cents). Safepay settles to you in PKR at its own rate. If no combined total can be computed (no rate set, shipping not free) payment is refused: nothing is created.

**Idempotency** — the browser makes a random UUID per checkout; the server stores only its SHA-256. The same UUID always returns the same order (double clicks, refreshes) and reuses the live Safepay session; it is also the private link to the order's status page. Retrying a cancelled/expired/failed attempt reuses or replaces the session for the order's **saved** amount, never re-priced.

**Webhook** — `POST /api/webhooks/safepay` (raw body, mounted before `express.json`). Verified with `X-SFPY-SIGNATURE` (HMAC-SHA512 of the body, using the webhook shared secret). Invalid signature → 401. Valid events are de-duplicated by event token, matched to our order by tracker and order reference, and for payments **re-confirmed with Safepay** before anything changes. Transient trouble → 5xx so Safepay retries. In Safepay's dashboard (Sandbox): Developers > Endpoints > **+ Add an endpoint**, enter `https://<your public host>/api/webhooks/safepay`, Create, then ⋯ > Details, subscribe to `payment.succeeded`, `payment.failed` (and optionally `payment.refunded`) at version `2.0.0`, and copy the shared secret into `SAFEPAY_WEBHOOK_SECRET`. The URL must be public HTTPS: for local development run a tunnel to port 5000 (e.g. ngrok or cloudflared) and use its https URL. Without a webhook, payments are still confirmed by the return-page check.

**Admin** — orders show the payment method, a *(sandbox)* marker, tracker and paid time. Sandbox payments are **not counted as revenue** on the dashboard.

**Not done / before Production** — see the project hand-over notes: production credentials, a live webhook endpoint and shared secret, and an explicit code change to allow `SAFEPAY_ENV=production`.

**If the Pay button is disabled / "Online payment isn't available right now"** — the API process doesn't have working Safepay settings. Most common cause: `.env` was edited while the API was running. `npm run dev` (`node --watch`) restarts on code changes but **not** on `.env` changes, so stop and start the API. In development the checkout page shows the exact reason (variable names only). To check without going through checkout, from the `server` folder run `npm run check:safepay` (configuration only) or `npm run check:safepay:live` (also creates one unpaid US$10.00 test session in Safepay's sandbox and reads it back). Both print only "set / NOT set", status codes and Safepay's short error text, never a key. The API start-up log also states whether payments are enabled, which folder it read `.env` from, and why they are off. Only the Public and Secret keys are required to start a payment; a wrong webhook secret only disables webhooks.

## Order tracking and shipment details

**Customers reopen an order** from **Track Order** in the main menu (or **My orders** in the account menu when signed in):
- *Signed in:* "Your orders" lists orders placed while signed in to that account, each opening `/account/orders/<reference>`. The server only ever returns the account's own orders.
- *Guest:* enter the order reference and the email used at checkout. On a match the server issues an expiring (14 days), hashed, revocable access token and opens `/order/<reference>/<token>`. Any mismatch (unknown order or wrong email) returns the **same** message; failures are throttled per order reference (8 per 15 minutes, identical for real and non-existent orders) plus an IP limiter.
- The private link `/order/<reference>/<token>` (also where Safepay returns the customer) keeps working after the browser is closed. This browser also remembers recent links under "Orders on this device" (removable); every page still loads from the server, so a refresh always shows the latest saved status.

**What a customer sees** (explicit allowlist in `server/src/lib/orderView.js`): reference, date, order status, payment status (Paid only when verified), items, subtotal/shipping/total, shipping method and estimate, delivery destination (city/country only), the tracking number and link once the order is **shipped**, and a timeline built from saved history. Never exposed: email, phone, street address, database ids, payment references, admin names or notes, the internal shipping note.

**Admin workflow** (Admin > Orders > an order): statuses keep their existing order (pending → confirmed → printing/processing → shipped → delivered). **Mark shipped** opens a dialog for carrier (default NLS Xpress), tracking/consignment number, tracking link (https only), dispatch date, estimated delivery and an admin-only internal note. Shipping without a tracking number, or shipping an order that was not paid online, needs an explicit tick-box confirmation. Nothing is generated: tracking numbers are always typed in. **Edit shipment details** corrects them after dispatch. **Mark delivered** is only possible after shipped and only by that explicit action. API: `PATCH /api/admin/orders/:id/status` (accepts `shipment`, `allowWithoutTracking`, `acknowledgeUnpaid`) and `PATCH /api/admin/orders/:id/shipment`, both `orders.update`.

**History** entries have a `kind` (status / payment / shipment). A verified payment writes its "payment received" entry in the same atomic update that marks the order paid, so repeated webhooks/polls cannot duplicate it. Old orders without history, tracking or shipping snapshot still display, with nothing invented.

**Tracking links:** no official NLS Xpress tracking URL format was found, so none is assumed: the link is whatever you enter per order. With only a number, customers are told to use the courier's official tracking service.

**Email notifications are not implemented**: the project has no email service configured (see the hand-over notes for what is needed).
