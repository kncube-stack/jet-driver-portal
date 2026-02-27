(function (window) {
  const {
    DAILY_RUNOUT,
    GSHEET_PUB_BASE,
    SECTION_KEY_MAP,
    SECTION_LABEL_MAP,
    MANUAL_STAFF_OVERRIDES
  } = window.JET_DATA;

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
    if (info.driver === driverName) return {
      duty: parseInt(dutyNum),
      ...info
    };
  }
  return null;
}
async function discoverSheetTabs() {
  const res = await fetch(GSHEET_PUB_BASE + "/pubhtml");
  const html = await res.text();
  const tabs = {};
  const regex = /name:\s*"(WC \d{2}\.\d{2}\.\d{4})".*?gid:\s*"(\d+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) tabs[m[1]] = m[2];
  return tabs;
}
function findCurrentWeekTab(tabs) {
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
  if (tabs[key]) return {
    tabName: key,
    gid: tabs[key]
  };
  const nextMon = new Date(monday);
  nextMon.setDate(monday.getDate() + 7);
  const key2 = fmt(nextMon);
  if (tabs[key2]) return {
    tabName: key2,
    gid: tabs[key2]
  };
  const keys = Object.keys(tabs);
  const lastKey = keys[keys.length - 1];
  return {
    tabName: lastKey,
    gid: tabs[lastKey]
  };
}
async function fetchTabCSV(gid) {
  const res = await fetch(GSHEET_PUB_BASE + `/pub?gid=${gid}&single=true&output=csv`);
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
function parseRotaCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  const rows = lines.map(l => parseCSVRow(l));
  const sections = [];
  const rota = {};
  let curKey = null;
  let curDrivers = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const colA = (row[0] || "").trim();
    const colB = (row[1] || "").trim();
    const days = row.slice(2, 9).map(d => {
      const v = (d || "").trim();
      return v === "" ? null : v;
    });
    if (colA && !colB && SECTION_KEY_MAP.hasOwnProperty(colA)) {
      if (curKey && curDrivers.length > 0) {
        sections.push({
          key: curKey,
          label: SECTION_LABEL_MAP[curKey],
          drivers: [...curDrivers]
        });
        curDrivers = [];
      }
      const newKey = SECTION_KEY_MAP[colA];
      curKey = newKey; // null for "Work to cover"
      continue;
    }
    if (colA && colB && /^\d+$/.test(colB)) {
      if (curKey) {
        curDrivers.push(colA);
        rota[colA] = days;
      } else {
        // Between sections (e.g. Frankie/Marius after Part Time gap) — attach to previous
        if (sections.length > 0) {
          sections[sections.length - 1].drivers.push(colA);
          rota[colA] = days;
        }
      }
      continue;
    }
  }
  if (curKey && curDrivers.length > 0) {
    sections.push({
      key: curKey,
      label: SECTION_LABEL_MAP[curKey],
      drivers: [...curDrivers]
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
  MANUAL_STAFF_OVERRIDES.forEach(override => {
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
  const match = tabName.match(/WC (\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return tabName;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(match[1])} ${months[parseInt(match[2]) - 1]} ${match[3]}`;
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
  }
};
const ACTIVE_ROTA_ADAPTER_KEY = "googleSheets";
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
