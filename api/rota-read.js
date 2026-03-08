const { list } = require("@vercel/blob");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const week = req.query && req.query.week;
  if (!week || typeof week !== "string") {
    return res.status(400).json({ ok: false, error: "Missing ?week= parameter (expected YYYY-MM-DD)." });
  }

  try {
    const { blobs } = await list({ prefix: `rota/${week}.json` });
    if (blobs.length === 0) {
      return res.status(404).json({ ok: false, error: `No rota found for week ${week}.` });
    }

    const response = await fetch(blobs[0].downloadUrl);
    if (!response.ok) {
      throw new Error(`Blob fetch failed (${response.status})`);
    }

    const data = await response.json();
    return res.status(200).json({ ok: true, weekCommencing: week, ...data });
  } catch (error) {
    console.error("Rota read failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to read rota data." });
  }
};
