/**
 * Shared auth helper for ingest endpoints (rota + allocation).
 * Validates requests using a simple API key in the x-api-key header.
 * The key is checked against the API_INGEST_KEY environment variable.
 */

const crypto = require("crypto");

function verifyIngestKey(req) {
  const key = process.env.API_INGEST_KEY;
  if (!key) return false;

  const provided = (req.headers && req.headers["x-api-key"]) || "";
  if (!provided || typeof provided !== "string") return false;

  const a = Buffer.from(key);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  return body;
}

module.exports = { verifyIngestKey, parseBody };
