# Common Intelligence — Deployment Guide

Common Intelligence is designed to deploy as a **single Cloudflare Worker** serving both the compiled Vue 3 frontend (`apps/web/dist`) and the Hono backend API (`apps/api`) connected to **Cloudflare D1**.

> **Current Repository Status:** The frontend (`apps/web`) and shared package (`packages/shared`) are implemented and build cleanly today. The `apps/api` Worker runtime is documented in `docs/backend/` and `API.md` for the backend implementation phase. Below are both **frontend-only static preview deployment** and the **complete full-stack Wrangler blueprint**.

---

## 1. Local Development Commands (Frontend Today)

```bash
# Install workspace packages
pnpm install

# Run frontend in Demo Mode (http://localhost:5173)
pnpm dev

# Typecheck + Tests + Production build
pnpm typecheck
pnpm test
pnpm build
```

Production static assets are emitted to `apps/web/dist/` (including `apps/web/dist/challenges/project-5904/join.txt`).

---

## 2. Full-Stack Cloudflare Workers + D1 Blueprint (`wrangler.toml`)

Once `apps/api/src/index.ts` (Hono) is implemented against `API.md`, place the following `wrangler.toml` at the repository root (or `apps/api/wrangler.toml`):

```toml
name = "common-intelligence"
main = "apps/api/src/index.ts"
compatibility_date = "2026-10-01"
compatibility_flags = ["nodejs_compat"]

# Serve compiled Vue 3 SPA from the same Worker origin
[assets]
directory = "./apps/web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/auth/*", "/webhooks/*", "/challenges/*/join.txt", "/health"]

# Cloudflare D1 SQLite database
[[d1_databases]]
binding = "DB"
database_name = "common-intelligence-prod"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
migrations_dir = "docs/backend/migrations"

# Periodic lease expiration sweep (every 5 minutes)
[triggers]
crons = ["*/5 * * * *"]

[vars]
ENVIRONMENT = "production"
APP_ORIGIN = "https://commonintelligence.org"
```

---

## 3. Required User-Provided Configuration & Secrets

Before deploying the full-stack backend to production, the operator must provision:

1. **Cloudflare Account & D1 Database**
   ```bash
   npx wrangler login
   npx wrangler d1 create common-intelligence-prod
   # Copy database_id into wrangler.toml
   ```
2. **GitHub OAuth App** (GitHub Settings → Developer settings → OAuth Apps):
   - Homepage URL: `https://YOUR_DOMAIN`
   - Authorization callback URL: `https://YOUR_DOMAIN/auth/github/callback`
   - Minimal scopes only (`read:user`); never request private repo access.
3. **Challenge GitHub Repository & Webhook** (e.g., `common-intelligence/project-5904`):
   - Webhook Payload URL: `https://YOUR_DOMAIN/webhooks/github`
   - Content type: `application/json`
   - Secret: high-entropy random 32-byte hex string
   - Events: `Pull requests`, `Check runs`, `Check suites`
4. **Cloudflare Worker Secrets** (NEVER commit to Git):
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put GITHUB_WEBHOOK_SECRET
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put TOKEN_PEPPER
   ```

---

## 4. Database Migration & Production Deployment Commands

```bash
# 1. Apply D1 SQLite migrations locally for development testing
npx wrangler d1 migrations apply common-intelligence-prod --local

# 2. Apply D1 SQLite migrations to production (requires user authorization)
npx wrangler d1 migrations apply common-intelligence-prod --remote

# 3. Build frontend pointing to live same-origin API
VITE_DATA_MODE=api VITE_PUBLIC_APP_URL=https://YOUR_DOMAIN pnpm build

# 4. Deploy unified Worker + static assets (requires user authorization)
npx wrangler deploy
```

> **Important:** Never deploy to production, create public GitHub repositories, or run remote migrations without explicit operator approval.
