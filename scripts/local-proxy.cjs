// scripts/local-proxy.cjs (CommonJS)
// Tiny local proxy: POST /flow -> forwards to REAL_FLOW_URL

const http = require("http");
const url = require("url");

const PORT = process.env.PROXY_PORT ? Number(process.env.PROXY_PORT) : 5179;
const TARGET = process.env.REAL_FLOW_URL;

if (!TARGET) {
  console.error("❌ REAL_FLOW_URL is missing. Check your .env.local");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);

  if (req.method !== "POST" || pathname !== "/flow") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const resp = await fetch(TARGET, {
        method: "POST",
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
        },
        body,
      });
      const text = await resp.text();
      res.writeHead(resp.status, { "Content-Type": "text/plain" });
      res.end(text);
    } catch (err) {
      console.error("Proxy forward error:", err);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway (proxy)");
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Proxy ready at http://localhost:${PORT}/flow`);
  console.log(`   Forwarding to REAL_FLOW_URL: ${TARGET}`);
});
