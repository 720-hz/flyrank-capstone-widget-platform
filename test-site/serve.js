// A tiny static file server for test-site/, deliberately on a different
// port than the platform API (3020) so the widget embed is demonstrably
// cross-origin — no framework needed for "serve one HTML file".
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.TEST_SITE_PORT || 4021;
const ROOT = __dirname;

const server = http.createServer((req, res) => {
  const filePath = req.url === "/" ? "/index.html" : req.url;
  const resolved = path.join(ROOT, path.normalize(filePath));
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(resolved);
    const contentType = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`test-site listening on :${PORT} — open http://localhost:${PORT}/`);
});
