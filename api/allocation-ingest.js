const { put } = require("@vercel/blob");
const { verifyIngestKey, parseBody } = require("./_ingest-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!verifyIngestKey(req)) {
    return res.status(401).json({ ok: false, error: "Invalid or missing API key." });
  }

  const body = parseBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const { date, allocation } = body;

  if (!date || typeof date !== "string") {
    return res.status(400).json({ ok: false, error: "Missing or invalid date (expected YYYY-MM-DD)." });
  }

  if (!allocation || typeof allocation !== "object") {
    return res.status(400).json({ ok: false, error: "Missing or invalid allocation data." });
  }

  try {
    await put(
      `allocation/${date}.json`,
      JSON.stringify(allocation),
      { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true }
    );

    const dutyCount = Object.keys(allocation).length;
    return res.status(200).json({
      ok: true,
      date,
      dutyCount,
      message: `Allocation published for ${date} (${dutyCount} duties).`
    });
  } catch (error) {
    console.error("Allocation ingest failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to store allocation data." });
  }
};
