// Idempotent demo data: one customer, one widget, with a fixed widget id
// so the test-site page (and this file's own printed instructions) never
// go stale between runs. Safe to run repeatedly — re-running just prints
// the same credentials/ids back out instead of erroring or duplicating.
require("dotenv").config();
const db = require("./src/db");
const { hashPassword } = require("./src/lib/passwords");

const DEMO_EMAIL = "demo@flyrank.dev";
const DEMO_PASSWORD = "demo12345";
const DEMO_WIDGET_ID = "demo0001";

function main() {
  let customer = db.prepare("SELECT * FROM customers WHERE email = ?").get(DEMO_EMAIL);
  if (!customer) {
    const now = new Date().toISOString();
    const info = db
      .prepare("INSERT INTO customers (email, password_hash, created_at) VALUES (?, ?, ?)")
      .run(DEMO_EMAIL, hashPassword(DEMO_PASSWORD), now);
    customer = { id: Number(info.lastInsertRowid), email: DEMO_EMAIL };
    console.log(`Created demo customer #${customer.id} (${DEMO_EMAIL}).`);
  } else {
    console.log(`Demo customer already exists: #${customer.id} (${DEMO_EMAIL}).`);
  }

  let widget = db.prepare("SELECT * FROM widgets WHERE id = ?").get(DEMO_WIDGET_ID);
  if (!widget) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO widgets (id, customer_id, type, title, description, fields, button_text, display_options, version, created_at, updated_at)
       VALUES (?, ?, 'signup_form', ?, ?, ?, ?, '{}', 1, ?, ?)`
    ).run(
      DEMO_WIDGET_ID,
      customer.id,
      "Join our newsletter",
      "One email a week, no spam.",
      JSON.stringify([
        { name: "name", label: "Name", type: "text", required: false },
        { name: "email", label: "Email", type: "email", required: true },
      ]),
      "Sign up",
      now,
      now
    );
    console.log(`Created demo widget "${DEMO_WIDGET_ID}".`);
  } else {
    console.log(`Demo widget already exists: "${DEMO_WIDGET_ID}".`);
  }

  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3020";
  console.log("\n--- Demo credentials ---");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log("\n--- Embed snippet (already used by test-site/index.html) ---");
  console.log(`  <script src="${base}/widget/v1/widget.js" data-widget-id="${DEMO_WIDGET_ID}" async></script>`);
  console.log("\nRun `npm run test-site` and open it in a browser to see the widget render");
  console.log("and submit from a different origin than the API.");
}

main();
