const LEAVE_REQUEST_TO = "errol@jasonedwardstravel.co.uk";
const SWAP_REQUEST_TO = "operations@jasonedwardstravel.co.uk";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function asCleanString(value, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function asPositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

function formatSubmittedAt(isoValue) {
  const date = isoValue ? new Date(isoValue) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  }
  return date.toLocaleString("en-GB", { timeZone: "Europe/London" });
}

function buildLeaveMessage(payload) {
  const driverName = asCleanString(payload.driverName, 120) || "Unknown driver";
  const fromDate = asCleanString(payload.fromDateLabel, 120) || asCleanString(payload.dateFrom, 20) || "Not provided";
  const toDate = asCleanString(payload.toDateLabel, 120) || asCleanString(payload.dateTo, 20) || "Not provided";
  const totalDays = asPositiveInt(payload.totalDays, 1);
  const reason = asCleanString(payload.reason, 200) || "Annual leave";
  const notes = asCleanString(payload.notes, 1200);
  const submittedAt = formatSubmittedAt(payload.submittedAtIso);

  const subject = `Annual Leave Request - ${driverName}`;
  const text = [
    "ANNUAL LEAVE REQUEST",
    "",
    `Driver: ${driverName}`,
    `From: ${fromDate}`,
    `To: ${toDate}`,
    `Total days: ${totalDays}`,
    `Reason: ${reason}`,
    notes ? `Notes: ${notes}` : "Notes: None",
    "",
    `Submitted: ${submittedAt}`,
    "Submitted via JET Driver Portal"
  ].join("\n");

  return {
    to: LEAVE_REQUEST_TO,
    subject,
    text
  };
}

function buildSwapMessage(payload) {
  const requestingDriver = asCleanString(payload.requestingDriver, 120) || "Unknown driver";
  const targetDriver = asCleanString(payload.targetDriver, 120) || "Unknown driver";
  const dayName = asCleanString(payload.dayName, 40) || "Unknown day";
  const requestingDuty = asCleanString(payload.requestingDuty, 120) || "-";
  const targetDuty = asCleanString(payload.targetDuty, 120) || "-";
  const notes = asCleanString(payload.notes, 1200);
  const submittedAt = formatSubmittedAt(payload.submittedAtIso);

  const subject = `Shift Swap Request - ${requestingDriver} <-> ${targetDriver}`;
  const text = [
    "SHIFT SWAP REQUEST",
    "",
    `Requesting Driver: ${requestingDriver}`,
    `Current duty (${dayName}): ${requestingDuty}`,
    "",
    `Swap With: ${targetDriver}`,
    `Their duty (${dayName}): ${targetDuty}`,
    notes ? `Notes: ${notes}` : "Notes: None",
    "",
    "Both drivers must agree to this swap.",
    `Submitted: ${submittedAt}`,
    "Submitted via JET Driver Portal"
  ].join("\n");

  return {
    to: SWAP_REQUEST_TO,
    subject,
    text
  };
}

async function sendWithResend(apiKey, from, email) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text
    })
  });

  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstream = responseData && typeof responseData === "object" ? JSON.stringify(responseData) : "Unknown upstream error";
    throw new Error(`Resend rejected request: ${upstream}`);
  }

  return responseData;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.PORTAL_EMAIL_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !fromAddress) {
    return res.status(500).json({
      ok: false,
      error: "Email service is not configured. Set RESEND_API_KEY and PORTAL_EMAIL_FROM."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body." });
    }
  }

  const kind = body && typeof body.kind === "string" ? body.kind : "";
  const payload = body && typeof body.payload === "object" && body.payload ? body.payload : {};

  let email;
  if (kind === "leave") {
    email = buildLeaveMessage(payload);
  } else if (kind === "swap") {
    email = buildSwapMessage(payload);
  } else {
    return res.status(400).json({ ok: false, error: "Unsupported request type." });
  }

  try {
    const result = await sendWithResend(apiKey, fromAddress, email);
    return res.status(200).json({ ok: true, id: result.id || null });
  } catch (error) {
    console.error("Request email send failed:", error);
    return res.status(502).json({
      ok: false,
      error: "Failed to send request email. Please try again shortly."
    });
  }
};
