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
    DAYS,
    SHORT_DAYS
  } = window.JET_DATA_LAYER;
  const { C, isDutyNumber, getSpecialDuty, getStatusStyle } = window.JET_UI;

function readStoredSession() {
  try {
    const raw = localStorage.getItem("jet_session") || sessionStorage.getItem("jet_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name || !parsed?.token) return null;
    if (parsed.expiresAt && Date.now() > new Date(parsed.expiresAt).getTime()) return null;
    return {
      name: parsed.name,
      role: parsed.role === "manager" ? "manager" : "driver",
      token: parsed.token,
      expiresAt: parsed.expiresAt || null
    };
  } catch {
    return null;
  }
}
function writeSession(name, role, token, expiresAt) {
  try {
    const payload = JSON.stringify({
      name,
      role,
      token,
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
const AUTH_LOGIN_ENDPOINT = "/api/auth-login";
const AUTH_SESSION_ENDPOINT = "/api/auth-session";
const LEAVE_EMAIL_TO = "errol@jasonedwardstravel.co.uk";
const SWAP_EMAIL_TO = "operations@jasonedwardstravel.co.uk";
const TIMESHEET_EMAIL_TO = "operations@jasonedwardstravel.co.uk";
const TIMESHEET_DRAFTS_STORAGE_KEY = "jet_timesheet_drafts_v1";
const PADDINGTON_TRAVEL_COST = 6.2;
const STANDARD_TRAVEL_COST = 9.2;
function isTimeValue(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
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
function inferDutyTravelCost(dutyCard) {
  if (!dutyCard) return 0;
  const routeLabel = String(dutyCard.route || "").toLowerCase();
  if (!routeLabel.includes("a6")) return STANDARD_TRAVEL_COST;
  const allStops = Array.isArray(dutyCard.segments) ? dutyCard.segments.flatMap(seg => Array.isArray(seg.stops) ? seg.stops : []).map(stop => String(stop?.stop || "").trim()).filter(Boolean) : [];
  const firstStop = (allStops[0] || "").toLowerCase();
  const lastStop = (allStops[allStops.length - 1] || "").toLowerCase();
  const startsOrFinishesAtPaddington = firstStop.includes("paddington") || lastStop.includes("paddington");
  if (startsOrFinishesAtPaddington) return PADDINGTON_TRAVEL_COST;
  return STANDARD_TRAVEL_COST;
}
function isNextWeekUnlockedForDrivers() {
  // Next week's rota becomes visible on Saturday at 12:00 London time.
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'short',
      hour: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    return weekday === 'Sun' || (weekday === 'Sat' && hour >= 12);
  } catch {
    return true;
  }
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
function hydrateTimesheetRowsFromDraft(baseRows, draftRows) {
  if (!Array.isArray(baseRows) || baseRows.length === 0 || !Array.isArray(draftRows)) return baseRows;
  const byDay = new Map();
  for (const row of draftRows) {
    const dayIndex = Number(row?.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= baseRows.length) continue;
    byDay.set(dayIndex, row);
  }
  return baseRows.map(baseRow => {
    const draft = byDay.get(baseRow.dayIndex);
    if (!draft) return baseRow;
    const startTime = isTimeValue(draft.startTime) ? draft.startTime : "";
    const finishTime = isTimeValue(draft.finishTime) ? draft.finishTime : "";
    return {
      ...baseRow,
      startTime,
      finishTime,
      travelCost: normalizeTimesheetTravelCost(draft.travelCost, baseRow.travelCost)
    };
  });
}
function readTimesheetDraftRows(driverName, weekTabName, baseRows) {
  const key = getTimesheetDraftEntryKey(driverName, weekTabName);
  if (!key) return baseRows;
  const store = readTimesheetDraftStore();
  const entry = store[key];
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.rows)) return baseRows;
  return hydrateTimesheetRowsFromDraft(baseRows, entry.rows);
}
function saveTimesheetDraftRows(driverName, weekTabName, rows) {
  const key = getTimesheetDraftEntryKey(driverName, weekTabName);
  if (!key || !Array.isArray(rows) || rows.length === 0) return;
  const compactRows = rows.map(row => ({
    dayIndex: row.dayIndex,
    startTime: row.startTime || "",
    finishTime: row.finishTime || "",
    travelCost: row.travelCost === "" || row.travelCost === null || row.travelCost === undefined ? "" : normalizeTimesheetTravelCost(row.travelCost, "")
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
  if (!response.ok || !data?.ok || !data?.session?.token) {
    throw new Error(data?.error || "Unable to sign in.");
  }
  return data.session;
}
async function verifyServerSession(token) {
  if (!token) {
    const missingTokenError = new Error("Missing session token.");
    missingTokenError.code = "SESSION_INVALID";
    throw missingTokenError;
  }
  let response = null;
  let data = null;
  let lastNetworkError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(AUTH_SESSION_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
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
  };
  const handleVisibility = () => {
    if (document.hidden) {
      handoffToAppDetected = true;
      cleanup();
    }
  };
  const handlePageHide = () => {
    handoffToAppDetected = true;
    cleanup();
  };
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide, {
    once: true
  });
  fallbackTimer = window.setTimeout(() => {
    cleanup();
    if (!handoffToAppDetected && fallbackUrl) {
      window.location.href = fallbackUrl;
    }
  }, 700);
  window.location.href = appUrl;
}

// ─── APP ────────────────────────────────────────────────────────
function App() {
  const storedSession = React.useMemo(() => readStoredSession(), []);
  const [authed, setAuthed] = React.useState(() => !!storedSession);
  const [sessionVerifying, setSessionVerifying] = React.useState(() => !!storedSession?.token);
  const [authName, setAuthName] = React.useState(() => storedSession?.name || "");
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
  const [leaveForm, setLeaveForm] = React.useState({
    dateFrom: "",
    dateTo: "",
    reason: "",
    notes: ""
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
  const [timesheetRows, setTimesheetRows] = React.useState([]);
  const [timesheetSubmitted, setTimesheetSubmitted] = React.useState(false);
  const [timesheetSending, setTimesheetSending] = React.useState(false);
  const [timesheetError, setTimesheetError] = React.useState("");
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

  // ─── USER IDENTITY ────────────────────────────────────────
  const [currentUser, setCurrentUser] = React.useState(() => storedSession?.name || null);
  const [nameSearch, setNameSearch] = React.useState("");
  const isManager = currentRole === "manager";

  // Derived data from live state
  const DRIVERS = React.useMemo(() => buildDriverList(STAFF_SECTIONS), [STAFF_SECTIONS]);
  const {
    DRIVER_SECTION,
    DRIVER_SECTION_LABEL
  } = React.useMemo(() => buildSectionLookup(STAFF_SECTIONS), [STAFF_SECTIONS]);
  const getTimesheetDefaultsForDuty = (dutyCode, driverName) => {
    const dutyValue = dutyCode === null || dutyCode === undefined || dutyCode === "" ? "—" : String(dutyCode).trim();
    const forceBlankTimesheetFields = isAvrOrPrivateHireDutyCode(dutyValue);
    const dutyNum = isDutyNumber(dutyValue) ? parseInt(dutyValue, 10) : null;
    const dutyCard = dutyNum && DUTY_CARDS[dutyNum] ? DUTY_CARDS[dutyNum] : null;
    const routeLearningMatch = dutyValue.match(/^RL\s*(\d+)$/i);
    const routeLearningNum = routeLearningMatch ? parseInt(routeLearningMatch[1], 10) : null;
    const routeLearningCard = routeLearningNum && DUTY_CARDS[routeLearningNum] ? DUTY_CARDS[routeLearningNum] : null;
    const special = getSpecialDuty(dutyValue);
    const startTimeRaw = dutyCard ? dutyCard.signOn : routeLearningCard ? routeLearningCard.signOn : special?.signOn && special.signOn !== "—" ? special.signOn : "";
    const finishTimeRaw = dutyCard ? dutyCard.signOff : routeLearningCard ? routeLearningCard.signOff : special?.signOff && special.signOff !== "—" ? special.signOff : "";
    const startTime = forceBlankTimesheetFields ? "" : isTimeValue(startTimeRaw) ? startTimeRaw : "";
    const finishTime = forceBlankTimesheetFields ? "" : isTimeValue(finishTimeRaw) ? finishTimeRaw : "";
    const baseTravelCost = dutyCard ? inferDutyTravelCost(dutyCard) : routeLearningCard ? inferDutyTravelCost(routeLearningCard) : 0;
    const dutyLabel = dutyCard ? `Duty ${dutyValue}` : routeLearningCard ? `Route Learning ${routeLearningNum}` : special ? special.label : getStatusStyle(dutyValue, driverName, true, DRIVER_SECTION).label;
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
      return {
        dayIndex,
        dayName,
        dutyCode: defaults.dutyCode,
        dutyLabel: defaults.dutyLabel,
        startTime: defaults.startTime,
        finishTime: defaults.finishTime,
        travelCost: defaults.travelCost
      };
    });
  };
  React.useEffect(() => {
    let cancelled = false;
    if (!storedSession?.token) {
      setSessionVerifying(false);
      return () => {
        cancelled = true;
      };
    }
    verifyServerSession(storedSession.token).then(serverSession => {
      if (cancelled) return;
      const resolvedRole = serverSession.role === "manager" ? "manager" : "driver";
      writeSession(serverSession.name, resolvedRole, storedSession.token, serverSession.expiresAt || storedSession.expiresAt || null);
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
        setAuthError(err?.message || "Session expired. Please sign in again.");
        return;
      }
      // Keep the cached session during transient API/network issues.
      console.warn("Session verification unavailable; keeping local session.", err);
      setAuthError("");
      setAuthed(true);
      if (storedSession?.name) {
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
      }
    }).finally(() => {
      if (!cancelled) setSessionVerifying(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storedSession?.token]);

  // Fetch live rota on mount
  React.useEffect(() => {
    let cancelled = false;
    setRotaLoading(true);
    setRotaError(null);
    fetchLiveRota().then(data => {
      if (cancelled) return;
      setStaffSections(data.sections);
      setRota(data.rota);
      setWeekLabel(formatWeekCommencing(data.tabName));
      setCurrentTabName(data.tabName);
      setAvailableWeeks(data.availableWeeks);
      setAllTabs(data.tabs);
      setLastFetchTime(new Date().toLocaleTimeString());
      setRotaLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error("Rota fetch failed:", err);
      setRotaError("Failed to load rota from Google Sheets. Check your connection.");
      setRotaLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Week switcher
  const switchWeek = async tabName => {
    setRotaLoading(true);
    setRotaError(null);
    try {
      const data = await fetchWeekRota(allTabs, tabName);
      if (data) {
        setStaffSections(data.sections);
        setRota(data.rota);
        setWeekLabel(formatWeekCommencing(tabName));
        setCurrentTabName(tabName);
        setLastFetchTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Week switch failed:", err);
      setRotaError("Failed to load week data.");
    }
    setRotaLoading(false);
  };

  // Refresh current week data
  const refreshRota = async () => {
    setRotaLoading(true);
    setRotaError(null);
    try {
      const data = await fetchLiveRota();
      setStaffSections(data.sections);
      setRota(data.rota);
      setWeekLabel(formatWeekCommencing(data.tabName));
      setCurrentTabName(data.tabName);
      setAvailableWeeks(data.availableWeeks);
      setAllTabs(data.tabs);
      setLastFetchTime(new Date().toLocaleTimeString());
    } catch (err) {
      setRotaError("Refresh failed.");
    }
    setRotaLoading(false);
  };
  const getWeekCommencing = () => weekLabel || "Loading...";
  const activeTimesheetWeekKey = currentTabName || weekLabel || "";
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return null;
    return DRIVERS.filter(d => d.toLowerCase().includes(q));
  }, [search, DRIVERS]);
  const handleLogin = async () => {
    const name = authName.trim();
    const pin = authPin.trim();
    if (!name || !pin) {
      setAuthError("Select your name and enter your PIN.");
      return;
    }
    const isManagerName = ACCESS_CONTROL.managerNames?.includes(name);
    const knownDriver = DRIVERS.includes(name);
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
      writeSession(resolvedName, role, session.token, session.expiresAt || null);
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
    if (screen !== "timesheet" || !selectedDriver) return;
    const baseRows = buildTimesheetRowsForDriver(selectedDriver);
    const hydratedRows = readTimesheetDraftRows(selectedDriver, activeTimesheetWeekKey, baseRows);
    setTimesheetRows(hydratedRows);
    setTimesheetSubmitted(false);
    setTimesheetSending(false);
    setTimesheetError("");
  }, [screen, selectedDriver, activeTimesheetWeekKey]);
  React.useEffect(() => {
    if (screen !== "timesheet" || !selectedDriver || !activeTimesheetWeekKey) return;
    if (!Array.isArray(timesheetRows) || timesheetRows.length !== DAYS.length) return;
    saveTimesheetDraftRows(selectedDriver, activeTimesheetWeekKey, timesheetRows);
  }, [screen, selectedDriver, activeTimesheetWeekKey, timesheetRows]);
  if (sessionVerifying) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: C.bg,
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
    const nameQ = nameSearch.toLowerCase().trim();
    const scoreNameMatch = name => {
      const n = name.toLowerCase();
      if (!nameQ) return -1;
      if (n === nameQ) return 1000;
      if (n.startsWith(nameQ)) return 900 - n.length / 100;
      const words = n.split(/\s+/).filter(Boolean);
      const wordPrefixIdx = words.findIndex(w => w.startsWith(nameQ));
      if (wordPrefixIdx >= 0) return 750 - wordPrefixIdx;
      const idx = n.indexOf(nameQ);
      if (idx >= 0) return 600 - idx / 100;
      return -1;
    };
    const nameFiltered = nameQ ? DRIVERS.map(name => ({
      name,
      score: scoreNameMatch(name)
    })).filter(item => item.score >= 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map(item => item.name).slice(0, 8) : [];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: C.bg,
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
        color: "#ffffff",
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
    }, "Select your name and enter your PIN")), rotaError && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: "12px",
        background: "#ef444422",
        border: "1px solid #ef444455",
        borderRadius: "8px",
        padding: "10px 12px",
        fontSize: "10px",
        color: "#fecaca",
        lineHeight: 1.5
      }
    }, "\u26A0 ", rotaError, " Showing directory names only until sync recovers."), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        marginBottom: "12px"
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: nameSearch,
      onChange: e => {
        setNameSearch(e.target.value);
        setAuthError("");
      },
      onKeyDown: e => {
        if (e.key === "Enter" && nameFiltered.length > 0) {
          e.preventDefault();
          setAuthName(nameFiltered[0]);
          setNameSearch("");
          setAuthError("");
        }
      },
      placeholder: "Search by name...",
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
    }, "\u2315")), (DRIVERS.length === 0 || nameQ) && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        maxHeight: "34vh",
        overflowY: "auto",
        marginBottom: "12px"
      }
    }, DRIVERS.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "24px",
        color: C.textDim,
        fontSize: "12px"
      }
    }, rotaLoading ? "Loading staff list..." : "No staff available") : nameFiltered.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "24px",
        color: C.textDim,
        fontSize: "12px"
      }
    }, "No staff found") : nameFiltered.map((name, idx) => /*#__PURE__*/React.createElement("button", {
      key: name,
      onClick: () => {
        setAuthName(name);
        setNameSearch("");
        setAuthError("");
      },
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: authName === name ? C.accent + "18" : C.surface,
        border: `1px solid ${authName === name ? C.accent + "66" : C.border}`,
        borderRadius: "8px",
        padding: "11px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: C.white,
        fontSize: "13px",
        fontWeight: 500
      }
    }, name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "9px",
        color: C.textDim,
        marginTop: "1px"
      }
    }, idx === 0 ? `Best match \u00b7 ${DRIVER_SECTION_LABEL[name]}` : DRIVER_SECTION_LABEL[name])), /*#__PURE__*/React.createElement("span", {
      style: {
        color: authName === name ? C.accent : C.textDim,
        fontSize: "12px"
      }
    }, authName === name ? "\u2713" : "\u203A")))), /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: authName,
      placeholder: "Name",
      readOnly: true,
      style: {
        width: "100%",
        padding: "12px 14px",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        color: C.white,
        fontSize: "13px",
        fontFamily: "inherit",
        outline: "none",
        boxSizing: "border-box",
        marginBottom: "8px",
        opacity: authName ? 1 : 0.9
      }
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
      disabled: !authName || !authPin || authLoading || DRIVERS.length === 0,
      style: {
        width: "100%",
        padding: "13px",
        background: !authName || !authPin || authLoading || DRIVERS.length === 0 ? C.textDim + "44" : C.accent,
        color: !authName || !authPin || authLoading || DRIVERS.length === 0 ? C.textDim : C.bg,
        border: "none",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: 700,
        cursor: !authName || !authPin || authLoading || DRIVERS.length === 0 ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px"
      }
    }, authLoading ? "Checking..." : "Continue"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "9px",
        color: C.textDim,
        textAlign: "center",
        lineHeight: 1.5,
        marginTop: "16px"
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
        background: C.bg,
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
        color: "#ffffff",
        textTransform: "uppercase",
        marginBottom: "32px"
      }
    }, "Jason Edwards Travel \u2014 Staff Portal"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.accent,
        marginBottom: "8px"
      }
    }, "\u23F3 Loading rota from Google Sheets..."), /*#__PURE__*/React.createElement("div", {
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
        background: C.bg,
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
  // Managers see all available weeks. Drivers only see next week from Saturday 12:00.
  const visibleWeeks = React.useMemo(() => {
    if (isManager || availableWeeks.length === 0) return availableWeeks;
    const currentIdx = availableWeeks.findIndex(w => w.tabName === currentTabName);
    if (currentIdx === -1) return availableWeeks;
    const maxIdx = isNextWeekUnlockedForDrivers() ? currentIdx + 1 : currentIdx;
    return availableWeeks.slice(0, Math.min(maxIdx + 1, availableWeeks.length));
  }, [availableWeeks, currentTabName, isManager]);
  const weekIndex = visibleWeeks.findIndex(w => w.tabName === currentTabName);
  const canGoBack = weekIndex > 0;
  const canGoForward = weekIndex < visibleWeeks.length - 1;
  const goWeek = dir => {
    const nextIdx = weekIndex + dir;
    if (nextIdx >= 0 && nextIdx < visibleWeeks.length) {
      switchWeek(visibleWeeks[nextIdx].tabName);
    }
  };

  // ─── USER SELECTION ─────────────────────────────────────
  const selectUser = name => {
    if (!isManager) return;
    setSelectedDriver(name);
    setScreen("week");
    setSearch("");
  };
  const switchUser = () => {
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.bg,
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
          notes: ""
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
      } else if (screen === "home") {
        setSelectedDriver(currentUser);
        setScreen("week");
        setSearch("");
      } else if (screen === "week" && selectedDriver !== currentUser) {
        setSelectedDriver(currentUser);
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
      color: "#ffffff",
      textTransform: "uppercase",
      marginTop: "1px"
    }
  }, "Jason Edwards Travel \u2014 Staff Portal")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11px",
      color: C.textMuted,
      textAlign: "right",
      lineHeight: 1.4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600
    }
  }, currentUser), /*#__PURE__*/React.createElement("button", {
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
  }, "Log out"))), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "640px",
      margin: "0 auto",
      padding: "16px"
    }
  }, rotaError && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "12px",
      background: "#ef444422",
      border: "1px solid #ef444455",
      borderRadius: "8px",
      padding: "10px 12px",
      fontSize: "10px",
      color: "#fecaca",
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
  }, "\u23F3"), /*#__PURE__*/React.createElement("button", {
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
  }, "\uD83D\uDFE2 Live from Google Sheets \xB7 Updated ", lastFetchTime)), /*#__PURE__*/React.createElement("div", {
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
  }, "Rota"), /*#__PURE__*/React.createElement("button", {
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
    placeholder: "Search by name...",
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
    const st = getStatusStyle(todayVal, driver, false, DRIVER_SECTION);
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
    const st = getStatusStyle(todayVal, driver, false, DRIVER_SECTION);
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
  })()))), screen === "week" && selectedDriver && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "4px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "17px",
      fontWeight: 600,
      margin: 0,
      color: C.white
    }
  }, selectedDriver), isManager && selectedDriver === currentUser && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setScreen("home");
      setSelectedDriver(null);
    },
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "6px",
      padding: "5px 10px",
      cursor: "pointer",
      color: C.textMuted,
      fontSize: "10px",
      fontWeight: 600,
      fontFamily: "inherit",
      letterSpacing: "0.5px"
    }
  }, "All Staff")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11px",
      color: C.textMuted,
      margin: 0
    }
  }, DRIVER_SECTION_LABEL[selectedDriver]), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      marginTop: "8px"
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
  }, "\u23F3"))), (() => {
    if (!isCurrentWeek) return null;
    const todayVal = ROTA[selectedDriver]?.[today] || "—";
    const runout = getDriverRunout(selectedDriver);
    const todayNote = null;
    const dutyNum = isDutyNumber(todayVal) ? parseInt(todayVal) : null;
    const dutyCard = dutyNum && DUTY_CARDS[dutyNum] ? DUTY_CARDS[dutyNum] : null;
    const runoutForDuty = dutyNum ? getTodayRunout(dutyNum) : null;
    const activeRunout = runout || runoutForDuty;

    // Show a banner for today unless there is truly no data for the day.
    // REST now gets the same top-banner treatment as work duties.
    if (!dutyCard && !activeRunout && todayVal === "—") return null;
    return /*#__PURE__*/React.createElement("div", {
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
    })), dutyCard && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: activeRunout ? "10px" : "0"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "18px",
        fontWeight: 700,
        color: C.white
      }
    }, "Duty ", todayVal), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        marginTop: "2px"
      }
    }, dutyCard.route, " \xB7 ", dutyCard.signOn, " \u2013 ", dutyCard.signOff)), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setSelectedDuty(dutyNum);
        setScreen("duty");
      },
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
    }, "View Card \u2192")), !dutyCard && todayVal === "R" && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: activeRunout ? "10px" : "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION).color
      }
    }, getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION).label)), !dutyCard && todayVal !== "R" && todayVal !== "—" && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: activeRunout ? "10px" : "0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION).color
      }
    }, getStatusStyle(todayVal, selectedDriver, true, DRIVER_SECTION).label), getSpecialDuty(todayVal)?.signOn !== "—" && getSpecialDuty(todayVal) && /*#__PURE__*/React.createElement("div", {
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
    }, todayNote)));
  })(), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "5px"
    }
  }, DAYS.map((day, i) => {
    const val = ROTA[selectedDriver]?.[i] || "—";
    const isToday = isCurrentWeek && i === today;
    const st = getStatusStyle(val, selectedDriver, true, DRIVER_SECTION);
    const hasDutyCard = isDutyNumber(val) && DUTY_CARDS[parseInt(val)];
    const dutyCard = hasDutyCard ? DUTY_CARDS[parseInt(val)] : null;
    const special = getSpecialDuty(val);
    const cellNote = null;
    // Route Learning: extract duty number from RL prefix (e.g. RL307 → 307)
    const rlDutyNum = val?.startsWith("RL") ? parseInt(val.slice(2)) : null;
    const rlDutyCard = rlDutyNum && DUTY_CARDS[rlDutyNum] ? DUTY_CARDS[rlDutyNum] : null;
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
        flex: 1
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
    }, "\uD83D\uDCDD ", cellNote)), (hasDutyCard || rlDutyCard) && /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setSelectedDuty(hasDutyCard ? parseInt(val) : rlDutyNum);
        setScreen("duty");
      },
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
        letterSpacing: "0.5px"
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
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowDutyLookup(true);
      setDutySearch("");
      setScreen("home");
    },
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      width: "100%",
      marginTop: "20px",
      padding: "14px",
      background: "linear-gradient(135deg, #14b8a622, #0f766e22)",
      border: "1px solid #14b8a633",
      borderRadius: "10px",
      color: "#2dd4bf",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px"
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = "#14b8a666";
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = "#14b8a633";
    }
  }, "\uD83D\uDCD8 Browse Duty Cards"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setLeaveSubmitted(false);
      setLeaveSending(false);
      setLeaveError("");
      setLeaveForm({
        dateFrom: "",
        dateTo: "",
        reason: "",
        notes: ""
      });
      setScreen("leave");
    },
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      width: "100%",
      marginTop: "8px",
      padding: "14px",
      background: "linear-gradient(135deg, #a78bfa22, #8b5cf622)",
      border: "1px solid #a78bfa33",
      borderRadius: "10px",
      color: "#a78bfa",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px"
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = "#a78bfa66";
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = "#a78bfa33";
    }
  }, "\uD83D\uDCCB Request Annual Leave"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSwapSubmitted(false);
      setSwapSending(false);
      setSwapError("");
      setSwapForm({
        dayIndex: "",
        targetDriver: "",
        notes: ""
      });
      setScreen("swap");
    },
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      width: "100%",
      marginTop: "8px",
      padding: "14px",
      background: "linear-gradient(135deg, #ffffff12, #ffffff08)",
      border: "1px solid #ffffff25",
      borderRadius: "10px",
      color: "#ffffff",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px"
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = "#ffffff44";
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = "#ffffff25";
    }
  }, "\uD83D\uDD04 Request Shift Swap"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setTimesheetSubmitted(false);
      setTimesheetSending(false);
      setTimesheetError("");
      if (selectedDriver) {
        setTimesheetRows(buildTimesheetRowsForDriver(selectedDriver));
      } else {
        setTimesheetRows([]);
      }
      setScreen("timesheet");
    },
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      width: "100%",
      marginTop: "8px",
      padding: "14px",
      background: "linear-gradient(135deg, #38bdf822, #0284c722)",
      border: "1px solid #38bdf833",
      borderRadius: "10px",
      color: "#7dd3fc",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      letterSpacing: "0.5px"
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = "#38bdf866";
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = "#38bdf833";
    }
  }, "\uD83E\uDDFE Generate Timesheet")), screen === "leave" && selectedDriver && (() => {
    const handleSubmit = () => {
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
        const subject = `Annual Leave Request - ${selectedDriver}`;
        const body = [`ANNUAL LEAVE REQUEST`, ``, `Driver: ${selectedDriver}`, `From: ${fromDate}`, `To: ${toDate}`, `Total days: ${diffDays}`, `Reason: ${leaveForm.reason || "Annual leave"}`, leaveForm.notes ? `Notes: ${leaveForm.notes}` : `Notes: None`, ``, `Submitted: ${new Date().toLocaleString("en-GB")}`, `Submitted via JET Driver Portal`].join("\n");
        window.open(`mailto:${LEAVE_EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_self");
        setLeaveSubmitted(true);
      } catch (err) {
        setLeaveError(err?.message || "Unable to open your email app.");
      }
      setLeaveSending(false);
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
    }, "Your annual leave request draft is ready in your email app. Send it to submit the request."), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setScreen("week");
        setLeaveSubmitted(false);
        setLeaveError("");
        setLeaveSending(false);
        setLeaveForm({
          dateFrom: "",
          dateTo: "",
          reason: "",
          notes: ""
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
    }, "Back to Rota"));
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
    }, selectedDriver)), /*#__PURE__*/React.createElement("div", {
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
      onChange: e => {
        const v = e.target.value;
        setLeaveForm(f => ({
          ...f,
          dateFrom: v,
          dateTo: f.dateTo && f.dateTo < v ? v : f.dateTo
        }));
      },
      style: {
        ...inputStyle,
        colorScheme: "dark"
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
    }, "LAST DAY OF LEAVE"), /*#__PURE__*/React.createElement("input", {
      type: "date",
      value: leaveForm.dateTo,
      min: leaveForm.dateFrom || undefined,
      onChange: e => setLeaveForm(f => ({
        ...f,
        dateTo: e.target.value
      })),
      style: {
        ...inputStyle,
        colorScheme: "dark"
      }
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
        color: "#fda4af",
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
    }, "This opens your email app with the request ready to send to office staff.")));
  })(), screen === "swap" && selectedDriver && (() => {
    const myRota = ROTA[selectedDriver] || [];
    const otherDrivers = DRIVERS.filter(d => d !== selectedDriver);
    const selectedDayDuty = swapForm.dayIndex !== "" ? myRota[parseInt(swapForm.dayIndex)] || "—" : null;
    const targetRota = swapForm.targetDriver ? ROTA[swapForm.targetDriver] || [] : [];
    const targetDayDuty = swapForm.dayIndex !== "" && swapForm.targetDriver ? targetRota[parseInt(swapForm.dayIndex)] || "—" : null;
    const handleSwapSubmit = () => {
      if (swapForm.dayIndex === "" || !swapForm.targetDriver || swapSending) return;
      const dayName = DAYS[parseInt(swapForm.dayIndex)];
      setSwapSending(true);
      setSwapError("");
      try {
        const subject = `Shift Swap Request - ${selectedDriver} <-> ${swapForm.targetDriver}`;
        const body = [`SHIFT SWAP REQUEST`, ``, `Requesting Driver: ${selectedDriver}`, `Current duty (${dayName}): ${selectedDayDuty || "—"}`, ``, `Swap With: ${swapForm.targetDriver}`, `Their duty (${dayName}): ${targetDayDuty || "—"}`, swapForm.notes ? `Notes: ${swapForm.notes}` : `Notes: None`, ``, `Both drivers must agree to this swap.`, `Submitted: ${new Date().toLocaleString("en-GB")}`, `Submitted via JET Driver Portal`].join("\n");
        window.open(`mailto:${SWAP_EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_self");
        setSwapSubmitted(true);
      } catch (err) {
        setSwapError(err?.message || "Unable to open your email app.");
      }
      setSwapSending(false);
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
    }, "Your shift swap request draft is ready in your email app. Send it to submit the request."), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setScreen("week");
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
    }, "Back to Rota"));
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
    }, "Request Shift Swap"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        margin: 0
      }
    }, selectedDriver)), /*#__PURE__*/React.createElement("div", {
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
    }, "YOUR DUTY (", DAYS[parseInt(swapForm.dayIndex)], ")"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: "#06b6d4"
      }
    }, selectedDayDuty), (() => {
      const sp = getSpecialDuty(selectedDayDuty);
      const dc = isDutyNumber(selectedDayDuty) ? DUTY_CARDS[parseInt(selectedDayDuty)] : null;
      if (dc) return /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, dc.route, " \xB7 ", dc.signOn, "\u2013", dc.signOff);
      if (sp && sp.signOn !== "—") return /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, sp.label, " \xB7 ", sp.signOn, "\u2013", sp.signOff);
      return null;
    })()), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
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
      const theirDuty = swapForm.dayIndex !== "" ? ROTA[d]?.[parseInt(swapForm.dayIndex)] || "—" : "";
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
    }, swapForm.targetDriver.toUpperCase(), "'S DUTY (", DAYS[parseInt(swapForm.dayIndex)], ")"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "16px",
        fontWeight: 700,
        color: "#f97316"
      }
    }, targetDayDuty), (() => {
      const sp = getSpecialDuty(targetDayDuty);
      const dc = isDutyNumber(targetDayDuty) ? DUTY_CARDS[parseInt(targetDayDuty)] : null;
      if (dc) return /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, dc.route, " \xB7 ", dc.signOn, "\u2013", dc.signOff);
      if (sp && sp.signOn !== "—") return /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: C.textMuted,
          marginTop: "2px"
        }
      }, sp.label, " \xB7 ", sp.signOn, "\u2013", sp.signOff);
      return null;
    })()), selectedDayDuty && targetDayDuty && swapForm.targetDriver && /*#__PURE__*/React.createElement("div", {
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
    }, "SWAP PREVIEW \u2014 ", DAYS[parseInt(swapForm.dayIndex)]), /*#__PURE__*/React.createElement("div", {
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
    }, selectedDriver.split(" ")[0]), /*#__PURE__*/React.createElement("div", {
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
      disabled: swapForm.dayIndex === "" || !swapForm.targetDriver || swapSending,
      style: {
        width: "100%",
        padding: "14px",
        background: swapForm.dayIndex === "" || !swapForm.targetDriver || swapSending ? C.textDim + "44" : "#06b6d4",
        color: swapForm.dayIndex === "" || !swapForm.targetDriver || swapSending ? C.textDim : C.bg,
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 700,
        cursor: swapForm.dayIndex === "" || !swapForm.targetDriver || swapSending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.5px",
        marginTop: "6px"
      }
    }, swapSending ? "Sending..." : "Submit Swap Request"), swapError && /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "10px",
        color: "#fda4af",
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
    }, "This opens your email app with the swap request ready to send.")));
  })(), screen === "timesheet" && selectedDriver && (() => {
    const rows = timesheetRows.length === DAYS.length ? timesheetRows : buildTimesheetRowsForDriver(selectedDriver);
    const updateTimesheetRow = (dayIndex, patch) => {
      setTimesheetRows(prev => {
        const baseRows = prev.length === DAYS.length ? prev : buildTimesheetRowsForDriver(selectedDriver);
        return baseRows.map(row => row.dayIndex === dayIndex ? {
          ...row,
          ...patch
        } : row);
      });
      if (timesheetSubmitted) setTimesheetSubmitted(false);
      if (timesheetError) setTimesheetError("");
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
    const totalHoursDecimal = (totals.minutes / 60).toFixed(2);
    const isSundayEvening = (() => {
      const now = new Date();
      return now.getDay() === 0 && now.getHours() >= 18;
    })();
    const handleTimesheetSubmit = () => {
      if (timesheetSending) return;
      setTimesheetSending(true);
      setTimesheetError("");
      try {
        const lines = rows.map(row => {
          const rowMinutes = getDurationMinutes(row.startTime, row.finishTime);
          const rowHours = (rowMinutes / 60).toFixed(2);
          const rowCost = Math.max(0, Number(row.travelCost) || 0);
          const dutyCode = String(row.dutyCode || "—").trim() || "—";
          const startTime = isTimeValue(row.startTime) ? row.startTime : "--:--";
          const finishTime = isTimeValue(row.finishTime) ? row.finishTime : "--:--";
          return `${row.dayName}: Duty ${dutyCode} | Start ${startTime} | Finish ${finishTime} | Hours ${rowHours} | Travel ${formatMoneyPounds(rowCost)}`;
        });
        const subject = `Driver Timesheet - ${selectedDriver} - ${getWeekCommencing()}`;
        const body = [`DRIVER TIMESHEET`, ``, `Driver: ${selectedDriver}`, `Week: ${getWeekCommencing()}`, ``, ...lines, ``, `TOTAL HOURS: ${totalHoursDecimal}`, `TOTAL TRAVEL COST: ${formatMoneyPounds(totals.travelCost)}`, ``, `Submitted: ${new Date().toLocaleString("en-GB")}`, `Submitted via JET Driver Portal`].join("\n");
        window.open(`mailto:${TIMESHEET_EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_self");
        clearTimesheetDraftRows(selectedDriver, activeTimesheetWeekKey);
        setTimesheetSubmitted(true);
      } catch (err) {
        setTimesheetError(err?.message || "Unable to open your email app.");
      }
      setTimesheetSending(false);
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
    }, "Your timesheet draft is ready in your email app. Send it to submit this week's record."), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setScreen("week");
        setTimesheetSubmitted(false);
        setTimesheetSending(false);
        setTimesheetError("");
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
        marginBottom: "14px"
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: "17px",
        fontWeight: 600,
        margin: "0 0 2px",
        color: C.white
      }
    }, "Generate Timesheet"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: "11px",
        color: C.textMuted,
        margin: 0
      }
    }, selectedDriver, " \xB7 ", getWeekCommencing())), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }
    }, rows.map(row => {
      const rowMinutes = getDurationMinutes(row.startTime, row.finishTime);
      const rowHours = (rowMinutes / 60).toFixed(2);
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
      }, row.dutyLabel)), /*#__PURE__*/React.createElement("div", {
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
        readOnly: true,
        style: {
          ...inputStyle,
          background: C.surfaceHover,
          color: C.textMuted
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
      }))));
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
    }, formatMoneyPounds(totals.travelCost)))), /*#__PURE__*/React.createElement("button", {
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
        color: "#fda4af",
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
    const runout = getTodayRunout(selectedDuty);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      ref: printRef,
      style: {
        display: "none"
      }
    }, /*#__PURE__*/React.createElement("h1", null, "Duty ", duty.number, " \u2014 ", duty.route), /*#__PURE__*/React.createElement("p", null, /*#__PURE__*/React.createElement("strong", null, "Days:"), " ", duty.days, " | ", /*#__PURE__*/React.createElement("strong", null, "Sign On:"), " ", duty.signOn, " | ", /*#__PURE__*/React.createElement("strong", null, "Sign Off:"), " ", duty.signOff, " | ", /*#__PURE__*/React.createElement("strong", null, "Length:"), " ", duty.dutyLength, " | ", /*#__PURE__*/React.createElement("strong", null, "Coach:"), " ", duty.coach, runout ? ` (${runout.vehicle})` : ""), duty.reminders?.map((r, i) => /*#__PURE__*/React.createElement("div", {
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
    }, "Duty ", runout.takeoverFrom.duty))))), duty.reminders?.map((r, i) => /*#__PURE__*/React.createElement("div", {
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
      return /*#__PURE__*/React.createElement("div", {
        key: j,
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
      }, s.notes)));
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
