const { list } = require("@vercel/blob");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const date = (req.query && req.query.date) || getTodayUK();

  try {
    const { blobs } = await list({ prefix: `allocation/${date}.json` });
    if (blobs.length === 0) {
      return res.status(404).json({ ok: false, error: `No allocation found for ${date}.` });
    }

    const response = await fetch(blobs[0].url);
    if (!response.ok) {
      throw new Error(`Blob fetch failed (${response.status})`);
    }

    const allocation = await response.json();
    return res.status(200).json({ ok: true, date, allocation });
  } catch (error) {
    console.error("Allocation read failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to read allocation data." });
  }
};

function getTodayUK() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
