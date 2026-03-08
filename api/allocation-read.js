const { getJsonBlob } = require("./_blob-json");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const date = (req.query && req.query.date) || getTodayUK();

  try {
    const blob = await getJsonBlob(`allocation/${date}.json`);
    if (!blob) {
      return res.status(404).json({ ok: false, error: `No allocation found for ${date}.` });
    }
    return res.status(200).json({ ok: true, date, allocation: blob.data });
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
