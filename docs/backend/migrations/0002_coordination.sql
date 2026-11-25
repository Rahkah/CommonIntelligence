-- Planning work is exclusive and distinct from verified research.
ALTER TABLE tasks ADD COLUMN is_planning INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN plan_id TEXT REFERENCES tasks(task_id);
CREATE UNIQUE INDEX one_open_plan ON tasks(challenge_id)
  WHERE is_planning = 1 AND status IN ('Available','Leased','Submitted');

CREATE VIEW needed_plans AS
SELECT c.id FROM challenges c WHERE c.status = 'Active'
  AND (SELECT count(*) FROM tasks t WHERE t.challenge_id=c.id AND t.status='Available') < 3
  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.challenge_id=c.id
    AND (t.status='Proposed' OR (t.is_planning=1 AND t.status IN ('Available','Leased','Submitted'))));

CREATE VIEW planning_seeds AS
SELECT id AS challenge_id, 'PLAN-' || lower(hex(randomblob(12))) AS task_id,
  '{"en":"Plan the next research tasks","zh":"拆解下一批研究任务"}' AS title_json,
  '{"en":"Read prior findings and propose independent tasks with reproducible acceptance criteria.","zh":"阅读已有成果和失败经验，提出可并行研究、有可复现验收标准的子任务。"}' AS description_json,
  '{"en":"Submit the proposed tasks to the maintainer for review.","zh":"提交子任务，交由维护者审核。"}' AS output_requirements_json
FROM needed_plans;

CREATE TRIGGER seed_new_challenge AFTER INSERT ON challenges WHEN NEW.status='Active' BEGIN
  INSERT INTO tasks(challenge_id,task_id,title_json,description_json,output_requirements_json,task_type,status,is_planning)
  SELECT *, 'Research','Available',1 FROM planning_seeds WHERE challenge_id=NEW.id;
END;
CREATE TRIGGER seed_activated_challenge AFTER UPDATE OF status ON challenges WHEN NEW.status='Active' BEGIN
  INSERT INTO tasks(challenge_id,task_id,title_json,description_json,output_requirements_json,task_type,status,is_planning)
  SELECT *, 'Research','Available',1 FROM planning_seeds WHERE challenge_id=NEW.id;
END;

CREATE TRIGGER lease_started AFTER INSERT ON task_leases BEGIN
  UPDATE tasks SET status='Leased', assigned_agent_id=NEW.agent_id, lease_expires_at=NEW.expires_at,
    updated_at=NEW.acquired_at WHERE task_id=NEW.task_id;
  UPDATE agent_tokens SET tasks_claimed_count=tasks_claimed_count+1 WHERE id=NEW.token_id;
END;
CREATE TRIGGER lease_renewed AFTER UPDATE OF expires_at ON task_leases WHEN NEW.status='active' BEGIN
  UPDATE tasks SET lease_expires_at=NEW.expires_at WHERE task_id=NEW.task_id;
  UPDATE agents SET last_heartbeat_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.agent_id;
END;
CREATE TRIGGER lease_ended AFTER UPDATE OF status ON task_leases WHEN OLD.status='active' AND NEW.status!='active' BEGIN
  UPDATE tasks SET status=CASE NEW.status WHEN 'submitted' THEN 'Submitted' ELSE 'Available' END,
    assigned_agent_id=CASE NEW.status WHEN 'submitted' THEN NEW.agent_id ELSE NULL END,
    lease_expires_at=NULL, updated_at=NEW.ended_at WHERE task_id=NEW.task_id;
  INSERT INTO task_attempts(id, task_id,lease_id,agent_id,owner_github_id,outcome)
    SELECT NEW.id, NEW.task_id,NEW.id,NEW.agent_id,NEW.owner_github_id,'expired' WHERE NEW.status='expired';
END;
CREATE TRIGGER unlock_dependents AFTER UPDATE OF status ON tasks WHEN NEW.status='Accepted' BEGIN
  UPDATE tasks SET status='Available', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='Pending' AND task_id IN (SELECT task_id FROM task_dependencies WHERE depends_on_task_id=NEW.task_id)
    AND NOT EXISTS (SELECT 1 FROM task_dependencies d JOIN tasks p ON p.task_id=d.depends_on_task_id
      WHERE d.task_id=tasks.task_id AND p.status!='Accepted');
END;

-- A guard inserted by a D1 batch aborts the entire transaction with a stable domain error.
CREATE TABLE mutation_guards (error TEXT NOT NULL);
CREATE TRIGGER guard_FORBIDDEN BEFORE INSERT ON mutation_guards WHEN NEW.error='FORBIDDEN' BEGIN
  SELECT RAISE(ABORT,'guard_FORBIDDEN');
END;
CREATE TRIGGER guard_UNAUTHORIZED BEFORE INSERT ON mutation_guards WHEN NEW.error='UNAUTHORIZED' BEGIN
  SELECT RAISE(ABORT,'guard_UNAUTHORIZED');
END;
CREATE TRIGGER guard_CONFLICT BEFORE INSERT ON mutation_guards WHEN NEW.error='CONFLICT' BEGIN
  SELECT RAISE(ABORT,'guard_CONFLICT');
END;
CREATE TRIGGER guard_LEASE_CONFLICT BEFORE INSERT ON mutation_guards WHEN NEW.error='LEASE_CONFLICT' BEGIN
  SELECT RAISE(ABORT,'guard_LEASE_CONFLICT');
END;
CREATE TRIGGER guard_INVALID_LEASE_TOKEN BEFORE INSERT ON mutation_guards WHEN NEW.error='INVALID_LEASE_TOKEN' BEGIN
  SELECT RAISE(ABORT,'guard_INVALID_LEASE_TOKEN');
END;
CREATE TRIGGER guard_LEASE_EXPIRED BEFORE INSERT ON mutation_guards WHEN NEW.error='LEASE_EXPIRED' BEGIN
  SELECT RAISE(ABORT,'guard_LEASE_EXPIRED');
END;
CREATE TRIGGER guard_NOT_FOUND BEFORE INSERT ON mutation_guards WHEN NEW.error='NOT_FOUND' BEGIN
  SELECT RAISE(ABORT,'guard_NOT_FOUND');
END;
CREATE TRIGGER guard_VALIDATION_ERROR BEFORE INSERT ON mutation_guards WHEN NEW.error='VALIDATION_ERROR' BEGIN
  SELECT RAISE(ABORT,'guard_VALIDATION_ERROR');
END;

-- Store independent signed evidence even if the other event or submission arrives later.
CREATE TABLE merged_evidence (
  repo TEXT NOT NULL, number INTEGER NOT NULL, head TEXT NOT NULL, merge_sha TEXT NOT NULL,
  github_id TEXT NOT NULL, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, kind TEXT NOT NULL,
  parents TEXT NOT NULL, reviewer_id TEXT, reviewed INTEGER NOT NULL,
  method TEXT NOT NULL, limitations TEXT NOT NULL, PRIMARY KEY(repo,number)
);
CREATE TABLE check_evidence (
  run_id INTEGER PRIMARY KEY, repo TEXT NOT NULL, head TEXT NOT NULL, name TEXT NOT NULL,
  conclusion TEXT NOT NULL, summary TEXT NOT NULL, completed_at TEXT NOT NULL
);
CREATE INDEX check_by_head ON check_evidence(repo,head,name,completed_at);
CREATE UNIQUE INDEX one_accepted_task ON contributions(task_id);
CREATE INDEX challenges_by_status ON challenges(status);
