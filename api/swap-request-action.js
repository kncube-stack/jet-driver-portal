const { verifyRequestSession, parseRequestBody } = require("./_auth");
const { asCleanString } = require("./_request-email");
const { buildApprovedSwapMessage, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncSwapRequests, saveSwapRequests } = require("./_swap-requests");

function formatWeekCommencingLabel(weekCommencing) {
  const match = String(weekCommencing || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return weekCommencing || "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  return `${Number.parseInt(match[3], 10)} ${months[monthIndex] || match[2]} ${match[1]}`;
}

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
  if (!id || !["approve", "decline", "cancel"].includes(action)) {
    return res.status(400).json({ ok: false, error: "Invalid swap action." });
  }

  try {
    const requests = await loadAndSyncSwapRequests();
    const index = requests.findIndex(request => request.id === id);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Swap request not found." });
    }
    const current = requests[index];
    if (current.status !== "pending") {
      return res.status(409).json({ ok: false, error: `Swap request is already ${current.status}.` });
    }

    const nowIso = new Date().toISOString();

    if (action === "cancel") {
      if (current.requestingDriver !== session.name) {
        return res.status(403).json({ ok: false, error: "Only the requesting driver can cancel this swap." });
      }
      const updated = {
        ...current,
        status: "cancelled",
        respondedAt: nowIso
      };
      requests[index] = updated;
      await saveSwapRequests(requests);
      return res.status(200).json({ ok: true, request: updated });
    }

    if (current.targetDriver !== session.name) {
      return res.status(403).json({ ok: false, error: "Only the target driver can respond to this swap." });
    }

    if (action === "decline") {
      const updated = {
        ...current,
        status: "declined",
        respondedAt: nowIso
      };
      requests[index] = updated;
      await saveSwapRequests(requests);
      return res.status(200).json({ ok: true, request: updated });
    }

    const approvedRequest = {
      ...current,
      status: "approved",
      respondedAt: nowIso
    };
    await sendConfiguredPortalEmail(buildApprovedSwapMessage({
      ...approvedRequest,
      approvedAtIso: nowIso,
      weekCommencingLabel: formatWeekCommencingLabel(approvedRequest.weekCommencing)
    }));
    requests[index] = approvedRequest;
    await saveSwapRequests(requests);
    return res.status(200).json({ ok: true, request: approvedRequest });
  } catch (error) {
    console.error("Swap request action failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to update swap request." });
  }
};
