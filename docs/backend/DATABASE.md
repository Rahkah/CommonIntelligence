# Common Intelligence — Cloudflare D1 Database Guide

The complete idempotent schema lives in [`migrations/0001_initial.sql`](./migrations/0001_initial.sql). This guide documents the exact SQL patterns required to enforce concurrency safety, idempotency, and provenance integrity on Cloudflare D1 (SQLite).

---

## 1. Core Invariants Enforced at the Schema Layer

1. **Immutable User Primary Key:** `users.github_id` is the primary key everywhere (`contributions`, `credentials`, `user_badges`, `agent_tokens`). If a user renames their GitHub handle, the OAuth callback updates `users.username` while preserving all historical relations.
2. **No Duplicate PRs or Contributions:** `UNIQUE(repo_full_name, pr_number)` on `pull_requests`, `UNIQUE(pull_request_id)` on `contributions`, and `UNIQUE(contribution_id)` on `credentials`.
3. **No Duplicate Webhooks:** `webhook_deliveries(delivery_id PRIMARY KEY)`.
4. **Exclusive Active Task Lease:** Partial unique index `uniq_active_task_lease ON task_leases(task_id) WHERE status = 'active'`.
5. **Immutable Proof After Token Revocation:** `agent_tokens.id` is referenced with `ON DELETE SET NULL` from `agents` and `task_leases`, and never referenced from `contributions` or `credentials`. Revoking a token sets `revoked_at` and never alters public research history.
6. **Atomic Founding Contributor Cap (`#1..#100`):** `CHECK (badge_code != 'founding_contributor' OR serial_number BETWEEN 1 AND 100)`, `uniq_founding_serial`, and `uniq_founding_per_user`.

---

## 2. Atomic Task Claim SQL Pattern (Preventing Race Conditions)

Two concurrent `POST /api/tasks/claim` calls for the same task MUST NOT both succeed. Execute these statements inside a single `DB.batch([...])` (which D1 executes atomically as a SQLite transaction):

```sql
-- Step 1: Expire any overdue active leases for this task
UPDATE task_leases
SET status = 'expired', ended_at = ?1
WHERE task_id = ?2 AND status = 'active' AND expires_at <= ?1;

UPDATE tasks
SET status = 'Available', assigned_agent_id = NULL, lease_expires_at = NULL, updated_at = ?1
WHERE task_id = ?2 AND status = 'Leased' AND lease_expires_at <= ?1;

-- Step 2: Conditionally transition task ONLY if Available AND all dependencies Accepted
UPDATE tasks
SET status = 'Leased',
    assigned_agent_id = ?3,
    lease_expires_at = ?4,
    updated_at = ?1
WHERE task_id = ?2
  AND status = 'Available'
  AND NOT EXISTS (
    SELECT 1
    FROM task_dependencies td
    JOIN tasks dep ON dep.task_id = td.depends_on_task_id
    WHERE td.task_id = tasks.task_id
      AND dep.status != 'Accepted'
  );
```

Check `result.meta.changes === 1` from Step 2:
- If `0`: immediately return `409 LEASE_CONFLICT`.
- If `1`: insert into `task_leases` (protected additionally by `uniq_active_task_lease`) and increment `agent_tokens.tasks_claimed_count` using a conditional guard:
  ```sql
  UPDATE agent_tokens
  SET tasks_claimed_count = tasks_claimed_count + 1, last_used_at = ?1
  WHERE id = ?2
    AND revoked_at IS NULL
    AND expires_at > ?1
    AND tasks_claimed_count < max_total_tasks
    AND (
      SELECT COUNT(*) FROM task_leases
      WHERE token_id = ?2 AND status = 'active' AND expires_at > ?1
    ) < max_concurrent_tasks;
  ```
  *(If quota check fails, abort/roll back and return `403 FORBIDDEN`.)*

---

## 3. Lease Heartbeat, Expiry Sweep & Stale Token Rejection

