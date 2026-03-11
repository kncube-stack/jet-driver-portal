const { getJsonBlob, putJsonBlob } = require("./_blob-json");

const TIMESHEETS_PATH = "timesheets/index.json";

async function loadTimesheets() {
  const blob = await getJsonBlob(TIMESHEETS_PATH);
  return blob ? (blob.data.timesheets || []) : [];
}

async function saveTimesheets(timesheets) {
  return putJsonBlob(TIMESHEETS_PATH, { timesheets });
}

/**
 * Upsert a timesheet record. Matches on driverName + weekCommencing.
 * entry: { id, driverName, weekCommencing, submittedAt, status: "submitted"|"reviewed", text }
 */
async function upsertTimesheet(entry) {
  const all = await loadTimesheets();
  const idx = all.findIndex(
    t => t.driverName === entry.driverName && t.weekCommencing === entry.weekCommencing
  );
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...entry };
  } else {
    all.push(entry);
  }
  await saveTimesheets(all);
  return all[idx >= 0 ? idx : all.length - 1];
}

/**
 * Returns a Set of driver names who have submitted a timesheet for the given week.
 */
async function getSubmittedDriversForWeek(weekCommencing) {
  const all = await loadTimesheets();
  return new Set(
    all
      .filter(t => t.weekCommencing === weekCommencing && t.status !== undefined)
      .map(t => t.driverName)
  );
}

module.exports = { loadTimesheets, saveTimesheets, upsertTimesheet, getSubmittedDriversForWeek };
