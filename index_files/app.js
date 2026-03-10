(function (window) {
  const { DUTY_CARDS, ACCESS_CONTROL } = window.JET_DATA;
  const {
    getTodayRunout,
    getDriverRunout,
    fetchLiveRota,
    fetchWeekRota,
    formatWeekCommencing,
    getStaffDirectorySections,
    buildEmptyRotaFromSections,
    buildDriverList,
    buildSectionLookup,
    normalizeStaffName,
    DAYS,
    SHORT_DAYS
  } = window.JET_DATA_LAYER;
  const {
    C: _defaultC,
    THEMES,
    isDutyNumber,
    getSpecialDuty,
    getStatusStyle
  } = window.JET_UI;

function readStoredSession() {
  try {
    const raw = localStorage.getItem("jet_session") || sessionStorage.getItem("jet_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name) return null;
    if (parsed.expiresAt && Date.now() > new Date(parsed.expiresAt).getTime()) return null;
    return {
      name: parsed.name,
      role: parsed.role === "manager" ? "manager" : "driver",
      token: typeof parsed.token === "string" ? parsed.token : "",
      expiresAt: parsed.expiresAt || null
    };
  } catch {
    return null;
  }
}
function writeSession(name, role, expiresAt) {
  try {
    const payload = JSON.stringify({
      name,
      role,
      expiresAt: expiresAt || null
    });
    localStorage.setItem("jet_session", payload);
    sessionStorage.setItem("jet_session", payload);
    localStorage.setItem("jet_user", name);
    localStorage.setItem("jet_auth", "1");
    sessionStorage.setItem("jet_user", name);
    sessionStorage.setItem("jet_auth", "1");
  } catch {}
}
function clearSession() {
  try {
    localStorage.removeItem("jet_session");
    localStorage.removeItem("jet_user");
    localStorage.removeItem("jet_auth");
    sessionStorage.removeItem("jet_session");
    sessionStorage.removeItem("jet_user");
    sessionStorage.removeItem("jet_auth");
  } catch {}
}
function normalizeNameSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function getNameSearchTokens(value) {
  const normalized = normalizeNameSearchText(value);
  return normalized ? normalized.split(" ") : [];
}
function getNameInitials(tokens) {
  return tokens.map(token => token[0]).join("");
}
function scoreDriverNameSearch(driverName, query) {
  const normalizedName = normalizeNameSearchText(driverName);
  const normalizedQuery = normalizeNameSearchText(query);
  if (!normalizedName || !normalizedQuery) return -1;
  const compactName = normalizedName.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const nameTokens = getNameSearchTokens(driverName);
  const queryTokens = getNameSearchTokens(query);
  if (normalizedName === normalizedQuery) return 1000;
  if (compactName === compactQuery) return 950;
  if (normalizedName.startsWith(normalizedQuery)) return 900;
  if (compactName.startsWith(compactQuery)) return 875;
  if (normalizedName.includes(normalizedQuery)) return 820;
  if (compactName.includes(compactQuery)) return 780;
  const initials = getNameInitials(nameTokens);
  if (initials && (initials === compactQuery || initials.startsWith(compactQuery))) return 760;
  let sequentialMatchCount = 0;
  let nameIndex = 0;
  for (const queryToken of queryTokens) {
    let matched = false;
    while (nameIndex < nameTokens.length) {
      const nameToken = nameTokens[nameIndex];
      nameIndex += 1;
      if (nameToken.startsWith(queryToken) || queryToken.length === 1 && nameToken[0] === queryToken || nameToken.includes(queryToken)) {
        sequentialMatchCount += 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      sequentialMatchCount = 0;
      break;
    }
  }
  if (sequentialMatchCount === queryTokens.length && sequentialMatchCount > 0) {
    return 700 + sequentialMatchCount * 10;
  }
  const overlapCount = queryTokens.filter(queryToken => nameTokens.some(nameToken => nameToken.startsWith(queryToken) || nameToken.includes(queryToken))).length;
  if (overlapCount > 0) return 600 + overlapCount * 10;
  return -1;
}
const AUTH_LOGIN_ENDPOINT = "/api/auth-login";
const AUTH_SESSION_ENDPOINT = "/api/auth-session";
const AUTH_LOGOUT_ENDPOINT = "/api/auth-logout";
const ALLOCATION_READ_ENDPOINT = "/api/allocation-read";
const SWAP_REQUESTS_ENDPOINT = "/api/swap-requests";
const SWAP_REQUEST_ACTION_ENDPOINT = "/api/swap-request-action";
const SEND_REQUEST_ENDPOINT = "/api/send-request";
const LEAVE_REQUESTS_ENDPOINT = "/api/leave-requests";
const LEAVE_REQUEST_ACTION_ENDPOINT = "/api/leave-request-action";
const LEAVE_MANAGERS = ["Alfie Hoque", "Errol Thomas"];
const BREAK_REMINDER_TEXT = "Ensure you have a 45 minute break";
const LEAVE_EMAIL_TO = "errol@jasonedwardstravel.co.uk";
const SWAP_EMAIL_TO = "operations@jasonedwardstravel.co.uk";
const TIMESHEET_EMAIL_TO = "errol@jasonedwardstravel.co.uk";
const TIMESHEET_DRAFTS_STORAGE_KEY = "jet_timesheet_drafts_v1";
const PADDINGTON_TRAVEL_COST = 6;
const VICTORIA_TRAVEL_COST = 9;
const WORKSHOP_DEFAULT_START_TIME = "08:00";
const WORKSHOP_DEFAULT_FINISH_TIME = "18:00";
const BREAK_STOP_IGNORE_TOKENS = new Set(["coach", "station", "bus", "stop", "stn", "arrivals", "arrival", "departures", "departure", "airport"]);
function isTimeValue(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}
function normalizeBreakStopText(value) {
  return String(value || "").toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function getBreakStopTokens(value) {
  return normalizeBreakStopText(value).split(" ").filter(token => token && !BREAK_STOP_IGNORE_TOKENS.has(token));
}
function areStopsEquivalentForBreak(stopA, stopB) {
  const tokensA = getBreakStopTokens(stopA);
  const tokensB = getBreakStopTokens(stopB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const setB = new Set(tokensB);
  const overlapCount = tokensA.filter(token => setB.has(token)).length;
  const requiredOverlap = Math.min(2, Math.min(tokensA.length, tokensB.length));
  if (overlapCount >= requiredOverlap) return true;
  const normalizedA = normalizeBreakStopText(stopA);
  const normalizedB = normalizeBreakStopText(stopB);
  if (!normalizedA || !normalizedB) return false;
  return normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
}
function getMinuteGapWithMidnightWrap(startMinutes, endMinutes) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;
  return endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
}
function buildBreakHintLookup(duty) {
  const lookup = new Map();
  if (!duty || !Array.isArray(duty.segments)) return lookup;
  const isA6Duty = String(duty.route || "").toLowerCase().includes("a6");
  const hasBreakReminder = Array.isArray(duty.reminders) && duty.reminders.some(reminder => String(reminder || "").trim() === BREAK_REMINDER_TEXT);
  if (!hasBreakReminder) return lookup;
  let lastArrival = null;
  duty.segments.forEach((segment, segmentIndex) => {
    const stops = Array.isArray(segment?.stops) ? segment.stops : [];
    stops.forEach((stop, stopIndex) => {
      const stopName = String(stop?.stop || "");
      const stopTime = String(stop?.time || "");
      const stopMinutes = parseTimeValueToMinutes(stopTime);
      if (stop?.dep && lastArrival && areStopsEquivalentForBreak(lastArrival.stopName, stopName)) {
        const gapMinutes = getMinuteGapWithMidnightWrap(lastArrival.timeMinutes, stopMinutes);
        if (gapMinutes !== null && gapMinutes >= 45) {
          let insertionIndex = stopIndex;
          if (isA6Duty) {
            for (let i = stopIndex - 1; i >= 0; i--) {
              const candidate = String(stops[i]?.stop || "").toLowerCase();
              if (candidate.includes("pull on stand")) {
                insertionIndex = i;
                break;
              }
            }
          }
          lookup.set(`${segmentIndex}:${insertionIndex}`, {
            location: stopName,
            arrivalTime: lastArrival.timeLabel,
            departureTime: stopTime
          });
        }
        lastArrival = null;
      }
      if (stop?.arr) {
        lastArrival = {
          stopName,
          timeMinutes: stopMinutes,
          timeLabel: stopTime
        };
      }
    });
  });
  return lookup;
}
function getVisibleDutyReminders(duty) {
  const reminders = Array.isArray(duty?.reminders) ? duty.reminders : [];
  return reminders.filter(reminder => String(reminder || "").trim() !== BREAK_REMINDER_TEXT);
}
function parseTimeValueToMinutes(value) {
  if (!isTimeValue(value)) return null;
  const [hh, mm] = String(value).split(":");
  return parseInt(hh, 10) * 60 + parseInt(mm, 10);
}
function getDurationMinutes(startTime, finishTime) {
  const start = parseTimeValueToMinutes(startTime);
  const finish = parseTimeValueToMinutes(finishTime);
  if (start === null || finish === null) return 0;
  let diff = finish - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}
function formatDurationLabel(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}
function formatMoneyPounds(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return `£${amount.toFixed(2)}`;
}
function collectDutyReferenceText(dutyCard) {
  if (!dutyCard) return "";
  const parts = [String(dutyCard.route || "")];
  if (Array.isArray(dutyCard.segments)) {
    dutyCard.segments.forEach(segment => {
      parts.push(String(segment?.title || ""));
      if (Array.isArray(segment?.stops)) {
        segment.stops.forEach(stop => {
          parts.push(String(stop?.stop || ""));
        });
      }
    });
  }
  return parts.join(" ").toLowerCase();
}
function resolveDutyTimesFromCard(dutyCard) {
  if (!dutyCard) return {
    startTime: "",
    finishTime: ""
  };
  const startTime = isTimeValue(dutyCard.signOn) ? dutyCard.signOn : "";
  const finishTime = isTimeValue(dutyCard.signOff) ? dutyCard.signOff : "";
  if (startTime && finishTime) {
    return {
      startTime,
      finishTime
    };
  }
  const timedStops = Array.isArray(dutyCard.segments) ? dutyCard.segments.flatMap(segment => Array.isArray(segment?.stops) ? segment.stops : []).filter(stop => isTimeValue(stop?.time)) : [];
  return {
    startTime: startTime || (timedStops[0]?.time || ""),
    finishTime: finishTime || (timedStops[timedStops.length - 1]?.time || "")
  };
}
function inferDutyTravelCost(dutyCard) {
  if (!dutyCard) return 0;
  const dutyRefText = collectDutyReferenceText(dutyCard);
  if (dutyRefText.includes("paddington")) return PADDINGTON_TRAVEL_COST;
  if (dutyRefText.includes("victoria")) return VICTORIA_TRAVEL_COST;
  return VICTORIA_TRAVEL_COST;
}
function isAvrOrPrivateHireDutyCode(value) {
  const code = String(value || "").toUpperCase().trim();
  if (!code) return false;
  if (code.includes("AVR")) return true;
  if (/^PH\b/.test(code) || code.startsWith("PH")) return true;
  if (/^P\d+/.test(code)) return true;
  return false;
}
function getTimesheetDraftEntryKey(driverName, weekTabName) {
  const safeDriver = String(driverName || "").trim().toLowerCase();
  const safeWeek = String(weekTabName || "").trim().toUpperCase();
  if (!safeDriver || !safeWeek) return "";
  return `${safeDriver}::${safeWeek}`;
}
function readTimesheetDraftStore() {
  try {
    const raw = localStorage.getItem(TIMESHEET_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}
function writeTimesheetDraftStore(store) {
  try {
    localStorage.setItem(TIMESHEET_DRAFTS_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}
function normalizeTimesheetTravelCost(value, fallback) {
  if (value === "" || value === null || value === undefined) return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}
function normalizeTimesheetExpenseAmount(value, fallback) {
  if (value === "" || value === null || value === undefined) return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}
function createEmptyTimesheetExpense(id, date = "") {
  return {
    id,
    date: normalizeTimesheetExpenseDate(date),
    description: "",
    amount: ""
  };
}
function normalizeTimesheetExpenseDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}
function normalizeTimesheetExpenseList(expenses, fallbackDate = "") {
  if (!Array.isArray(expenses) || expenses.length === 0) return [];
  const normalizedFallbackDate = normalizeTimesheetExpenseDate(fallbackDate);
  return expenses.map((expense, index) => {
    const fallbackId = index + 1;
    const rawId = Number(expense?.id);
    return {
      id: Number.isInteger(rawId) && rawId > 0 ? rawId : fallbackId,
      date: normalizeTimesheetExpenseDate(expense?.date) || normalizedFallbackDate,
      description: String(expense?.description || "").trim(),
      amount: normalizeTimesheetExpenseAmount(expense?.amount, "")
    };
  });
}
function getIsoDateWithDayOffset(isoValue, dayOffset) {
  const match = String(isoValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10) - 1, Number.parseInt(match[3], 10));
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(dayOffset || 0));
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function getTimesheetRowIsoDate(weekTabName, dayIndex) {
  const mondayIso = parseWeekTabNameToIso(weekTabName);
  if (!mondayIso || !Number.isInteger(dayIndex) || dayIndex < 0) return "";
  return getIsoDateWithDayOffset(mondayIso, dayIndex);
}
function formatTimesheetRowDateLabel(isoValue) {
  const match = String(isoValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10) - 1, Number.parseInt(match[3], 10));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
function buildLegacyTimesheetExpenseDayMap(expenses, baseRows) {
  const normalizedExpenses = normalizeTimesheetExpenseList(expenses);
  if (normalizedExpenses.length === 0 || !Array.isArray(baseRows) || baseRows.length === 0) return new Map();
  const dayIndexByDate = new Map(baseRows.map(row => [normalizeTimesheetExpenseDate(row?.rowDate), row.dayIndex]));
  const fallbackDayIndex = Number.isInteger(baseRows[0]?.dayIndex) ? baseRows[0].dayIndex : 0;
  const buckets = new Map();
  normalizedExpenses.forEach((expense, index) => {
    const mappedDayIndex = dayIndexByDate.get(expense.date) ?? fallbackDayIndex;
    const nextExpense = {
      id: index + 1,
      date: expense.date || normalizeTimesheetExpenseDate(baseRows.find(row => row.dayIndex === mappedDayIndex)?.rowDate),
      description: expense.description,
      amount: expense.amount
    };
    if (!buckets.has(mappedDayIndex)) buckets.set(mappedDayIndex, []);
    buckets.get(mappedDayIndex).push(nextExpense);
  });
  return buckets;
}
function hydrateTimesheetRowsFromDraft(baseRows, draftRows, legacyExpenses) {
  if (!Array.isArray(baseRows) || baseRows.length === 0 || !Array.isArray(draftRows)) return baseRows;
  const byDay = new Map();
  const legacyExpenseDayMap = buildLegacyTimesheetExpenseDayMap(legacyExpenses, baseRows);
  for (const row of draftRows) {
    const dayIndex = Number(row?.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= baseRows.length) continue;
    byDay.set(dayIndex, row);
  }
  return baseRows.map(baseRow => {
    const draft = byDay.get(baseRow.dayIndex);
    if (!draft) return baseRow;
    const draftDutyCode = String(draft.dutyCode || "").trim();
    const baseDutyCode = String(baseRow.dutyCode || "").trim();
    if (draftDutyCode && baseDutyCode && draftDutyCode !== baseDutyCode) return baseRow;
    const startTime = isTimeValue(draft.startTime) ? draft.startTime : "";
    const finishTime = isTimeValue(draft.finishTime) ? draft.finishTime : "";
    const normalizedExpenses = normalizeTimesheetExpenseList(draft.expenses, baseRow.rowDate);
    return {
      ...baseRow,
      startTime,
      finishTime,
      travelCost: normalizeTimesheetTravelCost(draft.travelCost, baseRow.travelCost),
      expenses: normalizedExpenses.length > 0 ? normalizedExpenses : normalizeTimesheetExpenseList(legacyExpenseDayMap.get(baseRow.dayIndex), baseRow.rowDate)
    };
  });
}
function readTimesheetDraftData(driverName, weekTabName, baseRows) {
  const key = getTimesheetDraftEntryKey(driverName, weekTabName);
  if (!key) return {
    rows: baseRows
  };
  const store = readTimesheetDraftStore();
  const entry = store[key];
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.rows)) return {
    rows: baseRows
  };
  return {
    rows: hydrateTimesheetRowsFromDraft(baseRows, entry.rows, entry.expenses)
  };
}
function saveTimesheetDraftData(driverName, weekTabName, rows) {
  const key = getTimesheetDraftEntryKey(driverName, weekTabName);
  if (!key || !Array.isArray(rows) || rows.length === 0) return;
  const compactRows = rows.map(row => ({
    dayIndex: row.dayIndex,
    dutyCode: String(row.dutyCode || "").trim(),
    startTime: row.startTime || "",
    finishTime: row.finishTime || "",
    travelCost: row.travelCost === "" || row.travelCost === null || row.travelCost === undefined ? "" : normalizeTimesheetTravelCost(row.travelCost, ""),
    expenses: normalizeTimesheetExpenseList(row.expenses, row.rowDate).map(expense => ({
      id: expense.id,
      date: normalizeTimesheetExpenseDate(expense.date) || normalizeTimesheetExpenseDate(row.rowDate),
      description: expense.description,
      amount: expense.amount === "" ? "" : normalizeTimesheetExpenseAmount(expense.amount, "")
    }))
  }));
  const store = readTimesheetDraftStore();
  store[key] = {
    rows: compactRows,
    updatedAt: Date.now()
  };
  const allKeys = Object.keys(store);
  if (allKeys.length > 100) {
    allKeys.sort((a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0));
    for (let i = 0; i < allKeys.length - 100; i++) {
      delete store[allKeys[i]];
    }
  }
  writeTimesheetDraftStore(store);
}
function clearTimesheetDraftRows(driverName, weekTabName) {
  const key = getTimesheetDraftEntryKey(driverName, weekTabName);
  if (!key) return;
  const store = readTimesheetDraftStore();
  if (!Object.prototype.hasOwnProperty.call(store, key)) return;
  delete store[key];
  writeTimesheetDraftStore(store);
}
async function loginWithServer(name, pin) {
  const response = await fetch(AUTH_LOGIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      name,
      pin
    })
  });
  let data = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok || !data?.ok || !data?.session?.name) {
    throw new Error(data?.error || "Unable to sign in.");
  }
  return data.session;
}
async function verifyServerSession(token = "") {
  let response = null;
  let data = null;
  let lastNetworkError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      response = await fetch(AUTH_SESSION_ENDPOINT, {
        method: "POST",
        headers,
        credentials: "same-origin",
        cache: "no-store"
      });
    } catch (error) {
      lastNetworkError = error;
      if (attempt === 0) continue;
      const networkError = new Error("Unable to verify session right now.");
      networkError.code = "SESSION_NETWORK_ERROR";
      networkError.cause = error;
      throw networkError;
    }
    data = null;
    try {
      data = await response.json();
    } catch {}
    if (response.status >= 500 && attempt === 0) continue;
    break;
  }
  if (!response) {
    const networkError = new Error("Unable to verify session right now.");
    networkError.code = "SESSION_NETWORK_ERROR";
    if (lastNetworkError) networkError.cause = lastNetworkError;
    throw networkError;
  }
  if (response.status === 401 || response.status === 403) {
    const invalidError = new Error(data?.error || "Session expired. Please sign in again.");
    invalidError.code = "SESSION_INVALID";
    invalidError.status = response.status;
    throw invalidError;
  }
  if (!response.ok || !data?.ok || !data?.session?.name) {
    const unavailableError = new Error(data?.error || `Session verification unavailable (${response.status}).`);
    unavailableError.code = "SESSION_UNAVAILABLE";
    unavailableError.status = response.status;
    throw unavailableError;
  }
  return data.session;
}
async function logoutServerSession() {
  await fetch(AUTH_LOGOUT_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store"
  }).catch(() => null);
}
async function fetchLiveAllocationData() {
  try {
    const response = await fetch(ALLOCATION_READ_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || !data.ok || !data.allocation || typeof data.allocation !== "object") return null;
    return Object.entries(data.allocation).reduce((acc, [dutyNum, info]) => {
      if (!info || typeof info !== "object") return acc;
      acc[dutyNum] = {
        ...info,
        driver: normalizeStaffName(info.driver),
        handoverTo: info.handoverTo ? {
          ...info.handoverTo,
          driver: normalizeStaffName(info.handoverTo.driver)
        } : null,
        takeoverFrom: info.takeoverFrom ? {
          ...info.takeoverFrom,
          driver: normalizeStaffName(info.takeoverFrom.driver)
        } : null
      };
      return acc;
    }, {});
  } catch {
    return null;
  }
}
async function fetchSwapRequests() {
  const response = await fetch(SWAP_REQUESTS_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !Array.isArray(data.requests)) {
    throw new Error(data?.error || "Unable to load swap requests right now.");
  }
  return data.requests;
}
async function createSwapRequest(payload) {
  const response = await fetch(SWAP_REQUESTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ payload })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data?.request) {
    throw new Error(data?.error || "Unable to create swap request right now.");
  }
  return data.request;
}
async function updateSwapRequestAction(id, action) {
  const response = await fetch(SWAP_REQUEST_ACTION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      id,
      action
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data?.request) {
    throw new Error(data?.error || "Unable to update swap request right now.");
  }
  return data.request;
}
async function fetchLeaveRequests() {
  const response = await fetch(LEAVE_REQUESTS_ENDPOINT, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to load leave requests.");
  }
  return data.requests;
}
async function updateLeaveRequestAction(id, action) {
  const response = await fetch(LEAVE_REQUESTS_ENDPOINT, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      id,
      action
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data?.request) {
    throw new Error(data?.error || "Unable to update leave request right now.");
  }
  return data.request;
}
async function fetchCalendarRequests() {
  try {
    const response = await fetch(LEAVE_REQUESTS_ENDPOINT + "?calendar=1", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) return [];
    return Array.isArray(data.requests) ? data.requests : [];
  } catch {
    return [];
  }
}
function countPendingSwapApprovals(requests, driverName) {
  if (!driverName || !Array.isArray(requests)) return 0;
  return requests.filter(request => request.status === "pending" && request.targetDriver === driverName).length;
}
function formatSwapWeekLabel(weekCommencing) {
  const match = String(weekCommencing || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(weekCommencing || "");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  return `w/c ${Number.parseInt(match[3], 10)} ${months[monthIndex] || match[2]} ${match[1]}`;
}
function parseWeekTabNameToIso(tabName) {
  const match = String(tabName || "").match(/^WC (\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}
function formatSwapDateTime(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}
function formatSwapExpiryLabel(isoValue) {
  const date = new Date(isoValue);
  const millis = date.getTime() - Date.now();
  if (!Number.isFinite(millis)) return "";
  if (millis <= 0) return "Expired";
  const totalMinutes = Math.ceil(millis / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor(totalMinutes % (60 * 24) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Expires in ${days}d ${hours}h`;
  if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
  return `Expires in ${minutes}m`;
}
const STOP_DIRECTORY = Array.isArray(window.JET_STOP_DIRECTORY) ? window.JET_STOP_DIRECTORY : [];
const STOP_OPERATION_PATTERNS = [/^sign on/i, /^sign off/i, /^empty to/i, /^take over/i, /^hand over/i, /^pull on stand/i, /^travel on tube/i, /^arrive for loading/i];
const STOP_TOKEN_IGNORE = new Set(["the", "and", "to", "for", "of", "at", "in", "on", "bus", "station", "stn", "road", "rd", "stop", "coach", "stops", "nr", "near", "opp", "opposite", "o", "s", "bay", "bays", "lower", "upper", "airport"]);
const STOP_MATCH_OVERRIDES = {
  A6: [{
    matchTokens: ["baker", "street", "gloucester"],
    targetTokens: ["baker", "street", "stop", "a"]
  }],
  "025": [{
    matchTokens: ["victoria", "coach", "station"],
    targetTokens: ["victoria", "coach", "station"]
  }, {
    matchTokens: ["heathrow", "central", "bus", "station"],
    targetTokens: ["heathrow", "central", "bus", "station"]
  }, {
    matchTokens: ["heathrow", "terminal", "5"],
    targetTokens: ["heathrow", "t5", "arrivals"]
  }, {
    matchTokens: ["gatwick", "north", "terminal"],
    targetTokens: ["gatwick", "north", "lower", "forecourt"]
  }, {
    matchTokens: ["gatwick", "south", "terminal"],
    targetTokens: ["gatwick", "south", "lower", "forecourt"]
  }, {
    matchTokens: ["patcham", "black", "lion"],
    targetTokens: ["patcham", "miller", "carter"]
  }, {
    matchTokens: ["withdean", "deneway"],
    targetTokens: ["withdean", "deneway"]
  }, {
    matchTokens: ["preston", "circus", "london", "road"],
    targetTokens: ["preston", "circus", "stop", "h"]
  }, {
    matchTokens: ["preston", "circus", "carters"],
    targetTokens: ["preston", "circus", "stop", "x"]
  }, {
    matchTokens: ["preston", "park", "hotel"],
    targetTokens: ["preston", "park", "hotel"]
  }, {
    matchTokens: ["preston", "park", "sainsburys"],
    targetTokens: ["preston", "park", "lauriston", "road"]
  }, {
    matchTokens: ["york", "place", "st", "peters", "church"],
    targetTokens: ["old", "steine", "s4"]
  }, {
    matchTokens: ["brighton", "pool", "valley"],
    targetTokens: ["old", "steine", "s4"]
  }],
  "400": [{
    matchTokens: ["victoria", "coach", "station"],
    targetTokens: ["victoria", "coach", "station"]
  }, {
    matchTokens: ["greenford", "middleston", "avenue"],
    targetTokens: ["greenford", "oldfield", "lane"]
  }, {
    matchTokens: ["greenford", "roundabout"],
    targetTokens: ["greenford", "oldfield", "lane"]
  }, {
    matchTokens: ["north", "acton", "friary", "road"],
    targetTokens: ["north", "acton", "friary", "road"]
  }, {
    matchTokens: ["marble", "arch", "park", "lane"],
    targetTokens: ["marble", "arch", "park", "lane"]
  }, {
    matchTokens: ["birmingham", "digbeth"],
    targetTokens: ["birmingham", "digbeth"]
  }, {
    matchTokens: ["coventry", "pool", "meadow"],
    targetTokens: ["coventry", "pool", "meadow"]
  }, {
    matchTokens: ["golders", "green", "stop", "ge"],
    targetTokens: ["golders", "green", "stop", "ge"]
  }]
};
function parseDutyRouteCode(duty) {
  const routeLabel = String(duty?.route || "");
  const match = routeLabel.match(/\b(A\d+|\d{3})\b/);
  return match ? match[1] : "";
}
function normalizeStopText(value) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/\bstn\b/g, "station").replace(/\brd\b/g, "road").replace(/\bnr\b/g, "near").replace(/\bopp\b/g, "opposite").replace(/\bo\/s\b/g, "opposite").replace(/[^a-z0-9]+/g, " ").trim();
}
function tokenizeStopText(value) {
  return normalizeStopText(value).split(" ").filter(token => token && !STOP_TOKEN_IGNORE.has(token));
}
function extractStopCodes(value) {
  const normalized = normalizeStopText(value);
  const codes = new Set();
  const codeRegex = /\bstop\s+([a-z]\d{0,2}|\d{1,2}[a-z]?)\b/g;
  let match;
  while ((match = codeRegex.exec(normalized)) !== null) {
    codes.add(match[1]);
  }
  return codes;
}
function isOperationalStop(stopName) {
  const label = String(stopName || "").trim();
  if (!label) return true;
  return STOP_OPERATION_PATTERNS.some(pattern => pattern.test(label));
}
function inferDirectionHint(routeCode, segmentTitle) {
  const seg = normalizeStopText(segmentTitle);
  if (!seg) return "";
  const findIndex = term => seg.indexOf(term);
  if (routeCode === "A6" && seg.includes("paddington") && seg.includes("stansted")) {
    return findIndex("paddington") < findIndex("stansted") ? "To Stansted" : "To Paddington";
  }
  if (routeCode === "025" && seg.includes("victoria") && seg.includes("brighton")) {
    return findIndex("victoria") < findIndex("brighton") ? "VCS to Brighton" : "Brighton to VCS";
  }
  if (routeCode === "400" && seg.includes("victoria") && seg.includes("birmingham")) {
    return findIndex("victoria") < findIndex("birmingham") ? "London to Birmingham" : "Birmingham to London";
  }
  return "";
}
const ROUTE_STOP_DIRECTORY = STOP_DIRECTORY.reduce((acc, row) => {
  const routeCode = String(row?.route || "").trim();
  if (!routeCode) return acc;
  if (!acc[routeCode]) acc[routeCode] = [];
  const dutyLabel = String(row?.dutyCardLabel || row?.displayName || "").trim();
  const displayLabel = String(row?.displayName || row?.dutyCardLabel || "").trim();
  const normalizedDuty = normalizeStopText(dutyLabel);
  const normalizedDisplay = normalizeStopText(displayLabel);
  const latitude = Number.parseFloat(row?.latitude);
  const longitude = Number.parseFloat(row?.longitude);
  const defaultUrl = Number.isFinite(latitude) && Number.isFinite(longitude) ? `https://www.google.com/maps?q=${latitude},${longitude}` : "";
  acc[routeCode].push({
    route: routeCode,
    direction: String(row?.direction || "").trim(),
    dutyCardLabel: dutyLabel,
    displayName: displayLabel,
    postcode: String(row?.postcode || "").trim(),
    latitude,
    longitude,
    webUrl: String(row?.googleMapsUrl || "").trim() || defaultUrl,
    normalizedDuty,
    normalizedDisplay,
    tokens: Array.from(new Set([...tokenizeStopText(dutyLabel), ...tokenizeStopText(displayLabel)])),
    stopCodes: extractStopCodes(`${dutyLabel} ${displayLabel}`)
  });
  return acc;
}, {});
function containsAllTokens(text, tokens) {
  return tokens.every(token => text.includes(token));
}
function findOverrideEntry(routeCode, normalizedStop, entries) {
  const overrides = STOP_MATCH_OVERRIDES[routeCode] || [];
  for (const override of overrides) {
    if (!containsAllTokens(normalizedStop, override.matchTokens)) continue;
    const matched = entries.find(entry => {
      const dutyText = entry.normalizedDuty;
      const displayText = entry.normalizedDisplay;
      return containsAllTokens(dutyText, override.targetTokens) || containsAllTokens(displayText, override.targetTokens);
    });
    if (matched) return matched;
  }
  return null;
}
function scoreDirectoryCandidate(normalizedStop, stopTokens, stopCodes, candidate, directionHint) {
  if (normalizedStop === candidate.normalizedDuty || normalizedStop === candidate.normalizedDisplay) {
    return 100;
  }
  let score = 0;
  if (candidate.normalizedDuty.includes(normalizedStop) || candidate.normalizedDisplay.includes(normalizedStop) || normalizedStop.includes(candidate.normalizedDuty) || normalizedStop.includes(candidate.normalizedDisplay)) {
    score += 0.3;
  }
  const candidateTokenSet = new Set(candidate.tokens);
  const overlap = stopTokens.filter(token => candidateTokenSet.has(token));
  const unionCount = new Set([...stopTokens, ...candidate.tokens]).size || 1;
  score += overlap.length / unionCount;
  if (stopCodes.size > 0 && candidate.stopCodes.size > 0) {
    const codesMatch = Array.from(stopCodes).some(code => candidate.stopCodes.has(code));
    score += codesMatch ? 0.3 : -0.2;
  }
  if (directionHint && candidate.direction === directionHint) score += 0.08;
  if (overlap.length >= 2) score += 0.08;
  return score;
}
function selectDirectoryEntry(stopName, duty, segmentTitle) {
  const routeCode = parseDutyRouteCode(duty);
  if (!routeCode || routeCode === "450") return null;
  const routeEntries = ROUTE_STOP_DIRECTORY[routeCode] || [];
  if (routeEntries.length === 0) return null;
  if (isOperationalStop(stopName)) return null;
  const normalizedStop = normalizeStopText(stopName);
  if (!normalizedStop) return null;
  const directionHint = inferDirectionHint(routeCode, segmentTitle);
  const directionalEntries = directionHint ? routeEntries.filter(entry => entry.direction === directionHint) : [];
  const entries = directionalEntries.length > 0 ? directionalEntries : routeEntries;
  const exactMatch = entries.find(entry => entry.normalizedDuty === normalizedStop || entry.normalizedDisplay === normalizedStop);
  if (exactMatch) return exactMatch;
  const overrideMatch = findOverrideEntry(routeCode, normalizedStop, entries);
  if (overrideMatch) return overrideMatch;
  const stopTokens = tokenizeStopText(stopName);
  if (stopTokens.length === 0) return null;
  const stopCodes = extractStopCodes(stopName);
  let bestEntry = null;
  let bestScore = -Infinity;
  for (const entry of entries) {
    const score = scoreDirectoryCandidate(normalizedStop, stopTokens, stopCodes, entry, directionHint);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  if (!bestEntry) return null;
  if (bestScore < 0.34) return null;
  return bestEntry;
}
function resolveStopMapTarget(stopName, duty, segmentTitle) {
  const label = String(stopName || "").trim();
  const matchedEntry = selectDirectoryEntry(label, duty, segmentTitle);
  if (matchedEntry) {
    const query = Number.isFinite(matchedEntry.latitude) && Number.isFinite(matchedEntry.longitude) ? String(matchedEntry.latitude) + "," + String(matchedEntry.longitude) : matchedEntry.displayName || label;
    const fallbackUrl = matchedEntry.webUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    return {
      label: matchedEntry.displayName || matchedEntry.dutyCardLabel || label,
      query,
      latitude: matchedEntry.latitude,
      longitude: matchedEntry.longitude,
      webUrl: fallbackUrl
    };
  }
  return {
    label,
    query: label,
    latitude: null,
    longitude: null,
    webUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`
  };
}
function getPreferredMapsAppUrl(target) {
  const ua = (navigator.userAgent || "").toLowerCase();
  const label = target?.label || target?.query || "Stop";
  const hasCoordinates = Number.isFinite(target?.latitude) && Number.isFinite(target?.longitude);
  const coordinateQuery = hasCoordinates ? String(target.latitude) + "," + String(target.longitude) : label;
  if (ua.includes("android")) {
    const androidQuery = hasCoordinates ? String(target.latitude) + "," + String(target.longitude) + " (" + label + ")" : label;
    return `geo:0,0?q=${encodeURIComponent(androidQuery)}`;
  }
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return `comgooglemaps://?q=${encodeURIComponent(coordinateQuery)}`;
  }
  return target?.webUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}
function openStopInPreferredMapsApp(event, target) {
  if (!event || !target) return;
  const ua = (navigator.userAgent || "").toLowerCase();
  const isMobile = ua.includes("android") || ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
  const isStandaloneMode = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (!isMobile) return;
  event.preventDefault();
  const appUrl = getPreferredMapsAppUrl(target);
  const fallbackUrl = target.webUrl;
  let fallbackTimer = null;
  let handoffToAppDetected = false;
  const cleanup = () => {
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("blur", handleBlur);
  };
  const markHandoff = () => {
    handoffToAppDetected = true;
    cleanup();
  };
  const handleVisibility = () => {
    if (document.hidden) {
      markHandoff();
    }
  };
  const handlePageHide = () => {
    markHandoff();
  };
  const handleBlur = () => {
    markHandoff();
  };
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide, {
    once: true
  });
  window.addEventListener("blur", handleBlur, {
    once: true
  });
  fallbackTimer = window.setTimeout(() => {
    cleanup();
    if (!handoffToAppDetected && fallbackUrl) {
      // Fallback in the same tab avoids the iOS blank interim tab issue.
      window.location.replace(fallbackUrl);
    }
  }, isStandaloneMode ? 2200 : 1400);
  window.location.href = appUrl;
}
function openNativeDatePicker(input) {
  if (!input) return;
  try {
    input.focus();
    if (typeof input.showPicker === "function") input.showPicker();
  } catch {}
}

// ─── APP ────────────────────────────────────────────────────────
function App() {
  const storedSession = React.useMemo(() => readStoredSession(), []);
  const [authed, setAuthed] = React.useState(() => !!storedSession?.name);
  const [sessionVerifying, setSessionVerifying] = React.useState(true);
  const [authName, setAuthName] = React.useState("");
  const [authPin, setAuthPin] = React.useState("");
  const [authError, setAuthError] = React.useState("");
  const [authLoading, setAuthLoading] = React.useState(false);
  const [currentRole, setCurrentRole] = React.useState(() => storedSession?.role || "driver");
  const [screen, setScreen] = React.useState(() => {
    return storedSession?.name ? "week" : "home";
  });
  const [selectedDriver, setSelectedDriver] = React.useState(() => {
    return storedSession?.name || null;
  });
  const [selectedDuty, setSelectedDuty] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [dutySearch, setDutySearch] = React.useState("");
  const [showDutyLookup, setShowDutyLookup] = React.useState(false);
  const [dutyLookupSource, setDutyLookupSource] = React.useState(false);
  const [showWeekMenu, setShowWeekMenu] = React.useState(false);
  const [leaveForm, setLeaveForm] = React.useState({
    dateFrom: "",
    dateTo: "",
    reason: "",
    notes: "",
    email: ""
  });
  const [leaveSubmitted, setLeaveSubmitted] = React.useState(false);
  const [leaveSending, setLeaveSending] = React.useState(false);
  const [leaveError, setLeaveError] = React.useState("");
  const [swapForm, setSwapForm] = React.useState({
    dayIndex: "",
    targetDriver: "",
    notes: ""
  });
  const [swapSubmitted, setSwapSubmitted] = React.useState(false);
  const [swapSending, setSwapSending] = React.useState(false);
  const [swapError, setSwapError] = React.useState("");
  const [swapBadgeCount, setSwapBadgeCount] = React.useState(0);
  const [swapRequests, setSwapRequests] = React.useState([]);
  const [swapRequestsLoading, setSwapRequestsLoading] = React.useState(false);
  const [swapRequestsError, setSwapRequestsError] = React.useState("");
  const [swapActionPending, setSwapActionPending] = React.useState("");
  const [leaveRequests, setLeaveRequests] = React.useState([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = React.useState(false);
  const [leaveRequestsError, setLeaveRequestsError] = React.useState("");
  const [leaveActionPending, setLeaveActionPending] = React.useState("");
  const [leavePendingCount, setLeavePendingCount] = React.useState(0);
  const [myLeaveRequests, setMyLeaveRequests] = React.useState([]);
  const [myLeaveRequestsLoading, setMyLeaveRequestsLoading] = React.useState(false);
  const [calendarRequests, setCalendarRequests] = React.useState([]);
  const [calendarMonth, setCalendarMonth] = React.useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [timesheetRows, setTimesheetRows] = React.useState([]);
  const [timesheetSubmitted, setTimesheetSubmitted] = React.useState(false);
  const [timesheetSending, setTimesheetSending] = React.useState(false);
  const [timesheetError, setTimesheetError] = React.useState("");
  const [timesheetDriverEmail, setTimesheetDriverEmail] = React.useState("");
  const printRef = React.useRef(null);
  const today = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();

  // ─── LIVE ROTA STATE ──────────────────────────────────────
  const [STAFF_SECTIONS, setStaffSections] = React.useState(() => getStaffDirectorySections());
  const [ROTA, setRota] = React.useState(() => buildEmptyRotaFromSections(getStaffDirectorySections()));
  const [weekLabel, setWeekLabel] = React.useState("");
  const [currentTabName, setCurrentTabName] = React.useState("");
  const [availableWeeks, setAvailableWeeks] = React.useState([]);
  const [allTabs, setAllTabs] = React.useState({});
  const [rotaLoading, setRotaLoading] = React.useState(true);
  const [rotaError, setRotaError] = React.useState(null);
  const [lastFetchTime, setLastFetchTime] = React.useState(null);
  const [liveAllocation, setLiveAllocation] = React.useState(null);
  const currentTabNameRef = React.useRef("");
  const allTabsRef = React.useRef({});
  const refreshInFlightRef = React.useRef(false);
  const queuedRefreshTabRef = React.useRef(null);

  // ─── USER IDENTITY ────────────────────────────────────────
  const [currentUser, setCurrentUser] = React.useState(() => storedSession?.name || null);
  const [nameSearch, setNameSearch] = React.useState("");
  const [theme, setTheme] = React.useState(() => { try { return localStorage.getItem("jet_theme") || "light"; } catch { return "light"; } });
  const [viewportWidth, setViewportWidth] = React.useState(() => typeof window === "undefined" ? 1280 : window.innerWidth);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("jet_theme", next); } catch {}
  };
  const C = THEMES[theme] || _defaultC;
  const isManager = currentRole === "manager";
  const isLeaveManager = isManager && !!currentUser && LEAVE_MANAGERS.includes(currentUser);
  const isNarrowWeekHeader = viewportWidth <= 480;
  const shouldWrapWeekHeader = viewportWidth <= 430;

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Derived data from live state
  const DRIVERS = React.useMemo(() => buildDriverList(STAFF_SECTIONS), [STAFF_SECTIONS]);
  const LOGIN_NAMES = React.useMemo(() => {
    const merged = new Set([...(Array.isArray(DRIVERS) ? DRIVERS : []), ...(Array.isArray(ACCESS_CONTROL.managerNames) ? ACCESS_CONTROL.managerNames : [])]);
    return Array.from(merged);
  }, [DRIVERS]);
  const {
    DRIVER_SECTION,
    DRIVER_SECTION_LABEL
  } = React.useMemo(() => buildSectionLookup(STAFF_SECTIONS), [STAFF_SECTIONS]);
  const actionDriver = React.useMemo(() => {
    if (currentUser && DRIVERS.includes(currentUser)) return currentUser;
    if (selectedDriver && DRIVERS.includes(selectedDriver)) return selectedDriver;
    return null;
  }, [currentUser, selectedDriver, DRIVERS]);
  const loadSwapRequestsForActionDriver = React.useCallback(async () => {
    if (!actionDriver) {
      setSwapRequests([]);
      setSwapRequestsError("");
      return;
    }
    setSwapRequestsLoading(true);
    setSwapRequestsError("");
    try {
      const requests = await fetchSwapRequests();
      setSwapRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
      setSwapRequestsError(error?.message || "Unable to load swap requests right now.");
    } finally {
      setSwapRequestsLoading(false);
    }
  }, [actionDriver]);
  const loadSwapBadgeCountForCurrentUser = React.useCallback(async () => {
    if (!currentUser) {
      setSwapBadgeCount(0);
      return;
    }
    try {
      const requests = await fetchSwapRequests();
      setSwapBadgeCount(countPendingSwapApprovals(requests, currentUser));
    } catch {
      setSwapBadgeCount(0);
    }
  }, [currentUser]);
  const loadLeaveRequestsForManager = React.useCallback(async () => {
    setLeaveRequestsLoading(true);
    setLeaveRequestsError("");
    try {
      const requests = await fetchLeaveRequests();
      setLeaveRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
      setLeaveRequestsError(error?.message || "Unable to load leave requests right now.");
    } finally {
      setLeaveRequestsLoading(false);
    }
  }, []);
  const loadMyLeaveRequests = React.useCallback(async () => {
    setMyLeaveRequestsLoading(true);
    try {
      const requests = await fetchLeaveRequests();
      // Keep last 12 months + any pending (pending may be older than 12mo)
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const recent = (Array.isArray(requests) ? requests : []).filter(r =>
        r.status === "pending" || new Date(r.createdAt) >= cutoff
      );
      setMyLeaveRequests(recent);
    } catch {
      // Silent — this is supplementary info
    } finally {
      setMyLeaveRequestsLoading(false);
    }
  }, []);
  const getTimesheetDefaultsForDuty = (dutyCode, driverName) => {
    const dutyValue = dutyCode === null || dutyCode === undefined || dutyCode === "" ? "—" : String(dutyCode).trim();
    const forceBlankTimesheetFields = isAvrOrPrivateHireDutyCode(dutyValue);
    const dutyNum = isDutyNumber(dutyValue) ? parseInt(dutyValue, 10) : null;
    const dutyCard = dutyNum && DUTY_CARDS[dutyNum] ? DUTY_CARDS[dutyNum] : null;
    const routeLearningMatch = dutyValue.match(/^RL\s*(\d+)$/i);
    const routeLearningNum = routeLearningMatch ? parseInt(routeLearningMatch[1], 10) : null;
    const routeLearningCard = routeLearningNum && DUTY_CARDS[routeLearningNum] ? DUTY_CARDS[routeLearningNum] : null;
    const special = getSpecialDuty(dutyValue);
    const isWorkshopDuty = dutyValue.toUpperCase() === "WS";
    const resolvedDutyTimes = dutyCard ? resolveDutyTimesFromCard(dutyCard) : routeLearningCard ? resolveDutyTimesFromCard(routeLearningCard) : {
      startTime: special?.signOn && special.signOn !== "—" && isTimeValue(special.signOn) ? special.signOn : "",
      finishTime: special?.signOff && special.signOff !== "—" && isTimeValue(special.signOff) ? special.signOff : ""
    };
    const startTime = forceBlankTimesheetFields ? "" : isWorkshopDuty ? WORKSHOP_DEFAULT_START_TIME : resolvedDutyTimes.startTime;
    const finishTime = forceBlankTimesheetFields ? "" : isWorkshopDuty ? WORKSHOP_DEFAULT_FINISH_TIME : resolvedDutyTimes.finishTime;
    const baseTravelCost = dutyCard ? inferDutyTravelCost(dutyCard) : routeLearningCard ? inferDutyTravelCost(routeLearningCard) : 0;
    const dutyLabel = dutyCard ? `Duty ${dutyValue}` : routeLearningCard ? `Route Learning ${routeLearningNum}` : special ? special.label : getStatusStyle(dutyValue, driverName, true, DRIVER_SECTION, C).label;
    return {
      dutyCode: dutyValue,
      dutyLabel,
      startTime,
      finishTime,
      travelCost: forceBlankTimesheetFields ? "" : Number(baseTravelCost.toFixed(2))
    };
  };
  const buildTimesheetRowsForDriver = driverName => {
    return DAYS.map((dayName, dayIndex) => {
      const dutyValueRaw = ROTA[driverName]?.[dayIndex];
      const dutyValue = dutyValueRaw === null || dutyValueRaw === undefined || dutyValueRaw === "" ? "—" : String(dutyValueRaw);
      const defaults = getTimesheetDefaultsForDuty(dutyValue, driverName);
      const rowDate = getTimesheetRowIsoDate(activeTimesheetWeekKey, dayIndex);
      return {
        dayIndex,
        dayName,
        rowDate,
        dutyCode: defaults.dutyCode,
        dutyLabel: defaults.dutyLabel,
        startTime: defaults.startTime,
        finishTime: defaults.finishTime,
        travelCost: defaults.travelCost,
        expenses: []
      };
    });
  };
  const applyRotaSnapshot = snapshot => {
    if (!snapshot) return;
    setStaffSections(snapshot.sections);
    setRota(snapshot.rota);
    setWeekLabel(formatWeekCommencing(snapshot.tabName));
    setCurrentTabName(snapshot.tabName);
    setAvailableWeeks(snapshot.availableWeeks);
    setAllTabs(snapshot.tabs);
    setLiveAllocation(snapshot.allocation);
    setLastFetchTime(new Date().toLocaleTimeString());
  };
  const fetchRotaSnapshot = async preferredTabName => {
    const fallbackTabs = allTabsRef.current && typeof allTabsRef.current === "object" ? allTabsRef.current : {};
    const requestedTabName = String(preferredTabName || "").trim();
    const canSpeculateWeek = requestedTabName && fallbackTabs[requestedTabName];
    const speculativeWeekPromise = canSpeculateWeek ? fetchWeekRota(fallbackTabs, requestedTabName).catch(() => null) : Promise.resolve(null);
    const [liveData, allocation, speculativeWeekData] = await Promise.all([fetchLiveRota(), fetchLiveAllocationData(), speculativeWeekPromise]);
    const targetTabName = requestedTabName && liveData.tabs[requestedTabName] ? requestedTabName : liveData.tabName;
    const canReuseSpeculativeWeek = requestedTabName && targetTabName === requestedTabName && speculativeWeekData && fallbackTabs[requestedTabName] && fallbackTabs[requestedTabName] === liveData.tabs[requestedTabName];
    const targetWeekData = targetTabName === liveData.tabName ? {
      sections: liveData.sections,
      rota: liveData.rota
    } : canReuseSpeculativeWeek ? speculativeWeekData : await fetchWeekRota(liveData.tabs, targetTabName);
    return {
      sections: targetWeekData.sections,
      rota: targetWeekData.rota,
      tabName: targetTabName,
      availableWeeks: liveData.availableWeeks,
      tabs: liveData.tabs,
      allocation
    };
  };
  React.useEffect(() => {
    let cancelled = false;
    verifyServerSession(storedSession?.token || "").then(serverSession => {
      if (cancelled) return;
      const resolvedRole = serverSession.role === "manager" ? "manager" : "driver";
      writeSession(serverSession.name, resolvedRole, serverSession.expiresAt || storedSession?.expiresAt || null);
      setAuthed(true);
      setCurrentRole(resolvedRole);
      setCurrentUser(serverSession.name);
      setAuthName(serverSession.name);
      if (DRIVERS.includes(serverSession.name)) {
        setSelectedDriver(serverSession.name);
        setScreen("week");
      } else {
        setSelectedDriver(null);
        setScreen("home");
      }
    }).catch(err => {
      if (cancelled) return;
      if (err?.code === "SESSION_INVALID") {
        clearSession();
        setAuthed(false);
        setCurrentUser(null);
        setCurrentRole("driver");
        setScreen("home");
        setSelectedDriver(null);
        setAuthName("");
        setAuthPin("");
        setAuthError(storedSession?.name ? err?.message || "Session expired. Please sign in again." : "");
        return;
      }
      if (storedSession?.name) {
        // Keep cached session metadata during transient API/network issues.
        console.warn("Session verification unavailable; keeping local session.", err);
        setAuthError("");
        setAuthed(true);
        setCurrentUser(storedSession.name);
        setCurrentRole(storedSession.role === "manager" ? "manager" : "driver");
        setAuthName(storedSession.name);
        if (DRIVERS.includes(storedSession.name)) {
          setSelectedDriver(storedSession.name);
          setScreen("week");
        } else {
          setSelectedDriver(null);
          setScreen("home");
        }
      } else {
        setAuthError("");
        setAuthed(false);
        setCurrentUser(null);
        setCurrentRole("driver");
        setScreen("home");
        setSelectedDriver(null);
      }
    }).finally(() => {
      if (!cancelled) setSessionVerifying(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch live rota on mount
  React.useEffect(() => {
    currentTabNameRef.current = currentTabName;
  }, [currentTabName]);
  React.useEffect(() => {
    allTabsRef.current = allTabs;
  }, [allTabs]);

  React.useEffect(() => {
    let cancelled = false;
    setRotaLoading(true);
    setRotaError(null);
    fetchRotaSnapshot("").then(snapshot => {
      if (cancelled) return;
      applyRotaSnapshot(snapshot);
      setRotaLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error("Rota fetch failed:", err);
      setRotaError("Failed to load rota. Check your connection.");
      setRotaLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  React.useEffect(() => {
    if (!authed) return undefined;
    const syncCurrentWeekOnResume = () => {
      if (document.hidden) return;
      if (!currentTabNameRef.current) return;
      if (refreshInFlightRef.current) return;
      const now = new Date();
      const dow = now.getDay();
      const diffToMon = dow === 0 ? 6 : dow - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMon);
      const dd = String(monday.getDate()).padStart(2, "0");
      const mm = String(monday.getMonth() + 1).padStart(2, "0");
      const liveWeekTabName = `WC ${dd}.${mm}.${monday.getFullYear()}`;
      if (currentTabNameRef.current !== liveWeekTabName) {
        refreshRota("");
      }
    };
    document.addEventListener("visibilitychange", syncCurrentWeekOnResume);
    window.addEventListener("focus", syncCurrentWeekOnResume);
    return () => {
      document.removeEventListener("visibilitychange", syncCurrentWeekOnResume);
      window.removeEventListener("focus", syncCurrentWeekOnResume);
    };
  }, [authed]);

  const getTodayRunoutLive = dutyNum => {
    if (liveAllocation) return liveAllocation[String(dutyNum)] || null;
    return getTodayRunout(dutyNum);
  };
  const getDriverRunoutLive = driverName => {
    if (liveAllocation) {
      for (const [dutyNum, info] of Object.entries(liveAllocation)) {
        if (normalizeStaffName(info.driver) === normalizeStaffName(driverName)) return { duty: parseInt(dutyNum, 10), ...info };
      }
      return null;
    }
    return getDriverRunout(driverName);
  };

  // Week switcher
  const switchWeek = async tabName => {
    setRotaLoading(true);
    setRotaError(null);
    try {
      const [data, allocation] = await Promise.all([fetchWeekRota(allTabs, tabName), fetchLiveAllocationData()]);
      if (data) {
        setStaffSections(data.sections);
        setRota(data.rota);
        setWeekLabel(formatWeekCommencing(tabName));
        setCurrentTabName(tabName);
        setLiveAllocation(allocation);
        setLastFetchTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Week switch failed:", err);
      setRotaError("Failed to load week data.");
    }
    setRotaLoading(false);
  };

  // Refresh current week data
  async function refreshRota(preferredTabName = currentTabNameRef.current) {
    if (refreshInFlightRef.current) {
      queuedRefreshTabRef.current = String(preferredTabName || "").trim();
      return;
    }
    refreshInFlightRef.current = true;
    setRotaLoading(true);
    setRotaError(null);
    try {
      const snapshot = await fetchRotaSnapshot(preferredTabName);
      applyRotaSnapshot(snapshot);
    } catch (err) {
      setRotaError("Refresh failed.");
    } finally {
      refreshInFlightRef.current = false;
      setRotaLoading(false);
      if (queuedRefreshTabRef.current !== null) {
        const queuedTabName = queuedRefreshTabRef.current;
        queuedRefreshTabRef.current = null;
        window.setTimeout(() => {
          refreshRota(queuedTabName);
        }, 0);
      }
    }
  }
  const getWeekCommencing = () => weekLabel || "Loading...";
  const activeTimesheetWeekKey = currentTabName || weekLabel || "";
  const filtered = React.useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    return DRIVERS.map(driver => ({
      driver,
      score: scoreDriverNameSearch(driver, q)
    })).filter(entry => entry.score >= 0).sort((a, b) => b.score - a.score || a.driver.localeCompare(b.driver, undefined, {
      sensitivity: "base"
    })).map(entry => entry.driver);
  }, [search, DRIVERS]);
  const handleLogin = async () => {
    const rawName = authName.trim();
    const pin = authPin.trim();
    if (!rawName || !pin) {
      setAuthError("Enter your name and PIN.");
      return;
    }
    const lowerRaw = rawName.toLowerCase();
    const name = LOGIN_NAMES.find(n => n.toLowerCase() === lowerRaw) || rawName;
    const isManagerName = ACCESS_CONTROL.managerNames?.some(n => n.toLowerCase() === lowerRaw);
    const knownDriver = DRIVERS.some(d => d.toLowerCase() === lowerRaw);
    if (!knownDriver && !isManagerName) {
      setAuthError("Name not found on this week's rota.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const session = await loginWithServer(name, pin);
      const resolvedName = session.name;
      const role = session.role === "manager" ? "manager" : "driver";
      const resolvedKnownDriver = DRIVERS.includes(resolvedName);
      writeSession(resolvedName, role, session.expiresAt || null);
      await refreshRota("");
      setAuthed(true);
      setCurrentRole(role);
      setCurrentUser(resolvedName);
      setSelectedDriver(resolvedKnownDriver ? resolvedName : null);
      setScreen(resolvedKnownDriver ? "week" : "home");
      setSearch("");
      setDutySearch("");
      setNameSearch("");
      setAuthPin("");
    } catch (err) {
      setAuthError(err?.message || "Unable to verify PIN. Please try again.");
    }
    setAuthLoading(false);
  };
  React.useEffect(() => {
    if (!authed || isManager) return;
    if (selectedDriver !== currentUser) setSelectedDriver(currentUser);
  }, [authed, isManager, selectedDriver, currentUser]);
  React.useEffect(() => {
    if (!authed) return;
    // Safety net: recover from stale state that can show an empty week page.
    if (screen === "week" && !selectedDriver) {
      setScreen("home");
    }
  }, [authed, screen, selectedDriver]);
  React.useEffect(() => {
    if (screen !== "timesheet" || !actionDriver) return;
    const baseRows = buildTimesheetRowsForDriver(actionDriver);
    const hydratedDraft = readTimesheetDraftData(actionDriver, activeTimesheetWeekKey, baseRows);
    setTimesheetRows(hydratedDraft.rows);
    setTimesheetSubmitted(false);
    setTimesheetSending(false);
    setTimesheetError("");
    setTimesheetDriverEmail("");
  }, [screen, actionDriver, activeTimesheetWeekKey]);
  React.useEffect(() => {
    if (screen !== "timesheet" || !actionDriver || !activeTimesheetWeekKey) return;
    if (!Array.isArray(timesheetRows) || timesheetRows.length !== DAYS.length) return;
    saveTimesheetDraftData(actionDriver, activeTimesheetWeekKey, timesheetRows);
  }, [screen, actionDriver, activeTimesheetWeekKey, timesheetRows]);
  React.useEffect(() => {
    if (!authed || !currentUser) return;
    loadSwapBadgeCountForCurrentUser();
  }, [authed, currentUser, loadSwapBadgeCountForCurrentUser]);
  React.useEffect(() => {
    if (!authed || screen !== "swap" || !actionDriver) return;
    loadSwapRequestsForActionDriver();
  }, [authed, screen, actionDriver, loadSwapRequestsForActionDriver]);
  React.useEffect(() => {
    if (screen !== "swap") return;
    setSwapBadgeCount(countPendingSwapApprovals(swapRequests, currentUser));
  }, [screen, swapRequests, currentUser]);
  React.useEffect(() => {
    if (!authed || screen !== "leave-manager" || !isLeaveManager) return;
    loadLeaveRequestsForManager();
    const pollInterval = setInterval(loadLeaveRequestsForManager, 20000);
    return () => clearInterval(pollInterval);
  }, [authed, screen, isLeaveManager, loadLeaveRequestsForManager]);
  React.useEffect(() => {
    setLeavePendingCount(leaveRequests.filter(r => r.status === "pending").length);
  }, [leaveRequests]);
  React.useEffect(() => {
    if (!authed || screen !== "leave") return;
    loadMyLeaveRequests();
    fetchCalendarRequests().then(setCalendarRequests).catch(() => {});
    const pollInterval = setInterval(loadMyLeaveRequests, 20000);
    return () => clearInterval(pollInterval);
  }, [authed, screen, loadMyLeaveRequests]);
  React.useEffect(() => {
    setShowWeekMenu(false);
  }, [screen, selectedDriver, currentUser]);
  if (sessionVerifying) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: C.pageBg,
        color: C.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted
      }
    }, "Verifying session..."));
  }
  if (!authed) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: C.pageBg,
        color: C.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace"
      }
    }, /*#__PURE__*/React.createElement("link", {
      href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap",
      rel: "stylesheet"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "640px",
        margin: "0 auto",
        padding: "24px 16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginBottom: "24px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "14px",
        fontWeight: 700,
        letterSpacing: "3px",
        color: "#ef4444",
        marginBottom: "2px"
      }
    }, "JET"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "9px",
        letterSpacing: "1.5px",
        color: C.textMuted,
        textTransform: "uppercase",
        marginBottom: "20px"
      }
    }, "Jason Edwards Travel \u2014 Staff Portal"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "13px",
        color: C.white,
        fontWeight: 600,
        marginBottom: "4px"
      }
    }, "Sign in"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, "Enter your name and PIN")), rotaError && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "12px",
        background: "#fee2e2",
        border: "1px solid #fca5a5",
        borderRadius: "8px",
        padding: "10px 12px",
        fontSize: "10px",
        color: "#b91c1c",
        lineHeight: 1.5
      }
    }, "\u26A0 ", rotaError, " Showing directory names only until sync recovers."), /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: authName,
      onChange: e => {
        setAuthName(e.target.value);
        setAuthError("");
      },
      onKeyDown: e => {
        if (e.key === "Enter" && authName && authPin) handleLogin();
      },
      placeholder: "Name",
      autoFocus: true,
      autoComplete: "off",
      style: {
        width: "100%",
        padding: "14px 16px",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        color: C.white,
        fontSize: "13px",
        fontFamily: "inherit",
        outline: "none",
        boxSizing: "border-box",
        marginBottom: "8px"
      },
      onFocus: e => e.target.style.borderColor = C.accent,
      onBlur: e => e.target.style.borderColor = C.border
    }), /*#__PURE__*/React.createElement("input", {
      type: "password",
      value: authPin,
      onChange: e => {
        setAuthPin(e.target.value);
        setAuthError("");
      },
      onKeyDown: e => {
        if (e.key === "Enter" && authName && authPin) handleLogin();
      },
      placeholder: "PIN",
      disabled: !authName,
      style: {
        width: "100%",
        padding: "14px 16px",
        background: C.surface,
        border: `1px solid ${authError ? "#ef4444" : C.border}`,
        borderRadius: "8px",
        color: C.white,
        fontSize: "13px",
        fontFamily: "inherit",
        outline: "none",
        boxSizing: "border-box",
        letterSpacing: "2px",
        marginBottom: "10px"
      },
      onFocus: e => {
        if (!authError && authName) e.target.style.borderColor = C.accent;
      },
      onBlur: e => {
        if (!authError) e.target.style.borderColor = C.border;
      }
    }), authError && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: "#ef4444",
        textAlign: "center",
        marginBottom: "8px"
      }
    }, authError), /*#__PURE__*/React.createElement("button", {
      onClick: handleLogin,
      disabled: !authName || !authPin || authLoading,
      style: {
        width: "100%",
        padding: "13px",
        background: !authName || !authPin || authLoading ? C.textDim + "44" : C.accent,
        color: !authName || !authPin || authLoading ? C.textDim : C.bg,
        border: "none",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: 700,
        cursor: !authName || !authPin || authLoading ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px"
      }
    }, authLoading ? "Checking..." : "Continue"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "center",
        marginTop: "16px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: toggleTheme,
      style: {
        background: "none",
        border: "none",
        color: C.textDim,
        fontSize: "11px",
        cursor: "pointer",
        fontFamily: "inherit",
        padding: "4px 8px"
      }
    }, theme === "light" ? "\u263D Dark mode" : "\u2600 Light mode")), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "9px",
        color: C.textDim,
        textAlign: "center",
        lineHeight: 1.5,
        marginTop: "8px"
      }
    }, ACCESS_CONTROL.mode === "soft" ? "Soft mode enabled for testing. Shared driver PIN is active." : "Strict mode enabled. Per-user PIN required.", /*#__PURE__*/React.createElement("br", null), "This portal contains staff data protected under UK GDPR.")));
  }
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Duty Card</title><style>
      body { font-family: 'Courier New', monospace; padding: 20px; color: #000; font-size: 12px; }
      h1 { font-size: 18px; margin-bottom: 4px; } h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #999; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; } th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
      th { background: #f0f0f0; } .break-row { background: #e8f5e9; font-weight: bold; }
      .warn { background: #fff8e1; padding: 8px; border: 1px solid #ffcc02; margin: 8px 0; }
      .info { background: #e3f2fd; padding: 8px; border: 1px solid #42a5f5; margin: 8px 0; }
      @media print { body { padding: 0; } }
    </style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write("</body></html>");
    w.document.close();
    w.print();
  };

  // Loading screen while fetching rota data
  if (rotaLoading && DRIVERS.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: C.pageBg,
        color: C.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }
    }, /*#__PURE__*/React.createElement("link", {
      href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap",
      rel: "stylesheet"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "14px",
        fontWeight: 700,
        letterSpacing: "3px",
        color: "#ef4444",
        marginBottom: "2px"
      }
    }, "JET"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "9px",
        letterSpacing: "1.5px",
        color: C.textMuted,
        textTransform: "uppercase",
        marginBottom: "32px"
      }
    }, "Jason Edwards Travel \u2014 Staff Portal"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.accent,
        marginBottom: "8px"
      }
    }, "\u23F3 Loading rota..."), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "9px",
        color: C.textDim
      }
    }, "Fetching live data"));
  }
  if (rotaError && DRIVERS.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: C.pageBg,
        color: C.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }
    }, /*#__PURE__*/React.createElement("link", {
      href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap",
      rel: "stylesheet"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "14px",
        fontWeight: 700,
        letterSpacing: "3px",
        color: "#ef4444",
        marginBottom: "16px"
      }
    }, "JET"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: "#ef4444",
        marginBottom: "12px"
      }
    }, "\u26A0 ", rotaError), /*#__PURE__*/React.createElement("button", {
      onClick: refreshRota,
      style: {
        padding: "10px 24px",
        background: C.accent,
        color: C.bg,
        border: "none",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "Retry"));
  }

  // ─── WEEK NAVIGATION ────────────────────────────────────
  const weekIndex = availableWeeks.findIndex(w => w.tabName === currentTabName);
  // For drivers, limit navigation to current calendar week ± 1
  const calendarWeekIdx = (() => {
    const now = new Date();
    const diffToMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - diffToMon);
    const dd = String(mon.getDate()).padStart(2, "0");
    const mm = String(mon.getMonth() + 1).padStart(2, "0");
    const key = `WC ${dd}.${mm}.${mon.getFullYear()}`;
    const idx = availableWeeks.findIndex(w => w.tabName === key);
    return idx >= 0 ? idx : weekIndex;
  })();
  const canGoBack = weekIndex > 0 && (isManager || weekIndex > calendarWeekIdx - 1);
  const canGoForward = weekIndex < availableWeeks.length - 1 && (isManager || weekIndex < calendarWeekIdx + 1);
  const goWeek = dir => {
    const nextIdx = weekIndex + dir;
    if (nextIdx >= 0 && nextIdx < availableWeeks.length) {
      switchWeek(availableWeeks[nextIdx].tabName);
    }
  };

  // ─── USER SELECTION ─────────────────────────────────────
  const selectUser = name => {
    if (!isManager) return;
    setSelectedDriver(name);
    setScreen("week");
    setSearch("");
  };
  const switchUser = async () => {
    await logoutServerSession();
    clearSession();
    setAuthed(false);
    setCurrentUser(null);
    setCurrentRole("driver");
    setScreen("home");
    setSelectedDriver(null);
    setAuthName("");
    setAuthPin("");
    setAuthError("");
    setNameSearch("");
    setSearch("");
    setTimesheetRows([]);
    setTimesheetSubmitted(false);
    setTimesheetSending(false);
    setTimesheetError("");
    setTimesheetDriverEmail("");
  };

  // Is the user viewing the current calendar week?
  const isCurrentWeek = (() => {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? 6 : dow - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMon);
    const dd = String(monday.getDate()).padStart(2, "0");
    const mm = String(monday.getMonth() + 1).padStart(2, "0");
    return currentTabName === `WC ${dd}.${mm}.${monday.getFullYear()}`;
  })();
  const canBrowseStaff = isManager;
  const showingDutyLookup = !canBrowseStaff || showDutyLookup;
  const openDutyLookupScreen = () => {
    setShowWeekMenu(false);
    setShowDutyLookup(true);
    setDutySearch("");
    setScreen("home");
  };
  const openCurrentUserWeek = () => {
    if (!currentUser || !DRIVERS.includes(currentUser)) return;
    setSelectedDriver(currentUser);
    setScreen("week");
    setSearch("");
    setShowWeekMenu(false);
  };
  const openLeaveRequestScreen = () => {
    setShowWeekMenu(false);
    setLeaveSubmitted(false);
    setLeaveSending(false);
    setLeaveError("");
    setLeaveForm({
      dateFrom: "",
      dateTo: "",
      reason: "",
      notes: "",
      email: ""
    });
    setScreen("leave");
  };
  const openSwapRequestScreen = () => {
    setShowWeekMenu(false);
    setSwapSubmitted(false);
    setSwapSending(false);
    setSwapError("");
    setSwapForm({
      dayIndex: "",
      targetDriver: "",
      notes: ""
    });
    setScreen("swap");
  };
  const openLeaveManagerScreen = () => {
    setShowWeekMenu(false);
    setLeaveActionPending("");
    setLeaveRequestsError("");
    setScreen("leave-manager");
  };
  const openTimesheetScreen = () => {
    setShowWeekMenu(false);
    setTimesheetSubmitted(false);
    setTimesheetSending(false);
    setTimesheetError("");
    setTimesheetDriverEmail("");
    if (actionDriver) {
      setTimesheetRows(buildTimesheetRowsForDriver(actionDriver));
    } else {
      setTimesheetRows([]);
    }
    setScreen("timesheet");
  };
  const handleWeekMenuRefresh = () => {
    setShowWeekMenu(false);
    refreshRota();
  };
  const openDutyCardScreen = dutyNumber => {
    if (!dutyNumber || !DUTY_CARDS[dutyNumber]) return;
    setSelectedDuty(dutyNumber);
    setScreen("duty");
  };
  const weekMenuButtonStyle = {
    display: "block",
    width: "100%",
    background: "none",
    border: "none",
    color: C.text,
    textAlign: "left",
    padding: "11px 12px",
    fontSize: "11px",
    fontFamily: "inherit",
    cursor: "pointer"
  };
  const renderWeekOverflowMenu = () => showWeekMenu ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "46px",
      right: 0,
      width: "220px",
      maxWidth: "calc(100vw - 48px)",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "12px",
      boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
      overflow: "hidden",
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: openDutyLookupScreen,
    style: weekMenuButtonStyle
  }, "Browse Duty Cards"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "1px",
      background: C.border
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: openLeaveRequestScreen,
    style: weekMenuButtonStyle
  }, "Request Annual Leave")) : null;
  const renderWeekHeaderActions = () => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: shouldWrapWeekHeader ? "flex-end" : "flex-start",
      gap: isNarrowWeekHeader ? "6px" : "8px",
      flexShrink: 0
    }
  }, isManager && selectedDriver === currentUser && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setScreen("home");
      setSelectedDriver(null);
      setShowWeekMenu(false);
    },
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "6px",
      padding: isNarrowWeekHeader ? "8px 10px" : "8px 12px",
      cursor: "pointer",
      color: C.textMuted,
      fontSize: "10px",
      fontWeight: 600,
      fontFamily: "inherit",
      letterSpacing: "0.5px"
    }
  }, "All Staff"), /*#__PURE__*/React.createElement("button", {
    onClick: handleWeekMenuRefresh,
    disabled: rotaLoading,
    title: rotaLoading ? "Refreshing rota" : "Refresh rota",
    style: {
      width: isNarrowWeekHeader ? "38px" : "40px",
      height: isNarrowWeekHeader ? "38px" : "40px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "10px",
      cursor: rotaLoading ? "not-allowed" : "pointer",
      color: rotaLoading ? C.textDim : C.accent,
      fontSize: "18px",
      fontFamily: "inherit",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      flexShrink: 0
    }
  }, rotaLoading ? "\u23F3" : "\u21BB"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowWeekMenu(open => !open),
    title: "Open actions menu",
    style: {
      width: isNarrowWeekHeader ? "38px" : "40px",
      height: isNarrowWeekHeader ? "38px" : "40px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "10px",
      cursor: "pointer",
      color: showWeekMenu ? C.accent : C.textMuted,
      fontSize: "18px",
      fontFamily: "inherit",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0
    }
  }, "\u2630"), renderWeekOverflowMenu()));
  const weekPrimaryActionStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    minWidth: 0,
    padding: "14px 12px",
    background: theme === "dark" ? "linear-gradient(135deg, #1e293b, #243247)" : "linear-gradient(135deg, #f8fafc, #eef2ff)",
    border: theme === "dark" ? "1px solid #475569" : "1px solid #cbd5e1",
    borderRadius: "10px",
    color: theme === "dark" ? C.white : C.text,
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.5px",
    textAlign: "center"
  };
  const handleWeekPrimaryActionMouseEnter = e => {
    e.currentTarget.style.borderColor = theme === "dark" ? "#64748b" : "#94a3b8";
  };
  const handleWeekPrimaryActionMouseLeave = e => {
    e.currentTarget.style.borderColor = theme === "dark" ? "#475569" : "#cbd5e1";
  };
  const renderWeekPrimaryActions = () => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "10px",
      marginTop: "20px"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: openSwapRequestScreen,
    style: {
      ...weekPrimaryActionStyle,
      position: "relative",
      overflow: "visible"
    },
    onMouseEnter: handleWeekPrimaryActionMouseEnter,
    onMouseLeave: handleWeekPrimaryActionMouseLeave
  }, "\uD83D\uDD04 Swap Request", swapBadgeCount > 0 && /*#__PURE__*/React.createElement("span", {
    title: `${swapBadgeCount} pending swap ${swapBadgeCount === 1 ? "request" : "requests"} awaiting your approval`,
    style: {
      position: "absolute",
      top: "-8px",
      right: "-8px",
      minWidth: "18px",
      height: "18px",
      padding: "0 5px",
      borderRadius: "999px",
      background: "#dc2626",
      color: "#ffffff",
      fontSize: "10px",
      fontWeight: 700,
      lineHeight: "18px",
      textAlign: "center",
      boxShadow: `0 0 0 2px ${theme === "dark" ? "#1e293b" : "#f8fafc"}`
    }
  }, swapBadgeCount > 9 ? "9+" : String(swapBadgeCount))), /*#__PURE__*/React.createElement("button", {
    onClick: openTimesheetScreen,
    style: weekPrimaryActionStyle,
    onMouseEnter: handleWeekPrimaryActionMouseEnter,
    onMouseLeave: handleWeekPrimaryActionMouseLeave
  }, "\uD83E\uDDFE Generate Timesheet"), isLeaveManager && /*#__PURE__*/React.createElement("button", {
    onClick: openLeaveManagerScreen,
    style: {
      ...weekPrimaryActionStyle,
      position: "relative",
      overflow: "visible"
    },
    onMouseEnter: handleWeekPrimaryActionMouseEnter,
    onMouseLeave: handleWeekPrimaryActionMouseLeave
  }, "\uD83D\uDCCB Leave Requests", leavePendingCount > 0 && /*#__PURE__*/React.createElement("span", {
    title: `${leavePendingCount} pending leave ${leavePendingCount === 1 ? "request" : "requests"} awaiting review`,
    style: {
      position: "absolute",
      top: "-8px",
      right: "-8px",
      minWidth: "18px",
      height: "18px",
      padding: "0 5px",
      borderRadius: "999px",
      background: "#dc2626",
      color: "#ffffff",
      fontSize: "10px",
      fontWeight: 700,
      lineHeight: "18px",
      textAlign: "center",
      boxShadow: `0 0 0 2px ${theme === "dark" ? "#1e293b" : "#f8fafc"}`
    }
  }, leavePendingCount > 9 ? "9+" : String(leavePendingCount))));
  const renderWeekScreen = () => {
    if (!selectedDriver) return null;
    const canShowWeekPrimaryActions = !!actionDriver && selectedDriver === actionDriver;
    const todayVal = ROTA[selectedDriver]?.[today] || "—";
    const runout = getDriverRunoutLive(selectedDriver);
    const todayNote = null;
    const todayDutyNum = isDutyNumber(todayVal) ? parseInt(todayVal) : null;
    const todayRouteLearningMatch = String(todayVal).match(/^RL\s*(\d+)$/i);
    const todayRouteLearningNum = todayRouteLearningMatch ? parseInt(todayRouteLearningMatch[1], 10) : null;
    const todayDutyCard = todayDutyNum && DUTY_CARDS[todayDutyNum] ? DUTY_CARDS[todayDutyNum] : null;
    const todayRouteLearningCard = todayRouteLearningNum && DUTY_CARDS[todayRouteLearningNum] ? DUTY_CARDS[todayRouteLearningNum] : null;
    const todayCardDutyNum = todayDutyNum || todayRouteLearningNum;
    const todayDisplayCard = todayDutyCard || todayRouteLearningCard;
    const runoutForDuty = todayCardDutyNum ? getTodayRunoutLive(todayCardDutyNum) : null;
    const activeRunout = runout || runoutForDuty;
    const showTodayBanner = isCurrentWeek && (todayDisplayCard || activeRunout || todayVal !== "—");
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: shouldWrapWeekHeader ? "wrap" : "nowrap",
        marginBottom: "10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: shouldWrapWeekHeader ? "1 1 100%" : "1 1 220px",
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "17px",
        fontWeight: 600,
        margin: 0,
        color: C.white
      }
    }, selectedDriver), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        marginTop: "4px"
      }
    }, DRIVER_SECTION_LABEL[selectedDriver])), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: shouldWrapWeekHeader ? 0 : "auto",
        flexShrink: 0,
        width: shouldWrapWeekHeader ? "100%" : "auto"
      }
    }, renderWeekHeaderActions())), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => goWeek(-1),
      disabled: !canGoBack || rotaLoading,
      style: {
        background: "none",
        border: "none",
        color: canGoBack && !rotaLoading ? C.accent : C.textDim,
        fontSize: "16px",
        cursor: canGoBack && !rotaLoading ? "pointer" : "not-allowed",
        padding: "2px 6px",
        fontFamily: "inherit"
      }
    }, "\u2039"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "12px",
        color: C.white,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "w/c ", getWeekCommencing()), /*#__PURE__*/React.createElement("button", {
      onClick: () => goWeek(1),
      disabled: !canGoForward || rotaLoading,
      style: {
        background: "none",
        border: "none",
        color: canGoForward && !rotaLoading ? C.accent : C.textDim,
        fontSize: "16px",
        cursor: canGoForward && !rotaLoading ? "pointer" : "not-allowed",
        padding: "2px 6px",
        fontFamily: "inherit"
      }
    }, "\u203A"), rotaLoading && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.accent
      }
    }, "\u23F3"))), showTodayBanner && /*#__PURE__*/React.createElement("div", {
      style: {
        background: `linear-gradient(135deg, ${C.accent}08, ${C.accent}04)`,
        border: `1px solid ${C.accent}33`,
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        fontWeight: 700,
        color: C.accent,
        letterSpacing: "1.5px",
        marginBottom: "10px"
      }
    }, SHORT_DAYS[today].toUpperCase(), " \u2014 ", new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    })), todayDisplayCard && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "10px",
        marginBottom: activeRunout ? "10px" : "0",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "18px",
        fontWeight: 700,
        color: todayDutyCard ? C.white : C.blue
      }
    }, todayDutyCard ? "Duty " : "Route Learning ", todayCardDutyNum), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        marginTop: "2px"
      }
    }, todayDisplayCard.route, " \xB7 ", todayDisplayCard.signOn, " \u2013 ", todayDisplayCard.signOff)), /*#__PURE__*/React.createElement("button", {
      onClick: () => openDutyCardScreen(todayCardDutyNum),
      style: {
        background: C.accent,
        color: C.bg,
        border: "none",
        borderRadius: "6px",
        padding: "7px 14px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "View Card \u2192")), !todayDisplayCard && todayVal === "R" && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: activeRunout ? "10px" : "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION, C).color
      }
    }, getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION, C).label)), !todayDisplayCard && todayVal !== "R" && todayVal !== "—" && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: activeRunout ? "10px" : "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION, C).color
      }
    }, getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION, C).label), getSpecialDuty(todayVal)?.signOn !== "—" && getSpecialDuty(todayVal) && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        marginTop: "2px"
      }
    }, getSpecialDuty(todayVal).signOn, " \u2013 ", getSpecialDuty(todayVal).signOff)), activeRunout && activeRunout.vehicle && /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.surface,
        borderRadius: "8px",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "COACH"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "14px",
        fontWeight: 700,
        color: C.white,
        letterSpacing: "1px"
      }
    }, activeRunout.vehicle)), activeRunout.handoverTo && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "4px",
        borderTop: `1px solid ${C.border}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "HANDING OVER TO"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 600,
        color: C.white
      }
    }, activeRunout.handoverTo.driver), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, "Duty ", activeRunout.handoverTo.duty, " \xB7 ", activeRunout.handoverTo.signOn))), activeRunout.takeoverFrom && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "4px",
        borderTop: `1px solid ${C.border}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "TAKING OVER FROM"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 600,
        color: C.white
      }
    }, activeRunout.takeoverFrom.driver), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, "Duty ", activeRunout.takeoverFrom.duty)))), todayNote && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "8px",
        background: C.warnBg,
        border: `1px solid ${C.warnBorder}`,
        borderRadius: "6px",
        padding: "8px 10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        fontWeight: 700,
        color: C.warnText,
        letterSpacing: "0.5px",
        marginBottom: "2px"
      }
    }, "NOTE"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.white,
        lineHeight: 1.4,
        whiteSpace: "pre-line"
      }
    }, todayNote))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "5px"
      }
    }, DAYS.map((day, i) => {
      const val = ROTA[selectedDriver]?.[i] || "—";
      const isToday = isCurrentWeek && i === today;
      const st = getStatusStyle(val, selectedDriver, true, DRIVER_SECTION, C);
      const hasDutyCard = isDutyNumber(val) && DUTY_CARDS[parseInt(val)];
      const dutyCard = hasDutyCard ? DUTY_CARDS[parseInt(val)] : null;
      const special = getSpecialDuty(val);
      const cellNote = null;
      const routeLearningMatch = String(val).match(/^RL\s*(\d+)$/i);
      const rlDutyNum = routeLearningMatch ? parseInt(routeLearningMatch[1], 10) : null;
      const rlDutyCard = rlDutyNum && DUTY_CARDS[rlDutyNum] ? DUTY_CARDS[rlDutyNum] : null;
      const hideRowViewCardButton = isToday && hasDutyCard && !!todayDutyCard;
      const showActiveRowViewCardButton = (hasDutyCard && !hideRowViewCardButton) || (!!rlDutyCard && !isToday);
      return /*#__PURE__*/React.createElement("div", {
        key: day,
        style: {
          background: isToday ? C.accent + "08" : C.surface,
          border: `1px solid ${isToday ? C.accent + "33" : C.border}`,
          borderRadius: "8px",
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          padding: "12px 14px",
          gap: "10px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: "38px",
          textAlign: "center"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "11px",
          fontWeight: 700,
          color: C.textMuted,
          letterSpacing: "1px"
        }
      }, SHORT_DAYS[i])), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, isDutyNumber(val) ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "15px",
          fontWeight: 700,
          color: C.white
        }
      }, "Duty ", val), dutyCard && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, dutyCard.route, " \xB7 ", dutyCard.signOn, " sign on")) : rlDutyCard ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "15px",
          fontWeight: 700,
          color: C.blue
        }
      }, "Route Learning ", rlDutyNum), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, rlDutyCard.route, " \xB7 ", rlDutyCard.signOn, " sign on")) : special ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "13px",
          color: special.color,
          fontWeight: 600
        }
      }, special.label), special.signOn !== "—" && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, special.signOn, " \u2013 ", special.signOff)) : /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "13px",
          color: st.color,
          fontWeight: 500
        }
      }, st.label), cellNote && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.white,
          marginTop: "3px",
          lineHeight: 1.3,
          whiteSpace: "pre-line"
        }
      }, "\uD83D\uDCDD ", cellNote)), showActiveRowViewCardButton && /*#__PURE__*/React.createElement("button", {
        onClick: () => openDutyCardScreen(hasDutyCard ? parseInt(val, 10) : rlDutyNum),
        style: {
          background: isToday ? C.accent : C.accent + "22",
          color: isToday ? C.bg : C.accent,
          border: "none",
          borderRadius: "6px",
          padding: "7px 12px",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.5px",
          flexShrink: 0
        },
        onMouseEnter: e => {
          e.currentTarget.style.background = C.accent;
          e.currentTarget.style.color = C.bg;
        },
        onMouseLeave: e => {
          if (!isToday) {
            e.currentTarget.style.background = C.accent + "22";
            e.currentTarget.style.color = C.accent;
          }
        }
      }, "View Card \u2192")), isToday && /*#__PURE__*/React.createElement("div", {
        style: {
          height: "2px",
          background: `linear-gradient(90deg, ${C.accent}, transparent)`
        }
      }));
    })), canShowWeekPrimaryActions ? renderWeekPrimaryActions() : null);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.pageBg,
      color: C.text,
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace"
    }
  }, /*#__PURE__*/React.createElement("link", {
    href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap",
    rel: "stylesheet"
  }), /*#__PURE__*/React.createElement("header", {
    style: {
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      position: "sticky",
      top: 0,
      zIndex: 100
    }
  }, (screen !== "week" || selectedDriver !== currentUser) && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (screen === "duty" && dutyLookupSource) {
        setScreen("home");
        setSelectedDuty(null);
        setDutyLookupSource(false);
      } else if (screen === "duty") {
        setScreen("week");
        setSelectedDuty(null);
      } else if (screen === "leave") {
        setScreen("week");
        setLeaveSubmitted(false);
        setLeaveForm({
          dateFrom: "",
          dateTo: "",
          reason: "",
          notes: "",
          email: ""
        });
      } else if (screen === "swap") {
        setScreen("week");
        setSwapSubmitted(false);
        setSwapForm({
          dayIndex: "",
          targetDriver: "",
          notes: ""
        });
      } else if (screen === "timesheet") {
        setScreen("week");
        setTimesheetSubmitted(false);
        setTimesheetSending(false);
        setTimesheetError("");
        setTimesheetDriverEmail("");
      } else if (screen === "leave-manager") {
        setScreen("week");
        setLeaveRequestsError("");
      } else if (screen === "home") {
        openCurrentUserWeek();
      } else if (screen === "week" && selectedDriver !== currentUser) {
        setScreen("home");
        setSearch("");
      } else {
        setScreen("home");
        setSelectedDriver(null);
        setSearch("");
      }
    },
    style: {
      background: "none",
      border: "none",
      color: C.accent,
      fontSize: "16px",
      cursor: "pointer",
      padding: "4px 8px",
      fontFamily: "inherit"
    }
  }, "\u2190 Back"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "14px",
      fontWeight: 700,
      letterSpacing: "3px",
      color: "#ef4444"
    }
  }, "JET"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "9px",
      letterSpacing: "1.5px",
      color: C.textMuted,
      textTransform: "uppercase",
      marginTop: "1px"
    }
  }, "Jason Edwards Travel \u2014 Staff Portal")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11px",
      color: C.textMuted,
      textAlign: "right",
      lineHeight: 1.4,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "4px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600
    }
  }, currentUser), /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: "10px", alignItems: "center", justifyContent: "flex-end" }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: toggleTheme,
    style: {
      background: "none",
      border: "none",
      color: C.textDim,
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
      fontFamily: "inherit",
      lineHeight: 1
    }
  }, theme === "light" ? "\u263D" : "\u2600"), /*#__PURE__*/React.createElement("button", {
    onClick: switchUser,
    style: {
      background: "none",
      border: "none",
      color: C.textDim,
      fontSize: "9px",
      cursor: "pointer",
      padding: 0,
      fontFamily: "inherit",
      textDecoration: "underline"
    }
  }, "Log out")))), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "640px",
      margin: "0 auto",
      padding: "16px"
    }
  }, rotaError && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "12px",
      background: "#fee2e2",
      border: "1px solid #fca5a5",
      borderRadius: "8px",
      padding: "10px 12px",
      fontSize: "10px",
      color: "#b91c1c",
      lineHeight: 1.5
    }
  }, "\u26A0 ", rotaError, " Some duties may be out of date."), screen === "home" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "18px",
      fontWeight: 600,
      margin: "0 0 4px",
      color: C.white
    }
  }, isManager ? "Staff Hub" : "Duty Cards"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "11px",
      color: C.textMuted,
      margin: 0
    }
  }, "w/c ", getWeekCommencing())), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }
  }, rotaLoading && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "10px",
      color: C.accent
    }
  }, "\u23F3"), canBrowseStaff && currentUser && DRIVERS.includes(currentUser) && /*#__PURE__*/React.createElement("button", {
    onClick: openCurrentUserWeek,
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "6px",
      padding: "6px 10px",
      cursor: "pointer",
      color: C.textMuted,
      fontSize: "12px",
      fontFamily: "inherit"
    }
  }, "Rota View"), /*#__PURE__*/React.createElement("button", {
    onClick: refreshRota,
    disabled: rotaLoading,
    title: "Refresh rota data",
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "6px",
      padding: "6px 10px",
      cursor: rotaLoading ? "not-allowed" : "pointer",
      color: C.textMuted,
      fontSize: "12px",
      fontFamily: "inherit"
    }
  }, "\u21BB"))), lastFetchTime && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "9px",
      color: C.textDim,
      marginTop: "4px"
    }
  }, "\uD83D\uDFE2 Live \xB7 Updated ", lastFetchTime)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      marginBottom: "14px",
      background: C.surface,
      borderRadius: "8px",
      border: `1px solid ${C.border}`,
      overflow: "hidden"
    }
  }, canBrowseStaff && /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowDutyLookup(false),
    style: {
      flex: 1,
      padding: "10px",
      background: !showingDutyLookup ? C.accent + "22" : "transparent",
      color: !showingDutyLookup ? C.accent : C.textMuted,
      border: "none",
      fontSize: "12px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px",
      borderBottom: !showingDutyLookup ? `2px solid ${C.accent}` : "2px solid transparent"
    }
  }, "Directory"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowDutyLookup(true),
    style: {
      flex: canBrowseStaff ? 1 : undefined,
      width: canBrowseStaff ? undefined : "100%",
      padding: "10px",
      background: showingDutyLookup ? C.accent + "22" : "transparent",
      color: showingDutyLookup ? C.accent : C.textMuted,
      border: "none",
      fontSize: "12px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px",
      borderBottom: showingDutyLookup ? `2px solid ${C.accent}` : "2px solid transparent"
    }
  }, "Duty Cards")), !showingDutyLookup ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      marginBottom: "16px"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search",
    autoFocus: true,
    style: {
      width: "100%",
      padding: "13px 16px 13px 38px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      color: C.white,
      fontSize: "14px",
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box"
    },
    onFocus: e => e.target.style.borderColor = C.accent,
    onBlur: e => e.target.style.borderColor = C.border
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: "14px",
      top: "50%",
      transform: "translateY(-50%)",
      color: C.textDim,
      fontSize: "14px"
    }
  }, "\u2315")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    }
  }, filtered !== null ?
  /*#__PURE__*/
  /* Search results — flat list */
  React.createElement(React.Fragment, null, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "40px",
      color: C.textDim,
      fontSize: "12px"
    }
  }, "No staff found matching \"", search, "\""), filtered.map(driver => {
    const todayVal = ROTA[driver]?.[today] || "—";
    const st = getStatusStyle(todayVal, driver, false, DRIVER_SECTION, C);
    return /*#__PURE__*/React.createElement("button", {
      key: driver,
      onClick: () => {
        setSelectedDriver(driver);
        setScreen("week");
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "12px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        transition: "all 0.1s"
      },
      onMouseEnter: e => {
        e.currentTarget.style.background = C.surfaceHover;
        e.currentTarget.style.borderColor = C.accent + "33";
      },
      onMouseLeave: e => {
        e.currentTarget.style.background = C.surface;
        e.currentTarget.style.borderColor = C.border;
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.white,
        fontSize: "13px",
        fontWeight: 500
      }
    }, driver), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "9px",
        color: C.textDim,
        marginTop: "1px"
      }
    }, DRIVER_SECTION_LABEL[driver])), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "12px",
        color: isDutyNumber(todayVal) ? C.white : st.color,
        background: st.bg,
        padding: "2px 8px",
        borderRadius: "4px",
        fontWeight: 600
      }
    }, st.label), /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.textDim,
        fontSize: "12px"
      }
    }, "\u203A")));
  })) : (/* Default view — grouped by section */
  STAFF_SECTIONS.map(section => /*#__PURE__*/React.createElement("div", {
    key: section.key,
    style: {
      marginBottom: "12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "10px",
      fontWeight: 700,
      color: C.accent,
      letterSpacing: "1.5px",
      padding: "8px 4px 6px",
      textTransform: "uppercase"
    }
  }, section.label, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.textDim,
      fontWeight: 400
    }
  }, "(", section.drivers.length, ")")), section.drivers.map(driver => {
    const todayVal = ROTA[driver]?.[today] || "—";
    const st = getStatusStyle(todayVal, driver, false, DRIVER_SECTION, C);
    return /*#__PURE__*/React.createElement("button", {
      key: driver,
      onClick: () => {
        setSelectedDriver(driver);
        setScreen("week");
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "12px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        marginBottom: "4px",
        transition: "all 0.1s"
      },
      onMouseEnter: e => {
        e.currentTarget.style.background = C.surfaceHover;
        e.currentTarget.style.borderColor = C.accent + "33";
      },
      onMouseLeave: e => {
        e.currentTarget.style.background = C.surface;
        e.currentTarget.style.borderColor = C.border;
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.white,
        fontSize: "13px",
        fontWeight: 500
      }
    }, driver), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, isCurrentWeek ? "Today:" : SHORT_DAYS[today] + ":"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "12px",
        color: isDutyNumber(todayVal) ? C.white : st.color,
        background: st.bg,
        padding: "2px 8px",
        borderRadius: "4px",
        fontWeight: 600
      }
    }, st.label), /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.textDim,
        fontSize: "12px"
      }
    }, "\u203A")));
  })))))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      marginBottom: "16px"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: dutySearch,
    onChange: e => setDutySearch(e.target.value),
    placeholder: "Search duty number or route...",
    autoFocus: true,
    style: {
      width: "100%",
      padding: "13px 16px 13px 38px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      color: C.white,
      fontSize: "14px",
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box"
    },
    onFocus: e => e.target.style.borderColor = C.accent,
    onBlur: e => e.target.style.borderColor = C.border
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: "14px",
      top: "50%",
      transform: "translateY(-50%)",
      color: C.textDim,
      fontSize: "14px"
    }
  }, "\u2315")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    }
  }, (() => {
    const allDuties = Object.values(DUTY_CARDS).sort((a, b) => a.number - b.number);
    const q = dutySearch.toLowerCase().trim();
    const matchedDuties = q ? allDuties.filter(d => String(d.number).includes(q) || d.route.toLowerCase().includes(q) || d.days.toLowerCase().includes(q)) : allDuties;
    if (matchedDuties.length === 0) return /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "40px",
        color: C.textDim,
        fontSize: "12px"
      }
    }, "No duties found matching \"", dutySearch, "\"");
    return matchedDuties.map(duty => /*#__PURE__*/React.createElement("button", {
      key: duty.number,
      onClick: () => {
        setSelectedDuty(duty.number);
        setDutyLookupSource(true);
        setScreen("duty");
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "12px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        transition: "all 0.1s"
      },
      onMouseEnter: e => {
        e.currentTarget.style.background = C.surfaceHover;
        e.currentTarget.style.borderColor = C.accent + "33";
      },
      onMouseLeave: e => {
        e.currentTarget.style.background = C.surface;
        e.currentTarget.style.borderColor = C.border;
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.white,
        fontSize: "14px",
        fontWeight: 700
      }
    }, duty.number), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        marginTop: "2px"
      }
    }, duty.route, " \xB7 ", duty.days)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "11px",
        color: C.textDim
      }
    }, duty.signOn, "\u2013", duty.signOff), /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.textDim,
        fontSize: "12px"
      }
    }, "\u203A"))));
  })()))), screen === "week" && selectedDriver && renderWeekScreen(), screen === "leave" && actionDriver && (() => {
    const handleSubmit = async () => {
      if (!leaveForm.dateFrom || !leaveForm.dateTo || leaveSending) return;
      const fromDate = new Date(leaveForm.dateFrom).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      const toDate = new Date(leaveForm.dateTo).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      const startD = new Date(leaveForm.dateFrom);
      const endD = new Date(leaveForm.dateTo);
      const diffDays = Math.max(1, Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1);
      setLeaveSending(true);
      setLeaveError("");
      try {
        const response = await fetch(LEAVE_REQUESTS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            payload: {
              driverName: actionDriver,
              fromDateLabel: fromDate,
              toDateLabel: toDate,
              dateFrom: leaveForm.dateFrom,
              dateTo: leaveForm.dateTo,
              totalDays: diffDays,
              reason: leaveForm.reason || "Annual leave",
              notes: leaveForm.notes || "",
              driverEmail: leaveForm.email || ""
            }
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "Failed to send leave request. Please try again.");
        }
        setLeaveSubmitted(true);
      } catch (err) {
        setLeaveError(err?.message || "Failed to send leave request. Please try again.");
      } finally {
        setLeaveSending(false);
      }
    };
    const inputStyle = {
      width: "100%",
      padding: "12px 14px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      color: C.white,
      fontSize: "13px",
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box"
    };
    const dateInputStyle = {
      ...inputStyle,
      colorScheme: "dark",
      cursor: "pointer"
    };
    const leaveStatusStyles = {
      pending: { background: "#f59e0b22", color: "#fbbf24" },
      approved: { background: "#22c55e22", color: "#4ade80" },
      declined: { background: "#ef444422", color: "#f87171" },
      cancelled: { background: "#64748b22", color: "#94a3b8" }
    };
    const renderMyLeaveRequests = () => {
      if (myLeaveRequests.length === 0) return null;
      return /*#__PURE__*/React.createElement("div", {
        style: { marginTop: "24px" }
      },
        /*#__PURE__*/React.createElement("p", {
          style: { fontSize: "11px", fontWeight: 600, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }
        }, "My Leave Requests"),
        /*#__PURE__*/React.createElement("div", {
          style: { display: "flex", flexDirection: "column", gap: "8px" }
        }, myLeaveRequests.map(req => {
          const badge = leaveStatusStyles[req.status] || leaveStatusStyles.cancelled;
          const fromLabel = req.fromDateLabel || req.dateFrom || "—";
          const toLabel = req.toDateLabel || req.dateTo || "—";
          return /*#__PURE__*/React.createElement("div", {
            key: req.id,
            style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }
          },
            /*#__PURE__*/React.createElement("div", {
              style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }
            },
              /*#__PURE__*/React.createElement("span", {
                style: { fontSize: "12px", fontWeight: 600, color: C.white }
              }, `${fromLabel}${fromLabel !== toLabel ? ` → ${toLabel}` : ""}`),
              /*#__PURE__*/React.createElement("span", {
                style: { fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", ...badge, textTransform: "capitalize" }
              }, req.status)
            ),
            /*#__PURE__*/React.createElement("div", {
              style: { fontSize: "11px", color: C.textDim }
            }, `${req.totalDays} ${req.totalDays === 1 ? "day" : "days"}${req.reason && req.reason !== "Annual leave" ? ` · ${req.reason}` : ""}`,
              req.respondedBy && req.status !== "pending" ? ` · ${req.status === "approved" ? "Approved" : req.status === "declined" ? "Declined" : "Actioned"} by ${req.respondedBy}` : null
            )
          );
        }))
      );
    };
    const renderLeaveCalendar = () => {
      const { year, month } = calendarMonth;
      const leaveDays = {};
      for (const req of calendarRequests) {
        if (req.status !== "approved" || !req.dateFrom || !req.dateTo) continue;
        const from = new Date(req.dateFrom + "T00:00:00");
        const to = new Date(req.dateTo + "T00:00:00");
        const cur = new Date(from);
        while (cur <= to) {
          const key = cur.toISOString().slice(0, 10);
          if (!leaveDays[key]) leaveDays[key] = [];
          leaveDays[key].push(req.driverName);
          cur.setDate(cur.getDate() + 1);
        }
      }
      const firstDay = new Date(year, month, 1);
      const lastDate = new Date(year, month + 1, 0).getDate();
      const startDow = firstDay.getDay();
      const monthLabel = firstDay.toLocaleString("en-GB", { month: "long", year: "numeric" });
      const todayStr = new Date().toISOString().slice(0, 10);
      const days = [];
      for (let i = 0; i < startDow; i++) days.push(null);
      for (let d = 1; d <= lastDate; d++) days.push(d);
      return /*#__PURE__*/React.createElement("div", {
        style: { marginTop: "24px" }
      },
        /*#__PURE__*/React.createElement("p", {
          style: { fontSize: "11px", fontWeight: 600, color: C.textDim, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }
        }, "Approved Leave Calendar"),
        /*#__PURE__*/React.createElement("div", {
          style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px" }
        },
          /*#__PURE__*/React.createElement("div", {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }
          },
            /*#__PURE__*/React.createElement("button", {
              onClick: () => setCalendarMonth(prev => { const d = new Date(prev.year, prev.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; }),
              style: { background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: "18px", padding: "2px 8px", lineHeight: 1 }
            }, "‹"),
            /*#__PURE__*/React.createElement("span", {
              style: { fontSize: "13px", fontWeight: 600, color: C.white }
            }, monthLabel),
            /*#__PURE__*/React.createElement("button", {
              onClick: () => setCalendarMonth(prev => { const d = new Date(prev.year, prev.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; }),
              style: { background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: "18px", padding: "2px 8px", lineHeight: 1 }
            }, "›")
          ),
          /*#__PURE__*/React.createElement("div", {
            style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }
          }, ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d =>
            /*#__PURE__*/React.createElement("div", {
              key: d,
              style: { textAlign: "center", fontSize: "10px", fontWeight: 600, color: C.textDim, padding: "2px 0" }
            }, d)
          )),
          /*#__PURE__*/React.createElement("div", {
            style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }
          }, days.map((day, i) => {
            if (day === null) return /*#__PURE__*/React.createElement("div", { key: `pad${i}` });
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const onLeave = leaveDays[dateStr] || [];
            const isToday = dateStr === todayStr;
            const hasLeave = onLeave.length > 0;
            return /*#__PURE__*/React.createElement("div", {
              key: dateStr,
              title: hasLeave ? `On leave: ${onLeave.join(", ")}` : undefined,
              style: {
                textAlign: "center",
                padding: "5px 2px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: isToday ? 700 : 400,
                background: hasLeave ? "#22c55e18" : "transparent",
                color: hasLeave ? "#4ade80" : isToday ? C.accent : C.text,
                border: isToday ? `1px solid ${C.accent}44` : "1px solid transparent",
                cursor: hasLeave ? "help" : "default"
              }
            },
              day,
              hasLeave && /*#__PURE__*/React.createElement("div", {
                style: { width: "4px", height: "4px", borderRadius: "50%", background: "#4ade80", margin: "1px auto 0" }
              })
            );
          }))
        )
      );
    };
    if (leaveSubmitted) return /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "40px 20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "48px",
        marginBottom: "16px"
      }
    }, "\u2705"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "18px",
        fontWeight: 600,
        color: C.white,
        margin: "0 0 8px"
      }
    }, "Request Sent"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "12px",
        color: C.textMuted,
        margin: "0 0 24px",
        lineHeight: 1.5
      }
    }, "Your annual leave request has been sent to the office."), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setScreen("week");
        setLeaveSubmitted(false);
        setLeaveError("");
        setLeaveSending(false);
        setLeaveForm({
          dateFrom: "",
          dateTo: "",
          reason: "",
          notes: "",
          email: ""
        });
      },
      style: {
        background: C.accent,
        color: C.bg,
        border: "none",
        borderRadius: "8px",
        padding: "12px 24px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "Back to Rota"), renderMyLeaveRequests(), renderLeaveCalendar());
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "20px"
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "17px",
        fontWeight: 600,
        margin: "0 0 2px",
        color: C.white
      }
    }, "Request Annual Leave"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        margin: 0
      }
    }, actionDriver)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "FIRST DAY OF LEAVE"), /*#__PURE__*/React.createElement("input", {
      type: "date",
      value: leaveForm.dateFrom,
      onClick: e => openNativeDatePicker(e.currentTarget),
      onFocus: e => openNativeDatePicker(e.currentTarget),
      onChange: e => {
        const v = e.target.value;
        setLeaveForm(f => ({
          ...f,
          dateFrom: v,
          dateTo: f.dateTo && f.dateTo < v ? v : f.dateTo
        }));
      },
      style: dateInputStyle
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "LAST DAY OF LEAVE"), /*#__PURE__*/React.createElement("input", {
      type: "date",
      value: leaveForm.dateTo,
      min: leaveForm.dateFrom || undefined,
      onClick: e => openNativeDatePicker(e.currentTarget),
      onFocus: e => openNativeDatePicker(e.currentTarget),
      onChange: e => setLeaveForm(f => ({
        ...f,
        dateTo: e.target.value
      })),
      style: dateInputStyle
    })), leaveForm.dateFrom && leaveForm.dateTo && (() => {
      const d1 = new Date(leaveForm.dateFrom);
      const d2 = new Date(leaveForm.dateTo);
      const diff = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
      return /*#__PURE__*/React.createElement("div", {
        style: {
          background: C.accent + "11",
          border: `1px solid ${C.accent}22`,
          borderRadius: "8px",
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "12px",
          color: C.textMuted
        }
      }, "Total days requested"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "18px",
          fontWeight: 700,
          color: C.accent
        }
      }, diff));
    })(), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "REASON (OPTIONAL)"), /*#__PURE__*/React.createElement("select", {
      value: leaveForm.reason,
      onChange: e => setLeaveForm(f => ({
        ...f,
        reason: e.target.value
      })),
      style: {
        ...inputStyle,
        colorScheme: "dark",
        appearance: "auto"
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "Annual leave"), /*#__PURE__*/React.createElement("option", {
      value: "Family commitment"
    }, "Family commitment"), /*#__PURE__*/React.createElement("option", {
      value: "Medical appointment"
    }, "Medical appointment"), /*#__PURE__*/React.createElement("option", {
      value: "Personal"
    }, "Personal"), /*#__PURE__*/React.createElement("option", {
      value: "Other"
    }, "Other"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "ADDITIONAL NOTES (OPTIONAL)"), /*#__PURE__*/React.createElement("textarea", {
      value: leaveForm.notes,
      onChange: e => setLeaveForm(f => ({
        ...f,
        notes: e.target.value
      })),
      rows: 3,
      placeholder: "Any extra info...",
      style: {
        ...inputStyle,
        resize: "vertical"
      }
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "YOUR EMAIL (OPTIONAL — FOR REPLIES)"), /*#__PURE__*/React.createElement("input", {
      type: "email",
      value: leaveForm.email,
      onChange: e => setLeaveForm(f => ({
        ...f,
        email: e.target.value
      })),
      placeholder: "your@email.com",
      style: inputStyle
    })), /*#__PURE__*/React.createElement("button", {
      onClick: handleSubmit,
      disabled: !leaveForm.dateFrom || !leaveForm.dateTo || leaveSending,
      style: {
        width: "100%",
        padding: "14px",
        background: !leaveForm.dateFrom || !leaveForm.dateTo || leaveSending ? C.textDim + "44" : C.accent,
        color: !leaveForm.dateFrom || !leaveForm.dateTo || leaveSending ? C.textDim : C.bg,
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 700,
        cursor: !leaveForm.dateFrom || !leaveForm.dateTo || leaveSending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px",
        marginTop: "6px"
      }
    }, leaveSending ? "Sending..." : "Submit Leave Request"), leaveError && /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: "#be123c",
        textAlign: "center",
        lineHeight: 1.5,
        margin: "2px 0 0"
      }
    }, leaveError), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: C.textDim,
        textAlign: "center",
        lineHeight: 1.5,
        margin: "4px 0 0"
      }
    }, "Leave requests are reviewed by the office.")), renderMyLeaveRequests(), renderLeaveCalendar());
  })(), screen === "swap" && actionDriver && (() => {
    const myRota = ROTA[actionDriver] || [];
    const otherDrivers = DRIVERS.filter(d => d !== actionDriver);
    const selectedDayIndex = swapForm.dayIndex === "" ? null : parseInt(swapForm.dayIndex, 10);
    const selectedDayDuty = selectedDayIndex !== null ? myRota[selectedDayIndex] || "—" : null;
    const targetRota = swapForm.targetDriver ? ROTA[swapForm.targetDriver] || [] : [];
    const targetDayDuty = selectedDayIndex !== null && swapForm.targetDriver ? targetRota[selectedDayIndex] || "—" : null;
    const weekCommencing = parseWeekTabNameToIso(currentTabName);
    const inputStyle = {
      width: "100%",
      padding: "12px 14px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      color: C.white,
      fontSize: "13px",
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box"
    };
    const statusStyles = {
      pending: {
        background: "#f59e0b22",
        color: "#fbbf24"
      },
      approved: {
        background: "#22c55e22",
        color: "#4ade80"
      },
      declined: {
        background: "#ef444422",
        color: "#f87171"
      },
      cancelled: {
        background: C.textDim + "22",
        color: C.textDim
      },
      expired: {
        background: "#64748b22",
        color: "#94a3b8"
      }
    };
    const outboundPending = swapRequests.filter(request => request.status === "pending" && request.requestingDriver === actionDriver);
    const inboundPending = swapRequests.filter(request => request.status === "pending" && request.targetDriver === actionDriver);
    const resolvedRequests = swapRequests.filter(request => request.status !== "pending");
    const handleSwapSubmit = () => {
      if (selectedDayIndex === null || !swapForm.targetDriver || swapSending) return;
      setSwapSending(true);
      setSwapError("");
      createSwapRequest({
        requestingDriver: actionDriver,
        targetDriver: swapForm.targetDriver,
        dayIndex: selectedDayIndex,
        dayName: DAYS[selectedDayIndex],
        weekCommencing,
        requestingDuty: selectedDayDuty || "—",
        targetDuty: targetDayDuty || "—",
        notes: swapForm.notes || ""
      }).then(request => {
        setSwapRequests(prev => [request, ...prev]);
        setSwapSubmitted(true);
      }).catch(err => {
        setSwapError(err?.message || "Unable to send your swap request right now.");
      }).finally(() => {
        setSwapSending(false);
      });
    };
    const handleSwapAction = (id, action) => {
      if (!id || swapActionPending) return;
      setSwapActionPending(`${action}:${id}`);
      setSwapError("");
      updateSwapRequestAction(id, action).then(updatedRequest => {
        setSwapRequests(prev => prev.map(request => request.id === updatedRequest.id ? updatedRequest : request));
      }).catch(err => {
        setSwapError(err?.message || "Unable to update this swap request right now.");
      }).finally(() => {
        setSwapActionPending("");
      });
    };
    const renderSwapRequestCard = (request, context) => {
      const badgeStyle = statusStyles[request.status] || statusStyles.cancelled;
      const isInbound = context === "inbound";
      const isOutbound = context === "outbound";
      const actionDisabled = swapActionPending !== "";
      const summaryLabel = isInbound ? `${request.requestingDriver} wants your ${request.dayName} duty` : isOutbound ? `Awaiting ${request.targetDriver}` : `${request.requestingDriver} ↔ ${request.targetDriver}`;
      return /*#__PURE__*/React.createElement("div", {
        key: request.id,
        style: {
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "10px",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px"
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "12px",
          fontWeight: 700,
          color: C.white
        }
      }, summaryLabel), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, request.dayName, " · ", formatSwapWeekLabel(request.weekCommencing))), /*#__PURE__*/React.createElement("span", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          padding: "4px 8px",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.4px",
          background: badgeStyle.background,
          color: badgeStyle.color,
          textTransform: "uppercase"
        }
      }, request.status)), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "8px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#06b6d411",
          border: "1px solid #06b6d422",
          borderRadius: "8px",
          padding: "10px 12px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "9px",
          color: C.textDim,
          letterSpacing: "0.5px",
          fontWeight: 700,
          marginBottom: "4px"
        }
      }, request.requestingDriver === actionDriver ? "YOUR DUTY" : `${request.requestingDriver.toUpperCase()}'S DUTY`), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "14px",
          fontWeight: 700,
          color: "#06b6d4"
        }
      }, request.requestingDuty)), /*#__PURE__*/React.createElement("div", {
        style: {
          background: "#f9731611",
          border: "1px solid #f9731622",
          borderRadius: "8px",
          padding: "10px 12px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "9px",
          color: C.textDim,
          letterSpacing: "0.5px",
          fontWeight: 700,
          marginBottom: "4px"
        }
      }, request.targetDriver === actionDriver ? "YOUR DUTY" : `${request.targetDriver.toUpperCase()}'S DUTY`), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "14px",
          fontWeight: 700,
          color: "#f97316"
        }
      }, request.targetDuty))), request.notes && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          lineHeight: 1.5
        }
      }, "Notes: ", request.notes), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          fontSize: "10px",
          color: C.textDim
        }
      }, /*#__PURE__*/React.createElement("span", null, "Created: ", formatSwapDateTime(request.createdAt)), request.status === "pending" ? /*#__PURE__*/React.createElement("span", {
        style: {
          color: C.accent
        }
      }, formatSwapExpiryLabel(request.expiresAt)) : request.respondedAt ? /*#__PURE__*/React.createElement("span", null, "Updated: ", formatSwapDateTime(request.respondedAt)) : null), request.status === "pending" && /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: "8px",
          flexWrap: "wrap"
        }
      }, isInbound && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
        onClick: () => handleSwapAction(request.id, "approve"),
        disabled: actionDisabled,
        style: {
          background: "#22c55e",
          color: C.bg,
          border: "none",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: actionDisabled ? "not-allowed" : "pointer",
          fontFamily: "inherit"
        }
      }, swapActionPending === `approve:${request.id}` ? "Approving..." : "Approve"), /*#__PURE__*/React.createElement("button", {
        onClick: () => handleSwapAction(request.id, "decline"),
        disabled: actionDisabled,
        style: {
          background: "#ef4444",
          color: C.white,
          border: "none",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: actionDisabled ? "not-allowed" : "pointer",
          fontFamily: "inherit"
        }
      }, swapActionPending === `decline:${request.id}` ? "Declining..." : "Decline")), isOutbound && /*#__PURE__*/React.createElement("button", {
        onClick: () => handleSwapAction(request.id, "cancel"),
        disabled: actionDisabled,
        style: {
          background: C.textDim + "22",
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: actionDisabled ? "not-allowed" : "pointer",
          fontFamily: "inherit"
        }
      }, swapActionPending === `cancel:${request.id}` ? "Cancelling..." : "Cancel")));
    };
    if (swapSubmitted) return /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "40px 20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "48px",
        marginBottom: "16px"
      }
    }, "\uD83D\uDD04"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "18px",
        fontWeight: 600,
        color: C.white,
        margin: "0 0 8px"
      }
    }, "Swap Request Sent"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "12px",
        color: C.textMuted,
        margin: "0 0 24px",
        lineHeight: 1.5
      }
    }, "Your shift swap request is now waiting for the other driver to approve it."), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setSwapSubmitted(false);
        setSwapError("");
        setSwapSending(false);
        setSwapForm({
          dayIndex: "",
          targetDriver: "",
          notes: ""
        });
      },
      style: {
        background: "#06b6d4",
        color: C.bg,
        border: "none",
        borderRadius: "8px",
        padding: "12px 24px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "Back to Swaps"));
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "17px",
        fontWeight: 600,
        margin: "0 0 2px",
        color: C.white
      }
    }, "Request Shift Swap"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        margin: 0
      }
    }, actionDriver)), inboundPending.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#f59e0b18",
        border: "1px solid #f59e0b33",
        borderRadius: "999px",
        padding: "8px 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        color: "#fbbf24",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.4px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: "18px",
        height: "18px",
        borderRadius: "999px",
        background: "#dc2626",
        color: "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "10px",
        fontWeight: 700,
        lineHeight: 1
      }
    }, inboundPending.length > 9 ? "9+" : String(inboundPending.length)), inboundPending.length === 1 ? "1 approval waiting below" : `${inboundPending.length} approvals waiting below`))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "WHICH DAY?"), /*#__PURE__*/React.createElement("select", {
      value: swapForm.dayIndex,
      onChange: e => setSwapForm(f => ({
        ...f,
        dayIndex: e.target.value
      })),
      style: {
        ...inputStyle,
        colorScheme: "dark",
        appearance: "auto"
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "Select a day..."), DAYS.map((day, i) => {
      const val = myRota[i] || "—";
      return /*#__PURE__*/React.createElement("option", {
        key: i,
        value: i
      }, day, " \u2014 ", val);
    }))), selectedDayDuty && /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#06b6d411",
        border: "1px solid #06b6d422",
        borderRadius: "8px",
        padding: "12px 14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px",
        marginBottom: "4px"
      }
    }, "YOUR DUTY (", DAYS[selectedDayIndex], ")"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: "#06b6d4"
      }
    }, selectedDayDuty)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "SWAP WITH"), /*#__PURE__*/React.createElement("select", {
      value: swapForm.targetDriver,
      onChange: e => setSwapForm(f => ({
        ...f,
        targetDriver: e.target.value
      })),
      style: {
        ...inputStyle,
        colorScheme: "dark",
        appearance: "auto"
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "Select a driver..."), otherDrivers.map(d => {
      const theirDuty = selectedDayIndex !== null ? ROTA[d]?.[selectedDayIndex] || "—" : "";
      return /*#__PURE__*/React.createElement("option", {
        key: d,
        value: d
      }, d, theirDuty ? ` — ${theirDuty}` : "");
    }))), targetDayDuty && swapForm.targetDriver && /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#f9731611",
        border: "1px solid #f9731622",
        borderRadius: "8px",
        padding: "12px 14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px",
        marginBottom: "4px"
      }
    }, swapForm.targetDriver.toUpperCase(), "'S DUTY (", DAYS[selectedDayIndex], ")"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: "#f97316"
      }
    }, targetDayDuty)), selectedDayDuty && targetDayDuty && swapForm.targetDriver && /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "14px",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px",
        marginBottom: "10px"
      }
    }, "SWAP PREVIEW \u2014 ", DAYS[selectedDayIndex]), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted
      }
    }, actionDriver.split(" ")[0]), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "15px",
        fontWeight: 700,
        color: "#06b6d4"
      }
    }, selectedDayDuty)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "20px",
        color: C.accent
      }
    }, "\u21C4"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted
      }
    }, swapForm.targetDriver.split(" ")[0]), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "15px",
        fontWeight: 700,
        color: "#f97316"
      }
    }, targetDayDuty)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "REASON / NOTES (OPTIONAL)"), /*#__PURE__*/React.createElement("textarea", {
      value: swapForm.notes,
      onChange: e => setSwapForm(f => ({
        ...f,
        notes: e.target.value
      })),
      rows: 2,
      placeholder: "Why do you want to swap?",
      style: {
        ...inputStyle,
        resize: "vertical"
      }
    })), /*#__PURE__*/React.createElement("button", {
      onClick: handleSwapSubmit,
      disabled: selectedDayIndex === null || !swapForm.targetDriver || swapSending,
      style: {
        width: "100%",
        padding: "14px",
        background: selectedDayIndex === null || !swapForm.targetDriver || swapSending ? C.textDim + "44" : "#06b6d4",
        color: selectedDayIndex === null || !swapForm.targetDriver || swapSending ? C.textDim : C.bg,
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 700,
        cursor: selectedDayIndex === null || !swapForm.targetDriver || swapSending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px",
        marginTop: "6px"
      }
    }, swapSending ? "Sending..." : "Send Swap Request"), swapError && /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: "#be123c",
        textAlign: "center",
        lineHeight: 1.5,
        margin: "2px 0 0"
      }
    }, swapError), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: C.textDim,
        textAlign: "center",
        lineHeight: 1.5,
        margin: "4px 0 0"
      }
    }, "This sends your request to the other driver for approval. Management is emailed only after approval.")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 700,
        color: C.white,
        marginBottom: "8px"
      }
    }, "Waiting For Your Approval"), swapRequestsLoading ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, "Loading swap requests...") : inboundPending.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim,
        padding: "12px 0"
      }
    }, "No incoming swap approvals.") : inboundPending.map(request => renderSwapRequestCard(request, "inbound"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 700,
        color: C.white,
        marginBottom: "8px"
      }
    }, "Waiting For Other Drivers"), !swapRequestsLoading && outboundPending.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim,
        padding: "12px 0"
      }
    }, "No outbound pending swaps.") : outboundPending.map(request => renderSwapRequestCard(request, "outbound"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 700,
        color: C.white,
        marginBottom: "8px"
      }
    }, "Recent Swap History"), !swapRequestsLoading && resolvedRequests.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim,
        padding: "12px 0"
      }
    }, "No resolved swaps yet.") : resolvedRequests.map(request => renderSwapRequestCard(request, "history"))), swapRequestsError && /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: "#be123c",
        lineHeight: 1.5,
        margin: "2px 0 0"
      }
    }, swapRequestsError)));
  })(), screen === "leave-manager" && isLeaveManager && (() => {
    const pendingRequests = leaveRequests.filter(r => r.status === "pending");
    const resolvedRequests = leaveRequests.filter(r => r.status !== "pending");
    const statusStyles = {
      pending: {
        background: "#f59e0b22",
        color: "#fbbf24"
      },
      approved: {
        background: "#22c55e22",
        color: "#4ade80"
      },
      declined: {
        background: "#ef444422",
        color: "#f87171"
      },
      cancelled: {
        background: C.textDim + "22",
        color: C.textDim
      }
    };
    const handleLeaveAction = (id, action) => {
      if (!id || leaveActionPending) return;
      setLeaveActionPending(`${action}:${id}`);
      setLeaveRequestsError("");
      updateLeaveRequestAction(id, action).then(updatedRequest => {
        setLeaveRequests(prev => prev.map(r => r.id === updatedRequest.id ? updatedRequest : r));
      }).catch(err => {
        setLeaveRequestsError(err?.message || "Unable to update this leave request right now.");
      }).finally(() => {
        setLeaveActionPending("");
      });
    };
    const renderLeaveRequestCard = (request, isPending) => {
      const badgeStyle = statusStyles[request.status] || statusStyles.cancelled;
      const actionDisabled = leaveActionPending !== "";
      const fromLabel = request.fromDateLabel || request.dateFrom || "—";
      const toLabel = request.toDateLabel || request.dateTo || "—";
      return /*#__PURE__*/React.createElement("div", {
        key: request.id,
        style: {
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "10px",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px"
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "12px",
          fontWeight: 700,
          color: C.white
        }
      }, request.driverName), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, fromLabel, " \u2192 ", toLabel, " \u00B7 ", request.totalDays, " ", request.totalDays === 1 ? "day" : "days")), /*#__PURE__*/React.createElement("span", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          padding: "4px 8px",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.4px",
          background: badgeStyle.background,
          color: badgeStyle.color,
          textTransform: "uppercase",
          flexShrink: 0
        }
      }, request.status)), request.reason && request.reason !== "Annual leave" && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          lineHeight: 1.5
        }
      }, "Reason: ", request.reason), request.notes && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          lineHeight: 1.5
        }
      }, "Notes: ", request.notes), request.driverEmail && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textDim,
          lineHeight: 1.5
        }
      }, "\u2709 ", request.driverEmail), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          fontSize: "10px",
          color: C.textDim
        }
      }, /*#__PURE__*/React.createElement("span", null, "Submitted: ", new Date(request.createdAt).toLocaleDateString("en-GB")), !isPending && request.respondedAt && request.respondedBy && /*#__PURE__*/React.createElement("span", null, request.status === "approved" ? "Approved" : request.status === "declined" ? "Declined" : "Updated", " by ", request.respondedBy)), isPending && /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: "8px",
          flexWrap: "wrap"
        }
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => handleLeaveAction(request.id, "approve"),
        disabled: actionDisabled,
        style: {
          background: "#22c55e",
          color: C.bg,
          border: "none",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: actionDisabled ? "not-allowed" : "pointer",
          fontFamily: "inherit"
        }
      }, leaveActionPending === `approve:${request.id}` ? "Approving..." : "Approve"), /*#__PURE__*/React.createElement("button", {
        onClick: () => handleLeaveAction(request.id, "decline"),
        disabled: actionDisabled,
        style: {
          background: "#ef4444",
          color: C.white,
          border: "none",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: actionDisabled ? "not-allowed" : "pointer",
          fontFamily: "inherit"
        }
      }, leaveActionPending === `decline:${request.id}` ? "Declining..." : "Decline")));
    };
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "17px",
        fontWeight: 600,
        margin: "0 0 2px",
        color: C.white
      }
    }, "Leave Requests"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        margin: 0
      }
    }, "Review and respond to driver leave requests")), /*#__PURE__*/React.createElement("button", {
      onClick: loadLeaveRequestsForManager,
      disabled: leaveRequestsLoading,
      style: {
        background: "none",
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        color: leaveRequestsLoading ? C.textDim : C.accent,
        fontSize: "11px",
        fontWeight: 600,
        padding: "8px 12px",
        cursor: leaveRequestsLoading ? "not-allowed" : "pointer",
        fontFamily: "inherit"
      }
    }, leaveRequestsLoading ? "Loading..." : "\u21BB Refresh"))), leaveRequestsLoading && leaveRequests.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        color: C.textMuted,
        padding: "24px 0",
        textAlign: "center"
      }
    }, "Loading leave requests..."), !leaveRequestsLoading && leaveRequests.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        color: C.textDim,
        padding: "24px 0",
        textAlign: "center"
      }
    }, "No leave requests yet."), pendingRequests.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        fontWeight: 700,
        color: "#fbbf24",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        marginBottom: "8px"
      }
    }, "Pending \u2014 ", pendingRequests.length), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginBottom: "20px"
      }
    }, pendingRequests.map(r => renderLeaveRequestCard(r, true)))), resolvedRequests.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        fontWeight: 700,
        color: C.textDim,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        marginBottom: "8px"
      }
    }, "History"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, resolvedRequests.map(r => renderLeaveRequestCard(r, false)))), leaveRequestsError && /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: "#be123c",
        lineHeight: 1.5,
        margin: "2px 0 0"
      }
    }, leaveRequestsError));
  })(), screen === "timesheet" && actionDriver && (() => {
    const rows = timesheetRows.length === DAYS.length ? timesheetRows : buildTimesheetRowsForDriver(actionDriver);
    const resolveTimesheetDutyLabel = dutyCode => getTimesheetDefaultsForDuty(dutyCode, actionDriver).dutyLabel;
    const clearTimesheetStateFlags = () => {
      if (timesheetSubmitted) setTimesheetSubmitted(false);
      if (timesheetError) setTimesheetError("");
    };
    const updateTimesheetRow = (dayIndex, patch) => {
      setTimesheetRows(prev => {
        const baseRows = prev.length === DAYS.length ? prev : buildTimesheetRowsForDriver(actionDriver);
        return baseRows.map(row => row.dayIndex === dayIndex ? {
          ...row,
          ...patch
        } : row);
      });
      clearTimesheetStateFlags();
    };
    const resetTimesheetView = () => {
      setTimesheetRows(buildTimesheetRowsForDriver(actionDriver));
      setTimesheetSubmitted(false);
      setTimesheetSending(false);
      setTimesheetError("");
      setTimesheetDriverEmail("");
    };
    const updateTimesheetExpensesForDay = (dayIndex, updater) => {
      setTimesheetRows(prev => {
        const baseRows = prev.length === DAYS.length ? prev : buildTimesheetRowsForDriver(actionDriver);
        return baseRows.map(row => {
          if (row.dayIndex !== dayIndex) return row;
          const nextExpenses = normalizeTimesheetExpenseList(updater(normalizeTimesheetExpenseList(row.expenses, row.rowDate)), row.rowDate);
          return {
            ...row,
            expenses: nextExpenses
          };
        });
      });
      clearTimesheetStateFlags();
    };
    const addTimesheetExpense = dayIndex => {
      updateTimesheetExpensesForDay(dayIndex, expensesForDay => {
        const rowDate = rows.find(row => row.dayIndex === dayIndex)?.rowDate || "";
        const nextId = expensesForDay.reduce((maxId, expense) => Math.max(maxId, expense.id), 0) + 1;
        return [...expensesForDay, createEmptyTimesheetExpense(nextId, rowDate)];
      });
    };
    const updateTimesheetExpense = (dayIndex, expenseId, patch) => {
      updateTimesheetExpensesForDay(dayIndex, expensesForDay => expensesForDay.map(expense => expense.id === expenseId ? {
        ...expense,
        ...patch
      } : expense));
    };
    const removeTimesheetExpense = (dayIndex, expenseId) => {
      updateTimesheetExpensesForDay(dayIndex, expensesForDay => expensesForDay.filter(expense => expense.id !== expenseId));
    };
    const totals = rows.reduce((acc, row) => {
      const minutes = getDurationMinutes(row.startTime, row.finishTime);
      const rowCost = Math.max(0, Number(row.travelCost) || 0);
      acc.minutes += minutes;
      acc.travelCost += rowCost;
      return acc;
    }, {
      minutes: 0,
      travelCost: 0
    });
    const expenseTotals = rows.reduce((acc, row) => {
      normalizeTimesheetExpenseList(row.expenses, row.rowDate).forEach(expense => {
        const amount = Math.max(0, Number(expense.amount) || 0);
        if (!expense.description && amount <= 0) return;
        acc.total += amount;
        acc.items.push({
          dayName: row.dayName,
          date: normalizeTimesheetExpenseDate(expense.date) || normalizeTimesheetExpenseDate(row.rowDate),
          description: expense.description || "Unlabelled expense",
          amount
        });
      });
      return acc;
    }, {
      total: 0,
      items: []
    });
    const overallExpenseTotal = totals.travelCost + expenseTotals.total;
    const totalHoursDecimal = (totals.minutes / 60).toFixed(2);
    const isSundayEvening = (() => {
      const now = new Date();
      return now.getDay() === 0 && now.getHours() >= 18;
    })();
    const handleTimesheetSubmit = async () => {
      if (timesheetSending) return;
      setTimesheetSending(true);
      setTimesheetError("");
      try {
        const lines = rows.map(row => {
          const rowMinutes = getDurationMinutes(row.startTime, row.finishTime);
          const rowHours = (rowMinutes / 60).toFixed(2);
          const rowCost = Math.max(0, Number(row.travelCost) || 0);
          const dutyCode = String(row.dutyCode || "—").trim() || "—";
          const dutyLabel = resolveTimesheetDutyLabel(dutyCode);
          const startTime = isTimeValue(row.startTime) ? row.startTime : "--:--";
          const finishTime = isTimeValue(row.finishTime) ? row.finishTime : "--:--";
          return `${row.dayName}: ${dutyLabel || `Duty ${dutyCode}`} | Start ${startTime} | Finish ${finishTime} | Hours ${rowHours} | Travel ${formatMoneyPounds(rowCost)}`;
        });
        const expenseLines = expenseTotals.items.length > 0 ? expenseTotals.items.map((expense, index) => `Expense ${index + 1}: ${expense.dayName} ${expense.date || "--"} | ${expense.description} | Amount ${formatMoneyPounds(expense.amount)}`) : [`Expense 1: -- | None | Amount ${formatMoneyPounds(0)}`];
        const body = [`DRIVER TIMESHEET`, ``, `Driver: ${actionDriver}`, `Week: ${getWeekCommencing()}`, ``, ...lines, ``, `OTHER EXPENSES`, ...expenseLines, ``, `TOTAL HOURS: ${totalHoursDecimal}`, `TOTAL TRAVEL COST: ${formatMoneyPounds(totals.travelCost)}`, `TOTAL OTHER EXPENSES: ${formatMoneyPounds(expenseTotals.total)}`, `TOTAL EXPENSES CLAIMED: ${formatMoneyPounds(overallExpenseTotal)}`, ``, `Submitted: ${new Date().toLocaleString("en-GB")}`, `Submitted via JET Driver Portal`].join("\n");
        const response = await fetch(SEND_REQUEST_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            kind: "timesheet",
            payload: {
              driverName: actionDriver,
              weekCommencing: getWeekCommencing(),
              text: body,
              driverEmail: timesheetDriverEmail || "",
              submittedAtIso: new Date().toISOString()
            }
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "Failed to send timesheet. Please try again.");
        }
        clearTimesheetDraftRows(actionDriver, activeTimesheetWeekKey);
        setTimesheetSubmitted(true);
      } catch (err) {
        setTimesheetError(err?.message || "Failed to send timesheet. Please try again.");
      } finally {
        setTimesheetSending(false);
      }
    };
    const inputStyle = {
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      display: "block",
      inlineSize: "100%",
      padding: "10px 12px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      color: C.white,
      fontSize: "12px",
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box"
    };
    const fieldWrapStyle = {
      width: "100%",
      minWidth: 0,
      overflow: "hidden"
    };
    if (timesheetSubmitted) return /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "40px 20px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "48px",
        marginBottom: "16px"
      }
    }, "\uD83E\uDDFE"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "18px",
        fontWeight: 600,
        color: C.white,
        margin: "0 0 8px"
      }
    }, "Timesheet Ready"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "12px",
        color: C.textMuted,
        margin: "0 0 24px",
        lineHeight: 1.5
      }
    }, "Your timesheet has been sent to the office."), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setScreen("week");
        setTimesheetSubmitted(false);
        setTimesheetSending(false);
        setTimesheetError("");
        setTimesheetDriverEmail("");
      },
      style: {
        background: "#38bdf8",
        color: C.bg,
        border: "none",
        borderRadius: "8px",
        padding: "12px 24px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "Back to Rota"));
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "17px",
        fontWeight: 600,
        margin: "0 0 2px",
        color: C.white
      }
    }, "Timesheet"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        margin: 0
      }
    }, actionDriver, " \xB7 ", getWeekCommencing())), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: resetTimesheetView,
      style: {
        background: "transparent",
        color: C.accent,
        border: `1px solid ${C.accent + "55"}`,
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "11px",
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px"
      }
    }, "Reset")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, rows.map(row => {
      const rowMinutes = getDurationMinutes(row.startTime, row.finishTime);
      const rowHours = (rowMinutes / 60).toFixed(2);
      const rowDutyLabel = resolveTimesheetDutyLabel(row.dutyCode);
      const rowDateLabel = formatTimesheetRowDateLabel(row.rowDate);
      const rowExpenses = normalizeTimesheetExpenseList(row.expenses, row.rowDate);
      return /*#__PURE__*/React.createElement("div", {
        key: row.dayIndex,
        style: {
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "10px",
          padding: "12px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
          marginBottom: "8px"
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "13px",
          fontWeight: 700,
          color: C.white
        }
      }, row.dayName), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, rowDateLabel ? `${rowDutyLabel} · ${rowDateLabel}` : rowDutyLabel)), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "11px",
          color: "#38bdf8",
          fontWeight: 700,
          whiteSpace: "nowrap"
        }
      }, rowHours, "h")), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "8px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: fieldWrapStyle
      }, /*#__PURE__*/React.createElement("label", {
        style: {
          display: "block",
          fontSize: "9px",
          color: C.textDim,
          marginBottom: "4px",
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "DUTY NUMBER"), /*#__PURE__*/React.createElement("input", {
        value: row.dutyCode,
        onChange: e => updateTimesheetRow(row.dayIndex, {
          dutyCode: e.target.value,
          dutyLabel: resolveTimesheetDutyLabel(e.target.value)
        }),
        style: {
          ...inputStyle
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: fieldWrapStyle
      }, /*#__PURE__*/React.createElement("label", {
        style: {
          display: "block",
          fontSize: "9px",
          color: C.textDim,
          marginBottom: "4px",
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "START TIME"), /*#__PURE__*/React.createElement("input", {
        type: "time",
        value: row.startTime,
        onChange: e => updateTimesheetRow(row.dayIndex, {
          startTime: e.target.value
        }),
        style: {
          ...inputStyle,
          appearance: "none",
          WebkitAppearance: "none",
          colorScheme: "dark"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: fieldWrapStyle
      }, /*#__PURE__*/React.createElement("label", {
        style: {
          display: "block",
          fontSize: "9px",
          color: C.textDim,
          marginBottom: "4px",
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "FINISH TIME"), /*#__PURE__*/React.createElement("input", {
        type: "time",
        value: row.finishTime,
        onChange: e => updateTimesheetRow(row.dayIndex, {
          finishTime: e.target.value
        }),
        style: {
          ...inputStyle,
          appearance: "none",
          WebkitAppearance: "none",
          colorScheme: "dark"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: fieldWrapStyle
      }, /*#__PURE__*/React.createElement("label", {
        style: {
          display: "block",
          fontSize: "9px",
          color: C.textDim,
          marginBottom: "4px",
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "TRAVEL COST (\xA3)"), /*#__PURE__*/React.createElement("input", {
        type: "number",
        min: "0",
        step: "0.01",
        value: row.travelCost === "" || row.travelCost === null || row.travelCost === undefined ? "" : row.travelCost,
        onChange: e => {
          const raw = e.target.value;
          if (raw === "") {
            updateTimesheetRow(row.dayIndex, {
              travelCost: ""
            });
            return;
          }
          const next = parseFloat(raw);
          updateTimesheetRow(row.dayIndex, {
            travelCost: Number.isFinite(next) ? Math.max(0, Number(next.toFixed(2))) : 0
          });
        },
        style: inputStyle
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          gridColumn: "1 / -1",
          marginTop: "4px",
          paddingTop: "12px",
          borderTop: `1px solid ${C.border}`
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          marginBottom: rowExpenses.length > 0 ? "10px" : "0",
          flexWrap: "wrap"
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "11px",
          fontWeight: 700,
          color: C.white
        }
      }, "Expenses"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "9px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, rowDateLabel ? `Add parking, tolls, meals, or other costs for ${rowDateLabel}.` : "Add parking, tolls, meals, or other reimbursable costs.")), /*#__PURE__*/React.createElement("button", {
        onClick: () => addTimesheetExpense(row.dayIndex),
        type: "button",
        style: {
          background: C.accent + "22",
          color: C.accent,
          border: "none",
          borderRadius: "6px",
          padding: "7px 12px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit"
        }
      }, "+ Add Expense")), rowExpenses.length === 0 ? /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textDim,
          lineHeight: 1.5
        }
      }, "No extra expenses added for this day.") : /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }
      }, rowExpenses.map((expense, index) => /*#__PURE__*/React.createElement("div", {
        key: expense.id,
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "8px",
          alignItems: "end"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: fieldWrapStyle
      }, /*#__PURE__*/React.createElement("label", {
        style: {
          display: "block",
          fontSize: "9px",
          color: C.textDim,
          marginBottom: "4px",
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "DESCRIPTION"), /*#__PURE__*/React.createElement("input", {
        value: expense.description,
        onChange: e => updateTimesheetExpense(row.dayIndex, expense.id, {
          description: e.target.value
        }),
        placeholder: `Expense ${index + 1}`,
        style: inputStyle
      })), /*#__PURE__*/React.createElement("div", {
        style: fieldWrapStyle
      }, /*#__PURE__*/React.createElement("label", {
        style: {
          display: "block",
          fontSize: "9px",
          color: C.textDim,
          marginBottom: "4px",
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "AMOUNT (\xA3)"), /*#__PURE__*/React.createElement("input", {
        type: "number",
        min: "0",
        step: "0.01",
        value: expense.amount === "" || expense.amount === null || expense.amount === undefined ? "" : expense.amount,
        onChange: e => {
          const raw = e.target.value;
          if (raw === "") {
            updateTimesheetExpense(row.dayIndex, expense.id, {
              amount: ""
            });
            return;
          }
          const next = parseFloat(raw);
          updateTimesheetExpense(row.dayIndex, expense.id, {
            amount: Number.isFinite(next) ? Math.max(0, Number(next.toFixed(2))) : 0
          });
        },
        style: inputStyle
      })), /*#__PURE__*/React.createElement("button", {
        onClick: () => removeTimesheetExpense(row.dayIndex, expense.id),
        type: "button",
        style: {
          background: "transparent",
          color: "#ef4444",
          border: "1px solid #ef444455",
          borderRadius: "6px",
          padding: "10px 12px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit"
        }
      }, "Remove")))))));
    })), /*#__PURE__*/React.createElement("div", {
        style: {
          marginTop: "14px",
          background: "linear-gradient(135deg, #38bdf814, #0284c70d)",
          border: "1px solid #38bdf833",
          borderRadius: "10px",
          padding: "12px 14px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "11px",
          color: C.textMuted,
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "TOTAL HOURS"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "16px",
          fontWeight: 700,
          color: "#38bdf8"
        }
      }, formatDurationLabel(totals.minutes), " (", totalHoursDecimal, "h)")), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "11px",
          color: C.textMuted,
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "TOTAL TRAVEL COST"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "16px",
          fontWeight: 700,
          color: "#38bdf8"
        }
      }, formatMoneyPounds(totals.travelCost))), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "6px"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "11px",
          color: C.textMuted,
          letterSpacing: "0.5px",
          fontWeight: 600
        }
      }, "TOTAL OTHER EXPENSES"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "16px",
          fontWeight: 700,
          color: "#38bdf8"
        }
      }, formatMoneyPounds(expenseTotals.total))), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "6px",
          paddingTop: "6px",
          borderTop: "1px solid #38bdf822"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "11px",
          color: C.white,
          letterSpacing: "0.5px",
          fontWeight: 700
        }
      }, "TOTAL EXPENSES CLAIMED"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: "16px",
          fontWeight: 700,
          color: "#38bdf8"
        }
      }, formatMoneyPounds(overallExpenseTotal)))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "12px"
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: {
        display: "block",
        fontSize: "11px",
        color: C.textMuted,
        marginBottom: "6px",
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "YOUR EMAIL (OPTIONAL — FOR REPLIES)"), /*#__PURE__*/React.createElement("input", {
      type: "email",
      value: timesheetDriverEmail,
      onChange: e => setTimesheetDriverEmail(e.target.value),
      placeholder: "your@email.com",
      style: {
        width: "100%",
        padding: "10px 12px",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        color: C.white,
        fontSize: "12px",
        fontFamily: "inherit",
        outline: "none",
        boxSizing: "border-box"
      }
    })), /*#__PURE__*/React.createElement("button", {
      onClick: handleTimesheetSubmit,
      disabled: timesheetSending || rows.length === 0,
      style: {
        width: "100%",
        marginTop: "12px",
        padding: "14px",
        background: timesheetSending || rows.length === 0 ? C.textDim + "44" : "#38bdf8",
        color: timesheetSending || rows.length === 0 ? C.textDim : C.bg,
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 700,
        cursor: timesheetSending || rows.length === 0 ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px"
      }
    }, timesheetSending ? "Sending..." : "Submit Timesheet"), timesheetError && /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: "#be123c",
        textAlign: "center",
        lineHeight: 1.5,
        margin: "6px 0 0"
      }
    }, timesheetError), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: C.textDim,
        textAlign: "center",
        lineHeight: 1.5,
        margin: "6px 0 0"
      }
    }, isSundayEvening ? "Sunday evening detected. Your timesheet can now be submitted." : "Tip: submit your final timesheet on Sunday evening after your last duty."));
  })(), screen === "duty" && selectedDuty && DUTY_CARDS[selectedDuty] && (() => {
    const duty = DUTY_CARDS[selectedDuty];
    const runout = getTodayRunoutLive(selectedDuty);
    const visibleReminders = getVisibleDutyReminders(duty);
    const breakHintLookup = buildBreakHintLookup(duty);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      ref: printRef,
      style: {
        display: "none"
      }
    }, /*#__PURE__*/React.createElement("h1", null, "Duty ", duty.number, " \u2014 ", duty.route), /*#__PURE__*/React.createElement("p", null, /*#__PURE__*/React.createElement("strong", null, "Days:"), " ", duty.days, " | ", /*#__PURE__*/React.createElement("strong", null, "Sign On:"), " ", duty.signOn, " | ", /*#__PURE__*/React.createElement("strong", null, "Sign Off:"), " ", duty.signOff, " | ", /*#__PURE__*/React.createElement("strong", null, "Length:"), " ", duty.dutyLength, " | ", /*#__PURE__*/React.createElement("strong", null, "Coach:"), " ", duty.coach, runout ? ` (${runout.vehicle})` : ""), visibleReminders.map((r, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "warn"
    }, "\u26A0 ", r)), duty.segments.map((seg, si) => /*#__PURE__*/React.createElement("div", {
      key: si
    }, /*#__PURE__*/React.createElement("h2", null, seg.title), /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Stop"), /*#__PURE__*/React.createElement("th", null, "Time"), /*#__PURE__*/React.createElement("th", null, "Notes"))), /*#__PURE__*/React.createElement("tbody", null, seg.stops.map((s, j) => /*#__PURE__*/React.createElement("tr", {
      key: j,
      className: s.notes?.includes("BREAK") ? "break-row" : ""
    }, /*#__PURE__*/React.createElement("td", null, s.stop), /*#__PURE__*/React.createElement("td", null, s.time), /*#__PURE__*/React.createElement("td", null, s.dep ? "DEP" : s.arr ? "ARR" : "", " ", s.notes || "")))))))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "10px",
        padding: "18px",
        marginBottom: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "26px",
        fontWeight: 700,
        color: C.white,
        lineHeight: 1
      }
    }, "Duty ", duty.number), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "13px",
        color: C.white,
        marginTop: "5px",
        fontWeight: 500
      }
    }, duty.route), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        marginTop: "4px"
      }
    }, duty.days, " \xB7 ", duty.coach)), /*#__PURE__*/React.createElement("button", {
      onClick: handlePrint,
      style: {
        background: C.accent + "22",
        color: C.accent,
        border: "none",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "\uD83D\uDDA8 Print")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: "16px",
        marginTop: "12px",
        fontSize: "11px",
        color: C.textMuted
      }
    }, /*#__PURE__*/React.createElement("span", null, "Sign On: ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: C.white
      }
    }, duty.signOn)), /*#__PURE__*/React.createElement("span", null, "Sign Off: ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: C.white
      }
    }, duty.signOff)), /*#__PURE__*/React.createElement("span", null, "Length: ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: C.white
      }
    }, duty.dutyLength)))), runout && /*#__PURE__*/React.createElement("div", {
      style: {
        background: `linear-gradient(135deg, ${C.accent}08, ${C.accent}04)`,
        border: `1px solid ${C.accent}33`,
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        fontWeight: 700,
        color: C.accent,
        letterSpacing: "1.5px",
        marginBottom: "10px"
      }
    }, SHORT_DAYS[today].toUpperCase(), " \u2014 ", new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.surface,
        borderRadius: "8px",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "COACH"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "14px",
        fontWeight: 700,
        color: C.white,
        letterSpacing: "1px"
      }
    }, runout.vehicle)), runout.handoverTo && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "4px",
        borderTop: `1px solid ${C.border}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "HANDING OVER TO"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 600,
        color: C.white
      }
    }, runout.handoverTo.driver), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, "Duty ", runout.handoverTo.duty, " \xB7 ", runout.handoverTo.signOn))), runout.takeoverFrom && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "4px",
        borderTop: `1px solid ${C.border}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 600,
        letterSpacing: "0.5px"
      }
    }, "TAKING OVER FROM"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 600,
        color: C.white
      }
    }, runout.takeoverFrom.driver), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textDim
      }
    }, "Duty ", runout.takeoverFrom.duty))))), visibleReminders.map((r, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: C.warnBg,
        border: `1px solid ${C.warnBorder}`,
        borderRadius: "6px",
        padding: "10px 14px",
        marginBottom: "6px",
        fontSize: "11px",
        color: C.warnText,
        lineHeight: 1.4
      }
    }, "\u26A0 ", r)), duty.segments?.[0]?.title?.startsWith("Travel to") && /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.warnBg,
        border: `1px solid ${C.warnBorder}`,
        borderRadius: "6px",
        padding: "10px 14px",
        marginBottom: "6px",
        fontSize: "11px",
        color: C.warnText,
        lineHeight: 1.4
      }
    }, "\u26A0 Ensure seatbelts are done-up before returning to depot"), duty.segments.map((seg, si) => /*#__PURE__*/React.createElement("div", {
      key: si,
      style: {
        marginBottom: "12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "12px",
        fontWeight: 700,
        color: C.accent,
        padding: "8px 0 6px",
        letterSpacing: "0.5px"
      }
    }, seg.title), /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        overflow: "hidden"
      }
    }, seg.stops.map((s, j) => {
      const isBreak = s.stop.includes("Pull on stand") || s.notes?.toLowerCase().includes("break");
      const isTakeover = s.notes?.includes("Takeover");
      const isSignal = s.dep || s.arr;
      const mapTarget = resolveStopMapTarget(s.stop, duty, seg.title);
      const breakHint = breakHintLookup.get(`${si}:${j}`);
      return /*#__PURE__*/React.createElement(React.Fragment, {
        key: `${si}-${j}`
      }, breakHint && /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "flex-start",
          padding: "10px 14px",
          borderBottom: `1px solid ${C.border}22`,
          background: C.breakBg + "44"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: "50px",
          fontSize: "11px",
          fontWeight: 700,
          color: C.breakText,
          letterSpacing: "0.4px",
          flexShrink: 0
        }
      }, "BREAK"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "12px",
          color: C.breakText,
          fontWeight: 700
        }
      }, "Take 45 minute break"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, breakHint.location, " \u00b7 ARR ", breakHint.arrivalTime, " \u2192 DEP ", breakHint.departureTime))), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "flex-start",
          padding: "10px 14px",
          borderBottom: j < seg.stops.length - 1 ? `1px solid ${C.border}22` : "none",
          background: isBreak ? C.breakBg + "44" : isTakeover ? C.blueBg : "transparent"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: "50px",
          fontSize: "13px",
          fontWeight: 600,
          color: isBreak ? C.breakText : C.textMuted,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0
        }
      }, s.time), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "12px",
          color: isSignal ? C.white : isBreak ? C.breakText : isTakeover ? C.blue : C.text,
          fontWeight: isSignal || isBreak || isTakeover ? 600 : 400
        }
      }, s.dep && /*#__PURE__*/React.createElement("span", {
        style: {
          color: C.green,
          marginRight: "6px",
          fontSize: "10px"
        }
      }, "DEP"), s.arr && /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#ef4444",
          marginRight: "6px",
          fontSize: "10px"
        }
      }, "ARR"), /*#__PURE__*/React.createElement("a", {
        href: mapTarget.webUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        onClick: e => openStopInPreferredMapsApp(e, mapTarget),
        style: {
          color: "inherit",
          textDecoration: "none"
        }
      }, s.stop)), s.notes && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: isTakeover ? C.blue : C.textMuted,
          marginTop: "2px"
        }
      }, s.notes))));
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "12px",
        fontSize: "10px",
        color: C.textDim,
        lineHeight: 1.5
      }
    }, "If your actual duty differs from this card, contact the duty manager immediately."));
  })()));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})(window);