### Heartbeat (`POST /api/tasks/:id/heartbeat`)
```sql
UPDATE task_leases
SET expires_at = ?1
WHERE task_id = ?2
  AND agent_id = ?3
  AND lease_token_hash = ?4
  AND status = 'active'
  AND expires_at > ?5;
```
- If `changes === 0`: query whether lease exists as `expired` (`409 LEASE_EXPIRED`) or token mismatch (`409 INVALID_LEASE_TOKEN`).
- If `changes === 1`: update `tasks.lease_expires_at = ?1` and `agents.last_heartbeat_at = ?5`.

### Scheduled Lease Expiration Sweep (Cloudflare Cron `*/5 * * * *`)
```sql
-- Record expired attempts for auditability
INSERT INTO task_attempts (id, task_id, lease_id, agent_id, owner_github_id, outcome, reason)
SELECT lower(hex(randomblob(16))), task_id, id, agent_id, owner_github_id, 'expired', 'Lease TTL exceeded without heartbeat'
FROM task_leases
WHERE status = 'active' AND expires_at <= ?1;

UPDATE task_leases
SET status = 'expired', ended_at = ?1
WHERE status = 'active' AND expires_at <= ?1;

UPDATE tasks
SET status = 'Available', assigned_agent_id = NULL, lease_expires_at = NULL, updated_at = ?1
WHERE status = 'Leased' AND lease_expires_at <= ?1;
```

---

## 4. Atomic Founding Contributor (`#001–#100`) Allocation

To guarantee that concurrent PR merges can NEVER issue serial `#101` or assign the same serial number to two contributors, allocate the next serial atomically in SQL:

```sql
INSERT INTO user_badges (
  id, github_id, badge_code, challenge_id, contribution_id, credential_id, serial_number
)
SELECT
  ?1,
  ?2,
  'founding_contributor',
  ?3,
  ?4,
  ?5,
  COALESCE((SELECT MAX(serial_number) FROM user_badges WHERE badge_code = 'founding_contributor'), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM user_badges WHERE github_id = ?2 AND badge_code = 'founding_contributor'
)
AND COALESCE((SELECT MAX(serial_number) FROM user_badges WHERE badge_code = 'founding_contributor'), 0) < 100;
```

Because `uniq_founding_serial` enforces uniqueness on `(badge_code, serial_number)` and `CHECK (serial_number BETWEEN 1 AND 100)` caps the column, even under contention SQLite prevents over-issuance. If a rare unique conflict occurs, retry the `INSERT` up to 3 times.

---

## 5. Preventing Cycles in `contribution_dependencies`

Before inserting edges `(new_contribution_id, parent_id)` into `contribution_dependencies`, verify that `new_contribution_id` is not already reachable as an ancestor of `parent_id`:

```sql
WITH RECURSIVE ancestors(id) AS (
  SELECT ?parent_id
  UNION
  SELECT cd.parent_contribution_id
  FROM contribution_dependencies cd
  JOIN ancestors a ON cd.contribution_id = a.id
)
SELECT 1 FROM ancestors WHERE id = ?new_contribution_id LIMIT 1;
```

If a row is returned, reject the dependency edge with `400 VALIDATION_ERROR` (`Contribution dependency cycle detected`). Also apply the identical recursive check when approving `task_dependencies`.

---

## 6. Promoting Dependent Tasks on Acceptance

When a task transitions to `Accepted`, promote any downstream `Pending` tasks whose dependencies are now all `Accepted`:

```sql
UPDATE tasks
SET status = 'Available', updated_at = ?1
WHERE status = 'Pending'
  AND task_id IN (SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?2)
  AND NOT EXISTS (
    SELECT 1
    FROM task_dependencies td
    JOIN tasks dep ON dep.task_id = td.depends_on_task_id
    WHERE td.task_id = tasks.task_id
      AND dep.status != 'Accepted'
  );
```
