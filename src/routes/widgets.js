// Widget management — authenticated, tenant-isolated CRUD. Every query
// here is scoped by req.customerId (from the verified JWT via
// requireAuth), never by anything the client passed in — that's what
// makes tenant isolation a query-layer guarantee instead of a hope.
const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { widgetCreateSchema, widgetUpdateSchema } = require("../lib/validation");
const { shortId } = require("../lib/ids");
const { loadOwnWidget } = require("../lib/tenant");

const router = express.Router();
router.use(requireAuth);

function embedSnippet(req, widgetId) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  // widget.js reads its target widget from data-widget-id on its own
  // <script> tag (via document.currentScript) — not a query string — so
  // the tag itself must carry that attribute, not "?id=".
  return `<script src="${base}/widget/v1/widget.js" data-widget-id="${widgetId}" async></script>`;
}

function toPublicShape(row, req) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    fields: JSON.parse(row.fields),
    buttonText: row.button_text,
    displayOptions: JSON.parse(row.display_options),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    embedSnippet: embedSnippet(req, row.id),
  };
}

router.post("/", (req, res) => {
  const parsed = widgetCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input.", details: parsed.error.issues });
  }
  const { type, title, description, fields, buttonText, displayOptions } = parsed.data;

  const id = shortId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO widgets (id, customer_id, type, title, description, fields, button_text, display_options, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, req.customerId, type, title, description, JSON.stringify(fields), buttonText, JSON.stringify(displayOptions), now, now);

  const row = loadOwnWidget(id, req.customerId);
  res.status(201).json(toPublicShape(row, req));
});

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM widgets WHERE customer_id = ? ORDER BY created_at DESC")
    .all(req.customerId);
  res.json(rows.map((r) => toPublicShape(r, req)));
});

router.get("/:id", (req, res) => {
  const row = loadOwnWidget(req.params.id, req.customerId);
  if (!row) return res.status(404).json({ error: "Widget not found." });
  res.json(toPublicShape(row, req));
});

router.put("/:id", (req, res) => {
  const existing = loadOwnWidget(req.params.id, req.customerId);
  if (!existing) return res.status(404).json({ error: "Widget not found." });

  const parsed = widgetUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input.", details: parsed.error.issues });
  }
  const patch = parsed.data;

  const merged = {
    type: patch.type ?? existing.type,
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    fields: patch.fields ?? JSON.parse(existing.fields),
    buttonText: patch.buttonText ?? existing.button_text,
    displayOptions: patch.displayOptions ?? JSON.parse(existing.display_options),
  };

  // Any change to the rendered widget bumps its version — the config
  // endpoint's short cache means visitors catch up within ~30s anyway,
  // but the version number is what the *loader* could key a longer cache
  // on if it ever needs to (see README's cache-headers section).
  db.prepare(
    `UPDATE widgets SET type=?, title=?, description=?, fields=?, button_text=?, display_options=?, version=version+1, updated_at=?
     WHERE id=? AND customer_id=?`
  ).run(
    merged.type,
    merged.title,
    merged.description,
    JSON.stringify(merged.fields),
    merged.buttonText,
    JSON.stringify(merged.displayOptions),
    new Date().toISOString(),
    req.params.id,
    req.customerId
  );

  const row = loadOwnWidget(req.params.id, req.customerId);
  res.json(toPublicShape(row, req));
});

router.delete("/:id", (req, res) => {
  const existing = loadOwnWidget(req.params.id, req.customerId);
  if (!existing) return res.status(404).json({ error: "Widget not found." });
  db.prepare("DELETE FROM widgets WHERE id = ? AND customer_id = ?").run(req.params.id, req.customerId);
  res.status(204).send();
});

module.exports = router;
