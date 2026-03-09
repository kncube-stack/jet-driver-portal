# JET Driver Portal - Azure / IT Handover Pack

Last updated: 09 March 2026 (UK time)

## 1) Purpose

This document is the handover pack for company IT if the portal is moved under Azure/Microsoft tenancy.

Preferred migration goal:

- move hosting and storage under company-controlled Azure infrastructure,
- keep the app's frontend behavior the same,
- keep the app reading the same published JSON contract it uses now,
- avoid making the live app parse raw Excel workbooks directly.

The lowest-risk migration is:

1. keep the publish pipeline concept the same,
2. keep the API contract the same,
3. replace the current Vercel hosting/storage implementation with Azure equivalents behind that contract.

## 2) Current live architecture

Current flow:

1. Excel / Office Scripts read SharePoint-hosted rota and allocation workbooks.
2. Office Scripts normalize that workbook data into app-friendly JSON.
3. Office Scripts POST the JSON to backend ingest endpoints.
4. Backend stores the JSON in Blob storage.
5. The portal reads that stored JSON through backend read endpoints.

Important:

- the live app does not read Excel directly,
- the live app expects normalized JSON snapshots,
- the frontend should not need major changes if the backend contract stays the same.

## 3) Recommended Azure target architecture

Recommended Azure shape:

1. Host static frontend + backend routes in Azure.
2. Store published JSON snapshots in Azure Blob Storage.
3. Keep Office Scripts posting to backend ingest endpoints.
4. Keep backend read endpoints returning the same JSON shape as today.
5. Keep authentication/session logic server-side.

Recommended principle:

- do not put Azure storage credentials inside Office Scripts if avoidable,
- let Office Scripts continue posting to controlled backend endpoints,
- let the backend own storage writes and reads.

## 4) What must stay the same for the app to keep working

The frontend should continue to get the same behavior from these app-facing endpoints:

Read endpoints:

- `GET /api/rota-read?week=YYYY-MM-DD`
- `GET /api/rota-weeks`
- `GET /api/allocation-read?date=YYYY-MM-DD`

Ingest endpoints used by Office Scripts:

- `POST /api/rota-ingest`
- `POST /api/allocation-ingest`

Auth/session endpoints:

- `POST /api/auth-login`
- `POST /api/auth-session`
- `POST /api/auth-logout`

Request / workflow endpoints:

- `POST /api/send-request`
- `GET /api/swap-requests`
- `POST /api/swap-requests`
- `POST /api/swap-request-action`

If IT preserves these endpoint names and payload shapes, the frontend should require little or no change.

## 5) Current data contract

### 5.1 Weekly rota ingest payload

Current Office Script publishes this JSON to `POST /api/rota-ingest`:

```json
{
  "weekCommencing": "2026-03-09",
  "sections": [
    {
      "key": "early_a6",
      "label": "Early A6",
      "drivers": ["Bruno Rodrigues", "Kennedy Ncube"]
    }
  ],
  "rota": {
    "Bruno Rodrigues": ["201", "R", "R", "R", "201", "263", "262"],
    "Kennedy Ncube": ["PH2457", null, null, null, null, null, null]
  }
}
```

Expected response:

```json
{
  "ok": true,
  "weekCommencing": "2026-03-09",
  "driverCount": 2,
  "message": "Rota published for 2026-03-09 (2 drivers)."
}
```

### 5.2 Weekly rota read response

Current app reads `GET /api/rota-read?week=YYYY-MM-DD` and expects:

```json
{
  "ok": true,
  "weekCommencing": "2026-03-09",
  "sections": [
    {
      "key": "early_a6",
      "label": "Early A6",
      "drivers": ["Bruno Rodrigues", "Kennedy Ncube"]
    }
  ],
  "rota": {
    "Bruno Rodrigues": ["201", "R", "R", "R", "201", "263", "262"],
    "Kennedy Ncube": ["PH2457", null, null, null, null, null, null]
  }
}
```

### 5.3 Available weeks response

Current app reads `GET /api/rota-weeks` and expects:

```json
{
  "ok": true,
  "weeks": ["2026-03-09", "2026-03-02", "2026-02-23"]
}
```

### 5.4 Daily allocation ingest payload

Current Office Script publishes this JSON to `POST /api/allocation-ingest`:

