const { verifyRequestSession, parseRequestBody } = require("./_auth");
const { asCleanString } = require("./_request-email");
const { loadAndSyncSwapRequests, saveSwapRequests, createSwapRequestRecord, getRelevantSwapRequests } = require("./_swap-requests");

function asDayIndex(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : null;
}

module.exports = async function handler(req, res) {
  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
  }

  if (req.method === "GET") {
    try {
      const requests = await loadAndSyncSwapRequests();
      return res.status(200).json({
        ok: true,
        requests: getRelevantSwapRequests(requests, session.name)
      });
    } catch (error) {
      console.error("Swap requests read failed:", error);
      return res.status(500).json({ ok: false, error: "Failed to load swap requests." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const payload = body && typeof body.payload === "object" && body.payload ? body.payload : {};
  const requestingDriver = asCleanString(payload.requestingDriver, 120);
  const targetDriver = asCleanString(payload.targetDriver, 120);
  const dayIndex = asDayIndex(payload.dayIndex);
  const dayName = asCleanString(payload.dayName, 40);
  const weekCommencing = asCleanString(payload.weekCommencing, 20);
  const requestingDuty = asCleanString(payload.requestingDuty, 120) || "—";
  const targetDuty = asCleanString(payload.targetDuty, 120) || "—";
  const notes = asCleanString(payload.notes, 1200);

  if (!requestingDriver || requestingDriver !== session.name) {
    return res.status(403).json({ ok: false, error: "Not allowed to create a swap for another driver." });
  }
  if (!targetDriver || targetDriver === requestingDriver) {
    return res.status(400).json({ ok: false, error: "Choose another driver to swap with." });
  }
  if (dayIndex === null || !dayName || !weekCommencing) {
    return res.status(400).json({ ok: false, error: "Missing swap day details." });
  }

  const createdRequest = createSwapRequestRecord({
    requestingDriver,
    targetDriver,
    dayIndex,
    dayName,
    weekCommencing,
    requestingDuty,
    targetDuty,
    notes
  });

  if (!createdRequest) {
    return res.status(400).json({ ok: false, error: "Invalid swap request payload." });
  }

  try {
    const requests = await loadAndSyncSwapRequests();
    requests.unshift(createdRequest);
    await saveSwapRequests(requests);
    return res.status(201).json({ ok: true, request: createdRequest });
  } catch (error) {
    console.error("Swap request create failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to create swap request." });
  }
};
