const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const requestLog = [];

function classify(urlPath) {
  if (urlPath === "/api/profile") return "profile";
  if (urlPath === "/api/api-source") return "apiSource";
  if (urlPath === "/api/session") return "session";
  if (urlPath === "/api/tabs") return "tabs";
  if (urlPath === "/api/list") return "list";
  if (urlPath.startsWith("/product/")) return "productRsc";
  if (urlPath.startsWith("/records/")) return "recordsRsc";
  if (urlPath === "/api/metrics" || urlPath === "/api/reset") return null;
  return "other";
}

function recordRequest(req, url) {
  const type = classify(url.pathname);
  if (!type) return;
  requestLog.push({
    type,
    method: req.method,
    path: `${url.pathname}${url.search}`,
    at: new Date().toISOString(),
    prefetch: req.headers["x-demo-prefetch"] === "1",
  });
}

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function metrics() {
  const counts = requestLog.reduce((result, item) => {
    result[item.type] = (result[item.type] || 0) + 1;
    return result;
  }, {});
  return {
    total: requestLog.length,
    counts,
    recent: requestLog.slice(-8),
  };
}

function serveStatic(res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
  send(res, 200, fs.readFileSync(filePath), types[ext] || "application/octet-stream");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  recordRequest(req, url);

  if (req.method === "POST" && url.pathname === "/api/reset") {
    requestLog.length = 0;
    send(res, 204, "");
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/metrics") {
    send(res, 200, JSON.stringify(metrics()));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    send(res, 200, JSON.stringify({ ok: true, endpoint: url.pathname }));
    return;
  }
  if (req.method === "GET" && (url.pathname.startsWith("/product/") || url.pathname.startsWith("/records/"))) {
    send(res, 200, `<article><h2>按需載入的詳細頁</h2><p>這筆資料是在使用者點擊後才請求，路徑：${url.pathname}</p></article>`, "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET") {
    serveStatic(res, url.pathname);
    return;
  }
  send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`WAF request demo running at http://127.0.0.1:${PORT}`);
});
