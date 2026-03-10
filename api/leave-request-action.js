const { verifyRequestSession, parseRequestBody } = require("./_auth");
const { asCleanString, sendConfiguredPortalEmail } = require("./_request-email");
const { loadAndSyncLeaveRequests, saveLeaveRequests } = require("./_leave-requests");

function buildDriverNotificationEmail(request, action) {
  const driverName = request.driverName || "Driver";
  const fromDate = request.fromDateLabel || request.dateFrom || "Unknown date";
  const toDate = request.toDateLabel || request.dateTo || "Unknown date";
  const totalDays = request.totalDays || 1;
  const reason = request.reason || "Annual leave";
  const respondedBy = request.respondedBy || "The office";

  const isApproved = action === "approve";
  const statusWord = isApproved ? "Approved" : "Declined";

  return {
    to: request.driverEmail,
    subject: `Leave Request ${statusWord} - ${driverName}`,
    text: [
      `ANNUAL LEAVE REQUEST ${statusWord.toUpperCase()}`,
      "",
      `Driver: ${driverName}`,
      `From: ${fromDate}`,
      `To: ${toDate}`,
      `Total days: ${totalDays}`,
      `Reason: ${reason}`,
      "",
      isApproved
        ? `Your annual leave request has been approved by ${respondedBy}.`
        : `Your annual leave request has been declined by ${respondedBy}.`,
      "",
      "JET Driver Portal"
    ].join("\n")
  };
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
    return res.status(400).json({ ok: false, error: "Invalid leave request action." });
  }

  if ((action === "approve" || action === "decline") && session.role !== "manager") {
    return res.status(403).json({ ok: false, error: "Only managers can approve or decline leave requests." });
  }

  try {
    const requests = await loadAndSyncLeaveRequests();
    const index = requests.findIndex(request => request.id === id);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Leave request not found." });
    }

    const current = requests[index];
    if (current.status !== "pending") {
      return res.status(409).json({ ok: false, error: `Leave request is already ${current.status}.` });
    }

    if (action === "cancel") {
      if (session.role !== "manager" && current.driverName !== session.name) {
        return res.status(403).json({ ok: false, error: "Only the requesting driver can cancel this leave request." });
      }
      const updated = {
        ...current,
        status: "cancelled",
        respondedAt: new Date().toISOString(),
        respondedBy: session.name
      };
      requests[index] = updated;
      await saveLeaveRequests(requests);
      return res.status(200).json({ ok: true, request: updated });
    }

    const nowIso = new Date().toISOString();
    const updated = {
      ...current,
      status: action === "approve" ? "approved" : "declined",
      respondedAt: nowIso,
      respondedBy: session.name
    };

    requests[index] = updated;
    await saveLeaveRequests(requests);

    if (updated.driverEmail) {
      try {
        await sendConfiguredPortalEmail(buildDriverNotificationEmail(updated, action));
      } catch (emailError) {
        console.error("Leave action driver notification failed:", emailError);
        // Don't fail the whole request if the notification email fails
      }
    }

    return res.status(200).json({ ok: true, request: updated });
  } catch (error) {
    console.error("Leave request action failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to update leave request." });
  }
};
