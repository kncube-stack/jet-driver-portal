const { list } = require("@vercel/blob");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const { blobs } = await list({ prefix: "rota/" });

    const weeks = blobs
      .map(b => b.pathname.replace(/^rota\//, "").replace(/\.json$/, ""))
      .filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w))
      .sort()
      .reverse();

    return res.status(200).json({ ok: true, weeks });
  } catch (error) {
    console.error("Rota weeks read failed:", error);
    return res.status(500).json({ ok: false, error: "Failed to read available weeks." });
  }
};
