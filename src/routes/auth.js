const express = require("express");
const db = require("../db");
const { hashPassword, verifyPassword } = require("../lib/passwords");
const { signToken } = require("../lib/jwt");
const { registerSchema, loginSchema } = require("../lib/validation");

const router = express.Router();

router.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input.", details: parsed.error.issues });
  }
  const { email, password } = parsed.data;

  const existing = db.prepare("SELECT id FROM customers WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = hashPassword(password);
  const info = db
    .prepare("INSERT INTO customers (email, password_hash, created_at) VALUES (?, ?, ?)")
    .run(email, passwordHash, new Date().toISOString());
  const customerId = Number(info.lastInsertRowid);

  res.status(201).json({ id: customerId, email, token: signToken(customerId) });
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input.", details: parsed.error.issues });
  }
  const { email, password } = parsed.data;

  const customer = db.prepare("SELECT id, password_hash FROM customers WHERE email = ?").get(email);
  if (!customer || !verifyPassword(password, customer.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json({ id: customer.id, email, token: signToken(customer.id) });
});

module.exports = router;