```json
{
  "date": "2026-03-09",
  "allocation": {
    "201": {
      "vehicle": "BV72 XFE",
      "driver": "Bruno Rodrigues",
      "signOn": "01:20",
      "handoverTo": {
        "duty": 206,
        "driver": "Khorrum Habib",
        "signOn": "12:05"
      }
    },
    "206": {
      "vehicle": "BV72 XFE",
      "driver": "Khorrum Habib",
      "signOn": "12:05",
      "takeoverFrom": {
        "duty": 201,
        "driver": "Bruno Rodrigues",
        "signOn": "01:20"
      }
    }
  }
}
```

Expected response:

```json
{
  "ok": true,
  "date": "2026-03-09",
  "dutyCount": 2,
  "message": "Allocation published for 2026-03-09 (2 duties)."
}
```

### 5.5 Daily allocation read response

Current app reads `GET /api/allocation-read?date=YYYY-MM-DD` and expects:

```json
{
  "ok": true,
  "date": "2026-03-09",
  "allocation": {
    "201": {
      "vehicle": "BV72 XFE",
      "driver": "Bruno Rodrigues",
      "signOn": "01:20"
    }
  }
}
```

### 5.6 Leave request email endpoint

Current app POSTs to `POST /api/send-request` with:

```json
{
  "kind": "leave",
  "payload": {
    "driverName": "Kennedy Ncube",
    "dateFrom": "2026-04-10",
    "dateTo": "2026-04-12",
    "fromDateLabel": "10/04/2026",
    "toDateLabel": "12/04/2026",
    "totalDays": 3,
    "reason": "Annual leave",
    "notes": "Optional text",
    "submittedAtIso": "2026-03-09T11:00:00.000Z"
  }
}
```

### 5.7 Swap workflow endpoints

Current swap flow is stateful and must be preserved if this functionality is retained.

Create/list:

- `GET /api/swap-requests`
- `POST /api/swap-requests`

Create request payload:

```json
{
  "payload": {
    "requestingDriver": "Driver A",
    "targetDriver": "Driver B",
    "dayIndex": 1,
    "dayName": "Tue",
    "weekCommencing": "2026-03-09",
    "requestingDuty": "209",
    "targetDuty": "208",
    "notes": "Optional text"
  }
}
```

Action endpoint:

- `POST /api/swap-request-action`

Action payload:

```json
{
  "id": "swap-request-id",
  "action": "approve"
}
```

Allowed actions:

- `approve`
- `decline`
- `cancel`

Stored statuses:

- `pending`
- `approved`
- `declined`
- `cancelled`
- `expired`

## 6) Current storage conventions

Current storage paths:

- `rota/{YYYY-MM-DD}.json`
- `allocation/{YYYY-MM-DD}.json`
- `swap-requests/index.json`

Current behavior:

- repeated publishes overwrite the same logical rota/allocation path,
- swap requests are stored in a single JSON file,
- expiry is handled at application read/write level, not by a background job.

If Azure Blob Storage is used, these same logical path conventions can be preserved.

## 7) Current security model

### 7.1 App auth

- sign-in is name + 6-digit PIN,
- PIN verification is server-side,
- session is stored in an `HttpOnly` cookie,
- login throttling is active.

### 7.2 Ingest auth

- Office Script ingest uses `x-api-key`,
- backend validates against `API_INGEST_KEY`,
- timing-safe comparison is used.

### 7.3 Email

- leave and approved swap email sends currently use Resend,
- timesheets still use `mailto:` at the client side.

### 7.4 Current storage caveat

- current live store is still public at the storage layer,
- code is already structured so storage can be replaced without changing the frontend contract.

## 8) Current Office Script behavior

Two Office Scripts currently exist:

- [`office-scripts/publish-rota.ts`](/Users/k_ncube/Documents/Projects/jet-driver-portal/office-scripts/publish-rota.ts)
- [`office-scripts/publish-allocation.ts`](/Users/k_ncube/Documents/Projects/jet-driver-portal/office-scripts/publish-allocation.ts)

What they do:

- read Excel workbook data,
- convert workbook structure into normalized JSON,
- POST JSON to the backend ingest endpoints.

Preferred Azure migration behavior:

- keep the transformation logic,
- only change the destination backend URL if required,
- do not change the payload shape.

## 9) Suggested Azure equivalent mapping

Current -> Azure equivalent:

