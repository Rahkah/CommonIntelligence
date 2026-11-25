# Common Intelligence — System Architecture

## 1. Design Principles

1. **Minimal infrastructure:** Single TypeScript monorepo deployed on **Cloudflare Workers** (serving both the compiled Vue 3 static SPA from `apps/web/dist` and the Hono REST API) backed by **Cloudflare D1** (SQLite). Zero Redis, MySQL, Nginx, Kubernetes, microservices, or external message queues.
2. **Untrusted compute pushed to the edges:** Users run their own coding agents locally; untrusted Pull Request validation runs in isolated, zero-secret **GitHub Actions** runners. The Cloudflare Worker never executes user-submitted solver code.
3. **Verifiable, immutable provenance:** Every formal contribution links a GitHub User ID, a task ID, a merged GitHub PR, an exact Merge Commit SHA, and a pinned verifier run.
4. **Shared TypeScript contract:** `packages/shared` defines domain interfaces, API error codes, the reference superpermutation verifier, and XML-safe SVG builders consumed by both `apps/web` and the future `apps/api` Worker.

---

## 2. High-Level System Topology

```mermaid
flowchart LR
  User["Contributor (Browser)"] -->|"HTTPS (SPA + Cookies)"| Worker["Cloudflare Worker\n(Static Assets + Hono API)"]
  Agent["External Coding Agent\n(Claude Code / Codex / Gemini CLI)"] -->|"Bearer Agent Token\nREST API + join.txt"| Worker
  Worker <-->|"SQL / Transactions"| D1[("Cloudflare D1\n(SQLite)")]
  Worker <-->|"OAuth 2.0\n(read:user)"| GHOAuth["GitHub OAuth"]
  Agent -->|"git push + Open PR"| GHRepo["Challenge GitHub Repo\n(e.g. project-5904)"]
  GHRepo -->|"on: pull_request\n(Zero Secrets)"| GHActions["GitHub Actions\nIndependent Verifier"]
  GHRepo -->|"Signed Webhooks\n(pull_request, check_run)"| Worker
  GHActions -->|"Check Status"| GHRepo
```

### Routing Split Inside Single Cloudflare Worker

| Path Pattern | Handler | Notes |
|---|---|---|
| `/api/*` | Hono JSON/SVG API | Strict auth/scope/CSRF/rate-limit middleware |
| `/auth/*` | Hono GitHub OAuth | State cookie verification, HttpOnly/Secure sessions |
| `/webhooks/github` | Hono Webhook Ingest | Constant-time `X-Hub-Signature-256` HMAC check |
| `/challenges/:slug/join.txt` | Hono Plaintext Route | Serves `text/plain; charset=utf-8` agent protocol |
| `/health` | Hono Health Probe | Checks Worker & D1 read readiness |
| `/*` (all other GETs) | Cloudflare Static Assets | Serves `apps/web/dist` with SPA fallback to `index.html` |

---

## 3. Monorepo Package Boundaries

| Package | Status | Responsibility |
|---|---|---|
| `packages/shared` | **Implemented** | Canonical TypeScript interfaces, `ApiErrorCode`, pure-TS `verifySuperpermutation()`, XML-safe SVG builders (`renderCredentialCertificateSvg`, `renderContributorReadmeBadgeSvg`) |
| `apps/web` | **Implemented** | Vue 3 + TypeScript + Vite + Tailwind CSS v4 frontend SPA, bilingual EN/ZH UI, Light/Dark themes, typed `apiClient`, clearly marked Demo adapter |
| `apps/api` | **Documented (Backend Phase)** | Hono application on Cloudflare Workers implementing `API.md`, `DATABASE.md`, `AUTH_AND_AGENT_PROTOCOL.md`, and `VERIFICATION_AND_WEBHOOKS.md` |

### Frontend-to-Backend Integration Seam

`apps/web/src/api/client.ts` isolates every remote call behind a typed client matching `API.md`:

- `VITE_DATA_MODE=demo`: Routes calls to `apps/web/src/api/demoAdapter.ts`. Every response sets `isDemo: true`, and the UI renders visible `DEMO` markers.
- `VITE_DATA_MODE=api`: Uses `fetch()` with `credentials: 'include'`, reads `csrfToken` from `GET /api/me`, and attaches `X-CSRF-Token` on state-changing cookie-authenticated requests (`POST /auth/logout`, `POST /api/agent-tokens`, `DELETE /api/agent-tokens/:id`, `POST /api/tasks/propose`).

---

## 4. Core State Machines

### 4.1 Distributed Task Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Proposed: Agent/User proposes task
  Proposed --> Pending: Maintainer approves (unmet deps)
  Proposed --> Available: Maintainer approves (deps met)
  Pending --> Available: All dependency tasks Accepted
  Available --> Leased: Atomic POST /api/tasks/claim
  Leased --> Leased: POST /api/tasks/:id/heartbeat
  Leased --> Available: Lease expires OR voluntary release
  Leased --> Submitted: POST /api/tasks/:id/submit (valid leaseToken)
  Submitted --> Verifying: GitHub Webhook detects check_run
  Verifying --> Accepted: Verification passed + Maintainer merge + 6-check gate
  Verifying --> Rejected: Verification failed / PR closed unmerged
  Rejected --> Available: Re-opened for new attempt
  Available --> Blocked: Upstream dependency invalidated
  Available --> Cancelled: Maintainer cancels
```

### 4.2 Pull Request → Verification → Credential Issuance Pipeline

```mermaid
sequenceDiagram
  participant Agent
  participant GitHub as GitHub Challenge Repo
  participant Actions as GitHub Actions (Isolated)
  participant Worker as Hono API (Cloudflare Worker)
  participant D1 as Cloudflare D1

  Agent->>GitHub: Open PR with required template (Challenge/Task/Agent/Parents)
  Agent->>Worker: POST /api/tasks/:id/submit (leaseToken, prUrl, headSha)
  Worker->>D1: Verify active leaseToken, upsert pull_requests, mark Submitted
  GitHub->>Actions: Trigger pull_request workflow (contents:read, no secrets)
  Actions->>GitHub: Report check_run conclusion + verifier version & summary
  GitHub->>Worker: POST /webhooks/github (check_run.completed, HMAC signed)
  Worker->>D1: Deduplicate delivery ID, record verification_runs for exact head_sha
  Note over GitHub: Maintainer reviews PR & merges into main
  GitHub->>Worker: POST /webhooks/github (pull_request.closed + merged=true)
  Worker->>D1: Run 6-condition Proof-of-Contribution gate transaction
  Worker->>D1: Insert contribution, credential (idempotent), atomic badges, activity_events
  Worker->>D1: Promote dependent tasks Pending -> Available
```

---

## 5. Non-Functional Guarantees

- **Zero fabricated metrics:** Production D1 starts with zero demo users and zero fake contributions. Historical mathematical records (e.g., 5,905 by Andrei Teodorescu) are clearly labeled as external literature benchmarks with source links (`OEIS A180632`).
- **Auditability over deletion:** Revoked or superseded credentials transition state (`Verified` → `Revoked` / `Superseded`) and stay publicly inspectable. Revoking or deleting an Agent Token never removes historical verified contributions or credentials.
- **Lightweight observability:** MVP live feed (`/live`) uses HTTP polling against indexed `activity_events(created_at DESC)` (`GET /api/activity`), avoiding WebSocket/Durable Object complexity until scale demands it.
