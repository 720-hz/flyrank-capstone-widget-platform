# Design — Embeddable Widget & Lead-Capture Platform

One page, written before Phase 2, per the brief's Phase 1 gate.

## Data model

```
customers (the widget owner / tenant)
  id, email UNIQUE, password_hash, created_at

widgets
  id, customer_id -> customers.id, type (signup_form|cta|popover),
  title, description, fields (JSON: [{name,label,type,required}]),
  button_text, display_options (JSON), version (int, bumped on update),
  created_at, updated_at
  INDEX(customer_id)

submissions
  id, widget_id -> widgets.id, customer_id -> customers.id (denormalized,
  so dashboard queries never join through widgets for tenant filtering),
  data (JSON — the submitted field values), ip_address,
  geo_country, geo_city, geo_provider (which provider answered, or null),
  spam_flagged (0/1), created_at
  INDEX(widget_id), INDEX(customer_id), INDEX(created_at)
```

Tenant isolation is enforced at the query layer: every widgets/submissions
query is scoped by `customer_id` taken from the verified JWT, never from a
request parameter or body. A widget id alone is never enough to read or
write it.

## The embed flow

```
1. Owner authenticates -> creates a widget -> API returns the widget +
   an embed snippet:
   <script src=".../widget/v1/widget.js" data-widget-id="{id}" async></script>

2. Customer pastes that tag into their site (any origin).

3. Visitor's browser loads /widget/v1/widget.js (versioned via the /v1/
   path segment, cached ~1 year, immutable) -> the script reads
   data-widget-id off its own <script> tag (via document.currentScript)
   -> fetches GET /widgets/:id/config (public, CORS-open, cached ~30s)
   -> renders the form client-side.

4. Visitor submits -> POST /submissions (public, CORS-open, cross-origin)
   -> validated -> rate-limited -> spam-checked -> geo-enriched
   (provider A -> B -> none) -> stored -> fake email side effect fired
   (failure here never blocks the response) -> 2xx back to the visitor.

5. Owner's dashboard calls the authenticated dashboard API for stats and
   the submissions list.
```

## API contracts (three request paths, kept separate)

**Authenticated (owner)** — `Authorization: Bearer <jwt>`, no CORS needed
(called by the owner directly, not by a browser on someone else's page):
`POST /auth/register`, `POST /auth/login`, full CRUD on `/widgets`,
`GET /dashboard/summary`, `GET /widgets/:id/stats`,
`GET /widgets/:id/submissions`.

**Public, cached** — no auth, CORS-open, GET only:
`GET /widget/v1/widget.js` (long, immutable cache),
`GET /widgets/:id/config` (short cache).

**Public, protected** — no auth, CORS-open, the actual attack surface:
`POST /submissions`. Every non-negotiable in the brief (validation, CORS,
rate limiting, spam, enrichment, safe side effects) lives here.

## One explicit non-goal

**No widget-builder UI.** The brief says it plainly: "this is a backend
capstone, not a frontend one." Widgets are created and edited through the
authenticated JSON API (curl, Postman, or the test site's static
markup) — there is no admin web app for building widgets visually. The
owner dashboard is a JSON API plus the plain test-site page for evidence,
not a polished frontend.
