// SQLite via node:sqlite — built into Node 22+, per the brief's own $0
// stack table ("PostgreSQL via Docker, or SQLite to start"). No Docker,
// no server process, one file, zero setup friction for the "a stranger
// can run it" requirement.
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "widgets.db");

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('signup_form', 'cta', 'popover')),
  title TEXT NOT NULL,
  description TEXT,
  fields TEXT NOT NULL,            -- JSON array of {name,label,type,required}
  button_text TEXT NOT NULL,
  display_options TEXT NOT NULL,   -- JSON object
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_widgets_customer ON widgets(customer_id);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id TEXT NOT NULL REFERENCES widgets(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  data TEXT NOT NULL,              -- JSON object of submitted field values
  ip_address TEXT,
  geo_country TEXT,
  geo_city TEXT,
  geo_provider TEXT,               -- 'A', 'B', or NULL if both failed
  spam_flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_widget ON submissions(widget_id);
CREATE INDEX IF NOT EXISTS idx_submissions_customer ON submissions(customer_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
`;

db.exec(SCHEMA);

module.exports = db;
