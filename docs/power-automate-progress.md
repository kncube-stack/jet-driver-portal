# Power Automate Progress (Handover)

Last updated: 06 March 2026 (UK time)

## Goal
Build a SharePoint-triggered flow that reads rota data from `Rota.xlsx`, converts it to clean JSON, and publishes it for the portal.

## Current status

### Completed
- Trigger created: **When a file is created or modified (properties only)**.
- Trigger scoped to:
  - Site: `Operations - https://jasonedwardstravel.sharepoint.com/sites/operations`
  - Library: `Documents`
  - Folder: `/Shared Documents/Jason Edwards Travel/Rota`
- Action added: **Get file metadata** using trigger `Identifier`.
- Variable initialized:
  - Name: `varCurrentPayload`
  - Type: `String`
  - Value: blank
- Action added: **List rows present in a table**
  - File: `/Jason Edwards Travel/Rota/Rota.xlsx`
  - Table: `RotaTable` (for current week test)
- Action added: **Select** (mapping driver/day fields).
- Action added: **Filter array** with input from Select output.
- Action added: **Set variable** for `varCurrentPayload` using `concat(...)` JSON expression.

### In progress / not fully confirmed
- Condition block was being reworked (old rows in `Condition 2` caused confusion).
- Output publishing destination not finalized:
  - Option A: SharePoint JSON file output (quick path)
  - Option B: App backend via HTTP (preferred long-term, requires premium HTTP action)

## Next session: exact steps

1. Replace/clean condition with one simple rule:
   - Left: `varCurrentPayload` (dynamic content)
   - Operator: `is not equal to`
   - Right: blank
2. In **True** branch, choose output path:
   - **Quick path (no premium):**
     - Add `Get file metadata using path`
       - Path: `/Shared Documents/Jason Edwards Travel/Rota/rota-live.json`
     - Add `Update file`
       - File Identifier: from previous step
       - File Content: `variables('varCurrentPayload')`
   - **Backend path (preferred later):**
     - Add `HTTP` POST to portal backend endpoint (if available in tenant).
3. Save flow.
4. Test manually by editing one cell in `Rota.xlsx`.
5. Check run history:
   - Confirm `List rows`, `Select`, `Filter array`, `Set variable`, and publish step all succeeded.

## Temporary testing note (tables)
- You created table-based setup for this week and next week for testing.
- Important: table names must be unique workbook-wide.
- Current method may require table switching for future weeks unless moved to:
  - Office Script method (no table dependency), or
  - Permanent `PortalFeed` sheet/table strategy.

## Decisions still needed
1. Final publish destination:
   - SharePoint JSON file (simpler now)
   - Backend API endpoint (more secure/robust)
2. Permanent rota extraction approach:
   - Keep table method (manual weekly maintenance)
   - Move to Office Script (recommended no-table long-term)

