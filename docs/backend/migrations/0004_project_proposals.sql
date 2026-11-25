CREATE TABLE project_proposals (
  id TEXT PRIMARY KEY,
  author_github_id TEXT NOT NULL REFERENCES users(github_id),
  proposal_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
  submitted_at TEXT NOT NULL,
  reviewer_github_id TEXT REFERENCES users(github_id),
  reviewed_at TEXT,
  rejection_reason TEXT,
  challenge_id TEXT UNIQUE REFERENCES challenges(id),
  CHECK (
    (status='Pending' AND reviewer_github_id IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL AND challenge_id IS NULL)
    OR (status='Approved' AND reviewer_github_id IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL AND challenge_id IS NOT NULL)
    OR (status='Rejected' AND reviewer_github_id IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL AND challenge_id IS NULL)
  )
);
CREATE INDEX project_proposals_by_author ON project_proposals(author_github_id, submitted_at DESC, id);
CREATE INDEX project_proposals_by_status ON project_proposals(status, submitted_at, id);
