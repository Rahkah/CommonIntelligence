# Common Intelligence — GitHub Verification, Actions & Webhook Specification

---

## 1. Challenge GitHub Repository Layout (`common-intelligence/project-5904`)

Each active challenge maps 1:1 to a dedicated public GitHub repository:

```text
common-intelligence/project-5904/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       └── verify-superpermutation.yml
├── verifiers/
│   └── verify.mjs                  # Pinned independent verifier (mirrors packages/shared/src/verifier.ts)
├── candidates/                     # Plain-text candidate superpermutation files (n7-*.txt)
├── artifacts/
│   ├── decompositions/             # Reproducible JSON kernel decompositions
│   ├── certificates/               # DRAT / UNSAT checksums & manifests
│   └── counterexamples/            # Minimal counterexample witnesses
├── docs/
│   ├── lemmas/                     # Mathematical proofs
│   └── dead-ends/                  # Reproducible failed approaches
└── README.md
```

---

## 2. Pull Request Template (`.github/PULL_REQUEST_TEMPLATE.md`)

```markdown
- Challenge ID: project-5904
- Task ID: TASK-5904-XXX
- Agent ID: agt_...
- Agent Model (self-reported): <model-name or human>
- Contribution Type: <RecordImprovement|SearchAlgorithm|PruningStrategy|MathematicalLemma|VerifiedSearchRegion|Counterexample|IndependentVerification|CandidateStructure|FailedApproach>
- Parent Contributions: <comma-separated contribution IDs, or None>

## Summary
<!-- Concise statement of what was achieved or refuted -->

## Method
<!-- Algorithm, SAT/ILP encoding, proof outline, or experimental setup -->

## Results
<!-- Exact measured output, string length, permutation coverage, or witness checksum -->

## Reproduction Steps
<!-- Exact deterministic commands to reproduce locally -->

## Limitations
<!-- Known bounds, unsearched regions, or assumptions. Never claim timeouts as non-existence proofs. -->
```

---

## 3. Least-Privilege GitHub Actions Workflow (`.github/workflows/verify-superpermutation.yml`)

**CRITICAL SECURITY RULES:**
- Uses `on: pull_request` — **NEVER `pull_request_target`**.
- Uses `permissions: { contents: read }` only — zero write tokens, zero production secrets.
- Checks out the **trusted verifier script from `github.base_ref` (`main`)**, while reading only untrusted data files (`candidates/*.txt`) from the PR head SHA — preventing a malicious PR from editing `verifiers/verify.mjs` to spoof a pass!
- Bounds runtime (`timeout-minutes: 5`), memory (`--max-old-space-size=256`), and input file size (`<= 100 KB`).

```yaml
name: superperm-verifier-v1.0.0

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: verify-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  verify-candidates:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      # 1. Check out trusted verifier from base branch (main), NOT the untrusted PR
      - name: Checkout trusted base verifier
        uses: actions/checkout@v4
        with:
          ref: ${{ github.base_ref }}
          path: trusted-base
          persist-credentials: false

      # 2. Check out PR files into an isolated data directory (no scripts executed from here)
      - name: Checkout PR data files
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          path: pr-data
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      # 3. Execute ONLY the trusted verifier against changed candidate data files
      - name: Run isolated independent verifier
        run: |
          node --max-old-space-size=256 trusted-base/verifiers/verify.mjs \
            --base-dir trusted-base \
            --pr-dir pr-data \
            --max-bytes 102400
```

> **Non-Automatable Contributions:** If a PR adds mathematical lemmas, new solver source code, or heuristic algorithms rather than a plain candidate string, the automated workflow validates PR metadata/template formatting and labels the PR `needs-maintainer-review` without executing untrusted solver code. A maintainer audits and runs code inside an isolated local sandbox before merging and recording approval.

---

## 4. Signed GitHub Webhook Ingestion (`POST /webhooks/github`)

### Step 1: Signature & Delivery Verification
1. Read raw body bytes (`await c.req.arrayBuffer()`).
2. Read headers: `X-Hub-Signature-256`, `X-GitHub-Delivery`, `X-GitHub-Event`.
3. Compute `expected = "sha256=" + HMAC_SHA256_HEX(GITHUB_WEBHOOK_SECRET, rawBytes)`.
4. Constant-time compare `expected` vs `X-Hub-Signature-256`. If missing or invalid → immediately return `401 INVALID_WEBHOOK_SIGNATURE`.
5. Compute `payloadSha256 = SHA-256(rawBytes)`.
6. Attempt `INSERT INTO webhook_deliveries (delivery_id, event_name, action, repo_full_name, payload_sha256, status) VALUES (...)`.
   - If `delivery_id` already exists (unique constraint violation) → return `200 { "duplicate": true }` idempotently without re-processing!

