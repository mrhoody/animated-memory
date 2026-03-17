# Cloudflare Tunnel Setup Guide

This guide walks you through exposing your Hetzner VPS backend to the internet
via Cloudflare Tunnel, then wiring it up to your Cloudflare Pages frontend.

## Prerequisites

- A domain managed by Cloudflare (free plan is fine)
- Your backend running on the VPS (port 3000)
- `cloudflared` installed on the VPS

---

## 1. Install `cloudflared` on the VPS

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
  -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Verify
cloudflared --version
```

---

## 2. Authenticate `cloudflared`

```bash
cloudflared tunnel login
# Opens a browser — authorise the domain you want to use.
# A credentials file is saved to ~/.cloudflared/
```

---

## 3. Create a Named Tunnel

```bash
cloudflared tunnel create connectivity-api
# Note the tunnel UUID printed, e.g.:
#   Created tunnel connectivity-api with id a1b2c3d4-...
```

---

## 4. Configure the Tunnel

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # ← your tunnel UUID
credentials-file: /root/.cloudflared/a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  - hostname: api.yourdomain.com   # ← replace with your chosen hostname
    service: http://localhost:3000
  - service: http_status:404
```

> **Tip:** You can name the hostname anything — it doesn't have to be `api.`.
> Common choices: `api.yourdomain.com`, `backend.yourdomain.com`.

---

## 5. Add a DNS Record

```bash
cloudflared tunnel route dns connectivity-api api.yourdomain.com
```

This creates a `CNAME` in your Cloudflare DNS pointing
`api.yourdomain.com → <tunnel-uuid>.cfargotunnel.com`.

---

## 6. Run the Tunnel (test)

```bash
cloudflared tunnel run connectivity-api
```

Visit `https://api.yourdomain.com/health` — you should get:

```json
{ "status": "ok", "timestamp": "2025-..." }
```

---

## 7. Run as a System Service (production)

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## 8. Configure CORS

Set the `ALLOWED_ORIGINS` environment variable in your Docker container to match
your Cloudflare Pages URL:

```bash
# docker-compose.yml → environment:
ALLOWED_ORIGINS: "https://your-pages-app.pages.dev,https://yourdomain.com"
```

Or if you're still iterating, `ALLOWED_ORIGINS=*` is fine.

---

## 9. Set the Frontend API URL

In your Cloudflare Pages project settings:

1. Go to **Settings → Environment variables**
2. Add:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://api.yourdomain.com` |

3. Trigger a new deployment (or use the **Retry deployment** button).

---

## 10. Full Request Flow

```
Browser (Cloudflare Pages)
  │  HTTPS
  ▼
Cloudflare Edge (api.yourdomain.com)
  │  Cloudflare Tunnel (encrypted WebSocket)
  ▼
cloudflared daemon on Hetzner VPS
  │  localhost
  ▼
Node.js API  :3000
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `net::ERR_FAILED` in browser | CORS — verify `ALLOWED_ORIGINS` includes your Pages URL |
| 502 Bad Gateway from Cloudflare | API not running — `docker compose ps`, `curl localhost:3000/health` |
| Tunnel not connecting | `sudo systemctl status cloudflared`, check credentials file path |
| DNS not resolving | Wait a minute for propagation, then `dig api.yourdomain.com` |
| `/whoami` shows no `cf-*` headers | Traffic is not going through Cloudflare — check DNS proxy (orange cloud) |

---

## Expected Endpoint Outputs

### `GET /health`
```json
{ "status": "ok", "timestamp": "2025-01-01T12:00:00.000Z" }
```

### `GET /whoami`
```json
{
  "method": "GET",
  "ip": "...",
  "headers": { "cf-ray": "...", "cf-visitor": "...", ... },
  "cloudflareHeaders": { "cf-ray": "...", "cf-connecting-ip": "..." }
}
```

### `GET /cors-test`
```json
{
  "cors": "ok",
  "receivedOrigin": "https://your-pages-app.pages.dev",
  "allowedOrigins": ["https://your-pages-app.pages.dev"]
}
```

### `POST /echo` (body: `{"hello":"world"}`)
```json
{
  "echo": { "hello": "world" },
  "contentType": "application/json",
  "receivedAt": "2025-01-01T12:00:00.000Z"
}
```
