const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 12;
const MAX_FAILURES_PER_NAME_IP = 6;

const failuresByIp = new Map();
const failuresByNameIp = new Map();

function getClientIp(req) {
  const forwarded = (req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"])) || "";
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = (req.headers && (req.headers["x-real-ip"] || req.headers["X-Real-Ip"])) || "";
  return typeof realIp === "string" && realIp.trim() ? realIp.trim() : "unknown";
}

function normalizeName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function getState(map, key, now) {
  const existing = map.get(key);
  if (!existing) return null;
  if (existing.blockedUntil && existing.blockedUntil > now) return existing;
  if (!existing.firstFailureAt || now - existing.firstFailureAt > WINDOW_MS) {
    map.delete(key);
    return null;
  }
  return existing;
}

function getRetryAfterSeconds(state, now) {
  if (!state || !state.blockedUntil || state.blockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
}

function checkLoginRateLimit(req, name) {
  const now = Date.now();
  const ip = getClientIp(req);
  const normalizedName = normalizeName(name);
  const ipState = getState(failuresByIp, ip, now);
  const nameIpKey = normalizedName ? `${ip}::${normalizedName}` : "";
  const nameIpState = nameIpKey ? getState(failuresByNameIp, nameIpKey, now) : null;
  const retryAfterSeconds = Math.max(getRetryAfterSeconds(ipState, now), getRetryAfterSeconds(nameIpState, now));
  return {
    blocked: retryAfterSeconds > 0,
    retryAfterSeconds
  };
}

function recordFailure(map, key, maxFailures, now) {
  const current = getState(map, key, now) || {
    count: 0,
    firstFailureAt: now,
    blockedUntil: 0
  };
  current.count += 1;
  current.firstFailureAt = current.firstFailureAt || now;
  if (current.count >= maxFailures) {
    current.blockedUntil = now + BLOCK_MS;
  }
  map.set(key, current);
}

function recordLoginFailure(req, name) {
  const now = Date.now();
  const ip = getClientIp(req);
  recordFailure(failuresByIp, ip, MAX_FAILURES_PER_IP, now);
  const normalizedName = normalizeName(name);
  if (normalizedName) {
    recordFailure(failuresByNameIp, `${ip}::${normalizedName}`, MAX_FAILURES_PER_NAME_IP, now);
  }
}

function clearLoginFailures(req, name) {
  const ip = getClientIp(req);
  failuresByIp.delete(ip);
  const normalizedName = normalizeName(name);
  if (normalizedName) {
    failuresByNameIp.delete(`${ip}::${normalizedName}`);
  }
}

module.exports = {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures
};
