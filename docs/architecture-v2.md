# JET Portal Architecture V2 (Non-Breaking Path)

## Goal
Modernize the codebase without changing the current UI/UX behavior.

## Principles
- Preserve existing visual design and flow.
- Decouple data sources from UI so Google Sheets can be swapped for SharePoint.
- Keep all changes incremental and deployable at every step.

## Phase 1 (Implemented)
- Added a rota data adapter abstraction:
  - `ROTA_DATA_ADAPTERS`
  - `ACTIVE_ROTA_ADAPTER`
  - `fetchLiveRota()` and `fetchWeekRota()` now read through the adapter layer.
- Added `applyManualStaffOverrides(parsed)` as a controlled merge point for temporary/ops overrides.
- Added deterministic week sorting via `sortAvailableWeeks(...)`.
- Added local date-key helper for runout lookups to avoid UTC day-shift edge cases.

## Phase 2 (Implemented)
- Split the monolithic inline script into modular files under `index_files/`:
  - `jet-data.js` (domain data/constants and temporary overrides)
  - `jet-data-layer.js` (runout/date helpers, sheet parsing, adapter + live fetch)
  - `jet-ui-helpers.js` (status/style/note filtering helpers)
  - `app.js` (auth + React app UI/screens)
- Replaced inline script in `index.html` with ordered script includes.
- Kept UI behavior and visual styling unchanged while reducing merge/conflict surface area.

## Phase 3 (Optional Build Tooling)
- Introduce Vite + TypeScript in parallel, then migrate screen-by-screen.
- Keep generated static output for existing hosting/deploy workflow.

## SharePoint Readiness
When SharePoint is ready, add a new adapter in `ROTA_DATA_ADAPTERS`:
- `discoverTabs()` equivalent (or week listing from SharePoint metadata).
- `fetchWeekByGid()` equivalent (or by file path/week id).
- No UI changes required.
