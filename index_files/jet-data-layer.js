(function (window) {
  const {
    DAILY_RUNOUT,
  GSHEET_PUB_BASE,
    SECTION_KEY_MAP,
    SECTION_LABEL_MAP,
    STAFF_NAME_ALIASES,
    STAFF_DIRECTORY,
    STAFF_SOURCE_CONFIG,
    MANUAL_STAFF_OVERRIDES
  } = window.JET_DATA;

const NORMALIZED_STAFF_NAME_ALIASES = Object.entries(STAFF_NAME_ALIASES || {}).reduce((acc, [fromName, toName]) => {
  const source = String(fromName || "").trim().toLowerCase();
  const target = String(toName || "").trim();
  if (source && target) acc[source] = target;
  return acc;
}, {});

function normalizeStaffName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return NORMALIZED_STAFF_NAME_ALIASES[raw.toLowerCase()] || raw;
}

function normalizeRotaByStaffName(rotaByName) {
  if (!rotaByName || typeof rotaByName !== "object") return {};
  return Object.entries(rotaByName).reduce((acc, [rawName, week]) => {
    const name = normalizeStaffName(rawName);
    if (!name || !Array.isArray(week)) return acc;
    acc[name] = week;
    return acc;
  }, {});
}

function mergeLiveRotaIntoDirectory(sourceSections, sourceRota) {
  const sections = getStaffDirectorySections();
  const rota = buildEmptyRotaFromSections(sections);
  const normalizedSourceRota = normalizeRotaByStaffName(sourceRota);
  Object.keys(rota).forEach(name => {
    if (Array.isArray(normalizedSourceRota[name])) rota[name] = normalizedSourceRota[name];
  });
  if (!STAFF_SOURCE_CONFIG.includeSheetDiscoveredStaff) {
    return {
      sections,
      rota
    };
  }
  const sectionIdxByKey = {};
  sections.forEach((section, idx) => {
    sectionIdxByKey[section.key] = idx;
  });
  const sourceSectionByName = {};
  const safeSourceSections = Array.isArray(sourceSections) ? sourceSections : [];
  safeSourceSections.forEach(section => {
    const sectionKey = section?.key || STAFF_SOURCE_CONFIG.fallbackSectionKey || "part_time";
    const drivers = Array.isArray(section?.drivers) ? section.drivers : [];
    drivers.forEach(rawName => {
      const name = normalizeStaffName(rawName);
      if (!name) return;
      sourceSectionByName[name] = sectionKey;
    });
  });
  Object.entries(normalizedSourceRota).forEach(([name, week]) => {
    if (Object.prototype.hasOwnProperty.call(rota, name)) return;
    const sectionKey = sourceSectionByName[name] || STAFF_SOURCE_CONFIG.fallbackSectionKey || "part_time";
    if (sectionIdxByKey[sectionKey] === undefined) {
      sections.push({
        key: sectionKey,
        label: SECTION_LABEL_MAP[sectionKey] || sectionKey,
        drivers: []
      });
      sectionIdxByKey[sectionKey] = sections.length - 1;
    }
    const targetSection = sections[sectionIdxByKey[sectionKey]];
    if (!targetSection.drivers.includes(name)) {
      targetSection.drivers.push(name);
    }
    rota[name] = Array.isArray(week) ? week.slice(0, 7) : blankWeek();
  });
  sections.forEach(section => {
    section.drivers.sort((a, b) => a.localeCompare(b, undefined, {
      sensitivity: "base"
    }));
  });
  return {
    sections,
    rota
  };
}

function getLocalDateKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Helper: get today's run out data for a given duty
function getTodayRunout(dutyNum) {
  const dateKey = getLocalDateKey();
  const todayData = DAILY_RUNOUT[dateKey];
  if (!todayData) return null;
  return todayData[dutyNum] || null;
}

// Helper: get run out info for a driver by name (checks today's sheet)
function getDriverRunout(driverName) {
  const dateKey = getLocalDateKey();
  const todayData = DAILY_RUNOUT[dateKey];
  if (!todayData) return null;
  for (const [dutyNum, info] of Object.entries(todayData)) {
    if (normalizeStaffName(info.driver) === normalizeStaffName(driverName)) return {
      duty: parseInt(dutyNum),
      ...info,
      driver: normalizeStaffName(info.driver)
    };
  }
  return null;
}
async function discoverSheetTabs() {
  const res = await fetch(GSHEET_PUB_BASE + "/pubhtml", {
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Rota source unavailable (${res.status}). Check your connection.`);
  const html = await res.text();
  const tabs = {};
  const regex = /name:\s*"(WC \d{2}\.\d{2}\.\d{4})".*?gid:\s*"(\d+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) tabs[m[1]] = m[2];
  return tabs;
}
function findCurrentWeekTab(tabs) {
  const safeTabs = tabs && typeof tabs === "object" ? tabs : {};
  const tabKeys = Object.keys(safeTabs);
  if (tabKeys.length === 0) {
    throw new Error("No weekly tabs found in rota source.");
  }
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMon);
  const fmt = d => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `WC ${dd}.${mm}.${d.getFullYear()}`;
  };
  const key = fmt(monday);
  if (safeTabs[key]) return {
    tabName: key,
    gid: safeTabs[key]
  };
  const nextMon = new Date(monday);
  nextMon.setDate(monday.getDate() + 7);
  const key2 = fmt(nextMon);
  if (safeTabs[key2]) return {
    tabName: key2,
    gid: safeTabs[key2]
  };
  // Fall back to the most recent available week (tabKeys[0] — list is newest-first from backend)
  const lastKey = tabKeys[0];
  return {
    tabName: lastKey,
    gid: safeTabs[lastKey]
  };
}
async function fetchTabCSV(gid) {
  const res = await fetch(GSHEET_PUB_BASE + `/pub?gid=${gid}&single=true&output=csv`, {
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Failed to fetch rota data (${res.status}). Check your connection.`);
  return await res.text();
}
function parseCSVRow(line) {
  const result = [];
  let current = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(current);
      current = "";
    } else current += ch;
  }
  result.push(current);
  return result;
}
function blankWeek() {
  return [null, null, null, null, null, null, null];
}
function getStaffDirectorySections() {
  return (STAFF_DIRECTORY || []).map(section => ({
    key: section.key,
    label: section.label || SECTION_LABEL_MAP[section.key] || section.key,
    drivers: Array.isArray(section.drivers) ? [...section.drivers] : []
  }));
}
function buildEmptyRotaFromSections(sections) {
  const rota = {};
  sections.forEach(section => {
    section.drivers.forEach(name => {
      rota[name] = blankWeek();
    });
  });
  return rota;
}
function parseRotaCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  const rows = lines.map(l => parseCSVRow(l));
  const sections = getStaffDirectorySections();
  const rota = buildEmptyRotaFromSections(sections);
  const sheetWeekByName = {};
  const sheetSectionByName = {};
  let currentSectionKey = null;
  let previousSectionKey = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const colA = (row[0] || "").trim();
    const colB = (row[1] || "").trim();
    if (colA && !colB && Object.prototype.hasOwnProperty.call(SECTION_KEY_MAP, colA)) {
      currentSectionKey = SECTION_KEY_MAP[colA];
      if (currentSectionKey) {
        previousSectionKey = currentSectionKey;
      }
      continue;
    }
    if (!colA || !colB || !/^\d+$/.test(colB)) continue;
    const week = Array.from({
      length: 7
    }, (_, dayIdx) => {
      const v = (row[dayIdx + 2] || "").trim();
      return v === "" ? null : v;
    });
    const resolvedName = normalizeStaffName(colA);
    sheetWeekByName[resolvedName] = week;
    const resolvedSection = currentSectionKey || previousSectionKey || STAFF_SOURCE_CONFIG.fallbackSectionKey || null;
    if (resolvedSection) {
      sheetSectionByName[resolvedName] = resolvedSection;
    }
  }
  Object.keys(rota).forEach(name => {
    if (sheetWeekByName[name]) {
      rota[name] = sheetWeekByName[name];
    }
  });
  if (STAFF_SOURCE_CONFIG.includeSheetDiscoveredStaff) {
    const knownNames = new Set(Object.keys(rota));
    const sectionIdxByKey = {};
    sections.forEach((section, idx) => {
      sectionIdxByKey[section.key] = idx;
    });
    Object.entries(sheetWeekByName).forEach(([name, week]) => {
      if (knownNames.has(name)) return;
      const sectionKey = sheetSectionByName[name] || STAFF_SOURCE_CONFIG.fallbackSectionKey || "part_time";
      if (sectionIdxByKey[sectionKey] === undefined) {
        sections.push({
          key: sectionKey,
          label: SECTION_LABEL_MAP[sectionKey] || sectionKey,
          drivers: []
        });
        sectionIdxByKey[sectionKey] = sections.length - 1;
      }
      sections[sectionIdxByKey[sectionKey]].drivers.push(name);
      rota[name] = week;
    });
  }
  return {
    sections,
    rota
  };
}
function applyManualStaffOverrides(parsed) {
  const sections = parsed.sections.map(s => ({
    ...s,
    drivers: [...s.drivers]
  }));
  const rota = {
    ...parsed.rota
  };
  const sectionIdxByKey = {};
  sections.forEach((s, idx) => {
    sectionIdxByKey[s.key] = idx;
  });
  const overrides = Array.isArray(MANUAL_STAFF_OVERRIDES) ? MANUAL_STAFF_OVERRIDES : [];
  overrides.forEach(override => {
    if (!override?.name || !override?.sectionKey || !Array.isArray(override.week)) return;
    const name = override.name;
    sections.forEach(s => {
      s.drivers = s.drivers.filter(d => d !== name);
    });
    rota[name] = override.week.slice(0, 7);
    if (sectionIdxByKey[override.sectionKey] === undefined) {
      sections.push({
        key: override.sectionKey,
        label: SECTION_LABEL_MAP[override.sectionKey] || override.sectionKey,
        drivers: [name]
      });
      sectionIdxByKey[override.sectionKey] = sections.length - 1;
    } else if (!sections[sectionIdxByKey[override.sectionKey]].drivers.includes(name)) {
      sections[sectionIdxByKey[override.sectionKey]].drivers.push(name);
    }
  });
  sections.forEach(s => {
    s.drivers.sort((a, b) => a.localeCompare(b, undefined, {
      sensitivity: "base"
    }));
  });
  return {
    sections,
    rota
  };
}
function parseWeekTabDate(tabName) {
  const m = tabName.match(/WC (\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}
function sortAvailableWeeks(weeks) {
  return [...weeks].sort((a, b) => {
    const da = parseWeekTabDate(a.tabName);
    const db = parseWeekTabDate(b.tabName);
    if (!da && !db) return a.tabName.localeCompare(b.tabName);
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });
}
function formatWeekCommencing(tabName) {
  if (typeof tabName !== "string") return "Loading...";
  const match = tabName.match(/WC (\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return tabName;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = parseInt(match[2], 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return tabName;
  return `${parseInt(match[1], 10)} ${months[monthIndex]} ${match[3]}`;
}

// Data layer adapter (phase 1): UI remains unchanged while source backends become swappable.
const ROTA_DATA_ADAPTERS = {
  googleSheets: {
    async discoverTabs() {
      return await discoverSheetTabs();
    },
    async fetchWeekByGid(gid) {
      const csv = await fetchTabCSV(gid);
      return parseRotaCSV(csv);
    }
  },
  backend: {
    async discoverTabs() {
      const res = await fetch("/api/rota-weeks", { cache: "no-store" });
      if (!res.ok) throw new Error(`Rota source unavailable (${res.status}). Check your connection.`);
      const { ok, weeks, error } = await res.json();
      if (!ok) throw new Error(error || "Failed to load available weeks.");
      // Convert ["2026-03-09", ...] → { "WC 09.03.2026": "2026-03-09", ... }
      const tabs = {};
      weeks.forEach(dateStr => {
        const [yyyy, mm, dd] = dateStr.split("-");
        tabs[`WC ${dd}.${mm}.${yyyy}`] = dateStr;
      });
      return tabs;
    },
    async fetchWeekByGid(weekCommencing) {
      const res = await fetch(`/api/rota-read?week=${weekCommencing}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch rota data (${res.status}). Check your connection.`);
      const { ok, sections: blobSections, rota: blobRota, error } = await res.json();
      if (!ok) throw new Error(error || "Failed to load rota data.");
      return mergeLiveRotaIntoDirectory(blobSections, blobRota);
    }
  }
};
const ACTIVE_ROTA_ADAPTER_KEY = "backend";
const ACTIVE_ROTA_ADAPTER = ROTA_DATA_ADAPTERS[ACTIVE_ROTA_ADAPTER_KEY];

async function fetchLiveRota() {
  const tabs = await ACTIVE_ROTA_ADAPTER.discoverTabs();
  const {
    tabName,
    gid
  } = findCurrentWeekTab(tabs);
  const parsed = await ACTIVE_ROTA_ADAPTER.fetchWeekByGid(gid);
  const {
    sections,
    rota
  } = applyManualStaffOverrides(parsed);
  const availableWeeks = sortAvailableWeeks(Object.keys(tabs).map(k => ({
    tabName: k,
    gid: tabs[k],
    label: formatWeekCommencing(k)
  })));
  return {
    sections,
    rota,
    tabName,
    availableWeeks,
    tabs
  };
}
async function fetchWeekRota(tabs, tabName) {
  const gid = tabs[tabName];
  if (!gid) return null;
  const parsed = await ACTIVE_ROTA_ADAPTER.fetchWeekByGid(gid);
  return applyManualStaffOverrides(parsed);
}

// ─── DERIVED DATA BUILDERS ──────────────────────────────────
function buildDriverList(sections) {
  return sections.flatMap(s => s.drivers);
}
function buildSectionLookup(sections) {
  const byKey = {};
  const byLabel = {};
  sections.forEach(s => s.drivers.forEach(d => {
    byKey[d] = s.key;
    byLabel[d] = s.label;
  }));
  return {
    DRIVER_SECTION: byKey,
    DRIVER_SECTION_LABEL: byLabel
  };
}
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  window.JET_DATA_LAYER = {
    getLocalDateKey,
    getTodayRunout,
    getDriverRunout,
    discoverSheetTabs,
    findCurrentWeekTab,
    fetchTabCSV,
    parseCSVRow,
    normalizeStaffName,
    getStaffDirectorySections,
    buildEmptyRotaFromSections,
    parseRotaCSV,
    applyManualStaffOverrides,
    parseWeekTabDate,
    sortAvailableWeeks,
    formatWeekCommencing,
    ROTA_DATA_ADAPTERS,
    ACTIVE_ROTA_ADAPTER_KEY,
    ACTIVE_ROTA_ADAPTER,
    fetchLiveRota,
    fetchWeekRota,
    buildDriverList,
    buildSectionLookup,
    DAYS,
    SHORT_DAYS
  };
})(window);
