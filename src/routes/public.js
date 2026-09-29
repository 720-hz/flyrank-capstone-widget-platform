// The public surface: everything a browser on a website you don't
// control can reach. Three routes, in increasing order of how much they
// need to defend themselves.
const express = require("express");
const cors = require("cors");
const path = require("node:path");
const db = require("../db");
const { ipLimiter, widgetLimiter } = require("../middleware/rateLimit");
const { submissionSchema, MAX_SUBMISSION_BYTES, validateAgainstWidgetFields } = require("../lib/validation");
const { isHoneypotTripped } = require("../lib/spam");
const { enrichIp } = require("../lib/geo");
const { sendConfirmationEmail } = require("../lib/email");

const router = express.Router();

// CORS-open on purpose — these routes are called by a visitor's browser
// on a site you've never heard of, which is the entire point of an
// embeddable widget. cors() with no origin restriction reflects the
// caller's Origin and correctly answers the OPTIONS preflight.
const openCors = cors();
router.use(openCors);
router.options(/.*/, openCors);

// GET /widget/v1/widget.js — the loader script. Same bytes for every
// widget; versioned in the URL (v1) so a future breaking change ships as
// /widget/v2/... instead of invalidating every cached copy in the wild.
router.get("/widget/v1/widget.js", (_req, res) => {
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(path.join(__dirname, "..", "..", "public", "widget.js"));
});

// GET /widgets/:id/config — public, per-widget rendering config. Short
// cache: config can change (Stage title edit, new field) and visitors
// should see that within tens of seconds, not a year.
router.get("/widgets/:id/config", (req, res) => {
  const row = db.prepare("SELECT * FROM widgets WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Widget not found." });

  res.set("Cache-Control", "public, max-age=30");
  res.json({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    fields: JSON.parse(row.fields),
    buttonText: row.button_text,
    displayOptions: JSON.parse(row.display_options),
    version: row.version,
  });
});

function clientIp(req) {
  const ip = req.ip || req.socket.remoteAddress || "";
  const isLoopback = ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.");
  // Loopback has no real geolocation. Substituting a documentation/
  // example IP (RFC 5737 TEST-NET-1) here — never a real address — is
  // what lets the enrichment chain actually run when this is demoed
  // from curl on the same machine, instead of silently short-circuiting
  // every single time.
  return isLoopback ? "192.0.2.1" : ip;
}

// POST /submissions — the hardened path. Every non-negotiable in the
// brief lives in this one handler, in the order a request meets them:
// size cap -> envelope validation -> spam -> rate limits -> widget
// lookup -> per-widget field validation -> enrichment -> store -> safe
// side effect.
router.post("/submissions", ipLimiter, widgetLimiter, async (req, res, next) => {
  try {
    const raw = JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw, "utf8") > MAX_SUBMISSION_BYTES) {
      return res.status(413).json({ error: "Payload too large." });
    }

    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input.", details: parsed.error.issues });
    }
    const { widgetId, data } = parsed.data;

    // Spam control: a filled honeypot is dropped silently — a fake
    // success, nothing stored, no hint to the bot that anything was
    // detected. This is deliberately not a validation error.
    if (isHoneypotTripped(req.body)) {
      return res.status(201).json({ status: "received" });
    }

    const widget = db.prepare("SELECT * FROM widgets WHERE id = ?").get(widgetId);
    if (!widget) {
      return res.status(404).json({ error: "Widget not found." });
    }

    const fieldProblems = validateAgainstWidgetFields(JSON.parse(widget.fields), data);
    if (fieldProblems.length > 0) {
      return res.status(400).json({ error: "Invalid submission.", details: fieldProblems });
    }

    const ip = clientIp(req);
    const geo = await enrichIp(ip); // never throws — degrades to nulls

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO submissions (widget_id, customer_id, data, ip_address, geo_country, geo_city, geo_provider, spam_flagged, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(widgetId, widget.customer_id, JSON.stringify(data), ip, geo.country, geo.city, geo.provider, now);
    const submissionId = Number(info.lastInsertRowid);

    // Safe side effect: deliberately outside the try that would reject
    // the request. A thrown error here is caught, logged, and otherwise
    // ignored — the submission is already committed and the visitor
    // already gets a success response either way.
    try {
      await sendConfirmationEmail({ to: data.email, widgetTitle: widget.title, submissionId });
    } catch (emailErr) {
      console.error(`[email] confirmation failed for submission #${submissionId} (non-fatal): ${emailErr.message}`);
    }

    res.status(201).json({ status: "received", id: submissionId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
