// Abuse protection: two independent limiters on the submission path, per
// the brief ("rate limiting per IP and per widget"). A burst from one IP
// hitting many widgets is capped by the first; a flood aimed at one
// widget from many IPs (a real botnet pattern) is capped by the second.
const rateLimit = require("express-rate-limit");

const ipLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP. Try again shortly." },
});

// express-rate-limit keys by IP out of the box; per-widget needs its own
// small sliding-window counter keyed by widgetId, since a flood can come
// from many different IPs. Deliberately hand-rolled rather than pulling
// in a second dependency for one counter.
const WIDGET_WINDOW_MS = 60_000;
const WIDGET_LIMIT = 15;
const widgetHits = new Map(); // widgetId -> [timestamps]

function widgetLimiter(req, res, next) {
  const widgetId = req.body?.widgetId;
  if (typeof widgetId !== "string" || !widgetId) return next(); // let validation reject it properly

  const now = Date.now();
  const hits = (widgetHits.get(widgetId) || []).filter((t) => now - t < WIDGET_WINDOW_MS);
  if (hits.length >= WIDGET_LIMIT) {
    widgetHits.set(widgetId, hits);
    return res.status(429).json({ error: "Too many submissions for this widget. Try again shortly." });
  }
  hits.push(now);
  widgetHits.set(widgetId, hits);
  next();
}

module.exports = { ipLimiter, widgetLimiter };
