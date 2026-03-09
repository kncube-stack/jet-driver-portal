# JET Driver Portal - Project Progress and Model Handover

Last updated: 09 March 2026 (UK time) — audit refresh after swap workflow rollout, auth hardening, PIN rollout, blob-read refactor, and weekly UI cleanup

## 1) Project purpose

JET currently distributes weekly duty information too broadly and too manually.
This portal provides:

- personal weekly rota visibility for each driver,
- manager/duty-manager access to all staff,
- fast duty-card lookup with stop-level map guidance,
- practical staff tools (leave, swap, timesheet),
- a backend-owned rota/allocation pipeline that no longer depends on Google Sheets at runtime.

Core constraint: onboarding must stay simple for drivers. No Microsoft 365 account is required for drivers to use the portal.

## 2) Design philosophy

This codebase has been steered by these principles:

1. Keep the driver workflow simple and mobile-first.
2. Avoid broad rewrites; prefer additive, rollback-safe changes.
3. Keep data-source logic separate from UI logic.
4. Preserve manager-only visibility controls.
5. Raise security incrementally without breaking the existing operational flow.

## 3) What exists today

There are two web experiences in this repo:

1. Main portal (`/`)
   - server-side login + PIN,
   - personal weekly rota view,
   - manager/duty-manager all-staff access,
   - duty-card details,
   - leave, swap, and timesheet flows.

2. Standalone duty cards app (`/duty-cards/`)
   - public, no login,
   - light-themed duty lookup,
   - search by duty number, route code, destination, and stop,
   - mobile map deep-linking.

Routing note:
- on duty-card hostnames, root redirects to `/duty-cards/`.

## 4) Audit summary (09 March 2026)

Static audit result:
- no critical regressions found in the current app/API source during this pass,
- syntax checks passed for the main app, data-layer files, auth endpoints, blob endpoints, and the PIN generator,
- the current handover doc was stale in several areas and has now been refreshed.

Residual risks still present:
- the live Blob store is still public-access at the storage layer and has not yet been migrated to a private store,
- login throttling is in-memory serverless throttling, so it is helpful but not a perfect distributed rate limiter,
- timesheet submission still opens `mailto:` rather than using the backend email route,
- Office Scripts still rely on a shared ingest secret in script configuration,
- the new swap-request workflow has syntax/runtime-checked code paths, but it still needs real multi-user production-path testing with two separate staff logins.

## 5) Current architecture

Runtime structure:

- `index.html` -> main portal shell
- `index_files/jet-data.js` -> duty cards, staff directory, access config
- `index_files/jet-data-layer.js` -> live rota adapter and fetch logic
- `index_files/jet-ui-helpers.js` -> shared theme/status helpers
- `index_files/app.js` -> main React app logic/UI
- `index_files/duty-cards-app.js` -> standalone duty-cards app
- `index_files/jet-stop-directory.js` -> stop coordinate directory

Serverless API endpoints:

Auth/session:
- `api/auth-login.js` — validates name + PIN, applies login throttling, sets `HttpOnly` session cookie
- `api/auth-session.js` — verifies existing session and promotes legacy bearer sessions into cookie sessions
- `api/auth-logout.js` — clears the server session cookie
- `api/_auth.js` — shared auth helpers (PIN hashing, JWT signing/verification, cookie helpers)
- `api/_auth-rate-limit.js` — login throttling helper

Requests/email:
- `api/send-request.js` — leave emails via Resend, plus legacy direct swap email support
- `api/_request-email.js` — shared email payload builders and Resend send helper

Swap workflow:
- `api/swap-requests.js` — create/list swap requests for the signed-in driver
- `api/swap-request-action.js` — approve, decline, cancel swap requests
- `api/_swap-requests.js` — Blob-backed swap-request store + expiry logic

Blob ingest/read:
- `api/rota-ingest.js`
- `api/rota-read.js`
- `api/rota-weeks.js`
- `api/allocation-ingest.js`
- `api/allocation-read.js`
- `api/_ingest-auth.js`
- `api/_blob-json.js` — shared blob read/write helper with access-mode support

Office Scripts:
- `office-scripts/publish-rota.ts`
- `office-scripts/publish-allocation.ts`

Utility/script:
- `scripts/gen-pins.js` — generates unique 6-digit driver/admin PIN packs and the `AUTH_USER_PIN_HASHES` payload

## 6) Authentication and access model (current)

