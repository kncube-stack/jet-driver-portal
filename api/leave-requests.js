const { verifyRequestSession, parseRequestBody } = require("./_auth");
const { asCleanString, asPositiveInt, buildLeaveMessage, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncLeaveRequests, saveLeaveRequests, createLeaveRequestRecord, getRelevantLeaveRequests, sortLeaveRequests } = require("./_leave-requests");

module.exports = async function handler(req, res) {
  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }

  if (req.method === "GET") {
    try {
      const requests = await loadAndSyncLeaveRequests();
      const result = session.role === "manager"
        ? sortLeaveRequests(requests)
        : getRelevantLeaveRequests(requests, session.name);
      return res.status(200).json({ ok: true, requests: result });
    } catch (error) {
      console.error("Leave requests read failed:", error);
      return res.status(500).json({ ok: false, error: "Failed to load leave requests." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const payload = body && typeof body.payload === "object" && body.payload ? body.payload : {};

  const driverName = asCleanString(payload.driverName, 120);
  if (!driverName) {
    return res.status(400).json({ ok: false, error: "Driver name is required." });
  }
  if (session.role !== "manager" && driverName !== session.name) {
    return res.status(403).json({ ok: false, error: "Not allowed to submit leave for another driver." });
  }

  const record = createLeaveRequestRecord({
    driverName,
    dateFrom: asCleanString(payload.dateFrom, 20),
    dateTo: asCleanString(payload.dateTo, 20),
    fromDateLabel: asCleanString(payload.fromDateLabel, 120),
    toDateLabel: asCleanString(payload.toDateLabel, 120),
    totalDays: asPositiveInt(payload.totalDays, 1),
    reason: asCleanString(payload.reason, 200),
    notes: asCleanString(payload.notes, 1200),
    driverEmail: asCleanString(payload.driverEmail, 200)
  });

  if (!record) {
    return res.status(400).json({ ok: false, error: "Invalid leave request payload." });
  }

  try {
    const requests = await loadAndSyncLeaveRequests();
    requests.unshift(record);
    await saveLeaveRequests(requests);

    await sendConfiguredPortalEmail(buildLeaveMessage({
      ...record,
      submittedAtIso: record.createdAt
    }));

    return res.status(201).json({ ok: true, request: record });
  } catch (error) {
    console.error("Leave request create failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to submit leave request." });
  }
};
