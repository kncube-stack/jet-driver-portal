const { authenticateNamePin, parseRequestBody, buildSessionCookie } = require("./_auth");
const { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } = require("./_auth-rate-limit");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const rateLimit = checkLoginRateLimit(req, body.name);
  if (rateLimit.blocked) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      ok: false,
      error: `Too many sign-in attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`
    });
  }

  const result = authenticateNamePin(body.name, body.pin);
  if (!result.ok) {
    recordLoginFailure(req, body.name);
    return res.status(401).json({ ok: false, error: result.error || "Authentication failed." });
  }

  clearLoginFailures(req, result.session.name);
  res.setHeader("Set-Cookie", buildSessionCookie(result.session.token, result.session.expiresAt, req));

  return res.status(200).json({
    ok: true,
    session: {
      name: result.session.name,
      role: result.session.role,
      expiresAt: result.session.expiresAt
    }
  });
};
