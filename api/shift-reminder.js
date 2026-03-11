// Triggered by Vercel cron daily at 05:30 UTC
// Sends a push notification to all drivers working today

const { getJsonBlob } = require("./_blob-json");
const { sendPushToDriver } = require("./_push");

function isCronRequest(req) {
  return req.headers?.["x-vercel-cron"] === "1" ||
    (process.env.CRON_SECRET && req.headers?.authorization === `Bearer ${process.env.CRON_SECRET}`);
}

function getTodayUK() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getMondayOfWeek(isoDate) {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return { h, m };
}

function isWithinRange(targetTimeStr, currentH, currentM) {
  const target = parseTime(targetTimeStr);
  if (!target) return false;

  const targetAbs = target.h * 60 + target.m;
  const currentAbs = currentH * 60 + currentM;

  // We want to ping if the shift starts in 50 to 70 minutes (approx 1 hour)
  // Our cron runs every 10 mins, so this window ensures we catch everyone once.
  const diff = targetAbs - currentAbs;
  return diff >= 55 && diff <= 65;
}

module.exports = async function handler(req, res) {
  if (!isCronRequest(req)) return res.status(401).json({ ok: false });

  const nowUK = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  const today = getTodayUK();
  const weekCommencing = getMondayOfWeek(today);

  const currentH = nowUK.getHours();
  const currentM = nowUK.getMinutes();

  // UTC day → rota array index (Mon=0 ... Sun=6)
  // Use UK date object to get correct day of week for UK
  const dayIdx = nowUK.getDay() === 0 ? 6 : nowUK.getDay() - 1;

  const [rotaBlob, allocBlob] = await Promise.all([
    getJsonBlob(`rota/${weekCommencing}.json`),
    getJsonBlob(`allocation/${today}.json`)
  ]);

  if (!rotaBlob) return res.status(200).json({ ok: true, sent: 0, note: "No rota for this week." });

  const { rota } = rotaBlob.data;
  if (!rota) return res.status(200).json({ ok: true, sent: 0 });

  const allocation = allocBlob?.data || {};

  let sent = 0;
  await Promise.allSettled(
    Object.entries(rota).map(async ([driverName, days]) => {
      const duty = days[dayIdx];
      if (!duty) return; // not working today

      // Look up sign-on time from allocation
      const entry = allocation[String(duty)];
      const signOnText = entry?.signOn || null;

      if (!signOnText || !isWithinRange(signOnText, currentH, currentM)) return;

      const body = `Your duty ${duty} sign-on is ${signOnText}. See you in 1 hour!`;

      await sendPushToDriver(driverName, {
        title: "Shift Starting Soon",
        body,
        url: "/",
        tag: `shift-reminder-${driverName}-${today}-${signOnText}`
      });
      sent++;
    })
  );

  return res.status(200).json({ ok: true, sent });
};