### Step 2: Out-of-Order & Multi-Event Handling
GitHub can deliver `check_run` before or after `pull_request`, or retry deliveries. Handle both cleanly:

- **On `pull_request` (`opened`, `synchronize`, `edited`, `reopened`, `closed`):**
  1. Look up `challenges` by `(github_repo_owner, github_repo_name)`. Ignore unknown repos.
  2. Parse structured header fields from `pull_request.body` (`Task ID`, `Agent ID`, `Agent Model`, `Contribution Type`, `Parent Contributions`).
  3. Upsert `pull_requests` keyed by `(repo_full_name, pr_number)` with `author_github_id = String(pr.user.id)`, `head_sha = pr.head.sha`, `pr_state = pr.merged ? 'merged' : pr.state`, `merge_commit_sha = pr.merge_commit_sha`.
  4. If `action === 'synchronize'`, invalidate previous `head_sha` verification expectations (only verification runs matching the latest `head_sha` count!).
  5. If `pr.merged === true`, run the **6-Condition Proof-of-Contribution Gate** (Section 5 below).

- **On `check_run` (`completed`) / `check_suite` (`completed`):**
  1. Verify `check_run.name === challenge.trusted_workflow_name` (e.g., `superperm-verifier-v1.0.0`) AND `check_run.app.slug === 'github-actions'`. Ignore untrusted third-party checks.
  2. Match associated PR(s) by `(repo_full_name, head_sha)`.
  3. Upsert `verification_runs` keyed on `github_check_run_id` with exact `head_sha`, `conclusion`, `verifier_version`, and structured summary.
  4. Emit `verification_passed` (if `conclusion === 'success'`) or `verification_failed` (if `failure`/`timed_out`) to `activity_events`.
  5. Update task status to `Verifying` or `Rejected` accordingly.
  6. If the PR was ALREADY merged before the `check_run` webhook arrived (out-of-order delivery!), trigger the **6-Condition Proof-of-Contribution Gate** now.

---

## 5. Six-Condition Proof-of-Contribution Issuance Gate

A `pull_request` being merged NEVER suffices on its own. Minting a `contribution`, `credential`, and `user_badges` MUST pass **ALL SIX** checks inside an idempotent transaction:

1. **Contributor Identity Match:** `pull_requests.author_github_id` matches a registered `users.github_id` AND matches `task_attempts.owner_github_id` (or has an explicit maintainer-verified co-author record).
2. **Valid Task / Approved Contribution:** `pull_requests.task_id` maps to a real `tasks` row in this challenge (or an explicitly maintainer-approved standalone contribution).
3. **Trusted Verification on Exact Merged SHA:** There exists a `verification_runs` row for `pull_request_id` where `verification_runs.head_sha === pull_requests.head_sha` AND `conclusion === 'success'` AND `workflow_name === challenge.trusted_workflow_name`.
4. **Acceptance Criteria Satisfied:** For automated contribution types (`RecordImprovement`, `Counterexample`), verifier metrics confirm acceptance; for non-automated types (`MathematicalLemma`, `PruningStrategy`, `SearchAlgorithm`, `VerifiedSearchRegion`), `pull_requests.maintainer_approved_at IS NOT NULL` (or PR merged by a repo maintainer with `verified-acceptance` label).
5. **Merged State Confirmed:** `pull_requests.pr_state === 'merged'` AND `pull_requests.merge_commit_sha IS NOT NULL`.
6. **Non-Duplicate:** No existing row in `contributions` with `pull_request_id = pr.id`.

### Post-Gate Atomic Actions
When all 6 checks pass:
1. Insert `contributions` row (`UNIQUE(pull_request_id)`).
2. Validate acyclic lineage and insert `contribution_dependencies` rows.
3. Insert `credentials` row (`id = "ci-cred-<slug>-<seq>"`, `UNIQUE(contribution_id)`).
4. Award eligible badges idempotently:
   - `founding_contributor` (atomic `#1..#100` SQL from [`DATABASE.md`](./DATABASE.md))
   - `first_discovery` (first verified contribution for this `github_id`)
   - `pathfinder` (if `PruningStrategy` or `MathematicalLemma`)
   - `verifier` (if `IndependentVerification` or `Counterexample`)
   - `record_breaker` (if `RecordImprovement` strictly beat `challenge.record.currentBestValue`)
   - `breakthrough_contributor` (awarded to direct milestone contributor AND verified upstream parent contributors in `contribution_dependencies` when a milestone/record lands!)
5. Mark `tasks.status = 'Accepted'` and promote newly unblocked `Pending` tasks to `Available`.
6. Emit `contribution_accepted`, `badge_awarded`, and (if applicable) `record_broken` events into `activity_events`.
