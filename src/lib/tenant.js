const db = require("../db");

/**
 * The one place "does this widget belong to this customer?" is answered.
 * Returns null for both "no such widget" and "not yours" — on purpose,
 * so a 404 never leaks which widget ids exist for other tenants.
 */
function loadOwnWidget(id, customerId) {
  return db.prepare("SELECT * FROM widgets WHERE id = ? AND customer_id = ?").get(id, customerId);
}

module.exports = { loadOwnWidget };