- Name + PIN sign-in is server-side only.
- The live auth mode is now expected to be `strict`.
- Per-user 6-digit PIN hashes are supplied via `AUTH_USER_PIN_HASHES`.
- Manager/duty-manager names are resolved from `ACCESS_CONTROL.managerNames`.
- Successful login sets an `HttpOnly`, `SameSite=Lax` session cookie (`jet_portal_session`).
- The browser still caches lightweight session metadata locally for UX continuity, but the actual auth token is no longer stored client-side for normal operation.
- Session TTL defaults to 30 days unless overridden by `AUTH_TOKEN_TTL_SECONDS`.
- Login throttling is active:
  - 6 failed attempts per name+IP within the rolling window,
  - 12 failed attempts per IP within the rolling window,
  - 15-minute temporary block when the threshold is hit.
- Manager-only controls:
  - all-staff browsing,
  - browsing other drivers,
  - management/duty-manager oversight flows.
- Ingest endpoints use a separate `API_INGEST_KEY` checked by timing-safe comparison.

Current manager/duty-manager access list in code:
- `Alfie Hoque`
- `Errol Thomas`
- `Jason Edwards`
- `Kennedy Ncube`
- `Joao Ferreira`
- `Mo ali`
- `Davina Howards`
- `Umair Akram`
- `Adrian Koprowski`

## 7) Data source and publish status

### Live source today

- `ACTIVE_ROTA_ADAPTER_KEY = "backend"` in `index_files/jet-data-layer.js`
- Google Sheets adapter still exists as rollback code, but the live portal now reads from the backend adapter
- the in-app staff directory remains the authoritative roster for sign-in name validation, access groups, and section labeling
- published rota data can now auto-surface unknown driver names into the app roster view, but that does not automatically provision login PINs
- legacy rota names are aliased to the newer full display names for:
  - `J. Ferreira` -> `Joao Ferreira`
  - `M. Ali` -> `Mo ali`
  - `D. Howards` -> `Davina Howards`

### Blob backend status

- Provider: Vercel Blob
- Current live store mode: still public-access
- Current code status: read/write layer is now compatible with both public and private modes via `BLOB_ACCESS_MODE`
- Current pinned env value in Vercel: `BLOB_ACCESS_MODE=public`

Important:
- the app no longer depends on public blob `downloadUrl` reads,
- but the underlying store itself has not yet been migrated to a private Blob store.

### Office Scripts status

- Office Scripts remain the intended operational publish path from SharePoint-hosted Excel files.
- Two scripts exist:
  1. `publish-rota.ts`
  2. `publish-allocation.ts`
- They post to:
  - `/api/rota-ingest`
  - `/api/allocation-ingest`
- They authenticate with `API_INGEST_KEY`.
- If the project later moves to a private Blob store, the Office Scripts do not need changing as long as the ingest URLs and API key remain the same.

## 8) Key functional features implemented

1. Login
   - plain-text name entry,
   - 6-digit PIN entry,
   - persistent sign-in via server cookie session.

2. Weekly rota view
   - manual refresh inside the app,
   - refresh on successful login,
   - current-week banner,
   - week navigation,
   - runout/allocation overlay where available.

3. Weekly action layout
   - primary actions below rota:
     - `Swap Request`
     - `Generate Timesheet`
   - secondary actions moved into the top-right menu:
     - duty cards
     - leave request
   - managers/duty managers also see:
     - `All Staff`
     - refresh icon
     - menu button
   - header layout has been tuned so larger phones keep those controls inline with the user name.

4. Leave and swap
   - leave currently uses the user's email app (`mailto:`) again for pilot testing
   - leave drafts to `errol@jasonedwardstravel.co.uk`
   - swap is now a two-step in-app workflow:
     - requester creates a pending swap for another driver
     - target driver approves or declines inside the dedicated `Swap Request` screen
     - requester can cancel while still pending
     - pending swaps auto-expire after 48 hours
     - management is emailed only after the target driver approves
   - swap requests are stored in Blob at `swap-requests/index.json`
   - the weekly view does not show full swap cards; it only shows a red count badge on the `Swap Request` button when approvals are waiting

5. Timesheets
   - generated from duty-card sign-on/sign-off data,
   - stale draft rows are ignored if the underlying duty changed,
   - Paddington travel default -> `£6`,
   - Victoria travel default -> `£9`,
   - still submitted via `mailto:` today.

6. Duty cards
   - route/destination/stop search,
   - stop matching and map deep-linking,
   - driver-facing filtering of office/internal note lines.

7. Staff directory structure
   - `Management`
   - `Duty Managers`
   - operational driver sections
   - `Jason Edwards` is now included under `Management` with blank days unless rota data is later added for him

## 9) Visual/UI state

- Main portal has light/dark theme toggle.
- Top header now keeps only:
  - theme toggle
  - log out
- Weekly manager header carries:
  - `All Staff`
  - refresh icon
  - menu icon
