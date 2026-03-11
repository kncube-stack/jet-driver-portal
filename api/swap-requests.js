const { verifyRequestSession, verifySignedActionToken, parseRequestBody, getRequestOrigin } = require("./_auth");
const { asCleanString, buildApprovedSwapMessage, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncSwapRequests, saveSwapRequests, createSwapRequestRecord, getRelevantSwapRequests } = require("./_swap-requests");
const { sendPushToDriver } = require("./_push");

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

function formatWeekCommencingLabel(weekCommencing) {
  const match = String(weekCommencing || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return weekCommencing || "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  return `${Number.parseInt(match[3], 10)} ${months[monthIndex] || match[2]} ${match[1]}`;
}

function asDayIndex(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : null;
}

module.exports = async function handler(req, res) {
  const token = getTokenFromRequest(req);
  const tokenPayload = token ? verifySignedActionToken(token) : null;

  // Office one-click approve / decline via email link (no session required)
  if (req.method === "GET" && token) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (!tokenPayload || tokenPayload.kind !== "swap-office-action") {
      return res.status(400).send(renderHtmlPage("Link Invalid", "This swap confirmation link is invalid or has expired.", "#dc2626", ["Ask the office to use the portal or request a new notification email."]));
    }
    const swapId = typeof tokenPayload.swapId === "string" ? tokenPayload.swapId.trim() : "";
    const action = tokenPayload.action === "approve" ? "approve" : tokenPayload.action === "decline" ? "decline" : "";
    if (!swapId || !action) {
      return res.status(400).send(renderHtmlPage("Link Invalid", "This swap confirmation link is missing required details.", "#dc2626"));
    }
    try {
      const requests = await loadAndSyncSwapRequests();
      const index = requests.findIndex(r => r.id === swapId);
      if (index < 0) {
        return res.status(404).send(renderHtmlPage("Swap Not Found", "This swap request could not be found.", "#dc2626"));
      }
      const current = requests[index];
      const dayLabel = current.dayName || "Unknown day";
      const weekLabel = formatWeekCommencingLabel(current.weekCommencing) || current.weekCommencing || "Unknown week";
      if (current.status !== "agreed") {
        const statusWord = current.status.charAt(0).toUpperCase() + current.status.slice(1);
        return res.status(409).send(renderHtmlPage("Already Actioned", `This swap is already ${current.status}.`, current.status === "approved" ? "#16a34a" : current.status === "declined" ? "#dc2626" : "#475569", [
          `Requesting Driver: ${current.requestingDriver}`,
          `Swap With: ${current.targetDriver}`,
          `Day: ${dayLabel} — ${weekLabel}`,
          current.respondedAt ? `${statusWord} at ${new Date(current.respondedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}` : `Status: ${statusWord}`
        ]));
      }
      const nowIso = new Date().toISOString();
      const updated = {
        ...current,
        status: action === "approve" ? "approved" : "declined",
        respondedAt: nowIso,
        respondedBy: "Operations"
      };
      requests[index] = updated;
      await saveSwapRequests(requests);
      if (action === "approve") {
        try {
          await sendConfiguredPortalEmail(buildApprovedSwapMessage({
            ...updated,
            approvedAtIso: nowIso,
            weekCommencingLabel: weekLabel
          }));
        } catch (emailError) {
          console.error("Swap approval confirmation email failed:", emailError);
        }
        const swapTag = `swap-${updated.id}`;
        await Promise.all([
          sendPushToDriver(updated.requestingDriver, {
            title: "Swap Approved \u2713",
            body: `Your ${updated.dayName} swap with ${updated.targetDriver} is confirmed`,
            url: "/",
            tag: swapTag
          }).catch(() => {}),
          sendPushToDriver(updated.targetDriver, {
            title: "Swap Confirmed",
            body: `Your ${updated.dayName} swap with ${updated.requestingDriver} is confirmed`,
            url: "/",
            tag: swapTag + "-t"
          }).catch(() => {})
        ]);
      } else {
        await sendPushToDriver(updated.requestingDriver, {
          title: "Swap Not Approved",
          body: `Your ${updated.dayName} swap request was not approved by the office`,
          url: "/",
          tag: `swap-${updated.id}`
        }).catch(() => {});
      }
      const statusWord = action === "approve" ? "Approved" : "Declined";
      return res.status(200).send(renderHtmlPage(statusWord, `The shift swap between ${updated.requestingDriver} and ${updated.targetDriver} has been ${action}d.`, action === "approve" ? "#16a34a" : "#dc2626", [
        `Day: ${dayLabel} — ${weekLabel}`,
        `${updated.requestingDriver}: ${updated.requestingDuty}`,
        `${updated.targetDriver}: ${updated.targetDuty}`,
        "The portal status has been updated immediately.",
        "Both drivers will see the updated status on their next refresh."
      ]));
    } catch (error) {
      console.error("Swap office action failed:", error);
      return res.status(500).send(renderHtmlPage("Update Failed", error?.message || "The swap request could not be updated right now.", "#dc2626"));
    }
  }

  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }

  if (req.method === "GET") {
    try {
      const requests = await loadAndSyncSwapRequests();
      return res.status(200).json({
        ok: true,
        requests: getRelevantSwapRequests(requests, session.name)
      });
    } catch (error) {
      console.error("Swap requests read failed:", error);
      return res.status(500).json({ ok: false, error: "Failed to load swap requests." });
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
  const requestingDriver = asCleanString(payload.requestingDriver, 120);
  const targetDriver = asCleanString(payload.targetDriver, 120);
  const dayIndex = asDayIndex(payload.dayIndex);
  const dayName = asCleanString(payload.dayName, 40);
  const weekCommencing = asCleanString(payload.weekCommencing, 20);
  const requestingDuty = asCleanString(payload.requestingDuty, 120) || "—";
  const targetDuty = asCleanString(payload.targetDuty, 120) || "—";
  const notes = asCleanString(payload.notes, 1200);

  if (!requestingDriver || requestingDriver !== session.name) {
    return res.status(403).json({ ok: false, error: "Not allowed to create a swap for another driver." });
  }
  if (!targetDriver || targetDriver === requestingDriver) {
    return res.status(400).json({ ok: false, error: "Choose another driver to swap with." });
  }
  if (dayIndex === null || !dayName || !weekCommencing) {
    return res.status(400).json({ ok: false, error: "Missing swap day details." });
  }

  const createdRequest = createSwapRequestRecord({
    requestingDriver,
    targetDriver,
    dayIndex,
    dayName,
    weekCommencing,
    requestingDuty,
    targetDuty,
    notes
  });

  if (!createdRequest) {
    return res.status(400).json({ ok: false, error: "Invalid swap request payload." });
  }

  try {
    const requests = await loadAndSyncSwapRequests();
    requests.unshift(createdRequest);
    await saveSwapRequests(requests);
    sendPushToDriver(createdRequest.targetDriver, {
      title: "New Swap Request",
      body: `${createdRequest.requestingDriver} wants to swap your ${createdRequest.dayName} duty`,
      url: "/",
      tag: `swap-request-${createdRequest.id}`
    }).catch(() => {});
    return res.status(201).json({ ok: true, request: createdRequest });
  } catch (error) {
    console.error("Swap request create failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to create swap request." });
  }
};
