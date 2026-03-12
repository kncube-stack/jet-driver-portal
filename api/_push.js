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

const LEAVE_MANAGERS = ["Alfie Hoque", "Errol Thomas", "Kennedy Ncube"];

async function calculateDriverBadgeCount(driverName) {
  let count = 0;
  try {
    const { loadAndSyncSwapRequests } = require("./_swap-requests");
    const swaps = await loadAndSyncSwapRequests();
    count += swaps.filter(r => r.status === "pending" && r.targetDriver === driverName).length;
  } catch (e) {
    console.warn("Badge swap count failed:", e.message);
  }

  if (LEAVE_MANAGERS.includes(driverName)) {
    try {
      const { loadAndSyncLeaveRequests } = require("./_leave-requests");
      const leaves = await loadAndSyncLeaveRequests();
      count += leaves.filter(r => r.status === "pending").length;
    } catch (e) {
      console.warn("Badge leave count failed:", e.message);
    }
  }

  return Math.max(1, count);
}

async function sendPushToDriver(driverName, payload) {
  const subs = await loadSubs();
  const targets = subs.filter(s => s.driverName === driverName);
  if (!targets.length) return;

  const badgeCount = await calculateDriverBadgeCount(driverName);
  const finalPayload = { ...payload, badgeCount };

  const results = await Promise.allSettled(
    targets.map(sub => webPush.sendNotification(sub, JSON.stringify(finalPayload)))
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
