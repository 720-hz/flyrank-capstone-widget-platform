# Evidence

One pasted proof per Requirements checkbox (brief, Section 6), captured against the running system on 2026-09-29. `demo@flyrank.dev` / `demo0001` is the seeded demo customer/widget (`npm run seed`); `dashtest@example.com` / `akanoti1` is a second customer created purely to prove tenant isolation.

## Widget management

**Authenticated CRUD endpoints for widgets; requests without valid auth are rejected.**

```
$ curl -i http://localhost:3020/widgets   # no Authorization header
HTTP 401
{"error":"Missing or malformed Authorization header."}

$ curl -i http://localhost:3020/widgets -H 'Authorization: Bearer garbage.token.here'
HTTP 401
{"error":"Invalid or expired token."}
```

**Multi-tenant isolation proven: tenant A cannot read or modify tenant B's widgets/submissions.**

```
$ curl -i http://localhost:3020/widgets/demo0001 -H 'Authorization: Bearer <dashtest token>'
HTTP 404
{"error":"Widget not found."}

$ curl -i -X DELETE http://localhost:3020/widgets/demo0001 -H 'Authorization: Bearer <dashtest token>'
HTTP 404
{"error":"Widget not found."}

# demo0001 is untouched, confirmed by its real owner:
$ curl http://localhost:3020/widgets/demo0001 -H 'Authorization: Bearer <demo token>'
{"id":"demo0001", ... "title":"Join our newsletter", ...}

# dashtest's own widget list never includes demo's widgets:
$ curl http://localhost:3020/widgets -H 'Authorization: Bearer <dashtest token>'
[ 'akanoti1' ]

# the dashboard endpoints are scoped the same way:
$ curl -i http://localhost:3020/widgets/demo0001/submissions -H 'Authorization: Bearer <dashtest token>'
HTTP 404
{"error":"Widget not found."}
```

404, not 403 — on purpose, so a rejected request never confirms that a given widget id even exists for another tenant.

**Embed snippet generated per widget.**

```
$ curl http://localhost:3020/widgets/demo0001 -H 'Authorization: Bearer <demo token>'
{ ..., "embedSnippet": "<script src=\"http://localhost:3020/widget/v1/widget.js\" data-widget-id=\"demo0001\" async></script>" }
```

## Widget delivery

**Public config endpoint serves a small payload with correct HTTP cache headers.**

```
$ curl -I http://localhost:3020/widgets/demo0001/config
HTTP/1.1 200 OK
Cache-Control: public, max-age=30
Content-Type: application/json; charset=utf-8
Content-Length: 303
```

**Widget JavaScript is served as a versioned bundle (new version = new URL or cache-bust).**

```
$ curl -I http://localhost:3020/widget/v1/widget.js
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable
Content-Type: text/javascript; charset=utf-8
```

The `v1` segment in the URL *is* the version — a breaking change ships at `/widget/v2/widget.js` instead of invalidating every cached copy already embedded across the internet.

**The widget renders on a page served from a different origin than your API.**

`test-site/index.html` is served by `test-site/serve.js` on port 4021; the API runs on port 3020 — two different origins.

```
$ curl -s http://localhost:4021/ | grep widget.js
  <script src="http://localhost:3020/widget/v1/widget.js" data-widget-id="demo0001" async></script>
```

`public/widget.js` fetches `/widgets/demo0001/config` and `/submissions` from `http://localhost:3020` while executing on a page served from `http://localhost:4021` — see the CORS evidence below for why that cross-origin call succeeds.

## Public submission API

**Cross-origin submissions work: CORS headers correct, preflight (`OPTIONS`) handled.**

```
$ curl -i -X OPTIONS http://localhost:3020/submissions \
  -H 'Origin: http://localhost:4021' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: Content-Type'
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: Content-Type

$ curl -i -X POST http://localhost:3020/submissions \
  -H 'Origin: http://localhost:4021' -H 'Content-Type: application/json' \
  -d '{"widgetId":"demo0001","data":{"name":"Probe One","email":"probe1@example.com"}}'
HTTP/1.1 201 Created
Access-Control-Allow-Origin: *
{"status":"received","id":18}
```

Visible immediately via the owner dashboard API:

```
$ curl http://localhost:3020/widgets/demo0001/submissions?limit=1 -H 'Authorization: Bearer <demo token>'
{"widgetId":"demo0001","total":2,"limit":1,"offset":0,
 "submissions":[{"id":18,"data":{"name":"Probe One","email":"probe1@example.com"}, ...}]}
```

**All incoming input validated; malformed and oversized payloads rejected with appropriate 4xx codes and JSON errors.**

