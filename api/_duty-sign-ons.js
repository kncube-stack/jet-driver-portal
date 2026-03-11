// Static duty sign-on times extracted from DUTY_CARDS in index_files/jet-data.js
// Used as fallback in shift-reminder when allocation blob is unavailable for a date.
// Non-numeric duty codes (SP, PH, RL*, USP, etc.) are not present here — they correctly
// return undefined, which the cron treats as "no notification needed".
module.exports = {
  // ── A6 EARLY DUTIES (200 series) ──────────────────────
  201: "01:20",
  261: "01:20",
  202: "02:10",
  262: "02:10",
  203: "03:00",
  263: "03:00",
  204: "04:00",
  264: "04:00",
  205: "05:00",
  // ── A6 LATE DUTIES (200 series) ───────────────────────
  206: "12:05",
  266: "12:05",
  207: "13:05",
  267: "13:05",
  208: "14:05",
  268: "14:05",
  209: "15:05",
  269: "15:05",
  210: "16:05",
  270: "16:05",
  // ── ROUTE 302 EARLY DUTIES (300 series) ───────────────
  301: "03:30",
  302: "04:30",
  362: "04:30",
  303: "04:50",
  323: "04:50",
  363: "04:50",
  304: "05:45",
  324: "05:45",
  364: "05:45",
  // ── ROUTE 302 LATE DUTIES (300 series) ────────────────
  306: "12:35",
  366: "12:35",
  307: "12:35",
  327: "12:35",
  367: "12:35",
  347: "12:35",
  308: "13:35",
  328: "13:35",
  348: "13:35",
  368: "13:35",
  309: "14:05",
  329: "14:05",
  369: "14:05",
};