- Vercel static frontend -> Azure Static Web Apps or Azure App Service
- Vercel serverless API routes -> Azure Functions or backend hosted in App Service
- Vercel Blob -> Azure Blob Storage
- Vercel env vars -> Azure App Settings / Key Vault-backed secrets

Best fit if the frontend should stay mostly unchanged:

- static frontend on Azure Static Web Apps,
- API in Azure Functions,
- JSON snapshots in Azure Blob Storage.

## 10) Environment layout to request from IT

Recommended minimum Azure environment layout:

1. `Production`
   - live driver-facing portal
   - production auth secrets
   - production storage account/container
   - live domain / SSL

2. `Staging` or `Test`
   - same codebase as production
   - separate app URL
   - separate storage container or storage path namespace
   - separate secrets/config where appropriate
   - safe place for Kennedy / IT to test before production rollout

Recommended supporting requirements:

- GitHub-connected deployment path for staging first
- clear promotion path from staging to production
- access to staging logs and deployment status
- a small set of staging test accounts/PINs
- if email sending is enabled in staging, either a test mailbox or clearly isolated email routing

Preferred deployment flow:

1. code change is pushed to GitHub
2. change deploys to staging
3. staging is tested and approved
4. same change is promoted/deployed to production

Important:

- testing directly against the live production environment is not recommended,
- the app should have at least one non-production Azure environment before the migration is considered complete.

## 11) What IT can change safely

These can change behind the scenes:

- hosting platform,
- storage provider,
- secret storage,
- SSL/certificate handling,
- network restrictions,
- backend implementation language/framework,
- Power Automate ownership.

## 12) What IT should not change without app rework

These should stay stable unless the app is intentionally rebuilt:

- read endpoint names,
- ingest endpoint names,
- JSON field names and nesting,
- session-cookie behavior expected by the frontend,
- rota/allocation snapshot model.

Most important point:

- do not replace the normalized JSON contract with direct raw-Excel reads unless a larger redevelopment is agreed.

## 13) Environment variables / secrets currently relevant

Auth:

- `AUTH_SIGNING_SECRET`
- `AUTH_MODE`
- `AUTH_USER_PIN_HASHES`
- `AUTH_MANAGER_NAMES`
- `AUTH_ALLOWED_NAMES`
- `AUTH_TOKEN_TTL_SECONDS`

Ingest:

- `API_INGEST_KEY`

Email:

- `RESEND_API_KEY`
- `PORTAL_EMAIL_FROM`

Storage:

- `BLOB_READ_WRITE_TOKEN`
- `BLOB_ACCESS_MODE`

## 14) Current important implementation files

Frontend/runtime:

- [`index_files/app.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/index_files/app.js)
- [`index_files/jet-data-layer.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/index_files/jet-data-layer.js)
- [`index_files/jet-data.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/index_files/jet-data.js)

Backend/API:

- [`api/rota-ingest.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/rota-ingest.js)
- [`api/rota-read.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/rota-read.js)
- [`api/rota-weeks.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/rota-weeks.js)
- [`api/allocation-ingest.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/allocation-ingest.js)
- [`api/allocation-read.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/allocation-read.js)
- [`api/_blob-json.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/_blob-json.js)
- [`api/_ingest-auth.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/_ingest-auth.js)
- [`api/_auth.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/_auth.js)
- [`api/auth-login.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/auth-login.js)
- [`api/auth-session.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/auth-session.js)
- [`api/auth-logout.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/auth-logout.js)
- [`api/send-request.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/send-request.js)
- [`api/swap-requests.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/swap-requests.js)
- [`api/swap-request-action.js`](/Users/k_ncube/Documents/Projects/jet-driver-portal/api/swap-request-action.js)

Office Scripts:

- [`office-scripts/publish-rota.ts`](/Users/k_ncube/Documents/Projects/jet-driver-portal/office-scripts/publish-rota.ts)
- [`office-scripts/publish-allocation.ts`](/Users/k_ncube/Documents/Projects/jet-driver-portal/office-scripts/publish-allocation.ts)

## 15) Plain-English summary for IT

The app already works by reading clean JSON snapshots, not raw Excel.

The safest migration is:

- keep that contract,
- move the infrastructure underneath it into Azure,
- let Excel / Power Automate continue publishing structured data to backend endpoints,
- let the backend write and read Azure storage instead of Vercel storage.

That gives the company:

- Azure ownership,
- Microsoft tenancy control,
- better governance and security oversight,
- minimal portal rewrite risk.
