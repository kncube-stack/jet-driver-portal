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

  // ── STEP 2: auto-find the allocation sheet ───────────────────
  const sheet = findAllocationSheet(workbook);
  if (!sheet) {
    console.log(
      "ERROR: Could not find the allocation sheet. " +
      "Make sure the sheet with DUTIES, VEHICLE, DRIVER, and SIGN ON columns is in this workbook."
    );
    return;
  }
  console.log(`Using sheet: "${sheet.getName()}"`);
  const range = sheet.getUsedRange();
  if (!range) {
    console.log("ERROR: Allocation sheet appears to be empty.");
    return;
  }
  // Use getTexts() so sign-on times come back as "01:20" strings
  // rather than Excel decimal fractions (e.g. 0.0556)
  const texts = range.getTexts();

  // ── STEP 3: find the main header row ─────────────────────────
  const headerInfo = findHeaderRow(texts);
  if (!headerInfo) {
    console.log(
      "ERROR: Could not find the header row. " +
      "Expected a row containing \"DUTIES\", \"VEHICLE\", \"DRIVER\", and \"SIGN ON\"."
    );
    return;
  }
  console.log(`Header row found at row index ${headerInfo.headerRowIdx}.`);

  // ── STEP 4: parse main duty rows ─────────────────────────────
  const rows = parseRows(texts, headerInfo);
  if (rows.length === 0) {
    console.log("ERROR: No duty rows found below the header. Check the sheet layout.");
    return;
  }
  console.log(`Parsed ${rows.length} duty rows.`);

  // ── STEP 5: build allocation with handover relationships ──────
  const allocation = buildAllocation(rows);

  // ── STEP 6: find and merge PH / AVR allocation ───────────────
  // The PH section lives to the right of the main section on the same
  // sheet, with its own distinct headers ("PH and AVR Vehicle", etc.).
  const phHeaderInfo = findPhHeaderRow(texts);
  if (phHeaderInfo) {
    const phRows = parsePhRows(texts, phHeaderInfo);
    console.log(`Parsed ${phRows.length} PH/AVR rows.`);
    phRows.forEach((row, i) => {
      // Use "ph_N" keys — the app matches drivers by name, not by key,
      // so any unique string key works fine here.
      allocation[`ph_${i}`] = {
        vehicle: row.vehicle,
        driver: row.driver,
        signOn: row.signOn,
        type: row.type,
      };
    });
  } else {
    console.log("No PH/AVR section found on this sheet — skipping.");
  }

  const dutyCount = Object.keys(allocation).length;

  // ── STEP 7: POST to /api/allocation-ingest ────────────────────
  const payload = { date, allocation };

  console.log(`Posting ${dutyCount} entries (duties + PH) to ${INGEST_URL} ...`);

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

/**
 * Scan all sheets for the one containing the allocation data
 * (identified by having DUTIES, VEHICLE, DRIVER, SIGN ON headers).
 */
function findAllocationSheet(workbook: ExcelScript.Workbook): ExcelScript.Worksheet | null {
  for (const sheet of workbook.getWorksheets()) {
    const range = sheet.getUsedRange();
    if (!range) continue;
    if (findHeaderRow(range.getTexts())) return sheet;
  }
  return null;
}

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

// ── MAIN SECTION TYPES & PARSERS ─────────────────────────────

interface HeaderInfo {
  headerRowIdx: number;
  dutyCol: number;
  vehicleCol: number;
  driverCol: number;
  signOnCol: number;
}

/**
 * Scan the 2-D texts array for the main header row.
 * Looks for a row that contains all four required headers.
 */
function findHeaderRow(texts: string[][]): HeaderInfo | null {
  for (let r = 0; r < texts.length; r++) {
    const row = texts[r].map(cell => cell.trim().toUpperCase());
    const dutyCol    = row.indexOf("DUTIES");
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
    const dutyRaw = (row[header.dutyCol]   ?? "").trim();
    const vehicle = (row[header.vehicleCol] ?? "").trim();
    const driver  = (row[header.driverCol]  ?? "").trim();
    const signOn  = (row[header.signOnCol]  ?? "").trim();

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
  type?: string; // "PH", "AVR", "NX" — only present for private hire entries
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

// ── PH / AVR SECTION TYPES & PARSERS ─────────────────────────

interface PhHeaderInfo {
  headerRowIdx: number;
  vehicleCol: number; // "PH and AVR Vehicle" column
  driverCol: number;
  signOnCol: number;
  typeCol: number;    // "PH / AVR / NX" column (-1 if not found)
}

/**
 * Find the Private Hire / AVR section header row.
 *
 * The PH section sits to the right of the main allocation on the same
 * sheet. Its unique identifier is a cell containing "PH" and "AVR" and
 * "VEHICLE" (e.g. "PH and AVR Vehicle"). Once that anchor column is
 * found, DRIVER and SIGN ON are located to its right on the same row.
 */
function findPhHeaderRow(texts: string[][]): PhHeaderInfo | null {
  for (let r = 0; r < texts.length; r++) {
    const row = texts[r].map(cell => cell.trim().toUpperCase());

    // Anchor: a cell that contains "PH", "AVR", and "VEHICLE"
    const vehicleCol = row.findIndex(
      c => c.includes("PH") && c.includes("AVR") && c.includes("VEHICLE")
    );
    if (vehicleCol < 0) continue;

    // Find DRIVER and SIGN ON to the right of the anchor
    let driverCol = -1;
    let signOnCol = -1;
    let typeCol   = -1;
    for (let c = vehicleCol + 1; c < row.length; c++) {
      const cell = row[c];
      if (cell === "DRIVER"  && driverCol < 0) driverCol = c;
      if (cell === "SIGN ON" && signOnCol < 0) signOnCol = c;
      // "PH / AVR / NX" or similar — contains "PH" and "AVR" but is not the vehicle col
      if (cell.includes("PH") && cell.includes("AVR") && typeCol < 0) typeCol = c;
    }

    if (driverCol >= 0 && signOnCol >= 0) {
      return { headerRowIdx: r, vehicleCol, driverCol, signOnCol, typeCol };
    }
  }
  return null;
}

interface PhRow {
  vehicle: string;
  driver: string;
  signOn: string;
  type: string; // "PH", "AVR", "NX", etc.
}

/**
 * Read PH/AVR data rows below the PH header row.
 * Skips rows where vehicle or driver are empty.
 */
function parsePhRows(texts: string[][], header: PhHeaderInfo): PhRow[] {
  const rows: PhRow[] = [];
  for (let r = header.headerRowIdx + 1; r < texts.length; r++) {
    const row     = texts[r];
    const vehicle = (row[header.vehicleCol] ?? "").trim();
    const driver  = (row[header.driverCol]  ?? "").trim();
    const signOn  = (row[header.signOnCol]  ?? "").trim();
    const type    = header.typeCol >= 0
      ? (row[header.typeCol] ?? "").trim().toUpperCase() || "PH"
      : "PH";

    if (!vehicle || !driver) continue;

    rows.push({ vehicle, driver, signOn, type });
  }
  return rows;
}
