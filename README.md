# Embeddable Widget & Lead-Capture Platform

A backend that lets a customer define an embeddable widget — a signup form, a CTA, a popover — get one `<script>` tag, and paste it into any website. The platform serves the widget, renders it client-side, and safely captures every submission the public internet sends back: validated, rate-limited, spam-filtered, geo-enriched with a fallback chain, stored, and shown to the widget's owner in a dashboard API.

Built for the FlyRank Internship Backend Track capstone: *Embeddable Widget & Lead-Capture Platform*.

## Architecture

Three separate request paths, kept separate in the code the same way they're separate in trust level:

```
Widget Owner (authenticated, JWT)
    -> POST/GET/PUT/DELETE /widgets           (src/routes/widgets.js)
    -> GET /dashboard/summary,
       GET /widgets/:id/stats,
       GET /widgets/:id/submissions           (src/routes/dashboard.js)
       -> tenant-isolated at the query layer, via loadOwnWidget()
       -> Widgets DB (SQLite)

Customer Website (any origin — a site you don't control)
    <script src="https://.../widget/v1/widget.js"
            data-widget-id="abc123" async></script>
        -> GET /widget/v1/widget.js   (public - CORS-open - cached 1yr, immutable)
        -> GET /widgets/:id/config    (public - CORS-open - cached 30s)
        -> renders the form client-side, no server-rendered HTML involved

Website Visitor (any browser, any origin)
    -> POST /submissions   (public - CORS-open - the hardened path)
         | size cap            -> 413 if over 20,000 bytes
         | envelope validation -> 400 (Zod) if malformed
         | honeypot check      -> silent fake-201, nothing stored, if tripped
         | rate limit (IP)     -> 429 if over 20/60s from one IP
         | rate limit (widget) -> 429 if over 15/60s for one widget
         | widget + field validation -> 400 if payload doesn't match the widget's fields
         | geo enrichment: provider A -(fails)-> provider B -(fails)-> store anyway, no geo
         | store the row (tenant_id copied from the widget, never from the client)
         | confirmation email side effect -- failure here is caught + logged,
         |   never blocks the response or undoes the stored row
    <- 201 { status: "received", id }
```

All three paths run in one process (`src/server.js`), routed to separate files by trust level: `src/routes/auth.js` + `src/routes/widgets.js` + `src/routes/dashboard.js` require a verified JWT; `src/routes/public.js` requires nothing and assumes every caller is a stranger.

## Setup

Works from a clean clone. Requires **Node.js 22+** (for the built-in `node:sqlite` module — no external database, no Docker, no signup, $0).

```bash
git clone <this-repo-url>
cd flyrank-capstone-widget-platform
npm install
cp .env.example .env        # defaults are fine for local use
npm run seed                # creates a demo customer + widget (idempotent)
npm start                   # listens on :3020 by default
```

In a second terminal, start the "customer site" — a plain HTML file on a *different* local port, proving the widget really is cross-origin:

```bash
npm run test-site           # listens on :4021
```

Open `http://localhost:4021/` in a browser. It's an ordinary page that never wrote a line of the widget's markup itself — the whole thing renders from the one `<script>` tag, fetched from the API on port 3020.

Demo credentials (from `npm run seed`, also printed to the console when it runs):

```
email:    demo@flyrank.dev
password: demo12345
widget:   demo0001
```

## Environment variables

See `.env.example`. The three `_DOWN` / `_FORCE_FAIL` toggles exist specifically so the failure-handling behavior graded by this capstone (Probes 4 and 5 below) can be demonstrated deterministically, without depending on a real third-party API happening to be down at demo time — the brief asks for exactly this ("mock the geo providers when you prove the fallback... one you can toggle down").

## API reference

### Authenticated (owner) — `Authorization: Bearer <jwt>`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password }` | 201 + token. 409 if email taken. |
| POST | `/auth/login` | `{ email, password }` | 200 + token. 401 on bad credentials. |
| POST | `/widgets` | `{ type, title, description?, fields[], buttonText?, displayOptions? }` | 201, includes `embedSnippet`. |
| GET | `/widgets` | — | List this customer's widgets only. |
| GET | `/widgets/:id` | — | 404 if not found or not yours. |
| PUT | `/widgets/:id` | partial widget body | Bumps `version`. 404 if not yours. |
| DELETE | `/widgets/:id` | — | 204. 404 if not yours. |
| GET | `/dashboard/summary` | — | Widget count, total submissions, per-widget counts. |
| GET | `/widgets/:id/stats` | — | Total, last-14-day daily series, country breakdown. |
| GET | `/widgets/:id/submissions?limit=&offset=` | — | Paginated raw submissions, newest first. |

### Public, cached — no auth, CORS-open, GET only

| Method | Path | Cache |
|---|---|---|
| GET | `/widget/v1/widget.js` | `public, max-age=31536000, immutable` |
| GET | `/widgets/:id/config` | `public, max-age=30` |

### Public, protected — no auth, CORS-open

| Method | Path | Notes |
|---|---|---|
| POST | `/submissions` | `{ widgetId, data: {...}, company_website?: "" }`. See the pipeline above. |
| OPTIONS | `/submissions` | CORS preflight, handled automatically. |

### Health

| Method | Path |
|---|---|
| GET | `/health` |

## Acceptance probes

The six behavioral probes from the brief (Section 13), each with a captured transcript in `EVIDENCE.md`:

1. POST a valid submission from the second-origin test page → stored, `2xx`, visible via the dashboard API.
2. Malformed and oversized payloads → clean `4xx` JSON errors, never a `500`.
3. A burst of rapid submissions → `429`s appear, and a normal request right after still succeeds.
4. Disable geo provider A → next submission stored, enriched by provider B. Disable both → stored anyway, without geo.
5. Force the email side effect to throw → submission still returns success and is stored.
6. Fill the honeypot field like a bot would → submission is silently dropped.

## Limitations (honest, on purpose)

- **No widget-builder UI.** This is a backend capstone; widgets are created and edited through the JSON API. See `DESIGN.md`'s explicit non-goal.
- **Email is fake.** Confirmation "emails" are `console.log`'d, never actually sent — what's graded is that a failing side effect can't break a submission, not real email delivery (the brief explicitly allows this: "Email can be fake").
- **Geo providers are mocked by default** (`MOCK_GEO` defaults on inside `src/lib/geo.js`) so the fallback-chain proof in `EVIDENCE.md` is deterministic and doesn't depend on a real third-party API's uptime at grading time. The same module's `providerA`/`providerB` functions call the real free APIs (`ip-api.com`, `ipapi.co`) when `MOCK_GEO=0` is set.
- **No production bundling.** `public/widget.js` is served as-is, unminified — the brief lists a minified/versioned bundle as an optional stretch goal, not part of the core.
- **SQLite, not Postgres.** Chosen per the brief's own $0 stack table ("PostgreSQL via Docker, or SQLite to start") — zero setup friction for "a stranger can run it."

## License

MIT.
