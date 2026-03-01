(function (window) {
  const { SPECIAL_DUTIES } = window.JET_DATA;

const SENSITIVE_PATTERNS = [/spoken\s*(and|&)\s*agreed/i, /agreed/i, /requested\b/i, /available\s*(for\s*ot)?/i, /holiday/i, /doc\s*letter/i, /showed\s*me/i, /talk\s*to\s*me/i];
function filterNote(note) {
  if (!note) return null;
  // Split into lines, keep only operational ones
  const lines = note.split("\n");
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip manager attribution lines (e.g. "Mahmudul Hoque:")
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+:$/.test(trimmed)) continue;
    // Also skip "JOAO —" or "Muhammed Ali:" style
    if (/^[A-Z.\s]+[—\-:]/.test(trimmed) && trimmed.length < 40 && !trimmed.match(/\d{4}/)) continue;
    // Skip sensitive lines
    if (SENSITIVE_PATTERNS.some(p => p.test(trimmed))) continue;
    kept.push(trimmed);
  }
  if (kept.length === 0) return null;
  return kept.join("\n");
}
// ─── Colours ────────────────────────────────────────────────────
const C = {
  bg: "#0a0e17",
  surface: "#131a2b",
  surfaceHover: "#1a2340",
  card: "#172033",
  border: "#1e2d4a",
  accent: "#f59e0b",
  text: "#e2e8f0",
  textMuted: "#7a8ba8",
  textDim: "#4a5a78",
  white: "#ffffff",
  green: "#22c55e",
  breakBg: "#1a2e1a",
  breakBorder: "#2d5a2d",
  breakText: "#4ade80",
  warnBg: "#2e2a1a",
  warnBorder: "#5a4a2d",
  warnText: "#fbbf24",
  blue: "#3b82f6",
  blueBg: "#1a1e2e",
  blueBorder: "#2d3a5a"
};

// ─── Helpers ────────────────────────────────────────────────────
// getWeekCommencing is now state-driven from the Google Sheets tab name

function normalizeDutyValue(val) {
  if (val === null || val === undefined) return "";
  return typeof val === "string" ? val.trim() : String(val).trim();
}
function isDutyNumber(val) {
  return /^\d+$/.test(normalizeDutyValue(val));
}
function getSpecialDuty(val) {
  const raw = normalizeDutyValue(val);
  if (!raw) return null;
  // Direct match
  if (SPECIAL_DUTIES[raw]) return SPECIAL_DUTIES[raw];
  // AVRA variants (e.g. AVRA6, AVRA8, 6AVRA8&A6, 1AVRA9A8A6)
  if (raw.includes("AVR")) return {
    label: raw,
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#be185d"
  };
  // P-codes (Private hire, e.g. P2742)
  if (/^P\d+/.test(raw)) return {
    label: `Private Hire ${raw}`,
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#ec4899"
  };
  return null;
}
function getStatusStyle(val, driverName, showTimes, driverSectionLookup) {
  const raw = normalizeDutyValue(val);
  if (!raw || raw === "—") return {
    color: C.textDim,
    bg: "transparent",
    label: "—"
  };
  if (raw === "R") return {
    color: C.green,
    bg: C.green + "15",
    label: "REST"
  };
  if (raw === "HOL") return {
    color: "#a78bfa",
    bg: "#a78bfa15",
    label: "HOLIDAY"
  };
  if (raw === "OFF") return {
    color: C.textMuted,
    bg: C.textMuted + "15",
    label: "OFF"
  };
  if (raw === "SICK") return {
    color: "#ef4444",
    bg: "#ef444415",
    label: "SICK"
  };
  if (raw === "ABS") return {
    color: "#ef4444",
    bg: "#ef444415",
    label: "ABSENT"
  };
  if (raw === "WORK") {
    const sec = driverName && driverSectionLookup ? driverSectionLookup[driverName] : null;
    if (sec === "cleaners") {
      const isDay = driverName === "Angelina Braganca";
      return {
        color: C.white,
        bg: "transparent",
        label: showTimes ? isDay ? "WORK · 10:00–15:00" : "WORK · 22:00–05:00" : "WORK"
      };
    }
    if (sec === "shunters") return {
      color: C.white,
      bg: "transparent",
      label: showTimes ? "WORK · 22:00–05:00" : "WORK"
    };
    return {
      color: C.white,
      bg: "transparent",
      label: "WORK"
    };
  }
  if (raw.startsWith("RL")) return {
    color: C.blue,
    bg: C.blue + "15",
    label: `Route Learning ${raw.slice(2)}`
  };
  const special = getSpecialDuty(raw);
  if (special) return {
    color: special.color,
    bg: special.color + "15",
    label: special.label
  };
  if (isDutyNumber(raw)) return {
    color: C.accent,
    bg: "transparent",
    label: `Duty ${raw}`
  };
  return {
    color: C.warnText,
    bg: C.warnText + "15",
    label: raw
  };
}

  window.JET_UI = {
    C,
    isDutyNumber,
    getSpecialDuty,
    getStatusStyle,
    filterNote
  };
})(window);
