const webPush = require("web-push");
const { getJsonBlob, putJsonBlob } = require("./_blob-json");

const SUBS_PATH = "push-subscriptions/index.json";

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:requests@jetportal.co",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

async function loadSubs() {
  const blob = await getJsonBlob(SUBS_PATH);
  return blob ? (blob.data.subscriptions || []) : [];
}

async function saveSubs(subs) {
  return putJsonBlob(SUBS_PATH, { subscriptions: subs });
}

async function upsertSubscription(driverName, subscription) {
  const subs = await loadSubs();
  const idx = subs.findIndex(s => s.endpoint === subscription.endpoint);
  const entry = { driverName, ...subscription, updatedAt: new Date().toISOString() };
  if (idx >= 0) subs[idx] = entry;
  else subs.push(entry);
  await saveSubs(subs);
}

async function sendPushToDriver(driverName, payload) {
  const subs = await loadSubs();
  const targets = subs.filter(s => s.driverName === driverName);
  if (!targets.length) return;
  const results = await Promise.allSettled(
    targets.map(sub => webPush.sendNotification(sub, JSON.stringify(payload)))
  );
  // Remove subscriptions that are gone (device unsubscribed)
  const dead = new Set();
  results.forEach((r, i) => {
    if (r.status === "rejected" && [404, 410].includes(r.reason?.statusCode)) {
      dead.add(targets[i].endpoint);
    }
  });
  if (dead.size > 0) {
    await saveSubs(subs.filter(s => !dead.has(s.endpoint)));
  }
}

module.exports = { upsertSubscription, sendPushToDriver };