- Weekly manager header is tuned to stay inline on larger phones and web, with controlled wrap only on genuinely narrow widths.
- `Generate Timesheet` and `Swap Request` now share the same button treatment in both light and dark mode.
- the `Swap Request` button can now show a red top-right badge count for pending inbound approvals.
- Admin browsing another driver's week now hides the bottom action buttons, and leave/swap/timesheet actions always stay tied to the logged-in user.
- Standalone duty-cards app remains separate and light-themed.

## 10) Security posture (current)

What is strong now:
- transport is HTTPS in normal production use,
- per-user 6-digit PINs are hashed server-side,
- auth/session checks are server-side,
- real session token is now in an `HttpOnly` cookie,
- leave/swap actions are authenticated server-side,
- swap approval/cancel permissions are enforced against the signed-in user on the server,
- login throttling is in place,
- ingest endpoints require `API_INGEST_KEY`.

What is still weaker than ideal:
- current Blob store is still public-access at the storage layer,
- rate limiting is not yet distributed/persistent across all serverless instances,
- Office Script ingest credentials are still shared operational secrets,
- timesheet still relies on the user's mail app,
- no MFA.

Presentation-safe summary:
- secure enough for internal operational rollout,
- not yet at full enterprise-hardening level,
- clear next upgrades are already identified.

## 11) Open items / next steps

Recommended order:

1. End-to-end test the rota Office Script with the real workbook and production ingest config.
2. End-to-end test the allocation Office Script with the real workbook and production ingest config.
3. End-to-end test the new two-step swap approval flow with two separate live staff sessions.
4. Migrate from the current public Blob store to a private Blob store.
5. Republish rota/allocation data into the private store.
6. Decide whether timesheet should also move from `mailto:` to backend email send.
7. Harden the Office Scripts so Power Automate failures throw explicitly and return useful result data.
8. If stronger security is required after rollout:
   - add distributed rate limiting,
   - consider shorter session TTL,
   - consider stronger admin authentication requirements.

## 12) Known docs and recommended reading order

Read in this order:

1. `docs/portal-project-progress.md` (this file)
2. `docs/architecture-v2.md`
3. `docs/server-email.md`
4. `docs/power-automate-progress.md` (historical notes / incomplete external setup progress)

Then inspect implementation files:

1. `index_files/jet-data.js`
2. `index_files/jet-data-layer.js`
3. `index_files/jet-ui-helpers.js`
4. `index_files/app.js`
5. `index_files/duty-cards-app.js`
6. `api/_auth.js`
7. `api/_blob-json.js`
8. `api/_ingest-auth.js`
9. `office-scripts/publish-rota.ts`
10. `office-scripts/publish-allocation.ts`

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

Blob + ingest:
- `BLOB_READ_WRITE_TOKEN`
- `BLOB_ACCESS_MODE`
- `API_INGEST_KEY`

## 14) Blob storage details

- Path convention:
  - `rota/{YYYY-MM-DD}.json`
  - `allocation/{YYYY-MM-DD}.json`
  - `swap-requests/index.json`
- Repeated publishes overwrite the same logical path
- `api/rota-weeks.js` lists available rota weeks
- Current store mode is public
- Current code is prepared for a future private-store cutover
- Current observed Blob usage is very small for this app:
  - storage footprint is tiny,
  - transfer is tiny,
  - simple operations are tiny,
  - advanced operations are the closest relative metric to watch, but still comfortably below limits at the last check
- Private-store migration still requires:
  - creating/linking a new private Blob store,
  - setting `BLOB_ACCESS_MODE=private`,
  - republishing rota/allocation data

Swap-request store notes:
- all swap requests currently live in a single Blob JSON file
- expiry is handled on read/write, not by a background scheduler
- statuses used by the app:
  - `pending`
  - `approved`
  - `declined`
  - `cancelled`
  - `expired`

## 15) Practical notes for future contributors/models

1. Avoid broad rewrites; this project is operationally sensitive.
2. Keep mobile behavior front-of-mind for all UI changes.
3. Keep manager-only behavior intact.
4. Do not reintroduce client-stored bearer-token auth as the main session mechanism.
5. Do not assume the current Blob store is private just because the read layer now supports it.
6. If changing Office Script publish logic, keep backward compatibility with the current ingest endpoints unless there is a clear migration plan.
7. The rate limiter is intentionally simple; treat it as a first hardening step, not a finished anti-abuse system.
8. The theme system is centralized in `jet-ui-helpers.js`; do not hardcode ad-hoc colors in new UI work unless necessary.
9. The in-app staff directory remains the source of truth for names/sections, including access-group labeling.
10. Timesheet email flow is the main remaining user-facing request flow that has not yet been moved fully server-side.
11. The swap workflow is now stateful; do not revert it back to immediate management email without an explicit process decision.
12. If changing staff display names, keep alias handling in sync with the rota source naming until the source workbook is updated too.
