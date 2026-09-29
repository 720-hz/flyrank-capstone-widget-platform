const jwt = require("jsonwebtoken");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env and set one.");
  }
  return secret;
}

function signToken(customerId) {
  return jwt.sign({ sub: customerId }, getSecret(), { expiresIn: "7d" });
}

function verifyToken(token) {
  const payload = jwt.verify(token, getSecret());
  return Number(payload.sub);
}

module.exports = { signToken, verifyToken };
