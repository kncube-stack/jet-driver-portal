const { verifyRequestSession, verifySignedActionToken, createSignedActionToken, getRequestOrigin, parseRequestBody } = require("./_auth");
const { asCleanString, asPositiveInt, buildLeaveRequestActionEmails, buildDriverLeaveDecisionEmail, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncLeaveRequests, saveLeaveRequests, createLeaveRequestRecord, getRelevantLeaveRequests, sortLeaveRequests } = require("./_leave-requests");

// Only these managers can view all requests, approve, and decline
const LEAVE_MANAGERS = ["Alfie Hoque", "Errol Thomas"];
const LEAVE_EMAIL_ACTION_TTL_SECONDS = 60 * 60 * 24 * 14;

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getTokenFromRequest(req) {
  if (req && req.query && typeof req.query.token === "string" && req.query.token.trim()) {
    return req.query.token.trim();
  }
  const url = req?.url || "";
  const queryIndex = url.indexOf("?");
  if (queryIndex < 0) return "";
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  return String(params.get("token") || "").trim();
}

function renderHtmlPage(title, message, accentColor, detailLines = []) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const detailsHtml = detailLines.length > 0 ? `<ul style="margin:16px 0 0;padding-left:18px;color:#475569;font-size:14px;line-height:1.6;">${detailLines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "";
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeTitle}</title>
      <style>
        body { margin: 0; font-family: Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
        .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { width: 100%; max-width: 640px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 18px; padding: 28px; box-sizing: border-box; }
        .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 14px; }
        h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: ${accentColor}; }
        p { margin: 0; font-size: 15px; line-height: 1.6; color: #334155; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="card">
          <div class="eyebrow">JET Driver Portal</div>
          <h1>${safeTitle}</h1>
          <p>${safeMessage}</p>
          ${detailsHtml}
        </div>
      </div>
    </body>
  </html>`;
}

function buildLeaveEmailActionUrl(req, requestId, action, managerName) {
  const token = createSignedActionToken({
    kind: "leave-request-action",
    requestId,
    action,
    managerName
  }, LEAVE_EMAIL_ACTION_TTL_SECONDS);
  return `${getRequestOrigin(req)}/api/leave-requests?token=${encodeURIComponent(token)}`;
}

async function sendLeaveRequestNotificationEmails(request, req) {
  const emails = buildLeaveRequestActionEmails({ ...request, submittedAtIso: request.createdAt }, (action, managerName) => buildLeaveEmailActionUrl(req, request.id, action, managerName));
  for (const email of emails) {
    await sendConfiguredPortalEmail(email);
  }
}

module.exports = async function handler(req, res) {
  const token = getTokenFromRequest(req);
  const tokenPayload = token ? verifySignedActionToken(token) : null;

  if (req.method === "GET" && token) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (!tokenPayload || tokenPayload.kind !== "leave-request-action") {
      return res.status(400).send(renderHtmlPage("Link Invalid", "This leave request link is invalid or has expired.", "#dc2626", ["Ask the office to use the portal or request a new email notification."]));
    }
    const requestId = typeof tokenPayload.requestId === "string" ? tokenPayload.requestId.trim() : "";
    const action = tokenPayload.action === "approve" ? "approve" : tokenPayload.action === "decline" ? "decline" : "";
    const managerName = typeof tokenPayload.managerName === "string" && tokenPayload.managerName.trim() ? tokenPayload.managerName.trim() : "Office email action";
    if (!requestId || !action) {
      return res.status(400).send(renderHtmlPage("Link Invalid", "This leave request link is missing required details.", "#dc2626"));
    }
    try {
      const requests = await loadAndSyncLeaveRequests();
      const index = requests.findIndex(request => request.id === requestId);
      if (index < 0) {
        return res.status(404).send(renderHtmlPage("Request Not Found", "This leave request could not be found.", "#dc2626"));
      }
      const current = requests[index];
      const fromLabel = current.fromDateLabel || current.dateFrom || "Unknown date";
      const toLabel = current.toDateLabel || current.dateTo || "Unknown date";
      if (current.status !== "pending") {
        const statusWord = current.status.charAt(0).toUpperCase() + current.status.slice(1);
        const details = [
          `Driver: ${current.driverName}`,
          `Dates: ${fromLabel}${fromLabel !== toLabel ? ` to ${toLabel}` : ""}`,
          current.respondedBy ? `${statusWord} by ${current.respondedBy}` : `Status: ${statusWord}`
        ];
        return res.status(409).send(renderHtmlPage("Already Actioned", `This leave request is already ${current.status}.`, current.status === "approved" ? "#16a34a" : current.status === "declined" ? "#dc2626" : "#475569", details));
      }
      const nowIso = new Date().toISOString();
      const updated = {
        ...current,
        status: action === "approve" ? "approved" : "declined",
        respondedAt: nowIso,
        respondedBy: managerName
      };
      requests[index] = updated;
      await saveLeaveRequests(requests);
      if (updated.driverEmail) {
        try {
          await sendConfiguredPortalEmail(buildDriverLeaveDecisionEmail(updated, action));
        } catch (emailError) {
          console.error("Email leave action driver notification failed:", emailError);
        }
      }
      const statusWord = action === "approve" ? "Approved" : "Declined";
      return res.status(200).send(renderHtmlPage(statusWord, `${updated.driverName}'s leave request has been ${action}d.`, action === "approve" ? "#16a34a" : "#dc2626", [
        `Dates: ${fromLabel}${fromLabel !== toLabel ? ` to ${toLabel}` : ""}`,
        `Recorded by: ${managerName}`,
        "The portal status has been updated immediately.",
        "Drivers on the leave screen will pick this up on the next refresh cycle."
      ]));
    } catch (error) {
      console.error("Leave email action failed:", error);
      return res.status(500).send(renderHtmlPage("Update Failed", error?.message || "The leave request could not be updated right now.", "#dc2626"));
    }
  }

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
