const crypto = require("crypto");
const { getJsonBlob, putJsonBlob } = require("./_blob-json");

const LEAVE_REQUESTS_BLOB_PATH = "leave-requests/index.json";
const ALLOWED_STATUSES = new Set(["pending", "approved", "declined", "cancelled"]);

function toIsoOrNull(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeString(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeLeaveRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== "object") return null;
  const id = normalizeString(rawRequest.id, 80);
  if (!id) return null;
  const driverName = normalizeString(rawRequest.driverName, 120);
  if (!driverName) return null;
  const createdAt = toIsoOrNull(rawRequest.createdAt);
  if (!createdAt) return null;
  const status = ALLOWED_STATUSES.has(rawRequest.status) ? rawRequest.status : "pending";
  return {
    id,
    driverName,
    dateFrom: normalizeString(rawRequest.dateFrom, 20),
    dateTo: normalizeString(rawRequest.dateTo, 20),
    fromDateLabel: normalizeString(rawRequest.fromDateLabel, 120),
    toDateLabel: normalizeString(rawRequest.toDateLabel, 120),
    totalDays: Number.isFinite(Number(rawRequest.totalDays)) ? Number(rawRequest.totalDays) : 1,
    reason: normalizeString(rawRequest.reason, 200) || "Annual leave",
    notes: normalizeString(rawRequest.notes, 1200),
    driverEmail: normalizeString(rawRequest.driverEmail, 200),
    status,
    createdAt,
    respondedAt: toIsoOrNull(rawRequest.respondedAt),
    respondedBy: normalizeString(rawRequest.respondedBy, 120)
  };
}

async function loadLeaveRequests() {
  const blob = await getJsonBlob(LEAVE_REQUESTS_BLOB_PATH);
  const rawRequests = Array.isArray(blob?.data?.requests) ? blob.data.requests : [];
  const requests = [];
  for (const raw of rawRequests) {
    const normalized = normalizeLeaveRequest(raw);
    if (normalized) requests.push(normalized);
  }
  return requests;
}

async function saveLeaveRequests(requests) {
  return await putJsonBlob(LEAVE_REQUESTS_BLOB_PATH, { requests });
}

async function loadAndSyncLeaveRequests() {
  return await loadLeaveRequests();
}

function createLeaveRequestRecord(payload, now = Date.now()) {
  const createdAt = new Date(now).toISOString();
  return normalizeLeaveRequest({
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"),
    driverName: payload.driverName,
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    fromDateLabel: payload.fromDateLabel,
    toDateLabel: payload.toDateLabel,
    totalDays: payload.totalDays,
    reason: payload.reason,
    notes: payload.notes,
    driverEmail: payload.driverEmail,
    status: "pending",
    createdAt,
    respondedAt: null,
    respondedBy: ""
  });
}

function sortLeaveRequests(requests) {
  return [...requests].sort((a, b) => {
    const aTime = new Date(a.respondedAt || a.createdAt).getTime();
    const bTime = new Date(b.respondedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function getRelevantLeaveRequests(requests, driverName) {
  return sortLeaveRequests(requests.filter(request => request.driverName === driverName));
}

module.exports = {
  normalizeLeaveRequest,
  loadLeaveRequests,
  saveLeaveRequests,
  loadAndSyncLeaveRequests,
  createLeaveRequestRecord,
  sortLeaveRequests,
  getRelevantLeaveRequests
};
