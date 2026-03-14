const { verifyRequestSession, parseRequestBody } = require("./_auth");
const { asCleanString } = require("./_request-email");
const { loadOvertimeRequests, saveOvertimeRequests } = require("./_overtime-requests");
const { sendPushToDriver } = require("./_push");

const MANAGERS = ["Alfie Hoque", "Errol Thomas", "Kennedy Ncube"];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const id = asCleanString(body.id, 80);
  const action = asCleanString(body.action, 20).toLowerCase();
  if (!id || !["approve", "decline", "register", "cancel"].includes(action)) {
    return res.status(400).json({ ok: false, error: "Invalid overtime action." });
  }

  const isManager = MANAGERS.includes(session.name);

  try {
    const requests = await loadOvertimeRequests();
    const index = requests.findIndex(r => r.id === id);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Overtime request not found." });
    }
    const current = requests[index];

    if (action === "cancel") {
      if (current.driverName !== session.name) {
        return res.status(403).json({ ok: false, error: "Only the requesting driver can cancel this overtime request." });
      }
      if (!["pending", "registered"].includes(current.status)) {
        return res.status(409).json({ ok: false, error: `Overtime request is already ${current.status}.` });
      }
      const updated = { ...current, status: "cancelled", respondedAt: new Date().toISOString() };
      requests[index] = updated;
      await saveOvertimeRequests(requests);
      return res.status(200).json({ ok: true, request: updated });
    }

    // approve / decline / register — manager only
    if (!isManager) {
      return res.status(403).json({ ok: false, error: "Only managers can approve, decline, or register overtime requests." });
    }
    if (current.status !== "pending") {
      return res.status(409).json({ ok: false, error: `Overtime request is already ${current.status}.` });
    }

    const nowIso = new Date().toISOString();
    const newStatus = action === "approve" ? "approved" : action === "register" ? "registered" : "declined";
    const updated = { ...current, status: newStatus, respondedAt: nowIso, respondedBy: session.name };
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

    return res.status(200).json({ ok: true, request: updated });
  } catch (error) {
    console.error("Overtime request action failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to update overtime request." });
  }
};
