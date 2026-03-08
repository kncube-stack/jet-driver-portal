// JET Driver Portal — Office Script: Publish Daily Allocation
// ─────────────────────────────────────────────────────────────
// HOW TO USE:
//   1. Open the daily allocation spreadsheet in Excel for the web (SharePoint).
//   2. Make sure the allocation sheet tab is active.
//   3. Open Automate → New Script, paste this file, save and Run.
//   4. Check the console output for SUCCESS or ERROR.
//
// CONFIGURATION — update INGEST_URL and API_KEY before first use.
// ─────────────────────────────────────────────────────────────

async function main(workbook: ExcelScript.Workbook): Promise<void> {
  // ── CONFIG ──────────────────────────────────────────────────
  const INGEST_URL = "https://YOUR-PORTAL-DOMAIN.vercel.app/api/allocation-ingest";
  const API_KEY = "YOUR_API_INGEST_KEY_HERE";
  // ────────────────────────────────────────────────────────────

  // ── STEP 1: get today's UK date ──────────────────────────────
  const date = getTodayUKDate();
  console.log(`Publishing allocation for ${date}`);

  // ── STEP 2: read the active sheet ────────────────────────────
  const sheet = workbook.getActiveWorksheet();
  const range = sheet.getUsedRange();
  if (!range) {
    console.log("ERROR: Sheet appears to be empty.");
    return;
  }
  // Use getTexts() so sign-on times come back as "01:20" strings
  // rather than Excel decimal fractions (e.g. 0.0556)
  const texts = range.getTexts();

  // ── STEP 3: find the header row ───────────────────────────────
  const headerInfo = findHeaderRow(texts);
  if (!headerInfo) {
    console.log(
      "ERROR: Could not find the header row. " +
      "Expected a row containing \"DUTIES\", \"VEHICLE\", \"DRIVER\", and \"SIGN ON\"."
    );
    return;
  }
  console.log(`Header row found at row index ${headerInfo.headerRowIdx}.`);

  // ── STEP 4: parse data rows ───────────────────────────────────
  const rows = parseRows(texts, headerInfo);
  if (rows.length === 0) {
    console.log("ERROR: No duty rows found below the header. Check the sheet layout.");
    return;
  }
  console.log(`Parsed ${rows.length} duty rows.`);

  // ── STEP 5: build allocation with handover relationships ──────
  const allocation = buildAllocation(rows);
  const dutyCount = Object.keys(allocation).length;

  // ── STEP 6: POST to /api/allocation-ingest ────────────────────
  const payload = { date, allocation };

  console.log(`Posting to ${INGEST_URL} ...`);

  let response: Response;
  try {
    response = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log(`ERROR: Network request failed — ${err}`);
    return;
  }

  let result: { ok: boolean; message?: string; error?: string };
  try {
    result = await response.json() as { ok: boolean; message?: string; error?: string };
  } catch {
    console.log(`ERROR: Server returned status ${response.status} with non-JSON body.`);
    return;
  }

  if (result.ok) {
    console.log(`SUCCESS: ${result.message}`);
  } else {
    console.log(`ERROR (${response.status}): ${result.error}`);
  }
}

// ── HELPERS ──────────────────────────────────────────────────

/** Returns today's date in YYYY-MM-DD format using the Europe/London timezone. */
function getTodayUKDate(): string {
  const parts = new Date()
    .toLocaleDateString("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/"); // "DD/MM/YYYY"
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

interface HeaderInfo {
  headerRowIdx: number;
  dutyCol: number;
  vehicleCol: number;
  driverCol: number;
  signOnCol: number;
}

/**
 * Scan the 2-D texts array for the header row.
 * Looks for a row that contains all four required headers.
 */
function findHeaderRow(texts: string[][]): HeaderInfo | null {
  for (let r = 0; r < texts.length; r++) {
    const row = texts[r].map(cell => cell.trim().toUpperCase());
    const dutyCol   = row.indexOf("DUTIES");
    const vehicleCol = row.indexOf("VEHICLE");
    const driverCol  = row.indexOf("DRIVER");
    const signOnCol  = row.indexOf("SIGN ON");
    if (dutyCol >= 0 && vehicleCol >= 0 && driverCol >= 0 && signOnCol >= 0) {
      return { headerRowIdx: r, dutyCol, vehicleCol, driverCol, signOnCol };
    }
  }
  return null;
}

interface AllocationRow {
  duty: number;
  vehicle: string;
  driver: string;
  signOn: string;
}

/**
 * Read data rows below the header row.
 * Skips any row where the duty cell is empty or not a plain number.
 */
function parseRows(texts: string[][], header: HeaderInfo): AllocationRow[] {
  const rows: AllocationRow[] = [];
  for (let r = header.headerRowIdx + 1; r < texts.length; r++) {
    const row = texts[r];
    const dutyRaw   = (row[header.dutyCol]   ?? "").trim();
    const vehicle   = (row[header.vehicleCol] ?? "").trim();
    const driver    = (row[header.driverCol]  ?? "").trim();
    const signOn    = (row[header.signOnCol]  ?? "").trim();

    if (!dutyRaw || !/^\d+$/.test(dutyRaw)) continue;
    if (!vehicle || !driver || !signOn) continue;

    rows.push({
      duty: parseInt(dutyRaw, 10),
      vehicle,
      driver,
      signOn,
    });
  }
  return rows;
}

interface DutyEntry {
  vehicle: string;
  driver: string;
  signOn: string;
  handoverTo?: { duty: number; driver: string; signOn: string };
  takeoverFrom?: { duty: number; driver: string; signOn: string };
}

/**
 * Group rows by vehicle to detect split-shift handover pairs.
 *
 * - One duty per vehicle  → no handover fields
 * - Two duties per vehicle → sort by sign-on; earlier gets handoverTo, later gets takeoverFrom
 * - Three+ per vehicle    → warning logged, no handover added for those duties
 */
function buildAllocation(rows: AllocationRow[]): Record<string, DutyEntry> {
  // Build base entries
  const allocation: Record<string, DutyEntry> = {};
  for (const row of rows) {
    allocation[String(row.duty)] = {
      vehicle: row.vehicle,
      driver: row.driver,
      signOn: row.signOn,
    };
  }

  // Group by vehicle
  const byVehicle: Record<string, AllocationRow[]> = {};
  for (const row of rows) {
    if (!byVehicle[row.vehicle]) byVehicle[row.vehicle] = [];
    byVehicle[row.vehicle].push(row);
  }

  for (const [vehicle, group] of Object.entries(byVehicle)) {
    if (group.length === 1) continue; // no handover

    if (group.length > 2) {
      console.log(
        `WARNING: Vehicle ${vehicle} appears ${group.length} times — ` +
        "expected at most 2. Skipping handover for these duties."
      );
      continue;
    }

    // Sort by sign-on time string (HH:MM lexicographic sort works correctly)
    group.sort((a, b) => a.signOn.localeCompare(b.signOn));
    const morning   = group[0];
    const afternoon = group[1];

    allocation[String(morning.duty)].handoverTo = {
      duty: afternoon.duty,
      driver: afternoon.driver,
      signOn: afternoon.signOn,
    };
    allocation[String(afternoon.duty)].takeoverFrom = {
      duty: morning.duty,
      driver: morning.driver,
      signOn: morning.signOn,
    };
  }

  return allocation;
}
