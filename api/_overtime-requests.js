const crypto = require("crypto");
const { getJsonBlob, putJsonBlob } = require("./_blob-json");

const OVERTIME_REQUESTS_BLOB_PATH = "overtime-requests/index.json";
const OVERTIME_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ALLOWED_STATUSES = new Set(["pending", "registered", "approved", "declined", "cancelled"]);
const ALLOWED_SHIFT_TIMES = new Set(["Morning", "Afternoon", "Full Day"]);

function toIsoOrNull(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeString(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeOvertimeRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== "object") return null;
  const id = normalizeString(rawRequest.id, 80);
  if (!id) return null;
  const driverName = normalizeString(rawRequest.driverName, 120);
  if (!driverName) return null;
  const createdAt = toIsoOrNull(rawRequest.createdAt);
  if (!createdAt) return null;
  const dayIndex = Number.parseInt(rawRequest.dayIndex, 10);
  const dayName = normalizeString(rawRequest.dayName, 40);
  const weekCommencing = normalizeString(rawRequest.weekCommencing, 20);
  const shiftTime = ALLOWED_SHIFT_TIMES.has(rawRequest.shiftTime) ? rawRequest.shiftTime : "Full Day";
  const status = ALLOWED_STATUSES.has(rawRequest.status) ? rawRequest.status : "pending";
  return {
    id,
    driverName,
    weekCommencing,
    dayIndex: Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6 ? dayIndex : 0,
    dayName,
    shiftTime,
    notes: normalizeString(rawRequest.notes, 1200),
    driverEmail: normalizeString(rawRequest.driverEmail, 200),
    status,
    createdAt,
    respondedAt: toIsoOrNull(rawRequest.respondedAt),
    respondedBy: normalizeString(rawRequest.respondedBy, 120)
  };
}

async function loadOvertimeRequests() {
  const blob = await getJsonBlob(OVERTIME_REQUESTS_BLOB_PATH);
  const rawRequests = Array.isArray(blob?.data?.requests) ? blob.data.requests : [];
  const requests = [];
  for (const raw of rawRequests) {
    const normalized = normalizeOvertimeRequest(raw);
    if (normalized) requests.push(normalized);
  }
  return requests;
}

async function saveOvertimeRequests(requests) {
  return await putJsonBlob(OVERTIME_REQUESTS_BLOB_PATH, { requests });
}

function createOvertimeRequestRecord(payload, now = Date.now()) {
  const createdAt = new Date(now).toISOString();
  return normalizeOvertimeRequest({
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"),
    driverName: payload.driverName,
    weekCommencing: payload.weekCommencing,
    dayIndex: payload.dayIndex,
    dayName: payload.dayName,
    shiftTime: payload.shiftTime,
    notes: payload.notes,
    driverEmail: payload.driverEmail,
    status: "pending",
    createdAt,
    respondedAt: null,
    respondedBy: ""
  });
}

function sortOvertimeRequests(requests) {
  return [...requests].sort((a, b) => {
    const aTime = new Date(a.respondedAt || a.createdAt).getTime();
    const bTime = new Date(b.respondedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function getRelevantOvertimeRequests(requests, driverName) {
  return sortOvertimeRequests(requests.filter(r => r.driverName === driverName));
}

module.exports = {
  OVERTIME_REQUEST_TTL_MS,
  normalizeOvertimeRequest,
  loadOvertimeRequests,
  saveOvertimeRequests,
  createOvertimeRequestRecord,
  sortOvertimeRequests,
  getRelevantOvertimeRequests
};
