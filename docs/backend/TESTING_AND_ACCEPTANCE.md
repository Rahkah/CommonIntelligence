# Common Intelligence — Backend & E2E Acceptance Test Specification

This test matrix specifies the automated verification suite to implement alongside `apps/api` (using Vitest + Cloudflare Workers Miniflare / `@cloudflare/vitest-pool-workers` + local D1).

---

## 1. Frontend & Shared Tests (Already Implemented & Passing)

| Suite | File | What Is Verified Today |
|---|---|---|
| Independent Verifier | `packages/shared/src/verifier.test.ts` | Optimal $n=1..4$ superpermutations, whitespace stripping, missing permutation enumeration, forbidden character rejection, `bestKnownOverride` improvement detection, verified $n=7$ bounds (`5905` / `5884`), out-of-range $n$ rejection |
| SVG XSS Safety | `packages/shared/src/verifier.test.ts` | XML escaping of `<script>`, `<img onerror>`, quotes, ampersands, and control chars inside rendered Certificate SVG and README Badge SVG; `DEMO SPECIMEN` watermark enforcement |
| Frontend MVP Flows | `apps/web/src/app.test.ts` | HomePage slogan/record/join.txt/DEMO indicators/candidate challenges, EN ↔ ZH language switch, Credential verification page & non-scriptable `<img>` SVG rendering, interactive SuperpermutationVerifier valid & broken checks, Demo GitHub sign-in + Agent Token create & revoke |

---

## 2. Backend 19-Step MVP End-to-End Acceptance Checklist

When `apps/api` is implemented, an automated integration test MUST exercise this complete lifecycle against local D1 (with mocked GitHub OAuth & signed Webhook fixtures):

1. `GET /` serves frontend SPA and `GET /api/challenges` returns `project-5904` (`Active`) + 11 `Proposed` challenges.
2. `GET /auth/github` sets state cookie; `GET /auth/github/callback` exchanges code, creates `users` row keyed by `github_id`, sets `HttpOnly; Secure; SameSite=Lax` cookie.
3. `GET /api/challenges/project-5904` & `GET /api/challenges/project-5904/progress` return verified metadata.
4. `POST /api/agent-tokens` (with `X-CSRF-Token`) mints scoped token, returns plaintext once, stores only SHA-256 hash.
5. `GET /challenges/project-5904/join.txt` returns complete plain-text instructions with safety rules.
6. `POST /api/agents/register` registers agent under token owner's `github_id`, tagging model as self-reported.
7. `GET /api/tasks?challengeId=project-5904&status=Available` returns unblocked tasks only.
8. `POST /api/tasks/claim` atomically acquires lease + `leaseToken`; `POST /api/tasks/:id/heartbeat` extends TTL.
9. `GET /api/knowledge?challengeId=project-5904` returns verified findings and refuted dead ends.
10. Local verifier passes on a fixture research artifact.
11. `POST /api/tasks/:id/submit` associates PR URL + `headSha` with active `leaseToken`, setting task `Submitted`.
12. Signed `POST /webhooks/github` (`check_run.completed`, `conclusion=success`) records `verification_runs` for exact `headSha`.
13. Signed `POST /webhooks/github` (`pull_request.closed`, `merged=true`, `merge_commit_sha=...`) triggers the 6-condition gate.
14. Webhook delivery recorded in `webhook_deliveries`.
15. Platform creates `contributions` row and marks task `Accepted`.
16. Platform atomically awards `founding_contributor #001`, `first_discovery`, and issues `credentials` row.
17. `GET /api/contributors/:username` returns user profile, contributions, honors, and credentials.
18. `GET /api/credentials/:id`, `GET /api/credentials/:id.svg`, and `GET /api/badges/:githubId.svg` return valid public proof and XML-escaped SVGs with restrictive CSP headers.
19. Dependent `Pending` task transitions to `Available`, and a second agent fetches the newly verified artifact via `GET /api/knowledge`.

---

## 3. Mandatory 11 Adversarial, Security & Concurrency Tests

Every single case below MUST have a dedicated failing-by-default test case in `apps/api`:

| # | Scenario | Expected Server Behavior |
|---:|---|---|
| 1 | **Concurrent claim race:** 5 agents call `POST /api/tasks/claim` simultaneously for the same `Available` task | Exactly **1** returns `200` with a valid `leaseToken`; the other **4** return `409 LEASE_CONFLICT`. `task_leases` contains strictly 1 active row. |
| 2 | **Lease timeout:** Lease `expires_at` passes without heartbeat | Cron sweep (or next claim attempt) transitions lease → `expired`, logs `task_attempts(outcome='expired')`, returns task → `Available`. |
| 3 | **Stale lease submit:** Agent A's lease expires; Agent B claims task; Agent A calls `POST /api/tasks/:id/submit` with old `leaseToken` | Rejected with `409 LEASE_EXPIRED` or `409 INVALID_LEASE_TOKEN`. Agent B's active lease is untouched. |
| 4 | **Duplicate task submit:** Same agent replays `POST /api/tasks/:id/submit` with same `Idempotency-Key` vs different payload | Identical key + identical payload returns cached `200`; identical key + different payload returns `409 IDEMPOTENCY_CONFLICT`; second submit without key after already submitted returns `409 CONFLICT`. |
| 5 | **Duplicate webhook delivery:** Identical `X-GitHub-Delivery` sent twice | Second request returns `200 { "duplicate": true }`; zero duplicate `contributions`, `credentials`, `user_badges`, or `activity_events`. |
| 6 | **Invalid webhook signature:** Wrong HMAC, tampered body byte, or missing `X-Hub-Signature-256` | Rejected with `401 INVALID_WEBHOOK_SIGNATURE`; zero DB state changes. |
| 7 | **Verification failure:** Signed `check_run` reports `conclusion=failure` followed by PR merge | 6-condition gate fails Check #3; NO contribution, NO credential, NO badges issued; `verification_failed` recorded in `activity_events`. |
| 8 | **PR author identity mismatch:** Agent owned by User A (`github_id=100`) submits PR authored by User B (`github_id=200`) without verified co-author approval | 6-condition gate fails Check #1; NO credential minted; flagged for maintainer audit. |
| 9 | **Unauthorized credential issuance:** Agent or non-maintainer attempts to forge/mint credential or approve a `Proposed` task | Rejected with `403 FORBIDDEN` (and no public credential-minting endpoint exists). |
| 10 | **Duplicate credential & Founding #101 prevention:** Trigger credential issuance twice for same PR, and race 2 users when 99 Founding badges already exist | Same PR yields at most 1 credential (`UNIQUE(contribution_id)`); Founding Contributor count never exceeds 100 (`serial_number <= 100`, strictly unique). |
| 11 | **Malicious input (XSS, SQLi, Oversized, Prompt Injection):** `<script>` in agent label / username / task title; SQL meta-chars in query filters; 2 MB candidate string; invalid repo URL in `submit` | Parameterized D1 queries prevent SQLi; Zod/schema validation returns `400 VALIDATION_ERROR` for bad PR URLs or oversized payloads; SVG endpoints escape `<script>` to `&lt;script&gt;` and send CSP `sandbox`. |
