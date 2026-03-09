const { buildClearedSessionCookie } = require("./_auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  res.setHeader("Set-Cookie", buildClearedSessionCookie(req));
  return res.status(200).json({ ok: true });
};
