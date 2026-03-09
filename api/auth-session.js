const { verifyRequestSession, buildSessionCookie } = require("./_auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const session = verifyRequestSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Invalid or expired session." });
  }

  const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      res.setHeader("Set-Cookie", buildSessionCookie(token, session.expiresAt, req));
    }
  }

  return res.status(200).json({
    ok: true,
    session
  });
};
