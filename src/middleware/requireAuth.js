const { verifyToken } = require("../lib/jwt");

/**
 * Every authenticated route goes through this. It sets req.customerId
 * from a verified JWT and nothing else — every downstream query filters
 * by this value, never by anything the client sent in the URL or body.
 * That's the entire tenant-isolation story: one chokepoint, enforced by
 * construction rather than by remembering to add a check everywhere.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }
  try {
    req.customerId = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = { requireAuth };
