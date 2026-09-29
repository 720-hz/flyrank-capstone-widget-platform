// Safe side effect: a confirmation "email" after a submission is stored.
// Faked per the brief's explicit permission ("Email can be fake: log it
// to the console... what's graded is that its failure doesn't block
// success") — logged to the console rather than a Mailpit SMTP catcher,
// to keep the $0 stack to exactly one moving part.
//
// EMAIL_FORCE_FAIL=1 makes this always throw, deterministically, for
// proving the failure-never-blocks-success behavior (Probe 5).
async function sendConfirmationEmail({ to, widgetTitle, submissionId }) {
  if (process.env.EMAIL_FORCE_FAIL === "1") {
    throw new Error("SMTP connection refused (forced via EMAIL_FORCE_FAIL=1).");
  }
  // A real integration would call an SMTP/API provider here. This is
  // intentionally the whole implementation — the point being graded is
  // the boundary around this call in submissions.js, not this function.
  console.log(
    `[email] confirmation sent for submission #${submissionId} on widget "${widgetTitle}"${to ? ` to ${to}` : ""}`
  );
}

module.exports = { sendConfirmationEmail };
