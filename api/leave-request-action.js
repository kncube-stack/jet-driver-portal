const { verifySignedActionToken } = require("./_auth");
const { loadAndSyncLeaveRequests, saveLeaveRequests } = require("./_leave-requests");
const { buildDriverLeaveDecisionEmail, sendConfiguredPortalEmail } = require("./_request-email");

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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const token = getTokenFromRequest(req);
  const payload = verifySignedActionToken(token);
  if (!payload || payload.kind !== "leave-request-action") {
    return res.status(400).send(renderHtmlPage("Link Invalid", "This leave request link is invalid or has expired.", "#dc2626", ["Ask the office to use the portal or request a new email notification."]));
  }

  const requestId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
  const action = payload.action === "approve" ? "approve" : payload.action === "decline" ? "decline" : "";
  const managerName = typeof payload.managerName === "string" && payload.managerName.trim() ? payload.managerName.trim() : "Office email action";
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
};