```
$ curl -i -X POST /submissions -d '{"data":{"email":"x@example.com"}}'   # missing widgetId
HTTP 400
{"error":"Invalid input.","details":[{"expected":"string","code":"invalid_type","path":["widgetId"], ...}]}

$ curl -i -X POST /submissions -d 'not json{{{'   # not valid JSON at all
HTTP 400
{"error":"Malformed JSON body."}

$ curl -i -X POST /submissions -d '{"widgetId":"demo0001","data":{"email":"<25000-char string>"}}'   # over 20,000 bytes
HTTP 413
{"error":"Payload too large."}
```

Never a 500 — see BUILDLOG.md for a bug found and fixed during this exact check (Express's JSON body-parser was throwing a raw `SyntaxError` past the app's own validation, landing on the generic 500 handler; now caught explicitly and returned as a 400).

**Valid submissions stored safely, linked to the right widget and tenant.**

Every `submissions` row carries both `widget_id` and `customer_id` (`src/db.js`), the latter copied from the *widget's* owner at insert time — never from client input — so a submission can never be attributed to the wrong tenant even if the widget id were guessed. See the Probe 1 transcript above for an end-to-end proof (submitted → stored → visible only to its owner).

## Abuse protection

**Rate limiting per IP and/or per widget returns `429` under a burst — and the API keeps serving legitimate traffic.**

```
$ for i in $(seq 1 16); do curl -s -o /dev/null -w "req#$i -> %{http_code}\n" -X POST /submissions -d '{"widgetId":"demo0001",...}'; done
req#1 -> 201
...
req#14 -> 201
req#15 -> 429
req#16 -> 429

# immediately after, a different widget still succeeds — the flood didn't take the service down:
$ curl -i -X POST /submissions -d '{"widgetId":"akanoti1",...}'
HTTP 201
{"status":"received","id":33}

# ~62s later, the SAME widget's own limiter has recovered:
$ curl -i -X POST /submissions -d '{"widgetId":"demo0001",...}'
HTTP 201
{"status":"received","id":34}
```

**At least one spam-prevention technique (honeypot field, token, or heuristic) demonstrably blocks a spam submission.**

```
# submission count for widget demo0001 before: 17
$ curl -i -X POST /submissions -d '{"widgetId":"demo0001","data":{"email":"bot@example.com"},"company_website":"http://spam-bot.example"}'
HTTP 201
{"status":"received"}
# submission count for widget demo0001 after: 17 — unchanged
```

The response still looks like success (`201`) on purpose: a real error would tell a bot its honeypot got caught. Nothing is written to the database.

## Enrichment & safe side effects

**IP→geo enrichment uses a provider fallback chain: provider A down → provider B answers → submission enriched.**

```
# server restarted with GEO_PROVIDER_A_DOWN=1
$ curl -X POST /submissions -d '{"widgetId":"demo0001","data":{"email":"provider-a-down@example.com"}}'
{"status":"received","id":35}
$ sqlite> SELECT id, geo_country, geo_provider FROM submissions WHERE id = 35;
{"id":35,"geo_country":"Canada","geo_city":"Toronto","geo_provider":"B"}
```

**All providers down → submission still succeeds (without geo). Degrade, never fail.**

```
# server restarted with GEO_PROVIDER_A_DOWN=1 AND GEO_PROVIDER_B_DOWN=1
$ curl -X POST /submissions -d '{"widgetId":"demo0001","data":{"email":"both-providers-down@example.com"}}'
{"status":"received","id":36}
$ sqlite> SELECT id, geo_country, geo_city, geo_provider FROM submissions WHERE id = 36;
{"id":36,"geo_country":null,"geo_city":null,"geo_provider":null}
```

**A failing confirmation email/webhook does not prevent the submission from being stored.**

```
# server restarted with EMAIL_FORCE_FAIL=1
$ curl -i -X POST /submissions -d '{"widgetId":"demo0001","data":{"email":"email-fail@example.com"}}'
HTTP/1.1 201 Created
{"status":"received","id":37}

# server log, same request:
[email] confirmation failed for submission #37 (non-fatal): SMTP connection refused (forced via EMAIL_FORCE_FAIL=1).
```

## Other correctness checks

**A truly unmatched route returns a plain 404, never leaks that some other route requires auth.**

```
$ curl -i http://localhost:3020/nonexistent
HTTP 404
{"error":"No route for GET /nonexistent"}
```

(See BUILDLOG.md — this was a 401 until a routing bug in `src/routes/dashboard.js` was found and fixed during this exact check.)

## Documentation

README.md has an architecture diagram (ASCII, matching the brief's three request paths), setup instructions that work from a clean clone (`npm install && npm run seed && npm start`), and full API documentation for every endpoint. `.env.example`, `capstone.yaml`, `BUILDLOG.md`, and this file are all present at the repo root per Section 11.
