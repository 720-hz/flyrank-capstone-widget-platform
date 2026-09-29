// Honeypot: a field named `company_website` that the widget's client-side
// script renders hidden (off-screen + aria-hidden) so no human visitor
// ever fills it in — but a bot that blindly fills every field it finds
// will. Present and non-empty = spam.
function isHoneypotTripped(body) {
  return typeof body?.company_website === "string" && body.company_website.trim().length > 0;
}

module.exports = { isHoneypotTripped };
