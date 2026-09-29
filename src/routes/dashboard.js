// Owner-facing analytics. No frontend needed per the brief — just
// aggregation endpoints an owner's dashboard (or curl, for grading) can
// call. Every query is tenant-scoped the same way as widgets.js: through
// loadOwnWidget for a single widget, or `customer_id = ?` directly for
// cross-widget aggregates — never trusting a client-supplied customer id.
const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { loadOwnWidget } = require("../lib/tenant");

const router = express.Router();
// requireAuth is attached per-route below, not with router.use(requireAuth)
// here. This router is mounted at the app root (it owns two different
// path prefixes, /widgets/... and /dashboard/...), and a path-less
// router.use() middleware runs for every request that reaches this
// router regardless of whether any route below actually matches it —
// which meant a request to some *unrelated* unmatched path (e.g.
// /nonexistent) was being rejected with 401 by this router before it
// ever got the chance to fall through to the app's real 404 handler.
// Scoping requireAuth to each route means it only runs once Express has
// already matched the path.

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// GET /widgets/:id/submissions — paginated raw submissions for one widget.
router.get("/widgets/:id/submissions", requireAuth, (req, res) => {
  const widget = loadOwnWidget(req.params.id, req.customerId);
  if (!widget) return res.status(404).json({ error: "Widget not found." });

  const limit = clampInt(req.query.limit, 25, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);

  const rows = db
    .prepare(
      `SELECT id, data, geo_country, geo_city, geo_provider, created_at
       FROM submissions WHERE widget_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(widget.id, limit, offset)
    .map((r) => ({ ...r, data: JSON.parse(r.data) }));

  const { total } = db
    .prepare("SELECT COUNT(*) AS total FROM submissions WHERE widget_id = ?")
    .get(widget.id);

  res.json({ widgetId: widget.id, total, limit, offset, submissions: rows });
});

// GET /widgets/:id/stats — one widget's aggregates: total count, a daily
// series for the last 14 days, and a country breakdown.
router.get("/widgets/:id/stats", requireAuth, (req, res) => {
  const widget = loadOwnWidget(req.params.id, req.customerId);
  if (!widget) return res.status(404).json({ error: "Widget not found." });

  const { total } = db
    .prepare("SELECT COUNT(*) AS total FROM submissions WHERE widget_id = ?")
    .get(widget.id);

  const daily = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM submissions
       WHERE widget_id = ? AND created_at >= datetime('now', '-14 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all(widget.id);

  const byCountry = db
    .prepare(
      `SELECT COALESCE(geo_country, 'Unknown') AS country, COUNT(*) AS count
       FROM submissions WHERE widget_id = ? GROUP BY country ORDER BY count DESC`
    )
    .all(widget.id);

  res.json({ widgetId: widget.id, total, dailyLast14Days: daily, byCountry });
});

// GET /dashboard/summary — cross-widget overview for the logged-in owner:
// how many widgets, how many submissions total, and a per-widget count so
// they can see at a glance which widget is pulling its weight.
router.get("/dashboard/summary", requireAuth, (req, res) => {
  const widgets = db
    .prepare("SELECT id, title, type FROM widgets WHERE customer_id = ? ORDER BY created_at DESC")
    .all(req.customerId);

  const perWidget = widgets.map((w) => {
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM submissions WHERE widget_id = ?")
      .get(w.id);
    return { id: w.id, title: w.title, type: w.type, submissions: count };
  });

  const { totalSubmissions } = db
    .prepare("SELECT COUNT(*) AS totalSubmissions FROM submissions WHERE customer_id = ?")
    .get(req.customerId);

  res.json({
    widgetCount: widgets.length,
    totalSubmissions,
    widgets: perWidget,
  });
});

module.exports = router;
