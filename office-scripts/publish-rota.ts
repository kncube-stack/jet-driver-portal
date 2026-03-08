// JET Driver Portal — Office Script: Publish Weekly Rota
// ─────────────────────────────────────────────────────────────
// HOW TO USE:
//   1. Open Rota.xlsx in Excel for the web (SharePoint).
//   2. Select the sheet tab for the week you want to publish (e.g. "WC 10.03.2025").
//   3. Open Automate → New Script, paste this file, save and Run.
//   4. Check the console output for SUCCESS or ERROR.
//
// CONFIGURATION — update INGEST_URL and API_KEY before first use.
// ─────────────────────────────────────────────────────────────

async function main(workbook: ExcelScript.Workbook): Promise<void> {
  // ── CONFIG ──────────────────────────────────────────────────
  const INGEST_URL = "https://YOUR-PORTAL-DOMAIN.vercel.app/api/rota-ingest";
  const API_KEY = "YOUR_API_INGEST_KEY_HERE";
  // ────────────────────────────────────────────────────────────

  // Section key map — must stay in sync with SECTION_KEY_MAP in jet-data.js
  const SECTION_KEY_MAP: Record<string, string | null> = {
    "Early A6": "early_a6",
    "Late A6": "late_a6",
    "Early Network": "early_network",
    "Late Network": "late_network",
    "Part Time Rota": "part_time",
    "Spare/Private Hire/Tour Drivers": "spare",
    "Work to cover": null,
    "Controllers": "controllers",
    "Cleaners (Fixed Nights)": "cleaners",
    "Shunters (4 ON / 4 OFF)": "shunters",
  };

  const SECTION_LABEL_MAP: Record<string, string> = {
    early_a6: "Early A6",
    late_a6: "Late A6",
    early_network: "Early Network",
    late_network: "Late Network",
    part_time: "Part Time",
    spare: "Spare / Private Hire / Tour",
    management: "Management Duties",
    controllers: "Controllers",
    cleaners: "Cleaners",
    shunters: "Shunters",
  };

  // ── STEP 1: auto-find the current week's rota sheet ─────────
  const sheet = findCurrentWeekSheet(workbook);
  if (!sheet) {
    console.log(
      "ERROR: Could not find a sheet tab for the current week (or next week). " +
      "Make sure the tab is named in the format \"WC DD.MM.YYYY\"."
    );
    return;
  }
  const tabName = sheet.getName();
  const weekCommencing = parseWeekCommencing(tabName)!;

  console.log(`Sheet: "${tabName}" → week commencing ${weekCommencing}`);

  // ── STEP 2: read the sheet values ────────────────────────────
  const range = sheet.getUsedRange();
  if (!range) {
    console.log("ERROR: Sheet appears to be empty.");
    return;
  }
  const values = range.getValues();

  // ── STEP 3: parse into sections + rota ───────────────────────
  const { sections, rota } = parseRota(values, SECTION_KEY_MAP, SECTION_LABEL_MAP);
  const driverCount = Object.keys(rota).length;

  if (driverCount === 0) {
    console.log("ERROR: No driver rows found. Check the sheet layout and section header names.");
    return;
  }

  console.log(`Parsed ${driverCount} drivers across ${sections.length} sections.`);

  // ── STEP 4: POST to /api/rota-ingest ─────────────────────────
  const payload = { weekCommencing, sections, rota };

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

/**
 * Scan all sheets for the current week's rota tab (format "WC DD.MM.YYYY").
 * Also checks next week so the button works when publishing ahead on Saturday.
 */
function findCurrentWeekSheet(workbook: ExcelScript.Workbook): ExcelScript.Worksheet | null {
  const now = new Date();
  const diffToMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMon);

  function wcKey(d: Date): string {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `WC ${dd}.${mm}.${d.getFullYear()}`;
  }

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const sheets = workbook.getWorksheets();
  for (const key of [wcKey(monday), wcKey(nextMonday)]) {
    const match = sheets.find(s => s.getName() === key);
    if (match) return match;
  }
  return null;
}

/** Convert "WC DD.MM.YYYY" tab name to "YYYY-MM-DD". Returns null if format doesn't match. */
function parseWeekCommencing(tabName: string): string | null {
  const match = tabName.match(/WC (\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

interface RotaSection {
  key: string;
  label: string;
  drivers: string[];
}

interface ParseResult {
  sections: RotaSection[];
  rota: Record<string, (string | null)[]>;
}

/**
 * Parse a 2-D array of cell values into { sections, rota }.
 *
 * Expected sheet layout (mirrors Google Sheets CSV structure):
 *   Section header row  — colA: section name (e.g. "Early A6"), colB: empty
 *   Driver row          — colA: driver name, colB: numeric staff no, colC-I: Mon–Sun duties
 *   Any other row       — skipped
 */
function parseRota(
  values: (string | number | boolean)[][],
  sectionKeyMap: Record<string, string | null>,
  sectionLabelMap: Record<string, string>
): ParseResult {
  const sections: RotaSection[] = [];
  const rota: Record<string, (string | null)[]> = {};
  const sectionIdxByKey: Record<string, number> = {};

  let currentSectionKey: string | null = null;
  let previousSectionKey: string | null = null;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const colA = String(row[0] ?? "").trim();
    const colB = String(row[1] ?? "").trim();

    // Section header: known section name in colA, colB empty
    if (colA && !colB && Object.prototype.hasOwnProperty.call(sectionKeyMap, colA)) {
      const key = sectionKeyMap[colA];
      currentSectionKey = key;
      if (key) {
        previousSectionKey = key;
        if (sectionIdxByKey[key] === undefined) {
          sectionIdxByKey[key] = sections.length;
          sections.push({ key, label: sectionLabelMap[key] ?? key, drivers: [] });
        }
      }
      continue;
    }

    // Driver row: colA = name, colB = numeric staff number
    if (!colA || !colB || !/^\d+$/.test(colB)) continue;

    const week: (string | null)[] = [];
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const v = String(row[dayIdx + 2] ?? "").trim();
      week.push(v === "" ? null : v);
    }

    rota[colA] = week;

    const resolvedSection = currentSectionKey ?? previousSectionKey;
    if (resolvedSection) {
      if (sectionIdxByKey[resolvedSection] === undefined) {
        sectionIdxByKey[resolvedSection] = sections.length;
        sections.push({
          key: resolvedSection,
          label: sectionLabelMap[resolvedSection] ?? resolvedSection,
          drivers: [],
        });
      }
      const sec = sections[sectionIdxByKey[resolvedSection]];
      if (!sec.drivers.includes(colA)) {
        sec.drivers.push(colA);
      }
    }
  }

  return { sections, rota };
}
