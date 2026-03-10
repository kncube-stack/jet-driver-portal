const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DEFAULT_MANAGER_NAMES = ["Kennedy Ncube", "Errol Thomas"];
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_COOKIE_NAME = "jet_portal_session";

function getFallbackTokenSecret() {
  // Stable fallback to reduce unexpected logouts between deployments.
  // Production should still set AUTH_SIGNING_SECRET explicitly.
  const seed = [
    process.env.AUTH_SECRET_SEED || "",
    process.env.VERCEL_PROJECT_ID || "",
    process.env.VERCEL_ORG_ID || "",
    process.cwd(),
    "jet-driver-portal"
  ].join("|");
  return crypto.createHash("sha256").update(seed).digest("hex");
}

let cachedClientData = null;

function parseJsonObject(value, fallback = {}) {
  if (!value || typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseList(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function toBase64Url(inputBuffer) {
  return Buffer.from(inputBuffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const base = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base.length % 4 === 0 ? "" : "=".repeat(4 - base.length % 4);
  return Buffer.from(base + pad, "base64");
}

function safeEqual(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function loadClientData() {
  if (cachedClientData) return cachedClientData;
  try {
    const dataPath = path.join(process.cwd(), "index_files", "jet-data.js");
    const source = fs.readFileSync(dataPath, "utf8");
    const context = vm.createContext({ window: {} });
    const script = new vm.Script(source, { filename: "jet-data.js" });
    script.runInContext(context, { timeout: 1200 });
    const data = context.window && context.window.JET_DATA ? context.window.JET_DATA : {};
    cachedClientData = {
      staffDirectory: Array.isArray(data.STAFF_DIRECTORY) ? data.STAFF_DIRECTORY : [],
      managerNames: Array.isArray(data.ACCESS_CONTROL && data.ACCESS_CONTROL.managerNames) ? data.ACCESS_CONTROL.managerNames : [],
      sourceConfig: data.STAFF_SOURCE_CONFIG && typeof data.STAFF_SOURCE_CONFIG === "object" ? data.STAFF_SOURCE_CONFIG : {},
      nameAliases: data.STAFF_NAME_ALIASES && typeof data.STAFF_NAME_ALIASES === "object" ? data.STAFF_NAME_ALIASES : {}
    };
    return cachedClientData;
  } catch {
    cachedClientData = {
      staffDirectory: [],
      managerNames: [],
      sourceConfig: {},
      nameAliases: {}
    };
    return cachedClientData;
  }
}

function buildNameAliasConfig(aliasMap) {
  const normalizedToCanonical = {};
  const canonicalToSources = {};
  if (!aliasMap || typeof aliasMap !== "object") {
    return {
      normalizedToCanonical,
      canonicalToSources
    };
  }
  Object.entries(aliasMap).forEach(([fromName, toName]) => {
    const source = typeof fromName === "string" ? fromName.trim() : "";
    const target = typeof toName === "string" ? toName.trim() : "";
    if (!source || !target) return;
    normalizedToCanonical[source.toLowerCase()] = target;
    const canonicalKey = target.toLowerCase();
    if (!canonicalToSources[canonicalKey]) canonicalToSources[canonicalKey] = [];
    if (!canonicalToSources[canonicalKey].includes(source)) canonicalToSources[canonicalKey].push(source);
  });
  return {
    normalizedToCanonical,
    canonicalToSources
  };
}

function resolveKnownName(rawName, config) {
  const raw = typeof rawName === "string" ? rawName.trim() : "";
  if (!raw) return "";
  const lowerRaw = raw.toLowerCase();
  for (const n of config.allowedNames) {
    if (n.toLowerCase() === lowerRaw) return n;
  }
  for (const n of config.managerNames) {
    if (n.toLowerCase() === lowerRaw) return n;
  }
  return config.nameAliases[lowerRaw] || raw;
}

function getPinHashCandidates(name, config) {
  const resolvedName = typeof name === "string" ? name.trim() : "";
  if (!resolvedName) return [];
  const candidates = [resolvedName];
  const aliasSources = config.pinHashAliasSources[resolvedName.toLowerCase()] || [];
  aliasSources.forEach(sourceName => {
    if (!candidates.includes(sourceName)) candidates.push(sourceName);
  });
  return candidates;
}

function getAllowedNames(staffDirectory, managerNames) {
  const names = new Set();
  staffDirectory.forEach(section => {
    const drivers = Array.isArray(section && section.drivers) ? section.drivers : [];
    drivers.forEach(name => {
      if (typeof name === "string" && name.trim()) names.add(name.trim());
    });
  });
  managerNames.forEach(name => {
    if (typeof name === "string" && name.trim()) names.add(name.trim());
  });
  return names;
}

function getAuthConfig() {
  const clientData = loadClientData();
  const managerNames = parseList(process.env.AUTH_MANAGER_NAMES);
  const resolvedManagers = managerNames.length > 0 ? managerNames : clientData.managerNames.length > 0 ? clientData.managerNames : DEFAULT_MANAGER_NAMES;
  const allowedNameOverrides = parseList(process.env.AUTH_ALLOWED_NAMES);
  const allowedNames = allowedNameOverrides.length > 0 ? new Set(allowedNameOverrides) : getAllowedNames(clientData.staffDirectory, resolvedManagers);
  const aliasConfig = buildNameAliasConfig(clientData.nameAliases);
  const mode = "strict";
  const tokenTtlCandidate = Number.parseInt(process.env.AUTH_TOKEN_TTL_SECONDS || "", 10);
  const tokenTtlSeconds = Number.isFinite(tokenTtlCandidate) && tokenTtlCandidate >= 300 ? tokenTtlCandidate : DEFAULT_TOKEN_TTL_SECONDS;

  return {
    mode,
    managerNames: resolvedManagers,
    allowedNames,
    nameAliases: aliasConfig.normalizedToCanonical,
    pinHashAliasSources: aliasConfig.canonicalToSources,
    userPinHashes: parseJsonObject(process.env.AUTH_USER_PIN_HASHES, {}),
    tokenSecret: process.env.AUTH_SIGNING_SECRET || process.env.RESEND_API_KEY || getFallbackTokenSecret(),
    tokenTtlSeconds,
    allowUnknownDrivers: process.env.AUTH_ALLOW_UNKNOWN_DRIVERS === "1"
  };
}

function createToken(name, role, config) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + config.tokenTtlSeconds;
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({
    sub: name,
    name,
    role,
    iat: issuedAt,
    exp
  }));
  const data = `${header}.${payload}`;
  const signature = toBase64Url(crypto.createHmac("sha256", config.tokenSecret).update(data).digest());
  return {
    token: `${data}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

function verifyToken(token, config) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expectedSig = toBase64Url(crypto.createHmac("sha256", config.tokenSecret).update(data).digest());
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    const parsedPayload = JSON.parse(fromBase64Url(payload).toString("utf8"));
    if (!parsedPayload || typeof parsedPayload !== "object") return null;
    const exp = Number.parseInt(parsedPayload.exp, 10);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) >= exp) return null;
    const name = resolveKnownName(typeof parsedPayload.name === "string" ? parsedPayload.name.trim() : "", config);
    const role = parsedPayload.role === "manager" ? "manager" : "driver";
    if (!name) return null;
    return {
      name,
      role,
      exp
    };
  } catch {
    return null;
  }
}

function createSignedActionToken(payload, ttlSeconds) {
  const config = getAuthConfig();
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenTtlSeconds = Number.isFinite(Number(ttlSeconds)) && Number(ttlSeconds) > 0 ? Number(ttlSeconds) : config.tokenTtlSeconds;
  const exp = issuedAt + tokenTtlSeconds;
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify({
    ...payload,
    iat: issuedAt,
    exp
  }));
  const data = `${header}.${body}`;
  const signature = toBase64Url(crypto.createHmac("sha256", config.tokenSecret).update(data).digest());
  return `${data}.${signature}`;
}

function verifySignedActionToken(token) {
  const config = getAuthConfig();
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expectedSig = toBase64Url(crypto.createHmac("sha256", config.tokenSecret).update(data).digest());
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    const parsedPayload = JSON.parse(fromBase64Url(payload).toString("utf8"));
    if (!parsedPayload || typeof parsedPayload !== "object") return null;
    const exp = Number.parseInt(parsedPayload.exp, 10);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) >= exp) return null;
    return parsedPayload;
  } catch {
    return null;
  }
}

function extractBearerToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  if (typeof header !== "string") return "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function parseCookies(req) {
  const cookieHeader = (req.headers && (req.headers.cookie || req.headers.Cookie)) || "";
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) return {};
  return cookieHeader.split(";").reduce((cookies, part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return cookies;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function isSecureRequest(req) {
  const proto = (req.headers && (req.headers["x-forwarded-proto"] || req.headers["X-Forwarded-Proto"])) || "";
  if (typeof proto === "string" && proto.toLowerCase().includes("https")) return true;
  const host = (req.headers && (req.headers.host || req.headers.Host)) || "";
  return typeof host === "string" && !/localhost|127\.0\.0\.1/i.test(host);
}

function getRequestOrigin(req) {
  const protoHeader = (req.headers && (req.headers["x-forwarded-proto"] || req.headers["X-Forwarded-Proto"])) || "";
  const protocol = typeof protoHeader === "string" && protoHeader.trim() ? protoHeader.split(",")[0].trim() : isSecureRequest(req) ? "https" : "http";
  const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers["X-Forwarded-Host"] || req.headers.host || req.headers.Host)) || "";
  if (typeof host === "string" && host.trim()) {
    return `${protocol}://${host.split(",")[0].trim()}`;
  }
  const fallbackHost = process.env.VERCEL_URL || "localhost:3000";
  return `${protocol}://${fallbackHost}`;
}

function buildSessionCookie(token, expiresAt, req) {
  const config = getAuthConfig();
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${config.tokenTtlSeconds}`
  ];
  if (expiresAt) parts.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

function buildClearedSessionCookie(req) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

function extractSessionToken(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim()) return cookieToken.trim();
  return extractBearerToken(req);
}

function parseRequestBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  return body;
}

function authenticateNamePin(nameInput, pinInput) {
  const config = getAuthConfig();
  const rawName = typeof nameInput === "string" ? nameInput.trim() : "";
  const pin = typeof pinInput === "string" ? pinInput.trim() : "";
  if (!rawName || !pin) {
    return {
      ok: false,
      error: "Name and PIN are required."
    };
  }
  const name = resolveKnownName(rawName, config);
  const isManagerName = config.managerNames.includes(name);
  const isKnownName = config.allowedNames.has(name);
  if (!isKnownName && !(config.allowUnknownDrivers && !isManagerName && config.mode !== "strict")) {
    return {
      ok: false,
      error: "Name not recognized."
    };
  }

  const hash = crypto.createHash("sha256").update(pin).digest("hex");
  const pinHashCandidates = getPinHashCandidates(name, config);
  const passByUserPin = pinHashCandidates.some(candidateName => {
    const userHash = config.userPinHashes[candidateName];
    return typeof userHash === "string" && safeEqual(userHash, hash);
  });
  if (!passByUserPin) {
    return {
      ok: false,
      error: "Incorrect PIN."
    };
  }

  const role = isManagerName ? "manager" : "driver";
  const signed = createToken(name, role, config);
  return {
    ok: true,
    session: {
      name,
      role,
      token: signed.token,
      expiresAt: signed.expiresAt
    }
  };
}

function verifyRequestSession(req) {
  const token = extractSessionToken(req);
  if (!token) return null;
  const config = getAuthConfig();
  const payload = verifyToken(token, config);
  if (!payload) return null;
  return {
    name: payload.name,
    role: payload.role,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

module.exports = {
  authenticateNamePin,
  verifyRequestSession,
  createSignedActionToken,
  verifySignedActionToken,
  getRequestOrigin,
  parseRequestBody,
  buildSessionCookie,
  buildClearedSessionCookie
};
