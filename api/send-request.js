const { verifyRequestSession, parseRequestBody } = require("./_auth");
const { asCleanString, buildLeaveMessage, buildSwapMessage, buildTimesheetMessage, sendConfiguredPortalEmail } = require("./_request-email");

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

  const kind = body && typeof body.kind === "string" ? body.kind : "";
  const payload = body && typeof body.payload === "object" && body.payload ? body.payload : {};
  if (session.role !== "manager") {
    if (kind === "leave") {
      const requestedDriver = asCleanString(payload.driverName, 120);
      if (requestedDriver !== session.name) {
        return res.status(403).json({ ok: false, error: "Not allowed to submit leave for another driver." });
      }
    }
    if (kind === "swap") {
      const requestingDriver = asCleanString(payload.requestingDriver, 120);
      if (requestingDriver !== session.name) {
        return res.status(403).json({ ok: false, error: "Not allowed to submit swap for another driver." });
      }
    }
    if (kind === "timesheet") {
      const requestedDriver = asCleanString(payload.driverName, 120);
      if (requestedDriver !== session.name) {
        return res.status(403).json({ ok: false, error: "Not allowed to submit a timesheet for another driver." });
      }
    }
  }

  let email;
  if (kind === "leave") {
    email = buildLeaveMessage(payload);
  } else if (kind === "swap") {
    email = buildSwapMessage(payload);
  } else if (kind === "timesheet") {
    email = buildTimesheetMessage(payload);
  } else {
    return res.status(400).json({ ok: false, error: "Unsupported request type." });
  }

  try {
    const result = await sendConfiguredPortalEmail(email);
    return res.status(200).json({ ok: true, id: result.id || null });
  } catch (error) {
    console.error("Request email send failed:", error);
    return res.status(502).json({
      ok: false,
      error: error?.message || "Failed to send request email. Please try again shortly."
    });
  }
};
