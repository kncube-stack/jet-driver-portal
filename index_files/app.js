(function (window) {
  const { DUTY_CARDS, ROTA_NOTES, ACCESS_CONTROL } = window.JET_DATA;
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
  const { C, isDutyNumber, getSpecialDuty, getStatusStyle, filterNote } = window.JET_UI;

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
const APP_VERSION = window.JET_APP_VERSION || "v2.7.0";
const ROTA_CACHE_KEY = "jet_rota_cache_v1";
const RECENT_DUTIES_KEY = "jet_recent_duties_v1";
const LARGE_TEXT_KEY = "jet_large_text_v1";
const PINNED_STOPS_KEY_PREFIX = "jet_pinned_stops_v1::";
function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function readRotaCache() {
  const cached = readJSON(ROTA_CACHE_KEY);
  if (!cached?.sections || !cached?.rota || !cached?.tabName || !cached?.tabs) return null;
  return cached;
}
function writeRotaCache(payload) {
  writeJSON(ROTA_CACHE_KEY, payload);
}
function readRecentDuties() {
  const list = readJSON(RECENT_DUTIES_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter(n => Number.isInteger(n)).slice(0, 3);
}
function writeRecentDuties(list) {
  writeJSON(RECENT_DUTIES_KEY, list.slice(0, 3));
}
function readLargeTextPref() {
  return localStorage.getItem(LARGE_TEXT_KEY) === "1";
}
function writeLargeTextPref(enabled) {
  try {
    localStorage.setItem(LARGE_TEXT_KEY, enabled ? "1" : "0");
  } catch {}
}
function sanitizeUserKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
function readPinnedStops(name) {
  if (!name) return [];
  const list = readJSON(PINNED_STOPS_KEY_PREFIX + sanitizeUserKey(name));
  if (!Array.isArray(list)) return [];
  return list.filter(v => typeof v === "string").slice(0, 30);
}
function writePinnedStops(name, stops) {
  if (!name) return;
  writeJSON(PINNED_STOPS_KEY_PREFIX + sanitizeUserKey(name), stops.slice(0, 30));
}
function getStopMapUrl(stop) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop || "")}`;
}
function getDutyFilterCategory(duty) {
  const route = String(duty?.route || "").toLowerCase();
  if (route.includes("a6")) return "a6";
  if (route.includes("spare")) return "spare";
  if (route.includes("management")) return "management";
  return "network";
}
function matchesDutyFilter(duty, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  return getDutyFilterCategory(duty) === filterKey;
}
function isActionDutyValue(val) {
  return !!val && val !== "—" && val !== "R" && val !== "OFF" && val !== "HOL" && val !== "SICK" && val !== "ABS";
}
function formatSyncClock(isoString) {
  if (!isoString) return null;
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
function formatSyncStamp(isoString) {
  if (!isoString) return null;
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString();
}
const AUTH_LOGIN_ENDPOINT = "/api/auth-login";
const AUTH_SESSION_ENDPOINT = "/api/auth-session";
const LEAVE_EMAIL_TO = "errol@jasonedwardstravel.co.uk";
const SWAP_EMAIL_TO = "operations@jasonedwardstravel.co.uk";
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
  if (!token) throw new Error("Missing session token.");
  const response = await fetch(AUTH_SESSION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });
  let data = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok || !data?.ok || !data?.session?.name) {
    throw new Error(data?.error || "Session verification failed.");
  }
  return data.session;
}

// ─── APP ────────────────────────────────────────────────────────
function App() {
  const storedSession = React.useMemo(() => readStoredSession(), []);
  const cachedRota = React.useMemo(() => readRotaCache(), []);
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
  const printRef = React.useRef(null);
  const today = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();

  // ─── LIVE ROTA STATE ──────────────────────────────────────
  const [STAFF_SECTIONS, setStaffSections] = React.useState(() => cachedRota?.sections || getStaffDirectorySections());
  const [ROTA, setRota] = React.useState(() => cachedRota?.rota || buildEmptyRotaFromSections(getStaffDirectorySections()));
  const [weekLabel, setWeekLabel] = React.useState(() => cachedRota?.tabName ? formatWeekCommencing(cachedRota.tabName) : "");
  const [currentTabName, setCurrentTabName] = React.useState(() => cachedRota?.tabName || "");
  const [availableWeeks, setAvailableWeeks] = React.useState(() => cachedRota?.availableWeeks || []);
  const [allTabs, setAllTabs] = React.useState(() => cachedRota?.tabs || {});
  const [rotaLoading, setRotaLoading] = React.useState(() => !cachedRota);
  const [rotaError, setRotaError] = React.useState(null);
  const [lastFetchTime, setLastFetchTime] = React.useState(() => formatSyncClock(cachedRota?.fetchedAt));
  const [lastSyncAt, setLastSyncAt] = React.useState(() => cachedRota?.fetchedAt || null);
  const [syncSource, setSyncSource] = React.useState(() => cachedRota ? "cache" : "live");

  // ─── USER IDENTITY ────────────────────────────────────────
  const [currentUser, setCurrentUser] = React.useState(() => storedSession?.name || null);
  const [nameSearch, setNameSearch] = React.useState("");
  const [dutyFilter, setDutyFilter] = React.useState("all");
  const [recentDutyCards, setRecentDutyCards] = React.useState(() => readRecentDuties());
  const [largeTextEnabled, setLargeTextEnabled] = React.useState(() => readLargeTextPref());
  const [pinnedStops, setPinnedStops] = React.useState(() => readPinnedStops(storedSession?.name || null));
  const isManager = currentRole === "manager";

  // Derived data from live state
  const DRIVERS = React.useMemo(() => buildDriverList(STAFF_SECTIONS), [STAFF_SECTIONS]);
  const {
    DRIVER_SECTION,
    DRIVER_SECTION_LABEL
  } = React.useMemo(() => buildSectionLookup(STAFF_SECTIONS), [STAFF_SECTIONS]);
  React.useEffect(() => {
    if (!document.getElementById("jet-large-text-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "jet-large-text-style";
      styleEl.textContent = `
        body.jet-large-text #root {
          zoom: 1.08;
        }
        @supports not (zoom: 1) {
          body.jet-large-text #root {
            -webkit-text-size-adjust: 112%;
            text-size-adjust: 112%;
          }
        }
      `;
      document.head.appendChild(styleEl);
    }
    document.body.classList.toggle("jet-large-text", largeTextEnabled);
    writeLargeTextPref(largeTextEnabled);
  }, [largeTextEnabled]);
  React.useEffect(() => {
    setPinnedStops(readPinnedStops(currentUser));
  }, [currentUser]);
  React.useEffect(() => {
    if (screen !== "duty" || !selectedDuty || !DUTY_CARDS[selectedDuty]) return;
    setRecentDutyCards(prev => {
      const next = [selectedDuty, ...prev.filter(n => n !== selectedDuty)].slice(0, 3);
      writeRecentDuties(next);
      return next;
    });
  }, [screen, selectedDuty]);
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
      if (resolvedRole === "manager") {
        setSelectedDriver(null);
        setScreen("home");
      } else if (DRIVERS.includes(serverSession.name)) {
        setSelectedDriver(serverSession.name);
        setScreen("week");
      } else {
        setSelectedDriver(null);
        setScreen("home");
      }
    }).catch(() => {
      if (cancelled) return;
      clearSession();
      setAuthed(false);
      setCurrentUser(null);
      setCurrentRole("driver");
      setScreen("home");
      setSelectedDriver(null);
      setAuthName("");
      setAuthPin("");
      setAuthError("Session expired. Please sign in again.");
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
      const fetchedAt = new Date().toISOString();
      setStaffSections(data.sections);
      setRota(data.rota);
      setWeekLabel(formatWeekCommencing(data.tabName));
      setCurrentTabName(data.tabName);
      setAvailableWeeks(data.availableWeeks);
      setAllTabs(data.tabs);
      setLastSyncAt(fetchedAt);
      setLastFetchTime(formatSyncClock(fetchedAt));
      setSyncSource("live");
      writeRotaCache({
        sections: data.sections,
        rota: data.rota,
        tabName: data.tabName,
        availableWeeks: data.availableWeeks,
        tabs: data.tabs,
        fetchedAt
      });
      setRotaLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error("Rota fetch failed:", err);
      if (cachedRota) {
        setSyncSource("cache");
        setRotaError("Live sync failed. Showing cached rota.");
      } else {
        setRotaError("Failed to load rota from Google Sheets. Check your connection.");
      }
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
        const fetchedAt = new Date().toISOString();
        setStaffSections(data.sections);
        setRota(data.rota);
        setWeekLabel(formatWeekCommencing(tabName));
        setCurrentTabName(tabName);
        setLastSyncAt(fetchedAt);
        setLastFetchTime(formatSyncClock(fetchedAt));
        setSyncSource("live");
        writeRotaCache({
          sections: data.sections,
          rota: data.rota,
          tabName,
          availableWeeks,
          tabs: allTabs,
          fetchedAt
        });
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
      const fetchedAt = new Date().toISOString();
      setStaffSections(data.sections);
      setRota(data.rota);
      setWeekLabel(formatWeekCommencing(data.tabName));
      setCurrentTabName(data.tabName);
      setAvailableWeeks(data.availableWeeks);
      setAllTabs(data.tabs);
      setLastSyncAt(fetchedAt);
      setLastFetchTime(formatSyncClock(fetchedAt));
      setSyncSource("live");
      writeRotaCache({
        sections: data.sections,
        rota: data.rota,
        tabName: data.tabName,
        availableWeeks: data.availableWeeks,
        tabs: data.tabs,
        fetchedAt
      });
    } catch (err) {
      setSyncSource(cachedRota ? "cache" : syncSource);
      setRotaError("Refresh failed.");
    }
    setRotaLoading(false);
  };
  const getWeekCommencing = () => weekLabel || "Loading...";
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return null;
    return DRIVERS.filter(d => d.toLowerCase().includes(q));
  }, [search, DRIVERS]);
  const dutyFilterOptions = [{
    key: "all",
    label: "All"
  }, {
    key: "a6",
    label: "A6"
  }, {
    key: "network",
    label: "Network"
  }, {
    key: "spare",
    label: "Spare"
  }, {
    key: "management",
    label: "Management"
  }];
  const openDutyCard = (dutyNumber, fromLookup) => {
    setSelectedDuty(dutyNumber);
    setDutyLookupSource(!!fromLookup);
    setScreen("duty");
  };
  const togglePinnedStop = stopName => {
    if (!currentUser || !stopName) return;
    setPinnedStops(prev => {
      const exists = prev.includes(stopName);
      const next = exists ? prev.filter(s => s !== stopName) : [stopName, ...prev].slice(0, 30);
      writePinnedStops(currentUser, next);
      return next;
    });
  };
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
      if (role === "manager") {
        setSelectedDriver(null);
        setScreen("home");
      } else {
        setSelectedDriver(resolvedKnownDriver ? resolvedName : null);
        setScreen(resolvedKnownDriver ? "week" : "home");
      }
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
    if (!authed || !isManager) return;
    if (screen === "week") {
      setSelectedDriver(null);
      setScreen("home");
    }
  }, [authed, isManager, screen]);
  React.useEffect(() => {
    if (!authed) return;
    // Safety fallback: prevent blank content if state lands on week without a selected driver.
    if (screen === "week" && !selectedDriver) {
      setScreen("home");
    }
  }, [authed, screen, selectedDriver]);
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
      const normalized = name.toLowerCase();
      if (!nameQ) return -1;
      if (normalized === nameQ) return 100;
      if (normalized.startsWith(nameQ)) return 80;
      if (normalized.split(/\s+/).some(part => part.startsWith(nameQ))) return 60;
      const idx = normalized.indexOf(nameQ);
      return idx >= 0 ? Math.max(30 - idx, 5) : -1;
    };
    const nameFiltered = nameQ ? DRIVERS.map(name => ({
      name,
      score: scoreNameMatch(name)
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map(item => item.name) : [];
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
      onChange: e => setNameSearch(e.target.value),
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
    }, "No staff found") : nameFiltered.map(name => /*#__PURE__*/React.createElement("button", {
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
    }, DRIVER_SECTION_LABEL[name])), /*#__PURE__*/React.createElement("span", {
      style: {
        color: authName === name ? C.accent : C.textDim,
        fontSize: "12px"
      }
    }, authName === name ? "\u2713" : "\u203A")))), /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: authName,
      readOnly: true,
      placeholder: "Name",
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
  const weekIndex = availableWeeks.findIndex(w => w.tabName === currentTabName);
  const canGoBack = weekIndex > 0;
  const canGoForward = weekIndex < availableWeeks.length - 1;
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
  const syncStamp = formatSyncStamp(lastSyncAt);
  const nextDutyInfo = (() => {
    if (!selectedDriver) return null;
    const week = ROTA[selectedDriver] || [];
    if (!Array.isArray(week) || week.length === 0) return null;
    const startIndex = isCurrentWeek ? today : 0;
    const maxLookahead = isCurrentWeek ? 7 : week.length;
    for (let offset = 0; offset < maxLookahead; offset++) {
      const idx = isCurrentWeek ? (startIndex + offset) % 7 : offset;
      const value = week[idx] || "—";
      if (!isActionDutyValue(value)) continue;
      const delta = isCurrentWeek ? idx >= today ? idx - today : idx + 7 - today : null;
      const relativeLabel = delta === 0 ? "Today" : delta === 1 ? "Tomorrow" : delta !== null ? `In ${delta} days` : null;
      return {
        dayIndex: idx,
        value,
        relativeLabel
      };
    }
    return null;
  })();
  const canRenderActiveScreen = screen === "home" || screen === "week" && !!selectedDriver || screen === "leave" && !!selectedDriver || screen === "swap" && !!selectedDriver || screen === "duty" && !!selectedDuty && !!DUTY_CARDS[selectedDuty];
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
      } else if (screen === "home") {
        if (isManager) {
          setSearch("");
          setDutySearch("");
        } else {
          setSelectedDriver(currentUser);
          setScreen("week");
          setSearch("");
        }
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
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setLargeTextEnabled(v => !v),
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      color: largeTextEnabled ? C.accent : C.textMuted,
      borderRadius: "6px",
      fontSize: "9px",
      fontWeight: 600,
      padding: "3px 7px",
      cursor: "pointer",
      fontFamily: "inherit",
      marginBottom: "3px"
    }
  }, largeTextEnabled ? "Large Text: On" : "Large Text: Off"), /*#__PURE__*/React.createElement("div", {
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
  }, syncSource === "cache" ? "\uD83D\uDFE1 Cached rota \xB7 Last synced " : "\uD83D\uDFE2 Live from Google Sheets \xB7 Last synced ", lastFetchTime), recentDutyCards.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "10px",
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "6px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "10px",
      color: C.textMuted,
      marginRight: "2px"
    }
  }, "Recent"), recentDutyCards.map(dutyNumber => /*#__PURE__*/React.createElement("button", {
    key: dutyNumber,
    onClick: () => openDutyCard(dutyNumber, true),
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      color: C.white,
      borderRadius: "999px",
      padding: "4px 10px",
      fontSize: "10px",
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "Duty ", dutyNumber))), /*#__PURE__*/React.createElement("div", {
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
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      marginBottom: "10px"
    }
  }, dutyFilterOptions.map(option => /*#__PURE__*/React.createElement("button", {
    key: option.key,
    onClick: () => setDutyFilter(option.key),
    style: {
      background: dutyFilter === option.key ? C.accent + "22" : C.surface,
      color: dutyFilter === option.key ? C.accent : C.textMuted,
      border: `1px solid ${dutyFilter === option.key ? C.accent + "55" : C.border}`,
      borderRadius: "999px",
      padding: "5px 10px",
      fontSize: "10px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, option.label))), /*#__PURE__*/React.createElement("div", {
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
    const matchedDuties = allDuties.filter(d => matchesDutyFilter(d, dutyFilter)).filter(d => !q || String(d.number).includes(q) || d.route.toLowerCase().includes(q) || d.days.toLowerCase().includes(q));
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
      onClick: () => openDutyCard(duty.number, true),
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
    const todayNote = filterNote(ROTA_NOTES[selectedDriver]?.[today]);
    const dutyNum = isDutyNumber(todayVal) ? parseInt(todayVal) : null;
    const dutyCard = dutyNum && DUTY_CARDS[dutyNum] ? DUTY_CARDS[dutyNum] : null;
    const runoutForDuty = dutyNum ? getTodayRunout(dutyNum) : null;
    const activeRunout = runout || runoutForDuty;

    // Only show the summary card if there's useful info (duty, vehicle, or notes)
    if (!dutyCard && !activeRunout && !todayNote && todayVal === "R") return null;
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
      onClick: () => openDutyCard(dutyNum, false),
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
    }, "View Card \u2192")), !dutyCard && todayVal !== "R" && todayVal !== "—" && /*#__PURE__*/React.createElement("div", {
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
  })(), nextDutyInfo && /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "9px",
      padding: "10px 12px",
      marginBottom: "10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "10px",
      color: C.textMuted,
      letterSpacing: "0.6px",
      marginBottom: "4px",
      fontWeight: 600
    }
  }, "NEXT DUTY"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "13px",
      color: C.white,
      fontWeight: 600
    }
  }, SHORT_DAYS[nextDutyInfo.dayIndex], nextDutyInfo.relativeLabel ? ` \u2014 ${nextDutyInfo.relativeLabel}` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "12px",
      color: C.accent,
      fontWeight: 700
    }
  }, isDutyNumber(nextDutyInfo.value) ? `Duty ${nextDutyInfo.value}` : getStatusStyle(nextDutyInfo.value, selectedDriver, true, DRIVER_SECTION).label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "5px"
    }
  }, DAYS.map((day, i) => {
    const val = ROTA[selectedDriver]?.[i] || "—";
    const isToday = isCurrentWeek && i === today;
    const isNextDuty = !!nextDutyInfo && i === nextDutyInfo.dayIndex && !isToday;
    const st = getStatusStyle(val, selectedDriver, true, DRIVER_SECTION);
    const hasDutyCard = isDutyNumber(val) && DUTY_CARDS[parseInt(val)];
    const dutyCard = hasDutyCard ? DUTY_CARDS[parseInt(val)] : null;
    const special = getSpecialDuty(val);
    const cellNote = isCurrentWeek ? filterNote(ROTA_NOTES[selectedDriver]?.[i]) : null;
    // Route Learning: extract duty number from RL prefix (e.g. RL307 → 307)
    const rlDutyNum = val?.startsWith("RL") ? parseInt(val.slice(2)) : null;
    const rlDutyCard = rlDutyNum && DUTY_CARDS[rlDutyNum] ? DUTY_CARDS[rlDutyNum] : null;
    return /*#__PURE__*/React.createElement("div", {
      key: day,
      style: {
        background: isToday ? C.accent + "08" : isNextDuty ? C.accent + "05" : C.surface,
        border: `1px solid ${isToday ? C.accent + "33" : isNextDuty ? C.accent + "26" : C.border}`,
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
        width: "62px",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "11px",
        fontWeight: 700,
        color: C.textMuted,
        letterSpacing: "1px"
      }
    }, SHORT_DAYS[i]), isNextDuty && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "2px",
        fontSize: "8px",
        color: C.accent,
        fontWeight: 600
      }
    }, nextDutyInfo?.relativeLabel === "Tomorrow" ? "TOMORROW" : "NEXT")), /*#__PURE__*/React.createElement("div", {
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
      onClick: () => openDutyCard(hasDutyCard ? parseInt(val) : rlDutyNum, false),
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
    }, "View Card \u2192")), (isToday || isNextDuty) && /*#__PURE__*/React.createElement("div", {
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
  }, "\uD83D\uDD04 Request Shift Swap")), screen === "leave" && selectedDriver && (() => {
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
    }, "Your annual leave request has been emailed for approval. You'll be contacted with a decision."), /*#__PURE__*/React.createElement("button", {
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
  })(), screen === "duty" && selectedDuty && DUTY_CARDS[selectedDuty] && (() => {
    const duty = DUTY_CARDS[selectedDuty];
    const runout = getTodayRunout(selectedDuty);
    const pinnedStopSet = new Set(pinnedStops);
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
    }, "\u26A0 Ensure seatbelts are done-up before returning to depot"), pinnedStops.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "10px 12px",
        marginBottom: "10px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "10px",
        color: C.textMuted,
        fontWeight: 700,
        letterSpacing: "0.7px",
        marginBottom: "6px"
      }
    }, "PINNED STOPS"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px"
      }
    }, pinnedStops.slice(0, 8).map(stop => /*#__PURE__*/React.createElement("button", {
      key: stop,
      onClick: () => window.open(getStopMapUrl(stop), "_blank", "noopener,noreferrer"),
      style: {
        background: C.surfaceHover,
        border: `1px solid ${C.border}`,
        color: C.white,
        borderRadius: "999px",
        padding: "4px 10px",
        fontSize: "10px",
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, stop))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "9px",
        color: C.textDim,
        marginTop: "6px"
      }
    }, "Tap any stop to open Google Maps.")), duty.segments.map((seg, si) => /*#__PURE__*/React.createElement("div", {
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
        href: getStopMapUrl(s.stop),
        target: "_blank",
        rel: "noopener noreferrer",
        style: {
          color: "inherit",
          textDecorationColor: C.textDim,
          textUnderlineOffset: "2px"
        }
      }, s.stop)), s.notes && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: "10px",
          color: isTakeover ? C.blue : C.textMuted,
          marginTop: "2px"
        }
      }, s.notes)), /*#__PURE__*/React.createElement("button", {
        onClick: e => {
          e.preventDefault();
          togglePinnedStop(s.stop);
        },
        style: {
          marginLeft: "8px",
          background: pinnedStopSet.has(s.stop) ? C.accent + "22" : "transparent",
          color: pinnedStopSet.has(s.stop) ? C.accent : C.textDim,
          border: `1px solid ${pinnedStopSet.has(s.stop) ? C.accent + "55" : C.border}`,
          borderRadius: "6px",
          padding: "3px 7px",
          fontSize: "10px",
          fontFamily: "inherit",
          cursor: "pointer",
          flexShrink: 0
        }
      }, pinnedStopSet.has(s.stop) ? "Pinned" : "Pin"));
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "12px",
        fontSize: "10px",
        color: C.textDim,
        lineHeight: 1.5
      }
    }, "If your actual duty differs from this card, contact the duty manager immediately."));
  })(), !canRenderActiveScreen && /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      padding: "12px 14px",
      marginTop: "12px",
      marginBottom: "12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11px",
      color: C.white,
      fontWeight: 600,
      marginBottom: "6px"
    }
  }, "Resetting view"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "10px",
      color: C.textMuted
    }
  }, "Your view state looked inconsistent, so the app is returning you to Home."), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setScreen("home");
      setSelectedDuty(null);
      if (!selectedDriver) setSelectedDriver(currentUser || null);
    },
    style: {
      marginTop: "10px",
      background: C.accent,
      color: C.bg,
      border: "none",
      borderRadius: "6px",
      padding: "7px 12px",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "Go Home")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      fontSize: "9px",
      color: C.textDim,
      lineHeight: 1.5,
      marginTop: "18px",
      paddingBottom: "8px"
    }
  }, "Portal ", APP_VERSION, " \xB7 ", syncSource === "cache" ? "Cached mode" : "Live mode", syncStamp ? ` \xB7 Last synced ${syncStamp}` : ""))));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})(window);
