(function (window) {
  const DUTY_CARDS = window.JET_DATA?.DUTY_CARDS || {};
  const STOP_DIRECTORY = Array.isArray(window.JET_STOP_DIRECTORY) ? window.JET_STOP_DIRECTORY : [];

  const C = {
    pageBg: "#f8fafc",
    panel: "#ffffff",
    panelAlt: "#f1f5f9",
    border: "#cbd5e1",
    borderStrong: "#94a3b8",
    text: "#0f172a",
    textMuted: "#475569",
    textDim: "#64748b",
    accent: "#f59e0b",
    accentSoft: "#fef3c7",
    blue: "#2563eb",
    green: "#16a34a",
    red: "#dc2626",
    teal: "#0f766e",
    warnBg: "#fff7ed",
    warnText: "#9a3412",
    warnBorder: "#fed7aa",
    breakBg: "#ecfdf5",
    breakText: "#166534"
  };

  const BREAK_REMINDER_TEXT = "Ensure you have a 45 minute break";
  const STOP_OPERATION_PATTERNS = [
    /^sign on/i,
    /^sign off/i,
    /^empty to/i,
    /^take over/i,
    /^hand over/i,
    /^pull on stand/i,
    /^travel on tube/i,
    /^arrive for loading/i
  ];
  const STOP_TOKEN_IGNORE = new Set([
    "the",
    "and",
    "to",
    "for",
    "of",
    "at",
    "in",
    "on",
    "bus",
    "station",
    "stn",
    "road",
    "rd",
    "stop",
    "coach",
    "stops",
    "nr",
    "near",
    "opp",
    "opposite",
    "o",
    "s",
    "bay",
    "bays",
    "lower",
    "upper",
    "airport"
  ]);
  const SEARCH_TOKEN_IGNORE = new Set([
    ...STOP_TOKEN_IGNORE,
    "route",
    "duty",
    "trip",
    "service"
  ]);
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
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\bstn\b/g, "station")
      .replace(/\brd\b/g, "road")
      .replace(/\bnr\b/g, "near")
      .replace(/\bopp\b/g, "opposite")
      .replace(/\bo\/s\b/g, "opposite")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokenizeStopText(value) {
    return normalizeStopText(value)
      .split(" ")
      .filter(token => token && !STOP_TOKEN_IGNORE.has(token));
  }

  function tokenizeSearchText(value) {
    return normalizeStopText(value)
      .split(" ")
      .filter(token => token && !SEARCH_TOKEN_IGNORE.has(token));
  }

  function extractStopCodes(value) {
    const normalized = normalizeStopText(value);
    const codes = new Set();
    const codeRegex = /\bstop\s+([a-z]\d{0,2}|\d{1,2}[a-z]?)\b/g;
    let match;
    while ((match = codeRegex.exec(normalized)) !== null) {
      codes.add(match[1]);
    }
    const tokenRegex = /\b([a-z]{1,2}\d{0,2}|\d{1,2}[a-z]{1,2})\b/g;
    while ((match = tokenRegex.exec(normalized)) !== null) {
      const code = match[1];
      if (/^\d+$/.test(code)) continue;
      codes.add(code);
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

  function buildRouteStopDirectory(stopDirectoryRows) {
    return stopDirectoryRows.reduce((acc, row) => {
      const routeCode = String(row?.route || "").trim();
      if (!routeCode) return acc;
      if (!acc[routeCode]) acc[routeCode] = [];
      const dutyLabel = String(row?.dutyCardLabel || row?.displayName || "").trim();
      const displayLabel = String(row?.displayName || row?.dutyCardLabel || "").trim();
      const normalizedDuty = normalizeStopText(dutyLabel);
      const normalizedDisplay = normalizeStopText(displayLabel);
      const latitude = Number.parseFloat(row?.latitude);
      const longitude = Number.parseFloat(row?.longitude);
      const defaultUrl = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : "";

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
        tokens: Array.from(new Set([
          ...tokenizeStopText(dutyLabel),
          ...tokenizeStopText(displayLabel)
        ])),
        stopCodes: extractStopCodes(`${dutyLabel} ${displayLabel}`)
      });
      return acc;
    }, {});
  }

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
    if (
      candidate.normalizedDuty.includes(normalizedStop) ||
      candidate.normalizedDisplay.includes(normalizedStop) ||
      normalizedStop.includes(candidate.normalizedDuty) ||
      normalizedStop.includes(candidate.normalizedDisplay)
    ) {
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

  const ROUTE_STOP_DIRECTORY = buildRouteStopDirectory(STOP_DIRECTORY);

  function selectDirectoryEntry(stopName, duty, segmentTitle) {
    const routeCode = parseDutyRouteCode(duty);
    if (!routeCode || routeCode === "450") return null;
    const routeEntries = ROUTE_STOP_DIRECTORY[routeCode] || [];
    if (routeEntries.length === 0) return null;
    if (isOperationalStop(stopName)) return null;

    const normalizedStop = normalizeStopText(stopName);
    if (!normalizedStop) return null;

    const directionHint = inferDirectionHint(routeCode, segmentTitle);
    const directionalEntries = directionHint
      ? routeEntries.filter(entry => entry.direction === directionHint)
      : [];
    const entries = directionalEntries.length > 0 ? directionalEntries : routeEntries;

    const exactMatch = entries.find(
      entry => entry.normalizedDuty === normalizedStop || entry.normalizedDisplay === normalizedStop
    );
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
      const query = Number.isFinite(matchedEntry.latitude) && Number.isFinite(matchedEntry.longitude)
        ? String(matchedEntry.latitude) + "," + String(matchedEntry.longitude)
        : (matchedEntry.displayName || label);
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
      const androidQuery = hasCoordinates
        ? String(target.latitude) + "," + String(target.longitude) + " (" + label + ")"
        : label;
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
    window.addEventListener("pagehide", handlePageHide, { once: true });
    window.addEventListener("blur", handleBlur, { once: true });

    fallbackTimer = window.setTimeout(() => {
      cleanup();
      if (!handoffToAppDetected && fallbackUrl) {
        // Fallback in the same tab avoids iOS blank interim tabs.
        window.location.replace(fallbackUrl);
      }
    }, isStandaloneMode ? 2200 : 1400);
    window.location.href = appUrl;
  }

  function getVisibleDutyReminders(duty) {
    const reminders = Array.isArray(duty?.reminders) ? duty.reminders : [];
    return reminders.filter(reminder => String(reminder || "").trim() !== BREAK_REMINDER_TEXT);
  }

  function collectDutyStops(duty) {
    const allStops = [];
    const segments = Array.isArray(duty?.segments) ? duty.segments : [];
    segments.forEach(segment => {
      const stops = Array.isArray(segment?.stops) ? segment.stops : [];
      stops.forEach(stop => {
        const label = String(stop?.stop || "").trim();
        if (label) allStops.push(label);
      });
    });
    return allStops;
  }

  function collectDestinationTerms(duty) {
    const terms = new Set();
    const routeCode = parseDutyRouteCode(duty).toLowerCase();
    if (routeCode) terms.add(routeCode);

    const routeLabelNorm = normalizeStopText(duty?.route || "");
    if (routeLabelNorm) terms.add(routeLabelNorm);
    routeLabelNorm
      .split(" ")
      .filter(Boolean)
      .forEach(token => {
        if (!SEARCH_TOKEN_IGNORE.has(token)) terms.add(token);
      });

    const segments = Array.isArray(duty?.segments) ? duty.segments : [];
    segments.forEach(segment => {
      const titleNorm = normalizeStopText(segment?.title || "");
      if (titleNorm) terms.add(titleNorm);
      titleNorm.split(" ").forEach(token => {
        if (token && !SEARCH_TOKEN_IGNORE.has(token)) terms.add(token);
      });

      const stops = Array.isArray(segment?.stops) ? segment.stops : [];
      if (stops.length === 0) return;

      const endpointCandidates = [];
      const firstStop = stops[0];
      const lastStop = stops[stops.length - 1];
      if (firstStop?.stop) endpointCandidates.push(firstStop.stop);
      if (lastStop?.stop) endpointCandidates.push(lastStop.stop);
      stops.forEach(stop => {
        if (stop?.arr) endpointCandidates.push(stop.stop);
      });

      endpointCandidates.forEach(stopLabel => {
        const normalized = normalizeStopText(stopLabel);
        if (!normalized) return;
        terms.add(normalized);
        normalized.split(" ").forEach(token => {
          if (token && !SEARCH_TOKEN_IGNORE.has(token)) terms.add(token);
        });
      });
    });

    return terms;
  }

  function buildDutySearchIndex(dutyCards) {
    const duties = Object.values(dutyCards || {}).sort((a, b) => a.number - b.number);
    return duties.map((duty, order) => {
      const routeCode = parseDutyRouteCode(duty);
      const routeCodeLower = routeCode.toLowerCase();
      const routeLabelNorm = normalizeStopText(duty.route || "");
      const daysNorm = normalizeStopText(duty.days || "");
      const destinationTerms = collectDestinationTerms(duty);
      const allStops = collectDutyStops(duty);
      const normalizedStops = allStops.map(label => normalizeStopText(label)).filter(Boolean);
      const nonOperationalStops = [];
      const nonOperationalStopSet = new Set();
      allStops.forEach(label => {
        if (isOperationalStop(label)) return;
        const normalized = normalizeStopText(label);
        if (!normalized) return;
        nonOperationalStops.push({
          label,
          normalized,
          tokens: tokenizeSearchText(label)
        });
        nonOperationalStopSet.add(normalized);
      });
      const stopTerms = new Set();
      normalizedStops.forEach(stopLabel => {
        tokenizeSearchText(stopLabel).forEach(token => stopTerms.add(token));
      });
      const stopCodes = new Set();
      allStops.forEach(stopLabel => {
        extractStopCodes(stopLabel).forEach(code => stopCodes.add(code));
      });

      const searchBlob = [
        String(duty.number),
        routeCodeLower,
        routeLabelNorm,
        daysNorm,
        ...Array.from(destinationTerms),
        ...normalizedStops,
        ...Array.from(stopTerms),
        ...Array.from(stopCodes)
      ].join(" | ");

      return {
        duty,
        number: duty.number,
        order,
        routeCodeLower,
        routeLabelNorm,
        daysNorm,
        destinationTerms,
        stopTerms,
        stopCodes,
        searchBlob,
        nonOperationalStops,
        nonOperationalStopSet
      };
    });
  }

  function buildStopChoiceIndex(allDutyIndex) {
    const byNormalized = new Map();
    allDutyIndex.forEach(entry => {
      entry.nonOperationalStops.forEach(stop => {
        if (!stop?.normalized) return;
        if (!byNormalized.has(stop.normalized)) {
          byNormalized.set(stop.normalized, {
            normalized: stop.normalized,
            label: stop.label,
            dutyNumbers: new Set([entry.number]),
            tokens: new Set(stop.tokens || []),
            popularity: 1
          });
          return;
        }
        const existing = byNormalized.get(stop.normalized);
        existing.dutyNumbers.add(entry.number);
        existing.popularity += 1;
        (stop.tokens || []).forEach(token => existing.tokens.add(token));
      });
    });
    return Array.from(byNormalized.values()).map(choice => ({
      normalized: choice.normalized,
      label: choice.label,
      dutyNumbers: Array.from(choice.dutyNumbers).sort((a, b) => a - b),
      dutyCount: choice.dutyNumbers.size,
      tokens: Array.from(choice.tokens),
      popularity: choice.popularity
    }));
  }

  function scoreStopChoice(choice, query) {
    const rawQuery = String(query || "").trim();
    if (!rawQuery) return 0;
    const normalizedQuery = normalizeStopText(rawQuery);
    if (!normalizedQuery) return 0;
    const queryTokens = tokenizeSearchText(normalizedQuery);
    let score = 0;

    if (choice.normalized === normalizedQuery) score += 1300;
    if (choice.normalized.startsWith(normalizedQuery)) score += 700;
    if (choice.normalized.includes(normalizedQuery)) score += 350;

    if (queryTokens.length > 0) {
      const tokenSet = new Set(choice.tokens);
      const overlap = queryTokens.filter(token => tokenSet.has(token)).length;
      score += overlap * 120;
      if (overlap === queryTokens.length) score += 220;
    }
    score += Math.min(80, choice.popularity * 8);
    return score;
  }

  function scoreDutyMatch(entry, query) {
    const rawQuery = String(query || "").trim();
    if (!rawQuery) return 0;
    const normalizedQuery = normalizeStopText(rawQuery);
    if (!normalizedQuery) return 0;

    const queryTokens = tokenizeSearchText(normalizedQuery);
    const queryNumber = rawQuery.replace(/\D/g, "");
    let score = 0;

    if (String(entry.number) === rawQuery || String(entry.number) === queryNumber) score += 1200;
    if (entry.routeCodeLower === normalizedQuery) score += 1150;
    if (entry.routeCodeLower.replace(/^0+/, "") === normalizedQuery.replace(/^0+/, "") && normalizedQuery.length > 0) {
      score += 1000;
    }

    if (entry.destinationTerms.has(normalizedQuery)) score += 600;
    if (entry.stopCodes.has(normalizedQuery)) score += 520;
    if (entry.stopTerms.has(normalizedQuery)) score += 420;

    if (entry.routeLabelNorm.includes(normalizedQuery)) score += 300;
    if (entry.daysNorm.includes(normalizedQuery)) score += 120;
    if (entry.searchBlob.includes(normalizedQuery)) score += 100;

    if (queryTokens.length > 0) {
      let destinationMatches = 0;
      let stopMatches = 0;
      let codeMatches = 0;
      queryTokens.forEach(token => {
        if (entry.destinationTerms.has(token)) destinationMatches++;
        if (entry.stopTerms.has(token)) stopMatches++;
        if (entry.stopCodes.has(token)) codeMatches++;
      });
      score += destinationMatches * 85;
      score += stopMatches * 55;
      score += codeMatches * 95;

      if (queryTokens.every(token => entry.searchBlob.includes(token))) {
        score += 150;
      }
    }

    return score;
  }

  function formatDutySummary(duty) {
    return `${duty.route} · ${duty.days}`;
  }

  function appHeader(selectedDutyNumber, onBack) {
    const h = React.createElement;
    return h(
      "header",
      {
        style: {
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(248, 250, 252, 0.92)",
          borderBottom: `1px solid ${C.border}`,
          backdropFilter: "blur(6px)"
        }
      },
      h(
        "div",
        {
          style: {
            maxWidth: "980px",
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 } },
          selectedDutyNumber && h(
            "button",
            {
              onClick: onBack,
              style: {
                background: "transparent",
                border: "none",
                color: C.accent,
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "8px 0",
                minHeight: "40px"
              }
            },
            "\u2190 Back"
          ),
          h(
            "div",
            null,
            h(
              "div",
              {
                style: {
                  color: "#dc2626",
                  fontSize: "30px",
                  fontWeight: 700,
                  lineHeight: 1
                }
              },
              "JET"
            ),
            h(
              "div",
              {
                style: {
                  color: C.text,
                  fontSize: "11px",
                  letterSpacing: "1.8px",
                  fontWeight: 600
                }
              },
              "Duty Card Directory"
            )
          )
        ),
        h(
          "div",
          {
            style: {
              fontSize: "11px",
              color: C.textMuted,
              textAlign: "right"
            }
          },
          ""
        )
      )
    );
  }

  function DutyListView(props) {
    const h = React.createElement;
    const {
      query,
      onChangeQuery,
      duties,
      onSelectDuty,
      stopChoices,
      showStopChoices,
      selectedStopChoice,
      onSelectStopChoice,
      onClearStopChoice
    } = props;

    return h(
      React.Fragment,
      null,
      h(
        "div",
        { style: { marginBottom: "14px" } },
        h(
          "h1",
          {
            style: {
              margin: "0 0 6px",
              color: C.text,
              fontSize: "24px",
              fontWeight: 700
            }
          },
          "Duty Cards"
        ),
        h(
          "p",
          {
            style: {
              margin: 0,
              color: C.textMuted,
              fontSize: "12px",
              lineHeight: 1.5
            }
          },
          "Search by duty number, route code (A6 / 400 / 450 / 025), destination, or specific stop."
        )
      ),
      h(
        "div",
        {
          style: {
            position: "relative",
            marginBottom: "12px"
          }
        },
        h("input", {
          type: "text",
          value: query,
          onChange: e => onChangeQuery(e.target.value),
          placeholder: "Search by duty, route, destination, or stop...",
          autoFocus: true,
          style: {
            width: "100%",
            padding: "13px 16px 13px 40px",
            borderRadius: "10px",
            border: `1px solid ${C.borderStrong}`,
            background: C.panel,
            color: C.text,
            fontSize: "16px",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.35
          }
        }),
        h(
          "span",
          {
            style: {
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              color: C.textDim,
              fontSize: "14px"
            }
          },
          "\u2315"
        )
      ),
      selectedStopChoice && h(
        "div",
        {
          style: {
            borderRadius: "10px",
            border: `1px solid ${C.accent}55`,
            background: C.accentSoft,
            color: C.text,
            padding: "10px 12px",
            marginBottom: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px"
          }
        },
        h(
          "div",
          { style: { minWidth: 0 } },
          h(
            "div",
            { style: { fontSize: "10px", color: C.textMuted, marginBottom: "2px", fontWeight: 600 } },
            "Selected stop"
          ),
          h(
            "div",
            {
              style: {
                fontSize: "12px",
                fontWeight: 700,
                overflowWrap: "anywhere"
              }
            },
            selectedStopChoice.label
          )
        ),
        h(
          "button",
          {
            onClick: onClearStopChoice,
            style: {
              border: `1px solid ${C.borderStrong}`,
              borderRadius: "7px",
              background: C.panel,
              color: C.text,
              fontSize: "11px",
              fontWeight: 700,
              padding: "8px 10px",
              minHeight: "36px",
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0
            }
          },
          "Change"
        )
      ),
      showStopChoices
        ? h(
          "div",
          null,
          h(
            "div",
            {
              style: {
                marginBottom: "8px",
                fontSize: "11px",
                color: C.textMuted
              }
            },
            "Matching stops. Select one to see only duties that run through it."
          ),
          h(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "7px"
              }
            },
            stopChoices.map(choice => h(
              "button",
              {
                key: `stop-${choice.normalized}`,
                onClick: () => onSelectStopChoice(choice),
                style: {
                  width: "100%",
                  textAlign: "left",
                  borderRadius: "10px",
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  color: C.text,
                  padding: "11px 12px",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }
              },
              h(
                "div",
                { style: { fontSize: "12px", fontWeight: 700, overflowWrap: "anywhere" } },
                choice.label
              ),
              h(
                "div",
                {
                  style: {
                    marginTop: "4px",
                    fontSize: "10px",
                    color: C.textMuted
                  }
                },
                `Used in ${choice.dutyCount} dut${choice.dutyCount === 1 ? "y" : "ies"}`
              )
            ))
          )
        )
        : duties.length === 0
          ? h(
            "div",
            {
              style: {
                borderRadius: "10px",
                border: `1px solid ${C.border}`,
                background: C.panel,
                textAlign: "center",
                padding: "24px",
                color: C.textMuted,
                fontSize: "12px"
              }
            },
            `No duties found matching "${query}".`
          )
          : h(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "8px"
              }
            },
            duties.map(duty => h(
              "button",
              {
                key: duty.number,
                onClick: () => onSelectDuty(duty.number),
                style: {
                  width: "100%",
                  textAlign: "left",
                  borderRadius: "10px",
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  color: C.text,
                  padding: "12px 14px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "border-color 120ms ease, background 120ms ease",
                  minHeight: "66px"
                },
                onMouseEnter: e => {
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.background = C.panelAlt;
                },
                onMouseLeave: e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.background = C.panel;
                }
              },
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    width: "100%"
                  }
                },
                h(
                  "div",
                  { style: { minWidth: 0, flex: 1 } },
                  h(
                    "div",
                    {
                      style: {
                        fontSize: "20px",
                        fontWeight: 700,
                        color: C.text,
                        lineHeight: 1
                      }
                    },
                    "Duty ",
                    duty.number
                  ),
                  h(
                    "div",
                    {
                      style: {
                        marginTop: "5px",
                        fontSize: "11px",
                        color: C.textMuted
                      }
                    },
                    formatDutySummary(duty)
                  )
                ),
                h(
                  "div",
                  {
                    style: {
                      textAlign: "right",
                      minWidth: "92px",
                      flexShrink: 0
                    }
                  },
                  h(
                    "div",
                    {
                      style: {
                        fontSize: "11px",
                        color: C.textMuted
                      }
                    },
                    `${duty.signOn} - ${duty.signOff}`
                  ),
                  h(
                    "div",
                    {
                      style: {
                        marginTop: "4px",
                        fontSize: "11px",
                        color: C.accent,
                        fontWeight: 700
                      }
                    },
                    "View Card \u2192"
                  )
                )
              )
            ))
          )
    );
  }

  function DutyDetailView(props) {
    const h = React.createElement;
    const { duty } = props;
    const reminders = getVisibleDutyReminders(duty);
    const segments = Array.isArray(duty?.segments) ? duty.segments : [];

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          style: {
            border: `1px solid ${C.border}`,
            borderRadius: "12px",
            background: C.panel,
            padding: "16px",
            marginBottom: "12px"
          }
        },
        h(
          "div",
          {
            style: {
              fontSize: "29px",
              fontWeight: 700,
              color: C.text,
              lineHeight: 1
            }
          },
          "Duty ",
          duty.number
        ),
        h(
          "div",
          {
            style: {
              fontSize: "13px",
              color: C.textMuted,
              marginTop: "6px",
              fontWeight: 600
            }
          },
          duty.route
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: "14px",
              marginTop: "10px",
              fontSize: "11px",
              color: C.textMuted
            }
          },
          h("span", null, "Days: ", h("strong", { style: { color: C.text } }, duty.days)),
          h("span", null, "Sign On: ", h("strong", { style: { color: C.text } }, duty.signOn)),
          h("span", null, "Sign Off: ", h("strong", { style: { color: C.text } }, duty.signOff)),
          h("span", null, "Length: ", h("strong", { style: { color: C.text } }, duty.dutyLength))
        )
      ),
      reminders.map((reminder, idx) => h(
        "div",
        {
          key: idx,
          style: {
            background: C.warnBg,
            border: `1px solid ${C.warnBorder}`,
            color: C.warnText,
            borderRadius: "8px",
            padding: "10px 12px",
            marginBottom: "8px",
            fontSize: "12px",
            lineHeight: 1.5,
            fontWeight: 500
          }
        },
        "\u26A0 ",
        reminder
      )),
      segments.map((segment, segmentIndex) => h(
        "div",
        {
          key: `${segment.title}-${segmentIndex}`,
          style: {
            marginBottom: "12px"
          }
        },
        h(
          "div",
          {
            style: {
              color: C.accent,
              fontWeight: 700,
              fontSize: "13px",
              marginBottom: "6px",
              letterSpacing: "0.4px"
            }
          },
          segment.title
        ),
        h(
          "div",
          {
            style: {
              border: `1px solid ${C.border}`,
              borderRadius: "9px",
              overflow: "hidden",
              background: C.panel
            }
          },
          (Array.isArray(segment.stops) ? segment.stops : []).map((stop, stopIndex, stops) => {
            const isBreak = String(stop?.stop || "").includes("Pull on stand") ||
              String(stop?.notes || "").toLowerCase().includes("break");
            const mapTarget = resolveStopMapTarget(stop.stop, duty, segment.title);
            return h(
              "div",
              {
                key: `${segmentIndex}-${stopIndex}`,
                style: {
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "10px 12px",
                  borderBottom: stopIndex < stops.length - 1 ? `1px solid ${C.border}` : "none",
                  background: isBreak ? C.breakBg : "transparent",
                  width: "100%"
                }
              },
              h(
                "div",
                {
                  style: {
                    width: "58px",
                    flexShrink: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                    color: isBreak ? C.breakText : C.textMuted,
                    fontVariantNumeric: "tabular-nums"
                  }
                },
                stop.time || "--:--"
              ),
              h(
                "div",
                { style: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } },
                h(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      color: C.text,
                      fontWeight: stop.dep || stop.arr || isBreak ? 700 : 500,
                      lineHeight: 1.5
                    }
                  },
                  stop.dep ? h(
                    "span",
                    { style: { color: C.green, marginRight: "7px", fontSize: "10px" } },
                    "DEP"
                  ) : null,
                  stop.arr ? h(
                    "span",
                    { style: { color: C.red, marginRight: "7px", fontSize: "10px" } },
                    "ARR"
                  ) : null,
                  h(
                    "a",
                    {
                      href: mapTarget.webUrl,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      onClick: e => openStopInPreferredMapsApp(e, mapTarget),
                      style: {
                        color: "inherit",
                        textDecoration: "none",
                        borderBottom: `1px dotted ${C.borderStrong}`,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word"
                      }
                    },
                    stop.stop
                  )
                ),
                stop.notes ? h(
                  "div",
                  {
                    style: {
                      marginTop: "3px",
                      fontSize: "10px",
                      color: C.textMuted,
                      lineHeight: 1.45
                    }
                  },
                  stop.notes
                ) : null
              )
            );
          })
        )
      )),
      h(
        "div",
        {
          style: {
            marginTop: "12px",
            color: C.textDim,
            fontSize: "10px",
            lineHeight: 1.5,
            textAlign: "center"
          }
        },
        "If your actual duty differs from this card, contact the duty manager immediately."
      )
    );
  }

  function App() {
    const allDutyIndex = React.useMemo(() => buildDutySearchIndex(DUTY_CARDS), []);
    const stopChoiceIndex = React.useMemo(() => buildStopChoiceIndex(allDutyIndex), [allDutyIndex]);
    const [query, setQuery] = React.useState("");
    const [selectedDutyNumber, setSelectedDutyNumber] = React.useState(null);
    const [selectedStopChoice, setSelectedStopChoice] = React.useState(null);

    const normalizedQuery = React.useMemo(() => normalizeStopText(query || ""), [query]);
    const destinationExactMatch = React.useMemo(() => {
      if (!normalizedQuery) return false;
      return allDutyIndex.some(entry => entry.destinationTerms.has(normalizedQuery));
    }, [allDutyIndex, normalizedQuery]);

    const stopChoices = React.useMemo(() => {
      const rawQuery = String(query || "").trim();
      if (!rawQuery) return [];
      return stopChoiceIndex
        .map(choice => ({
          ...choice,
          score: scoreStopChoice(choice, rawQuery)
        }))
        .filter(row => row.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.dutyCount !== a.dutyCount) return b.dutyCount - a.dutyCount;
          return a.label.localeCompare(b.label);
        })
        .slice(0, 40);
    }, [query, stopChoiceIndex]);

    const isDutyNumberLike = React.useMemo(() => /^\d+$/.test(String(query || "").trim()), [query]);
    const isRouteCodeLike = React.useMemo(() => /^(A\d+|\d{3})$/i.test(String(query || "").trim()), [query]);
    const showStopChoices = React.useMemo(() => {
      const rawQuery = String(query || "").trim();
      if (!rawQuery) return false;
      if (selectedStopChoice) return false;
      if (isDutyNumberLike || isRouteCodeLike) return false;
      if (destinationExactMatch) return false;
      return stopChoices.length > 0;
    }, [query, selectedStopChoice, isDutyNumberLike, isRouteCodeLike, destinationExactMatch, stopChoices.length]);

    const sortedDuties = React.useMemo(() => {
      if (selectedStopChoice?.normalized) {
        return allDutyIndex
          .filter(entry => entry.nonOperationalStopSet.has(selectedStopChoice.normalized))
          .map(entry => entry.duty);
      }
      const rawQuery = String(query || "").trim();
      if (!rawQuery) return allDutyIndex.map(entry => entry.duty);
      return allDutyIndex
        .map(entry => ({
          entry,
          score: scoreDutyMatch(entry, rawQuery)
        }))
        .filter(row => row.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.entry.number - b.entry.number;
        })
        .map(row => row.entry.duty);
    }, [allDutyIndex, query, selectedStopChoice]);

    const handleQueryChange = React.useCallback(nextQuery => {
      setQuery(nextQuery);
      if (!selectedStopChoice) return;
      const nextNormalized = normalizeStopText(nextQuery || "");
      if (nextNormalized !== selectedStopChoice.normalized) {
        setSelectedStopChoice(null);
      }
    }, [selectedStopChoice]);

    const handleSelectStopChoice = React.useCallback(choice => {
      setSelectedStopChoice(choice);
      setQuery(choice.label);
    }, []);

    const handleClearStopChoice = React.useCallback(() => {
      setSelectedStopChoice(null);
      setQuery("");
    }, []);

    const selectedDuty = selectedDutyNumber ? DUTY_CARDS[selectedDutyNumber] : null;

    return React.createElement(
      "div",
      {
        style: {
          minHeight: "100vh",
          background: `linear-gradient(180deg, ${C.pageBg}, #eef2ff 120%)`,
          color: C.text,
          overflowX: "hidden"
        }
      },
      appHeader(selectedDutyNumber, () => setSelectedDutyNumber(null)),
      React.createElement(
        "main",
        {
          style: {
            maxWidth: "980px",
            margin: "0 auto",
            padding: "12px"
          }
        },
        selectedDuty
          ? React.createElement(DutyDetailView, { duty: selectedDuty })
          : React.createElement(DutyListView, {
            query,
            onChangeQuery: handleQueryChange,
            duties: sortedDuties,
            onSelectDuty: setSelectedDutyNumber,
            stopChoices,
            showStopChoices,
            selectedStopChoice,
            onSelectStopChoice: handleSelectStopChoice,
            onClearStopChoice: handleClearStopChoice
          })
      )
    );
  }

  if (!window.React || !window.ReactDOM) {
    return;
  }

  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  window.ReactDOM.createRoot(rootEl).render(window.React.createElement(App));
})(window);
