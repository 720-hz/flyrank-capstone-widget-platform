// Password hashing via node:crypto's scrypt — no bcrypt/argon2 native
// dependency to install or compile, and scrypt is a fine KDF for this.
const crypto = require("node:crypto");

const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { hashPassword, verifyPassword };
