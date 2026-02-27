const { authenticateNamePin, parseRequestBody } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body." });
  }

  const result = authenticateNamePin(body.name, body.pin);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: result.error || "Authentication failed." });
  }

  return res.status(200).json({
    ok: true,
    session: result.session
  });
};
