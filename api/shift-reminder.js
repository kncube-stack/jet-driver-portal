// Shift reminder: every 10 min — sends push to drivers whose shift starts in ~1 hour
// Timesheet reminder: Sundays at 10:00 UTC — pushes drivers who haven't submitted this week

const { getJsonBlob } = require("./_blob-json");
const { sendPushToDriver } = require("./_push");
const { getSubmittedDriversForWeek } = require("./_timesheets");

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

module.exports = async function handler(req, res) {
  if (!isCronRequest(req)) return res.status(401).json({ ok: false });

  // --- Timesheet reminder branch (Sunday 10:00 UTC cron) ---
  const reqType = (req.query && req.query.type) || "";
  if (reqType === "timesheet") {
    const today = getTodayUK();
    const wc = getMondayOfWeek(today);
    const rotaBlob = await getJsonBlob(`rota/${wc}.json`);
    if (!rotaBlob || !rotaBlob.data.rota) {
      return res.status(200).json({ ok: true, sent: 0, note: "No rota for this week." });
    }
    const submittedSet = await getSubmittedDriversForWeek(wc);
    const allDrivers = Object.keys(rotaBlob.data.rota);
    const unsubmitted = allDrivers.filter(name => !submittedSet.has(name));
    let sent = 0;
    await Promise.allSettled(unsubmitted.map(async name => {
      await sendPushToDriver(name, {
        title: "Timesheet Due",
        body: `Please submit your timesheet for w/c ${wc} \u2014 tap to open`,
        url: "/",
        tag: `timesheet-reminder-${wc}`
      });
      sent++;
    }));
    return res.status(200).json({ ok: true, sent, unsubmitted });
  }

  const nowUK = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  const today = getTodayUK();
  
  // We check today's rota and tomorrow's rota to catch shifts crossing midnight.
  // Actually, for a simplicity and accuracy, we check the rota day that corresponds 
  // to the CURRENT UK time and the NEXT day if we are in the late evening.

  async function processDay(targetDate) {
    const wc = getMondayOfWeek(targetDate);
    const dObj = new Date(targetDate + "T12:00:00Z"); // middle of day for safe dayIdx
    const dIdx = dObj.getUTCDay() === 0 ? 6 : dObj.getUTCDay() - 1;

    const [rotaBlob, allocBlob] = await Promise.all([
      getJsonBlob(`rota/${wc}.json`),
      getJsonBlob(`allocation/${targetDate}.json`)
    ]);

    if (!rotaBlob || !rotaBlob.data.rota) return 0;
    const { rota } = rotaBlob.data;
    const allocation = allocBlob?.data || {};

    let count = 0;
    const currentH = nowUK.getHours();
    const currentM = nowUK.getMinutes();

    await Promise.allSettled(
      Object.entries(rota).map(async ([driverName, days]) => {
        const duty = days[dIdx];
        if (!duty) return;

        const entry = allocation[String(duty)];
        const signOnText = entry?.signOn || null;
        if (!signOnText || !isWithinRange(signOnText, currentH, currentM, targetDate === today)) return;

        await sendPushToDriver(driverName, {
          title: "Shift Starting Soon",
          body: `Your duty ${duty} sign-on is ${signOnText}. See you in 1 hour!`,
          url: "/",
          tag: `shift-reminder-${driverName}-${targetDate}-${signOnText}`
        });
        count++;
      })
    );
    return count;
  }

  // Check today
  const sentToday = await processDay(today);

  // If late at night (after 22:00), check tomorrow too
  let sentTomorrow = 0;
  if (nowUK.getHours() >= 22) {
    const tomorrowObj = new Date(nowUK);
    tomorrowObj.setDate(nowUK.getDate() + 1);
    const tomorrow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(tomorrowObj);
    sentTomorrow = await processDay(tomorrow);
  }

  return res.status(200).json({ ok: true, sent: sentToday + sentTomorrow });
};

function isWithinRange(targetTimeStr, currentH, currentM, isToday) {
  const target = parseTime(targetTimeStr);
  if (!target) return false;

  let targetAbs = target.h * 60 + target.m;
  const currentAbs = currentH * 60 + currentM;

  if (!isToday) {
    // If we're checking tomorrow's shifts, add 24 hours to the target
    targetAbs += 24 * 60;
  }

  const diff = targetAbs - currentAbs;
  return diff >= 55 && diff <= 65;
}
