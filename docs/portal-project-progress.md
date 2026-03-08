# JET Driver Portal - Project Progress and Model Handover

Last updated: 08 March 2026 (UK time) — updated same day after second session

## 1) Project purpose (problem we are solving)

JET currently shares weekly duty information in a broad WhatsApp-style way where everyone can see everything.
This project aims to provide a cleaner driver portal with:

- personalized weekly rota visibility for each driver,
- manager-level oversight for all staff,
- fast duty card lookup with stop-level map guidance,
- practical tools (leave request, shift swap, timesheet),
- a path to move live rota source from Google Sheets to a backend-owned data pipeline.

Core constraint: keep onboarding simple for drivers (no Microsoft 365 account requirement for every driver).

## 2) Design philosophy

This codebase has been steered by these principles:

1. Keep UI familiar and stable while adding capability.
2. Make changes incrementally, with rollback-safe commits.
3. Decouple data source from UI so Google Sheets can later be swapped for backend data.
4. Keep driver flow simple:
   - one sign-in step,
   - persistent session until logout/clear,
   - minimal typing and mobile-first use.
5. Protect sensitive operational data:
   - server-side auth/session checks,
   - manager-only access to all-staff controls,
   - suppress office-only notes in driver views.

## 3) What exists today (high-level)

There are two web experiences in the same repo:

1. Main portal (`/`)
   - login + PIN,
   - personal weekly rota view,
   - manager controls (all staff),
   - duty card details,
   - leave/swap/timesheet flows.

2. Standalone Duty Cards app (`/duty-cards/`)
   - public, no login,
   - light theme,
   - search by duty number, route code, destination, and stop,
   - map deep-linking for stops.

Routing note:
- On duty-card hostnames, root path redirects to `/duty-cards/`.

## 4) Current architecture

This project is static-first (no bundler required in runtime) with modular JS files:

- `index.html` -> main portal shell and script loading
- `index_files/jet-data.js` -> core data constants (duty cards, staff directory, config)
- `index_files/jet-data-layer.js` -> live rota adapter/parsing/fetch logic
- `index_files/jet-ui-helpers.js` -> colors/status/note filtering helpers
- `index_files/app.js` -> main React app logic/UI flows
- `index_files/jet-stop-directory.js` -> stop coordinate directory used for map matching
- `index_files/duty-cards-app.js` -> standalone duty cards app

Serverless API endpoints (`/api`):

Existing (unchanged):
- `api/auth-login.js` — name + PIN login, returns JWT
- `api/auth-session.js` — validate existing session token
- `api/send-request.js` — leave/swap request emails via Resend API
- `api/_auth.js` — shared auth/session helpers (JWT, PIN hashing)

New (added 08 March 2026):
- `api/rota-ingest.js` — receives weekly rota JSON, stores in Vercel Blob
- `api/rota-read.js` — serves stored rota for a given week
- `api/rota-weeks.js` — lists all available published weeks
- `api/allocation-ingest.js` — receives daily allocation JSON, stores in Vercel Blob
- `api/allocation-read.js` — serves today's allocation (defaults to UK date)
- `api/_ingest-auth.js` — shared API key validation for ingest endpoints

## 5) Authentication and access model (current)

- Name + PIN sign-in validated server-side.
- Session token stored client-side and verified via `/api/auth-session`.
- Default token TTL: 30 days (configurable with env var).
- Manager names defined in data/config and resolved to role `manager`.
- Manager-only controls:
  - all staff browsing / staff-hub behavior.
- Non-managers are forced back to their own driver view if they try to browse staff.
- Ingest endpoints (rota/allocation publish) are protected by a separate API key (`API_INGEST_KEY`), validated via timing-safe comparison in `_ingest-auth.js`.

## 6) Data source status

### Live source today
- **Vercel Blob backend is now the active rota source** — `ACTIVE_ROTA_ADAPTER_KEY = "backend"` in `jet-data-layer.js`.
- Google Sheets adapter remains in code at `ROTA_DATA_ADAPTERS.googleSheets` as a one-line rollback.
- In-app staff directory remains authoritative for name validation after login.

### Backend data pipeline (live — 08 March 2026)
- **Vercel Blob storage** is connected and tested.
- Five API endpoints are live:
  - `POST /api/rota-ingest` — writes `rota/{weekCommencing}.json` to blob
  - `GET /api/rota-read?week=YYYY-MM-DD` — reads a week's rota from blob
  - `GET /api/rota-weeks` — discovers available weeks from blob prefix listing
  - `POST /api/allocation-ingest` — writes `allocation/{date}.json` to blob
  - `GET /api/allocation-read?date=YYYY-MM-DD` — reads a day's allocation from blob
