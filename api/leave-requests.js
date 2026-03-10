const { verifyRequestSession, createSignedActionToken, getRequestOrigin, parseRequestBody } = require("./_auth");
const { asCleanString, asPositiveInt, buildLeaveRequestActionEmails, buildDriverLeaveDecisionEmail, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncLeaveRequests, saveLeaveRequests, createLeaveRequestRecord, getRelevantLeaveRequests, sortLeaveRequests } = require("./_leave-requests");

// Only these managers can view all requests, approve, and decline
const LEAVE_MANAGERS = ["Alfie Hoque", "Errol Thomas"];
const LEAVE_EMAIL_ACTION_TTL_SECONDS = 60 * 60 * 24 * 14;

function buildLeaveEmailActionUrl(req, requestId, action, managerName) {
  const token = createSignedActionToken({
    kind: "leave-request-action",
    requestId,
    action,
    managerName
  }, LEAVE_EMAIL_ACTION_TTL_SECONDS);
  return `${getRequestOrigin(req)}/api/leave-request-action?token=${encodeURIComponent(token)}`;
}

async function sendLeaveRequestNotificationEmails(request, req) {
  const emails = buildLeaveRequestActionEmails({ ...request, submittedAtIso: request.createdAt }, (action, managerName) => buildLeaveEmailActionUrl(req, request.id, action, managerName));
  for (const email of emails) {
    await sendConfiguredPortalEmail(email);
  }
}

module.exports = async function handler(req, res) {
  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }

  // GET — list requests
  if (req.method === "GET") {
    try {
      const requests = await loadAndSyncLeaveRequests();

      // Calendar view — approved requests only, accessible to all authenticated users
      const urlStr = req.url || "";
      if (urlStr.includes("calendar=1")) {
        const approved = requests.filter(r => r.status === "approved");
        return res.status(200).json({ ok: true, requests: approved });
      }

      const isLeaveManager = LEAVE_MANAGERS.includes(session.name);
      const result = isLeaveManager
        ? sortLeaveRequests(requests)
        : getRelevantLeaveRequests(requests, session.name);
      return res.status(200).json({ ok: true, requests: result });
    } catch (error) {
      console.error("Leave requests read failed:", error);
      return res.status(500).json({ ok: false, error: "Failed to load leave requests." });
    }
  }

  // PATCH — approve / decline / cancel
  if (req.method === "PATCH") {
    const body = parseRequestBody(req);
    if (!body) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body." });
    }
    const id = asCleanString(body.id, 80);
    const action = asCleanString(body.action, 20).toLowerCase();
    if (!id || !["approve", "decline", "cancel"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Invalid leave request action." });
    }
    if ((action === "approve" || action === "decline") && !LEAVE_MANAGERS.includes(session.name)) {
      return res.status(403).json({ ok: false, error: "Only designated leave managers can approve or decline leave requests." });
    }
    try {
      const requests = await loadAndSyncLeaveRequests();
      const index = requests.findIndex(r => r.id === id);
      if (index < 0) {
        return res.status(404).json({ ok: false, error: "Leave request not found." });
      }
      const current = requests[index];
      if (current.status !== "pending") {
        return res.status(409).json({ ok: false, error: `Leave request is already ${current.status}.` });
      }
      if (action === "cancel") {
        if (!LEAVE_MANAGERS.includes(session.name) && current.driverName !== session.name) {
          return res.status(403).json({ ok: false, error: "Only the requesting driver can cancel this leave request." });
        }
        const updated = { ...current, status: "cancelled", respondedAt: new Date().toISOString(), respondedBy: session.name };
        requests[index] = updated;
        await saveLeaveRequests(requests);
        return res.status(200).json({ ok: true, request: updated });
      }
      const nowIso = new Date().toISOString();
      const updated = { ...current, status: action === "approve" ? "approved" : "declined", respondedAt: nowIso, respondedBy: session.name };
      requests[index] = updated;
      await saveLeaveRequests(requests);
      if (updated.driverEmail) {
        try {
          await sendConfiguredPortalEmail(buildDriverLeaveDecisionEmail(updated, action));
        } catch (emailError) {
          console.error("Leave action driver notification failed:", emailError);
        }
      }
      return res.status(200).json({ ok: true, request: updated });
    } catch (error) {
      console.error("Leave request action failed:", error);
      return res.status(500).json({ ok: false, error: error?.message || "Failed to update leave request." });
    }
  }

  // POST — create new request
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, PATCH");
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
    await sendLeaveRequestNotificationEmails(record, req);
    return res.status(201).json({ ok: true, request: record });
  } catch (error) {
    console.error("Leave request create failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to submit leave request." });
  }
};
