import express from "express";
import cors from "cors";
import dns from "node:dns/promises";

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["*"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (allowedOrigins.includes("*") || !origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin '${origin}' not allowed`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// ── Helper ───────────────────────────────────────────────────────────────────
function getClientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress
  );
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /whoami
app.get("/whoami", (req, res) => {
  const cfHeaders = Object.fromEntries(
    Object.entries(req.headers).filter(([k]) => k.startsWith("cf-"))
  );
  res.json({
    method: req.method,
    url: req.url,
    ip: getClientIp(req),
    headers: req.headers,
    cloudflareHeaders: cfHeaders,
  });
});

// GET /cors-test
app.get("/cors-test", (req, res) => {
  const origin = req.headers.origin || null;
  res.json({
    cors: "ok",
    receivedOrigin: origin,
    allowedOrigins,
    timestamp: new Date().toISOString(),
  });
});

// POST /echo
app.post("/echo", (req, res) => {
  res.json({
    echo: req.body,
    contentType: req.headers["content-type"] || null,
    receivedAt: new Date().toISOString(),
  });
});

// GET /dns?hostname=example.com
app.get("/dns", async (req, res) => {
  const hostname = req.query.hostname || "cloudflare.com";
  try {
    const addresses = await dns.resolve4(hostname);
    res.json({ hostname, addresses, status: "ok" });
  } catch (err) {
    res.status(502).json({ hostname, error: err.message, status: "error" });
  }
});

// GET /fetch?url=https://...
app.get("/fetch", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "Missing ?url= query parameter" });
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: "Only http/https URLs are allowed" });
  }
  const start = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    res.json({
      url,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - start,
      bodyPreview: text.slice(0, 500),
    });
  } catch (err) {
    res.status(502).json({
      url,
      error: err.message,
      durationMs: Date.now() - start,
      status: "error",
    });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Connectivity test API listening on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
