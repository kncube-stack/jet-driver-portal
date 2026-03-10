const LEAVE_REQUEST_TO = [
  "errol@jasonedwardstravel.co.uk",
  "alfie.hoque@jasonedwardstravel.co.uk",
  "relief.controller@jasonedwardstravel.co.uk"
];
const LEAVE_REQUEST_ACTION_RECIPIENTS = [
  {
    name: "Errol Thomas",
    email: "errol@jasonedwardstravel.co.uk"
  },
  {
    name: "Alfie Hoque",
    email: "alfie.hoque@jasonedwardstravel.co.uk"
  }
];
const LEAVE_REQUEST_INFO_RECIPIENTS = ["relief.controller@jasonedwardstravel.co.uk"];
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

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildLeaveMessage(payload, options = {}) {
  const driverName = asCleanString(payload.driverName, 120) || "Unknown driver";
  const fromDate = asCleanString(payload.fromDateLabel, 120) || asCleanString(payload.dateFrom, 20) || "Not provided";
  const toDate = asCleanString(payload.toDateLabel, 120) || asCleanString(payload.dateTo, 20) || "Not provided";
  const totalDays = asPositiveInt(payload.totalDays, 1);
  const reason = asCleanString(payload.reason, 200) || "Annual leave";
  const notes = asCleanString(payload.notes, 1200);
  const submittedAt = formatSubmittedAt(payload.submittedAtIso);
  const approveUrl = asCleanString(options.approveUrl, 2000);
  const declineUrl = asCleanString(options.declineUrl, 2000);
  const recipientName = asCleanString(options.recipientName, 120);
  const replyTo = asCleanString(payload.driverEmail, 200);
  const includeActionLinks = Boolean(approveUrl && declineUrl);
  const textLines = [
    "ANNUAL LEAVE REQUEST",
    "",
    `Driver: ${driverName}`,
    `From: ${fromDate}`,
    `To: ${toDate}`,
    `Total days: ${totalDays}`,
    `Reason: ${reason}`,
    notes ? `Notes: ${notes}` : "Notes: None",
    "",
    `Submitted: ${submittedAt}`
  ];
  if (includeActionLinks) {
    textLines.push(
      "",
      `Approve: ${approveUrl}`,
      `Decline: ${declineUrl}`,
      "These links expire in 14 days and work only while the request is still pending."
    );
  }
  textLines.push("Submitted via JET Driver Portal");

  const safeDriverName = escapeHtml(driverName);
  const safeFromDate = escapeHtml(fromDate);
  const safeToDate = escapeHtml(toDate);
  const safeReason = escapeHtml(reason);
  const safeNotes = escapeHtml(notes || "None");
  const safeSubmittedAt = escapeHtml(submittedAt);
  const safeGreeting = recipientName ? `Hello ${escapeHtml(recipientName)},` : "Hello,";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;color:#0f172a;">
      <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:24px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#475569;margin-bottom:16px;">Annual Leave Request</div>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${safeGreeting}</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
          <strong>${safeDriverName}</strong> has submitted a leave request.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;width:120px;">From</td><td style="padding:6px 0;font-size:14px;"><strong>${safeFromDate}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">To</td><td style="padding:6px 0;font-size:14px;"><strong>${safeToDate}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Total days</td><td style="padding:6px 0;font-size:14px;"><strong>${totalDays}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Reason</td><td style="padding:6px 0;font-size:14px;"><strong>${safeReason}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;vertical-align:top;">Notes</td><td style="padding:6px 0;font-size:14px;line-height:1.5;">${safeNotes}</td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Submitted</td><td style="padding:6px 0;font-size:14px;">${safeSubmittedAt}</td></tr>
        </table>
        ${includeActionLinks ? `
          <div style="margin:20px 0 12px;">
            <a href="${escapeHtml(approveUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;margin-right:10px;">Approve</a>
            <a href="${escapeHtml(declineUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;">Decline</a>
          </div>
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">These links expire in 14 days and only work while the request is still pending.</p>
        ` : `
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">Review this request inside the JET Driver Portal.</p>
        `}
      </div>
    </div>
  `.trim();
  return {
    to: options.to || LEAVE_REQUEST_TO,
    subject: `Annual Leave Request - ${driverName}`,
    ...(replyTo ? { replyTo } : {}),
    text: textLines.join("\n"),
    html
  };
}

function buildLeaveRequestActionEmails(payload, buildActionUrl) {
  const emails = LEAVE_REQUEST_ACTION_RECIPIENTS.map(recipient => buildLeaveMessage(payload, {
    to: recipient.email,
    recipientName: recipient.name,
    approveUrl: buildActionUrl("approve", recipient.name),
    declineUrl: buildActionUrl("decline", recipient.name)
  }));
  if (LEAVE_REQUEST_INFO_RECIPIENTS.length > 0) {
    emails.push(buildLeaveMessage(payload, {
      to: LEAVE_REQUEST_INFO_RECIPIENTS
    }));
  }
  return emails;
}

function buildDriverLeaveDecisionEmail(request, action) {
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

function buildSwapOfficeActionEmail(swap, approveUrl, declineUrl) {
  const requestingDriver = asCleanString(swap.requestingDriver, 120) || "Unknown driver";
  const targetDriver = asCleanString(swap.targetDriver, 120) || "Unknown driver";
  const dayName = asCleanString(swap.dayName, 40) || "Unknown day";
  const weekCommencing = asCleanString(swap.weekCommencingLabel || swap.weekCommencing, 80) || "Unknown week";
  const requestingDuty = asCleanString(swap.requestingDuty, 120) || "—";
  const targetDuty = asCleanString(swap.targetDuty, 120) || "—";
  const notes = asCleanString(swap.notes, 1200);
  const safeReqDriver = escapeHtml(requestingDriver);
  const safeTgtDriver = escapeHtml(targetDriver);
  const safeDayName = escapeHtml(dayName);
  const safeWeek = escapeHtml(weekCommencing);
  const safeReqDuty = escapeHtml(requestingDuty);
  const safeTgtDuty = escapeHtml(targetDuty);
  const safeNotes = escapeHtml(notes || "None");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;color:#0f172a;">
      <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:24px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#475569;margin-bottom:16px;">Shift Swap — Awaiting Office Confirmation</div>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Both drivers have agreed to this swap. Please confirm or decline below.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;width:140px;">Requesting Driver</td><td style="padding:6px 0;font-size:14px;"><strong>${safeReqDriver}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Their Duty</td><td style="padding:6px 0;font-size:14px;"><strong>${safeReqDuty}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Swap With</td><td style="padding:6px 0;font-size:14px;"><strong>${safeTgtDriver}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Their Duty</td><td style="padding:6px 0;font-size:14px;"><strong>${safeTgtDuty}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Day</td><td style="padding:6px 0;font-size:14px;"><strong>${safeDayName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;">Week</td><td style="padding:6px 0;font-size:14px;"><strong>${safeWeek}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#475569;font-size:14px;vertical-align:top;">Notes</td><td style="padding:6px 0;font-size:14px;line-height:1.5;">${safeNotes}</td></tr>
        </table>
        <div style="margin:20px 0 12px;">
          <a href="${escapeHtml(approveUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;margin-right:10px;">Approve Swap</a>
          <a href="${escapeHtml(declineUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;">Decline Swap</a>
        </div>
        <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">These links expire in 14 days and only work while the swap is awaiting confirmation.</p>
      </div>
    </div>
  `.trim();
  return {
    to: SWAP_REQUEST_TO,
    subject: `Shift Swap Confirmation Needed — ${requestingDriver} ↔ ${targetDriver} (${dayName})`,
    replyTo: "requests@jetportal.co",
    text: [
      "SHIFT SWAP — AWAITING OFFICE CONFIRMATION",
      "",
      "Both drivers have agreed to this swap. Please confirm or decline.",
      "",
      `Requesting Driver: ${requestingDriver}`,
      `Their duty: ${requestingDuty}`,
      `Swap With: ${targetDriver}`,
      `Their duty: ${targetDuty}`,
      `Day: ${dayName}`,
      `Week: ${weekCommencing}`,
      notes ? `Notes: ${notes}` : "Notes: None",
      "",
      `Approve: ${approveUrl}`,
      `Decline: ${declineUrl}`,
      "",
      "These links expire in 14 days and only work while the swap is awaiting confirmation.",
      "JET Driver Portal"
    ].join("\n"),
    html
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
      ...(email.html ? { html: email.html } : {}),
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
  buildLeaveRequestActionEmails,
  buildDriverLeaveDecisionEmail,
  buildSwapMessage,
  buildApprovedSwapMessage,
  buildSwapOfficeActionEmail,
  buildTimesheetMessage,
  sendConfiguredPortalEmail
};
