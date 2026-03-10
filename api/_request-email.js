const LEAVE_REQUEST_TO = [
  "errol@jasonedwardstravel.co.uk",
  "alfie.hoque@jasonedwardstravel.co.uk",
  "relief.controller@jasonedwardstravel.co.uk"
];
const SWAP_REQUEST_TO = [
  "operations@jasonedwardstravel.co.uk",
  "relief.controller@jasonedwardstravel.co.uk"
];
const TIMESHEET_EMAIL_TO = [
  "errol@jasonedwardstravel.co.uk",
  "relief.controller@jasonedwardstravel.co.uk"
];
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

  const replyTo = asCleanString(payload.driverEmail, 200);
  return {
    to: LEAVE_REQUEST_TO,
    subject: `Annual Leave Request - ${driverName}`,
    ...(replyTo ? { replyTo } : {}),
    text: [
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
    ].join("\n")
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

  return {
    to: SWAP_REQUEST_TO,
    subject: `Shift Swap Request - ${requestingDriver} <-> ${targetDriver}`,
    text: [
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
    ].join("\n")
  };
}

function buildApprovedSwapMessage(payload) {
  const requestingDriver = asCleanString(payload.requestingDriver, 120) || "Unknown driver";
  const targetDriver = asCleanString(payload.targetDriver, 120) || "Unknown driver";
  const dayName = asCleanString(payload.dayName, 40) || "Unknown day";
  const weekCommencing = asCleanString(payload.weekCommencingLabel || payload.weekCommencing, 80) || "Unknown week";
  const requestingDuty = asCleanString(payload.requestingDuty, 120) || "-";
  const targetDuty = asCleanString(payload.targetDuty, 120) || "-";
  const notes = asCleanString(payload.notes, 1200);
  const approvedAt = formatSubmittedAt(payload.approvedAtIso);

  return {
    to: SWAP_REQUEST_TO,
    subject: `Approved Shift Swap - ${requestingDriver} <-> ${targetDriver}`,
    text: [
      "APPROVED SHIFT SWAP",
      "",
      `Requesting Driver: ${requestingDriver}`,
      `Approved By: ${targetDriver}`,
      `Week: ${weekCommencing}`,
      `Day: ${dayName}`,
      `Requesting duty: ${requestingDuty}`,
      `Target duty: ${targetDuty}`,
      notes ? `Notes: ${notes}` : "Notes: None",
      "",
      `Approved: ${approvedAt}`,
      "Approved via JET Driver Portal"
    ].join("\n")
  };
}

function buildTimesheetMessage(payload) {
  const driverName = asCleanString(payload.driverName, 120) || "Unknown driver";
  const weekCommencing = asCleanString(payload.weekCommencing, 80) || "Unknown week";
  const text = asCleanString(payload.text, 8000);
  const replyTo = asCleanString(payload.driverEmail, 200);
  return {
    to: TIMESHEET_EMAIL_TO,
    subject: `Driver Timesheet - ${driverName} - ${weekCommencing}`,
    ...(replyTo ? { replyTo } : {}),
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
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {})
    })
  });

  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstream = responseData && typeof responseData === "object" ? JSON.stringify(responseData) : "Unknown upstream error";
    throw new Error(`Resend rejected request: ${upstream}`);
  }

  return responseData;
}

async function sendConfiguredPortalEmail(email) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.PORTAL_EMAIL_FROM || process.env.EMAIL_FROM;
  if (!apiKey || !fromAddress) {
    throw new Error("Email service is not configured. Set RESEND_API_KEY and PORTAL_EMAIL_FROM.");
  }
  return await sendWithResend(apiKey, fromAddress, email);
}

module.exports = {
  asCleanString,
  asPositiveInt,
  formatSubmittedAt,
  buildLeaveMessage,
  buildSwapMessage,
  buildApprovedSwapMessage,
  buildTimesheetMessage,
  sendConfiguredPortalEmail
};
