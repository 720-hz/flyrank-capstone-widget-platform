const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const widgetFieldSchema = z.object({
  name: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "email", "textarea", "tel"]),
  required: z.boolean().optional().default(false),
});

const widgetCreateSchema = z.object({
  type: z.enum(["signup_form", "cta", "popover"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  fields: z.array(widgetFieldSchema).min(1).max(20),
  buttonText: z.string().min(1).max(80).default("Submit"),
  displayOptions: z.record(z.string(), z.unknown()).optional().default({}),
});

const widgetUpdateSchema = widgetCreateSchema.partial();

// Submission payloads are dynamic (they mirror whatever fields the widget
// defines), so only the envelope is fixed here; field values are checked
// against the widget's own field list in the route handler, where the
// widget is already loaded. A payload above this size is rejected before
// we even look at it — a request from the open internet must never be
// trusted to be small.
const submissionSchema = z.object({
  widgetId: z.string().min(1).max(64),
  data: z.record(z.string(), z.union([z.string(), z.boolean()])).refine(
    (obj) => Object.keys(obj).length <= 50,
    "Too many fields."
  ),
  // Honeypot — a real visitor never sees or fills this field (hidden by
  // the widget's own CSS). Optional so a well-behaved client that omits
  // it entirely isn't penalized; present-and-non-empty is what flags it.
  company_website: z.string().max(500).optional(),
});

const MAX_SUBMISSION_BYTES = 20_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks submitted field values against the widget's OWN field
 * definitions (required-ness, basic type shape) — the schema above only
 * validates the envelope, since the fields themselves are per-widget and
 * dynamic. Returns a list of human-readable problems; empty = valid.
 */
function validateAgainstWidgetFields(widgetFields, data) {
  const problems = [];
  for (const field of widgetFields) {
    const value = data[field.name];
    if (field.required && (value === undefined || value === null || value === "")) {
      problems.push(`Field "${field.name}" is required.`);
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") {
      problems.push(`Field "${field.name}" must be a string.`);
      continue;
    }
    if (value.length > 5000) {
      problems.push(`Field "${field.name}" is too long.`);
    }
    if (field.type === "email" && !EMAIL_RE.test(value)) {
      problems.push(`Field "${field.name}" must be a valid email address.`);
    }
  }
  return problems;
}

module.exports = {
  registerSchema,
  loginSchema,
  widgetCreateSchema,
  widgetUpdateSchema,
  submissionSchema,
  validateAgainstWidgetFields,
  MAX_SUBMISSION_BYTES,
};
