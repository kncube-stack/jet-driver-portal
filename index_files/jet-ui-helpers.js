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
  pageBg: "linear-gradient(180deg, #f8fafc, #eef2ff 120%)",
  bg: "#0f172a",
  surface: "#ffffff",
  surfaceHover: "#f8fafc",
  card: "#ffffff",
  border: "#cbd5e1",
  accent: "#f59e0b",
  text: "#0f172a",
  textMuted: "#475569",
  textDim: "#64748b",
  white: "#0f172a",
  green: "#16a34a",
  breakBg: "#ecfdf5",
  breakBorder: "#86efac",
  breakText: "#166534",
  warnBg: "#fff7ed",
  warnBorder: "#fed7aa",
  warnText: "#9a3412",
  blue: "#2563eb",
  blueBg: "#eff6ff",
  blueBorder: "#bfdbfe"
};

// ─── Helpers ────────────────────────────────────────────────────
// getWeekCommencing is now state-driven from the Google Sheets tab name

function isDutyNumber(val) {
  return /^\d+$/.test(val);
}
function getSpecialDuty(val) {
  if (!val) return null;
  // Direct match
  if (SPECIAL_DUTIES[val]) return SPECIAL_DUTIES[val];
  // AVRA variants (e.g. AVRA6, AVRA8, 6AVRA8&A6, 1AVRA9A8A6)
  if (val.includes("AVR")) return {
    label: val,
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#be185d"
  };
  // P-codes (Private hire, e.g. P2742)
  if (/^P\d+/.test(val)) return {
    label: `Private Hire ${val}`,
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#ec4899"
  };
  return null;
}
function getStatusStyle(val, driverName, showTimes, driverSectionLookup) {
  if (val === null || val === undefined || val === "—") return {
    color: C.textDim,
    bg: "transparent",
    label: "—"
  };
  if (val === "R") return {
    color: C.green,
    bg: C.green + "15",
    label: "REST"
  };
  if (val === "HOL") return {
    color: "#a78bfa",
    bg: "#a78bfa15",
    label: "HOLIDAY"
  };
  if (val === "OFF") return {
    color: C.textMuted,
    bg: C.textMuted + "15",
    label: "OFF"
  };
  if (val === "SICK") return {
    color: "#ef4444",
    bg: "#ef444415",
    label: "SICK"
  };
  if (val === "ABS") return {
    color: "#ef4444",
    bg: "#ef444415",
    label: "ABSENT"
  };
  if (val === "WORK") {
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
  if (val?.startsWith("RL")) return {
    color: C.blue,
    bg: C.blue + "15",
    label: `Route Learning ${val.slice(2)}`
  };
  const special = getSpecialDuty(val);
  if (special) return {
    color: special.color,
    bg: special.color + "15",
    label: special.label
  };
  if (isDutyNumber(val)) return {
    color: C.accent,
    bg: "transparent",
    label: `Duty ${val}`
  };
  return {
    color: C.warnText,
    bg: C.warnText + "15",
    label: val
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
