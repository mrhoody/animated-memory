import express, { Request, Response } from "express";
import cors from "cors";
import dns from "node:dns/promises";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS
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

// ── Helper ────────────────────────────────────────────────────────────────────
function getClientIp(req: Request): string | undefined {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;

  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return raw.split(",")[0]?.trim();
  }

  return req.socket.remoteAddress;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /health
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /whoami
app.get("/whoami", (req: Request, res: Response) => {
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
app.get("/cors-test", (req: Request, res: Response) => {
  const origin = req.headers.origin ?? null;
  res.json({
    cors: "ok",
    receivedOrigin: origin,
    allowedOrigins,
    timestamp: new Date().toISOString(),
  });
});

// POST /echo
app.post("/echo", (req: Request, res: Response) => {
  res.json({
    echo: req.body as unknown,
    contentType: req.headers["content-type"] ?? null,
    receivedAt: new Date().toISOString(),
  });
});

// GET /dns?hostname=example.com
app.get("/dns", async (req: Request, res: Response) => {
  const hostname =
    typeof req.query.hostname === "string" ? req.query.hostname : "cloudflare.com";
  try {
    const addresses = await dns.resolve4(hostname);
    res.json({ hostname, addresses, status: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ hostname, error: message, status: "error" });
  }
});

// GET /fetch?url=https://...
app.get("/fetch", async (req: Request, res: Response) => {
  const rawUrl = req.query.url;
  if (typeof rawUrl !== "string" || !rawUrl) {
    res.status(400).json({ error: "Missing ?url= query parameter" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: "Only http/https URLs are allowed" });
    return;
  }

  const start = Date.now();
  try {
    const response = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    res.json({
      url: rawUrl,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - start,
      bodyPreview: text.slice(0, 500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      url: rawUrl,
      error: message,
      durationMs: Date.now() - start,
      status: "error",
    });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Connectivity test API listening on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
