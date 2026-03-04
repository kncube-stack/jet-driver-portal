const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DEFAULT_MANAGER_NAMES = ["Kennedy Ncube", "Errol Thomas"];
const DEFAULT_DRIVER_PIN_HASH = "ed946f65d2c785d90e827c5ffd879ce3b49c68d4c88013074176a7e73bc58bcf";
const DEFAULT_MANAGER_MASTER_PIN_HASH = "07c903ce633842c12f7430406521a6d57fd72de978b2c667a5bf8ec2cc7f9a9c";
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

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
      sourceConfig: data.STAFF_SOURCE_CONFIG && typeof data.STAFF_SOURCE_CONFIG === "object" ? data.STAFF_SOURCE_CONFIG : {}
    };
    return cachedClientData;
  } catch {
    cachedClientData = {
      staffDirectory: [],
      managerNames: [],
      sourceConfig: {}
    };
    return cachedClientData;
  }
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
  const modeRaw = (process.env.AUTH_MODE || "soft").toLowerCase();
  const mode = modeRaw === "strict" ? "strict" : "soft";
  const tokenTtlCandidate = Number.parseInt(process.env.AUTH_TOKEN_TTL_SECONDS || "", 10);
  const tokenTtlSeconds = Number.isFinite(tokenTtlCandidate) && tokenTtlCandidate >= 300 ? tokenTtlCandidate : DEFAULT_TOKEN_TTL_SECONDS;

  return {
    mode,
    managerNames: resolvedManagers,
    allowedNames,
    userPinHashes: parseJsonObject(process.env.AUTH_USER_PIN_HASHES, {}),
    defaultDriverPinHash: process.env.AUTH_DEFAULT_DRIVER_PIN_HASH || DEFAULT_DRIVER_PIN_HASH,
    managerMasterPinHash: process.env.AUTH_MANAGER_MASTER_PIN_HASH || DEFAULT_MANAGER_MASTER_PIN_HASH,
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
    const name = typeof parsedPayload.name === "string" ? parsedPayload.name.trim() : "";
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

function extractBearerToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  if (typeof header !== "string") return "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
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
  const name = typeof nameInput === "string" ? nameInput.trim() : "";
  const pin = typeof pinInput === "string" ? pinInput.trim() : "";
  if (!name || !pin) {
    return {
      ok: false,
      error: "Name and PIN are required."
    };
  }
  const isManagerName = config.managerNames.includes(name);
  const isKnownName = config.allowedNames.has(name);
  if (!isKnownName && !(config.allowUnknownDrivers && !isManagerName && config.mode !== "strict")) {
    return {
      ok: false,
      error: "Name not recognized."
    };
  }

  const hash = crypto.createHash("sha256").update(pin).digest("hex");
  const userHash = config.userPinHashes[name];
  const passByUserPin = typeof userHash === "string" && safeEqual(userHash, hash);
  const passByManagerPin = isManagerName && !!config.managerMasterPinHash && safeEqual(config.managerMasterPinHash, hash);
  const passBySharedPin = config.mode !== "strict" && !!config.defaultDriverPinHash && safeEqual(config.defaultDriverPinHash, hash);

  if (!(passByUserPin || passByManagerPin || passBySharedPin)) {
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
  const token = extractBearerToken(req);
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
  parseRequestBody
};
