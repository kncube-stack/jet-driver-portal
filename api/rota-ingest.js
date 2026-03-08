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

  const { weekCommencing, sections, rota } = body;

  if (!weekCommencing || typeof weekCommencing !== "string") {
    return res.status(400).json({ ok: false, error: "Missing or invalid weekCommencing (expected YYYY-MM-DD)." });
  }

  if (!Array.isArray(sections) || !rota || typeof rota !== "object") {
    return res.status(400).json({ ok: false, error: "Missing or invalid sections/rota data." });
  }

  try {
    const blob = await put(
      `rota/${weekCommencing}.json`,
      JSON.stringify({ sections, rota }),
      { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true }
    );

    const driverCount = Object.keys(rota).length;
    return res.status(200).json({
      ok: true,
      weekCommencing,
      driverCount,
      message: `Rota published for ${weekCommencing} (${driverCount} drivers).`
    });
  } catch (error) {
    console.error("Rota ingest failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to store rota data." });
  }
};
