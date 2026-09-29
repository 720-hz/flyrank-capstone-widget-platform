require("dotenv").config();

const express = require("express");
const authRoutes = require("./routes/auth");
const widgetRoutes = require("./routes/widgets");
const publicRoutes = require("./routes/public");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Public, CORS-open routes first (widget.js, config, submissions) — they
// have no auth to fall through to.
app.use("/", publicRoutes);

app.use("/auth", authRoutes);
// Dashboard routes are more specific (/widgets/:id/submissions,
// /widgets/:id/stats) than widgetRoutes' generic /widgets/:id, so they're
// mounted first to make the match order unambiguous at a glance.
app.use(dashboardRoutes);
app.use("/widgets", widgetRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // express.json() throws a SyntaxError (type "entity.parse.failed") when
  // the request body isn't valid JSON at all — that's malformed client
  // input, not a server fault, so it must come back as a clean 4xx like
  // every other validation failure, never the generic 500 below.
  if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err)) {
    return res.status(400).json({ error: "Malformed JSON body." });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`flyrank-capstone-widget-platform listening on :${PORT}`));
}

module.exports = app;
