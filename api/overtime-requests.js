const { verifyRequestSession, verifySignedActionToken, createSignedActionToken, parseRequestBody, getRequestOrigin } = require("./_auth");
const { asCleanString, buildOvertimeRequestEmail, sendConfiguredPortalEmail } = require("./_request-email");
const { loadOvertimeRequests, saveOvertimeRequests, createOvertimeRequestRecord, getRelevantOvertimeRequests } = require("./_overtime-requests");
const { sendPushToDriver } = require("./_push");

const MANAGERS = ["Alfie Hoque", "Errol Thomas", "Kennedy Ncube"];
const OVERTIME_EMAIL_ACTION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const ALLOWED_SHIFT_TIMES = new Set(["Morning", "Afternoon", "Full Day"]);

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
  const detailsHtml = detailLines.length > 0
    ? `<ul style="margin:16px 0 0;padding-left:18px;color:#475569;font-size:14px;line-height:1.6;">${detailLines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : "";
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

function buildOvertimeEmailActionUrl(req, id, action) {
  const token = createSignedActionToken(
    { kind: "overtime-request-action", id, action },
    OVERTIME_EMAIL_ACTION_TTL_SECONDS
  );
  return `${getRequestOrigin(req)}/api/overtime-requests?token=${encodeURIComponent(token)}`;
}

function asDayIndex(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : null;
}

module.exports = async function handler(req, res) {
  const token = getTokenFromRequest(req);
  const tokenPayload = token ? verifySignedActionToken(token) : null;

  // Office one-click approve / register / decline via email link (no session required)
  if (req.method === "GET" && token) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (!tokenPayload || tokenPayload.kind !== "overtime-request-action") {
      return res.status(400).send(renderHtmlPage("Link Invalid", "This overtime request link is invalid or has expired.", "#dc2626", ["Ask the driver to resubmit if the request is still needed."]));
    }
    const id = typeof tokenPayload.id === "string" ? tokenPayload.id.trim() : "";
    const rawAction = tokenPayload.action;
    const action = rawAction === "approve" ? "approve" : rawAction === "register" ? "register" : rawAction === "decline" ? "decline" : "";
    if (!id || !action) {
      return res.status(400).send(renderHtmlPage("Link Invalid", "This overtime request link is missing required details.", "#dc2626"));
    }
    try {
      const requests = await loadOvertimeRequests();
      const index = requests.findIndex(r => r.id === id);
      if (index < 0) {
        return res.status(404).send(renderHtmlPage("Not Found", "This overtime request could not be found.", "#dc2626"));
      }
      const current = requests[index];
      if (current.status !== "pending") {
        const statusWord = current.status.charAt(0).toUpperCase() + current.status.slice(1);
        const accentColor = current.status === "approved" ? "#16a34a" : current.status === "registered" ? "#d97706" : "#dc2626";
        return res.status(409).send(renderHtmlPage("Already Actioned", `This overtime request is already ${current.status}.`, accentColor, [
          `Driver: ${current.driverName}`,
          `Day: ${current.dayName}${current.weekCommencing ? " — w/c " + current.weekCommencing : ""}`,
          `Shift: ${current.shiftTime}`,
          current.respondedAt ? `${statusWord} at ${new Date(current.respondedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}` : `Status: ${statusWord}`
        ]));
      }
      const nowIso = new Date().toISOString();
      const newStatus = action === "approve" ? "approved" : action === "register" ? "registered" : "declined";
      const updated = { ...current, status: newStatus, respondedAt: nowIso, respondedBy: "Operations" };
      requests[index] = updated;
      await saveOvertimeRequests(requests);
      const pushTag = `overtime-${updated.id}`;
      if (action === "approve") {
        sendPushToDriver(updated.driverName, { title: "Overtime Approved \u2713", body: `Your overtime request for ${updated.dayName} has been confirmed`, url: "/", tag: pushTag }).catch(() => {});
      } else if (action === "register") {
        sendPushToDriver(updated.driverName, { title: "Overtime Registered \uD83D\uDCCB", body: `Your overtime interest for ${updated.dayName} has been noted on the rota`, url: "/", tag: pushTag }).catch(() => {});
      } else {
        sendPushToDriver(updated.driverName, { title: "Overtime Request Declined", body: `Your overtime request for ${updated.dayName} was not available`, url: "/", tag: pushTag }).catch(() => {});
      }
      const statusWord = action === "approve" ? "Approved" : action === "register" ? "Registered" : "Declined";
      const accentColor = action === "approve" ? "#16a34a" : action === "register" ? "#d97706" : "#dc2626";
      const actionPastTense = action === "register" ? "registered" : action + "d";
      return res.status(200).send(renderHtmlPage(statusWord, `${updated.driverName}'s overtime request for ${updated.dayName} has been ${actionPastTense}.`, accentColor, [
        `Shift: ${updated.shiftTime}`,
        `Week commencing: ${updated.weekCommencing || "Unknown"}`,
        "The portal status has been updated immediately.",
        "The driver will see the updated status on their next refresh."
      ]));
    } catch (error) {
      console.error("Overtime email action failed:", error);
      return res.status(500).send(renderHtmlPage("Update Failed", error?.message || "The overtime request could not be updated right now.", "#dc2626"));
    }
  }

  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }
  const isManager = MANAGERS.includes(session.name);

  if (req.method === "DELETE") {
    if (!isManager) {
      return res.status(403).json({ ok: false, error: "Only managers can clear overtime requests." });
    }
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      const all = await loadOvertimeRequests();
      const updated = ids ? all.filter(r => !ids.includes(r.id)) : [];
      await saveOvertimeRequests(updated);
      return res.status(200).json({ ok: true, cleared: ids ? ids.length : all.length });
    } catch (error) {
      console.error("Overtime requests clear failed:", error);
      return res.status(500).json({ ok: false, error: "Failed to clear overtime requests." });
    }
  }

  if (req.method === "GET") {
    try {
      const all = await loadOvertimeRequests();
      const requests = isManager ? all : getRelevantOvertimeRequests(all, session.name);
      return res.status(200).json({ ok: true, requests });
    } catch (error) {
      console.error("Overtime requests read failed:", error);
      return res.status(500).json({ ok: false, error: "Failed to load overtime requests." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const payload = body && typeof body.payload === "object" && body.payload ? body.payload : {};
  const driverName = asCleanString(payload.driverName, 120);
  const weekCommencing = asCleanString(payload.weekCommencing, 20);
  const dayIndex = asDayIndex(payload.dayIndex);
  const dayName = asCleanString(payload.dayName, 40);
  const shiftTime = ALLOWED_SHIFT_TIMES.has(payload.shiftTime) ? payload.shiftTime : null;
  const notes = asCleanString(payload.notes, 1200);
  const driverEmail = asCleanString(payload.driverEmail, 200);

  if (!driverName || driverName !== session.name) {
    return res.status(403).json({ ok: false, error: "Not allowed to create an overtime request for another driver." });
  }
  if (dayIndex === null || !dayName || !weekCommencing) {
    return res.status(400).json({ ok: false, error: "Missing overtime day details." });
  }
  if (!shiftTime) {
    return res.status(400).json({ ok: false, error: "Select a preferred shift time." });
  }

  const createdRequest = createOvertimeRequestRecord({ driverName, weekCommencing, dayIndex, dayName, shiftTime, notes, driverEmail });
  if (!createdRequest) {
    return res.status(400).json({ ok: false, error: "Invalid overtime request payload." });
  }

  try {
    const requests = await loadOvertimeRequests();
    requests.unshift(createdRequest);
    await saveOvertimeRequests(requests);
    try {
      const approveUrl = buildOvertimeEmailActionUrl(req, createdRequest.id, "approve");
      const registerUrl = buildOvertimeEmailActionUrl(req, createdRequest.id, "register");
      const declineUrl = buildOvertimeEmailActionUrl(req, createdRequest.id, "decline");
      await sendConfiguredPortalEmail(buildOvertimeRequestEmail(createdRequest, approveUrl, registerUrl, declineUrl));
    } catch (emailError) {
      console.error("Overtime request email failed:", emailError);
    }
    return res.status(201).json({ ok: true, request: createdRequest });
  } catch (error) {
    console.error("Overtime request create failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to create overtime request." });
  }
};
