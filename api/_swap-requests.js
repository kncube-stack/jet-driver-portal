const crypto = require("crypto");
const { getJsonBlob, putJsonBlob } = require("./_blob-json");

const SWAP_REQUESTS_BLOB_PATH = "swap-requests/index.json";
const SWAP_REQUEST_TTL_MS = 48 * 60 * 60 * 1000;
const ALLOWED_STATUSES = new Set(["pending", "agreed", "approved", "declined", "cancelled", "expired"]);

function toIsoOrNull(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeString(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeSwapRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== "object") return null;
  const id = normalizeString(rawRequest.id, 80);
  if (!id) return null;
  const requestingDriver = normalizeString(rawRequest.requestingDriver, 120);
  const targetDriver = normalizeString(rawRequest.targetDriver, 120);
  const dayName = normalizeString(rawRequest.dayName, 40);
  const weekCommencing = normalizeString(rawRequest.weekCommencing, 20);
  if (!requestingDriver || !targetDriver || !dayName || !weekCommencing) return null;
  const dayIndex = Number.parseInt(rawRequest.dayIndex, 10);
  const status = ALLOWED_STATUSES.has(rawRequest.status) ? rawRequest.status : "pending";
  const createdAt = toIsoOrNull(rawRequest.createdAt);
  if (!createdAt) return null;
  const expiresAt = toIsoOrNull(rawRequest.expiresAt);
  return {
    id,
    requestingDriver,
    targetDriver,
    dayIndex: Number.isInteger(dayIndex) ? dayIndex : -1,
    dayName,
    weekCommencing,
    requestingDuty: normalizeString(rawRequest.requestingDuty, 120) || "—",
    targetDuty: normalizeString(rawRequest.targetDuty, 120) || "—",
    notes: normalizeString(rawRequest.notes, 1200),
    status,
    createdAt,
    agreedAt: toIsoOrNull(rawRequest.agreedAt),
    respondedAt: toIsoOrNull(rawRequest.respondedAt),
    expiresAt: expiresAt || new Date(new Date(createdAt).getTime() + SWAP_REQUEST_TTL_MS).toISOString()
  };
}

function expirePendingRequests(requests, now = Date.now()) {
  let changed = false;
  const normalizedRequests = [];
  for (const request of requests) {
    const normalized = normalizeSwapRequest(request);
    if (!normalized) continue;
    if (normalized.status === "pending") {
      const expiresAt = new Date(normalized.expiresAt).getTime();
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        normalized.status = "expired";
        normalized.respondedAt = new Date(now).toISOString();
        changed = true;
      }
    }
    normalizedRequests.push(normalized);
  }
  return {
    requests: normalizedRequests,
    changed
  };
}

async function loadSwapRequests() {
  const blob = await getJsonBlob(SWAP_REQUESTS_BLOB_PATH);
  const rawRequests = Array.isArray(blob?.data?.requests) ? blob.data.requests : [];
  return expirePendingRequests(rawRequests);
}

async function saveSwapRequests(requests) {
  return await putJsonBlob(SWAP_REQUESTS_BLOB_PATH, {
    requests
  });
}

async function loadAndSyncSwapRequests() {
  const state = await loadSwapRequests();
  if (state.changed) {
    await saveSwapRequests(state.requests);
  }
  return state.requests;
}

function createSwapRequestRecord(payload, now = Date.now()) {
  const createdAt = new Date(now).toISOString();
  return normalizeSwapRequest({
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"),
    requestingDriver: payload.requestingDriver,
    targetDriver: payload.targetDriver,
    dayIndex: payload.dayIndex,
    dayName: payload.dayName,
    weekCommencing: payload.weekCommencing,
    requestingDuty: payload.requestingDuty,
    targetDuty: payload.targetDuty,
    notes: payload.notes,
    status: "pending",
    createdAt,
    respondedAt: null,
    expiresAt: new Date(now + SWAP_REQUEST_TTL_MS).toISOString()
  });
}

function sortSwapRequests(requests) {
  return [...requests].sort((a, b) => {
    const aTime = new Date(a.respondedAt || a.createdAt).getTime();
    const bTime = new Date(b.respondedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function getRelevantSwapRequests(requests, driverName) {
  return sortSwapRequests(requests.filter(request => request.requestingDriver === driverName || request.targetDriver === driverName));
}

module.exports = {
  SWAP_REQUEST_TTL_MS,
  normalizeSwapRequest,
  expirePendingRequests,
  loadSwapRequests,
  saveSwapRequests,
  loadAndSyncSwapRequests,
  createSwapRequestRecord,
  sortSwapRequests,
  getRelevantSwapRequests
};
