const { verifyRequestSession, parseRequestBody, buildSessionCookie, buildClearedSessionCookie } = require("./_auth");
const { upsertSubscription } = require("./_push");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // DELETE — logout (replaces auth-logout.js)
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", buildClearedSessionCookie(req));
    return res.status(200).json({ ok: true });
  }

  // PATCH — register/update push subscription
  if (req.method === "PATCH") {
    const session = verifyRequestSession(req);
    if (!session) return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
    const body = parseRequestBody(req);
    if (!body?.subscription) return res.status(400).json({ ok: false, error: "Missing subscription." });
    try {
      await upsertSubscription(session.name, body.subscription);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Push subscribe failed:", err);
      return res.status(500).json({ ok: false, error: "Failed to save push subscription." });
    }
  }

  // POST — refresh session cookie; also return VAPID public key for push setup
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE, PATCH");
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
    session,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null
  });
};