- The `backend` adapter in `jet-data-layer.js` calls `/api/rota-weeks` to discover tabs and `/api/rota-read` to fetch each week. The `YYYY-MM-DD` dates are converted to/from `WC DD.MM.YYYY` tab-name format so the rest of the UI is unchanged.
- To roll back to Google Sheets: change one line — `const ACTIVE_ROTA_ADAPTER_KEY = "googleSheets";`

### SharePoint / Power Automate status
- Power Automate flow approach has been **deprioritized**.
- The premium HTTP connector is not available on the company's current Microsoft 365 plan.
- Azure App Registration was refused by IT on security grounds.
- The new strategy is to use **Office Scripts** (available in Excel for the web) to publish data directly from SharePoint-hosted Excel files to the portal backend — no Power Automate or Azure registration required.

### Office Scripts publish strategy
- Two separate Excel files, two separate Office Scripts:
  1. **Rota script** — reads weekly rota sheet from `Rota.xlsx`, posts to `/api/rota-ingest`
  2. **Allocation script** — reads daily allocation chart, posts to `/api/allocation-ingest`
- Scripts authenticate using `API_INGEST_KEY` in the `x-api-key` header.
- Office Scripts confirmed available on the company's Microsoft 365 plan (Automate tab visible in Excel for the web).
- **Rota script (Script 1) is built** — file: `office-scripts/publish-rota.ts`.
  - User selects the target week's sheet tab, runs the script once per week.
  - Script is saved to the user's Microsoft 365 account — does not need to be re-pasted each week.
  - Requires `INGEST_URL` and `API_KEY` constants to be filled in before first use.
- Allocation script (Script 2) is NOT yet built — daily allocation spreadsheet layout still needs to be mapped.

## 7) Key functional features already implemented

1. Login UX:
   - plain text name input (no picker/autocomplete — drivers type their name),
   - PIN entry,
   - persistent login behavior.

2. Weekly rota view:
   - today banner for duty and REST states,
   - week navigation,
   - status coloring by duty type.

3. Duty card details:
   - reminders/warnings,
   - runout/takeover details where available,
   - 45-minute break prompt inserted near operational ARR/DEP points (especially around stand/pull-on-stand behavior for A6 flow).

4. Duty cards map links:
   - stop-to-directory fuzzy matching,
   - coordinates prioritized where available,
   - mobile deep-link preference (`geo:` Android, `comgooglemaps://` iOS) with web fallback.

5. Standalone duty cards app:
   - light soft style,
   - smart ranking search,
   - stop-choice behavior for stop-based queries.

6. Requests and timesheet:
   - Leave request and shift swap currently open user email app (`mailto`) with prefilled text.
   - Timesheet generator with editable start/finish/travel fields.
   - Draft timesheet autosave in local storage.
   - AVR/PH logic uses blank defaults for manual fill.

7. Notes visibility:
   - management/internal note lines are filtered for driver-facing views.

## 8) Visual/UI state

- Main portal has a **user-selectable light/dark theme toggle**.
  - Light theme: soft white/slate (current default).
  - Dark theme: dark navy baseline (original style).
  - Preference persisted in `localStorage("jet_theme")`.
  - Toggle button: ☽/☀ icon in the main app header (next to Log out) and text link on the login page.
  - Theme tokens defined in `jet-ui-helpers.js` as `LIGHT_THEME` and `DARK_THEME`, exported via `THEMES`. Active theme is resolved inside `App()` — all `C.xxx` references respond automatically.
- Standalone duty cards app remains light-themed (no toggle — separate app).
- UI rule has been to preserve layout/interaction patterns and avoid disruptive redesigns.

## 9) Security and compliance posture (current)

- Auth and session checks are server-side, not purely client trust.
- Sensitive request actions validate the logged-in identity.
- Email request routing is fixed by request type:
  - leave -> `errol@jasonedwardstravel.co.uk`
  - shift swap -> `operations@jasonedwardstravel.co.uk`
- Ingest endpoints protected by API key (timing-safe comparison).
- Blob storage is public-access (URLs are long random strings, not discoverable; write access requires the API key).
- Portal messaging and handling acknowledge staff data sensitivity (UK GDPR context).

## 10) Current blockers / open decisions

