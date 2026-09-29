// Short, URL-safe ids for widgets — matches the brief's own example
// (?id=abc123) better than a full UUID in a <script> tag.
const crypto = require("node:crypto");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function shortId(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

module.exports = { shortId };
