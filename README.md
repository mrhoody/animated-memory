# Cloudflare Tunnel Connectivity Tester

A minimal full-stack diagnostic app for testing connectivity between a **Cloudflare Pages** frontend and a **Hetzner VPS** backend joined by a **Cloudflare Tunnel**.

```
Browser (Cloudflare Pages)
  ↓ HTTPS
Cloudflare Edge (api.yourdomain.com)
  ↓ Cloudflare Tunnel
cloudflared on Hetzner VPS
  ↓ localhost
Node.js API :3000
```

---

## Repo Structure

```
.
├── backend/          Node 24 + Express API
│   ├── src/
│   │   └── server.ts
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/         Vite + React diagnostics UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── .env.example
├── docker-compose.yml
└── docs/
    └── cloudflare-tunnel.md   ← full tunnel setup guide
```

---

## Backend API

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Returns `{status:"ok", timestamp}` |
| `/whoami` | GET | Dumps method, headers, CF headers, client IP |
| `/cors-test` | GET | Confirms CORS, echoes request origin |
| `/echo` | POST | Echoes JSON body (tests POST + JSON parsing) |
| `/dns?hostname=` | GET | Resolves hostname from VPS (outbound DNS test) |
| `/fetch?url=` | GET | Fetches URL from VPS (outbound HTTP test) |

### Run Locally (no Docker)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
# API listens on http://localhost:3000
```

### Run with Docker Compose

```bash
docker compose up --build
# API listens on http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins (e.g. `https://app.pages.dev`) |

---

## Frontend

A Vite + React app with a button for every endpoint. Shows response data, HTTP status, and timing.

### Run Locally

```bash
cd frontend
cp .env.example .env
# Edit .env: VITE_API_BASE_URL=http://localhost:3000
npm install
npm run dev
# Opens http://localhost:5173
```

### Build for Cloudflare Pages

```bash
cd frontend
npm run build
# dist/ is your Pages output directory
```

#### Cloudflare Pages Settings

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |
| Environment variable | `VITE_API_BASE_URL=https://api.yourdomain.com` |

---

## Cloudflare Tunnel Setup

See **[docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md)** for a complete step-by-step guide including:

- Installing and authenticating `cloudflared`
- Creating and configuring a named tunnel
- DNS CNAME setup
- Running as a systemd service
- CORS configuration
- Troubleshooting table

---

## Quick Smoke Test (curl)

```bash
BASE=https://api.yourdomain.com

curl $BASE/health
curl $BASE/whoami
curl $BASE/cors-test -H "Origin: https://your-pages-app.pages.dev"
curl -X POST $BASE/echo \
  -H "Content-Type: application/json" \
  -d '{"hello":"world"}'
curl "$BASE/dns?hostname=cloudflare.com"
curl "$BASE/fetch?url=https://cloudflare.com"
```

---

## Diagnosing Failures

| Symptom | Likely Cause |
|---|---|
| `/health` returns 502 | API container not running — `docker compose ps` |
| `net::ERR_FAILED` in browser | CORS mismatch — check `ALLOWED_ORIGINS` |
| No `cf-ray` header in `/whoami` | Traffic not going through Cloudflare proxy |
| Tunnel keeps disconnecting | Check `systemctl status cloudflared`, rotate credentials |