1. ~~SharePoint integration completion path~~ — resolved: using Office Scripts instead of Power Automate.
2. ~~Where JSON feed should be published~~ — resolved: Vercel Blob via backend ingest endpoints.
3. ~~Portal frontend wired to backend adapter~~ — resolved: `ACTIVE_ROTA_ADAPTER_KEY = "backend"` live.
4. ~~Remove name auto-population on login screen~~ — resolved: plain text input, no pre-fill.
5. Daily allocation spreadsheet layout needs to be mapped for Office Script 2.
6. Planned security upgrade (not yet implemented):
   - Upgrade from 4-digit to 6-digit PIN.

## 11) Immediate next steps (recommended order)

1. ~~Build Office Script 1 (rota publish)~~ — done: `office-scripts/publish-rota.ts`.
2. ~~Wire up portal frontend to backend adapter~~ — done: `ACTIVE_ROTA_ADAPTER_KEY = "backend"`.
3. ~~Remove login name auto-population~~ — done: plain text input.
4. Test Office Script 1 end-to-end with real rota data (WC 09.03.2026).
5. Get daily allocation spreadsheet layout to build Office Script 2.
6. Build Office Script 2 (allocation publish).
7. Replace static `DAILY_RUNOUT` with fetch from `/api/allocation-read`.
8. Implement 6-digit PIN upgrade.

## 12) Known project docs and where to look first

Read in this order:

1. `docs/portal-project-progress.md` (this file)
2. `docs/architecture-v2.md` (adapter/modularization decisions)
3. `docs/server-email.md` (email/auth env requirements)
4. `docs/power-automate-progress.md` (historical — approach deprioritized)

Then inspect implementation files:

1. `index_files/jet-data.js`
2. `index_files/jet-data-layer.js` — note `ACTIVE_ROTA_ADAPTER_KEY = "backend"`
3. `index_files/jet-ui-helpers.js` — note `THEMES` export with `LIGHT_THEME` / `DARK_THEME`
4. `index_files/app.js`
5. `index_files/duty-cards-app.js`
6. `api/_auth.js`
7. `api/_ingest-auth.js`
8. `office-scripts/publish-rota.ts` — Office Script for rota publish

## 13) Environment variables currently relevant

Auth:
- `AUTH_SIGNING_SECRET`
- `AUTH_MODE`
- `AUTH_USER_PIN_HASHES`
- `AUTH_MANAGER_NAMES`
- `AUTH_ALLOWED_NAMES`
- `AUTH_DEFAULT_DRIVER_PIN_HASH`
- `AUTH_MANAGER_MASTER_PIN_HASH`
- `AUTH_TOKEN_TTL_SECONDS`

Email:
- `RESEND_API_KEY`
- `PORTAL_EMAIL_FROM`

Blob storage + ingest:
- `BLOB_READ_WRITE_TOKEN` (auto-set by Vercel when Blob store is linked)
- `API_INGEST_KEY` (shared secret for Office Scripts to authenticate ingest requests)

## 14) Blob storage details

- Provider: Vercel Blob (public access store)
- Path convention:
  - `rota/{YYYY-MM-DD}.json` — weekly rota keyed by week-commencing date
  - `allocation/{YYYY-MM-DD}.json` — daily allocation keyed by date
- Overwrites: `addRandomSuffix: false` allows repeated publishes to the same path (last write wins)
- Max weeks retained: no hard limit in code, but `rota-weeks.js` lists all available

## 15) Practical notes for future contributors/models

1. Avoid broad rewrites; this project has many UX-sensitive workflows already validated by the user.
2. Keep manager-only guard behavior intact.
3. Keep mobile behavior front-of-mind for all UI changes.
4. Preserve the stop-directory map accuracy work and route-direction matching behavior.
5. Before changing data ingestion, maintain a rollback path to known-good Google Sheets feed.
6. If uncertain, prefer additive changes behind toggles/adapters rather than replacing existing flow.
7. ~~The ingest endpoints are additive — they do not affect the existing portal until the adapter is switched.~~ The adapter has now been switched. Google Sheets adapter remains as rollback (one-line change).
8. Office Scripts run in Excel for the web only (not desktop Excel).
9. The theme toggle (`THEMES` in `jet-ui-helpers.js`, `const C = THEMES[theme]` in `App()`) means all color references throughout the portal respond to the toggle automatically. Do not hardcode color values outside the theme objects.
10. Login name is now a plain free-text input — the server validates the name against known staff on `/api/auth-login`. Do not re-add client-side name autocomplete without confirming with the project owner.
