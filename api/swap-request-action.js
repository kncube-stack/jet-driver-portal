const { verifyRequestSession, parseRequestBody, createSignedActionToken, getRequestOrigin } = require("./_auth");
const { asCleanString, buildSwapOfficeActionEmail, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncSwapRequests, saveSwapRequests } = require("./_swap-requests");

const SWAP_OFFICE_ACTION_TTL_SECONDS = 60 * 60 * 24 * 14;

function formatWeekCommencingLabel(weekCommencing) {
  const match = String(weekCommencing || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return weekCommencing || "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  return `${Number.parseInt(match[3], 10)} ${months[monthIndex] || match[2]} ${match[1]}`;
}

function buildSwapOfficeActionUrl(req, swapId, action) {
  const token = createSignedActionToken(
    { kind: "swap-office-action", swapId, action },
    SWAP_OFFICE_ACTION_TTL_SECONDS
  );
  return `${getRequestOrigin(req)}/api/swap-requests?token=${encodeURIComponent(token)}`;
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

    // Target driver approves — move to "agreed", await office confirmation
    const agreedRequest = {
      ...current,
      status: "agreed",
      agreedAt: nowIso
    };
    requests[index] = agreedRequest;
    await saveSwapRequests(requests);
    try {
      const approveUrl = buildSwapOfficeActionUrl(req, agreedRequest.id, "approve");
      const declineUrl = buildSwapOfficeActionUrl(req, agreedRequest.id, "decline");
      await sendConfiguredPortalEmail(buildSwapOfficeActionEmail(
        { ...agreedRequest, weekCommencingLabel: formatWeekCommencingLabel(agreedRequest.weekCommencing) },
        approveUrl,
        declineUrl
      ));
    } catch (emailError) {
      console.error("Swap office action email failed:", emailError);
    }
    return res.status(200).json({ ok: true, request: agreedRequest });
  } catch (error) {
    console.error("Swap request action failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to update swap request." });
  }
};
