CREATE TRIGGER finish_reviewed_plan AFTER UPDATE OF status ON tasks
WHEN OLD.status='Proposed' AND NEW.plan_id IS NOT NULL AND NEW.status IN ('Pending','Available','Rejected') BEGIN
  UPDATE tasks SET status=CASE WHEN EXISTS(SELECT 1 FROM tasks WHERE plan_id=NEW.plan_id AND status!='Rejected')
    THEN 'Accepted' ELSE 'Rejected' END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE task_id=NEW.plan_id AND status='Submitted' AND is_planning=1
    AND NOT EXISTS(SELECT 1 FROM tasks WHERE plan_id=NEW.plan_id AND status='Proposed');
END;

CREATE VIEW eligible_contributions AS
SELECT p.id pr_id,p.task_id,p.challenge_id,p.submitted_by_github_id github_id,p.self_reported_model,
  e.kind,e.merge_sha,e.parents,e.method,e.limitations,t.title_json,t.description_json,
  v.id run_id,v.verifier_version,v.metrics_json,attempt.progress_notes summary
FROM pull_requests p JOIN challenges h ON h.id=p.challenge_id
JOIN tasks t ON t.task_id=p.task_id AND t.challenge_id=p.challenge_id
JOIN task_attempts attempt ON attempt.task_id=t.task_id AND attempt.pr_url=p.pr_url AND attempt.head_sha=p.head_sha
  AND attempt.owner_github_id=p.submitted_by_github_id AND attempt.outcome='submitted'
JOIN merged_evidence e ON e.repo=p.repo_full_name AND e.number=p.pr_number AND e.head=p.head_sha
  AND e.github_id=p.submitted_by_github_id AND e.task_id=p.task_id AND e.agent_id=attempt.agent_id
JOIN users reviewer ON reviewer.github_id=e.reviewer_id AND reviewer.role IN ('maintainer','admin')
JOIN verification_runs v ON v.pull_request_id=p.id AND v.head_sha=p.head_sha AND v.workflow_name=h.trusted_workflow_name
WHERE h.status='Active' AND e.reviewed=1 AND e.merge_sha IS NOT NULL AND t.is_planning=0 AND t.status IN ('Submitted','Verifying','Rejected')
  AND v.conclusion='success'
  AND v.github_check_run_id=CAST((SELECT run_id FROM check_evidence WHERE repo=e.repo AND head=e.head AND name=h.trusted_workflow_name
    ORDER BY completed_at DESC,run_id DESC LIMIT 1) AS TEXT)
  AND (e.kind!='Counterexample' OR json_extract(v.metrics_json,'$.accepted')=1)
  AND (e.kind!='RecordImprovement' OR (json_extract(v.metrics_json,'$.accepted')=1 AND
    json_type(v.metrics_json,'$.score') IN ('real','integer') AND
    (json_extract(h.record_info_json,'$.currentBestValue') IS NULL OR CASE json_extract(h.record_info_json,'$.scoreDirection')
      WHEN 'higher' THEN json_extract(v.metrics_json,'$.score')>json_extract(h.record_info_json,'$.currentBestValue')
      ELSE json_extract(v.metrics_json,'$.score')<json_extract(h.record_info_json,'$.currentBestValue') END)))
  AND NOT EXISTS(SELECT 1 FROM json_each(e.parents) j WHERE NOT EXISTS(SELECT 1 FROM contributions parent
    WHERE parent.id=j.value AND parent.challenge_id=p.challenge_id))
  AND NOT EXISTS(SELECT 1 FROM contributions WHERE task_id=t.task_id OR pull_request_id=p.id);

CREATE TRIGGER publish_contribution AFTER INSERT ON contributions BEGIN
  INSERT INTO contribution_dependencies(contribution_id,parent_contribution_id)
    SELECT NEW.id,j.value FROM pull_requests p JOIN merged_evidence e ON e.repo=p.repo_full_name AND e.number=p.pr_number,
      json_each(e.parents) j WHERE p.id=NEW.pull_request_id;
  INSERT INTO research_artifacts(id,challenge_id,contribution_id,task_id,author_github_id,kind,status,title_json,summary_json,
    method_notes_json,limitations_json,parent_artifact_ids_json,verifier_version)
    SELECT 'artifact_'||NEW.id,NEW.challenge_id,NEW.id,NEW.task_id,NEW.contributor_github_id,
    CASE NEW.contribution_type WHEN 'FailedApproach' THEN 'FailedApproach' WHEN 'Counterexample' THEN 'Counterexample'
      WHEN 'PruningStrategy' THEN 'PruningStrategy' WHEN 'SearchAlgorithm' THEN 'Algorithm' WHEN 'MathematicalLemma' THEN 'Lemma'
      WHEN 'RecordImprovement' THEN 'CandidateSolution' ELSE 'Experiment' END,
    NEW.status,NEW.title_json,NEW.summary_json,json_object('en',e.method,'zh',e.method),json_object('en',e.limitations,'zh',e.limitations),
    (SELECT json_group_array('artifact_'||value) FROM json_each(e.parents)),NEW.verifier_version
    FROM pull_requests p JOIN merged_evidence e ON e.repo=p.repo_full_name AND e.number=p.pr_number WHERE p.id=NEW.pull_request_id;
  INSERT INTO credentials(id,contribution_id,contributor_github_id,challenge_id)
    VALUES('ci-cred-'||NEW.id,NEW.id,NEW.contributor_github_id,NEW.challenge_id);
  INSERT OR IGNORE INTO user_badges(id,github_id,badge_code,challenge_id,contribution_id,credential_id,serial_number)
    SELECT lower(hex(randomblob(16))),NEW.contributor_github_id,'founding_contributor',NEW.challenge_id,NEW.id,'ci-cred-'||NEW.id,
      coalesce(max(serial_number),0)+1 FROM user_badges WHERE badge_code='founding_contributor'
      HAVING coalesce(max(serial_number),0)<100;
  INSERT OR IGNORE INTO user_badges(id,github_id,badge_code,challenge_id,contribution_id,credential_id)
    SELECT lower(hex(randomblob(16))),NEW.contributor_github_id,code,NEW.challenge_id,NEW.id,'ci-cred-'||NEW.id FROM badges
      WHERE (code='first_discovery' AND NOT EXISTS(SELECT 1 FROM user_badges WHERE github_id=NEW.contributor_github_id AND badge_code='first_discovery'))
      OR (code='pathfinder' AND NEW.contribution_type IN ('PruningStrategy','MathematicalLemma'))
      OR (code='verifier' AND NEW.contribution_type IN ('IndependentVerification','Counterexample'))
      OR (code='record_breaker' AND NEW.contribution_type='RecordImprovement');
  INSERT OR IGNORE INTO user_badges(id,github_id,badge_code,challenge_id,contribution_id,credential_id)
    WITH RECURSIVE lineage(id) AS (SELECT NEW.id UNION SELECT d.parent_contribution_id FROM contribution_dependencies d JOIN lineage l ON l.id=d.contribution_id)
    SELECT lower(hex(randomblob(16))),c.contributor_github_id,'breakthrough_contributor',NEW.challenge_id,c.id,'ci-cred-'||c.id
      FROM lineage JOIN contributions c USING(id) WHERE NEW.contribution_type='RecordImprovement';
  UPDATE challenges SET record_info_json=json_set(record_info_json,'$.currentBestValue',
    (SELECT json_extract(metrics_json,'$.score') FROM verification_runs WHERE id=NEW.verification_run_id),
    '$.currentBestDisplay',(SELECT CAST(json_extract(metrics_json,'$.score') AS TEXT) FROM verification_runs WHERE id=NEW.verification_run_id),
    '$.attribution',(SELECT username FROM users WHERE github_id=NEW.contributor_github_id),'$.recordedAt',substr(NEW.accepted_at,1,10),
    '$.sourceUrl',(SELECT pr_url FROM pull_requests WHERE id=NEW.pull_request_id),'$.sourceLabel','Verified PR'),
    record_history_json=json_insert(record_history_json,'$[#]',json_object('date',substr(NEW.accepted_at,1,10),
    'score',(SELECT json_extract(metrics_json,'$.score') FROM verification_runs WHERE id=NEW.verification_run_id),
    'label',json_extract(NEW.title_json,'$.en'),'attribution',(SELECT username FROM users WHERE github_id=NEW.contributor_github_id),
    'sourceUrl',(SELECT pr_url FROM pull_requests WHERE id=NEW.pull_request_id))),updated_at=NEW.accepted_at
    WHERE id=NEW.challenge_id AND NEW.contribution_type='RecordImprovement';
  UPDATE tasks SET status='Accepted',updated_at=NEW.accepted_at WHERE task_id=NEW.task_id;
  INSERT INTO task_attempts(id,task_id,lease_id,agent_id,owner_github_id,outcome)
    SELECT 'accepted_'||NEW.id,NEW.task_id,lease_id,agent_id,NEW.contributor_github_id,'accepted'
    FROM task_attempts WHERE task_id=NEW.task_id AND outcome='submitted' AND owner_github_id=NEW.contributor_github_id LIMIT 1;
  INSERT INTO activity_events(id,event_type,challenge_id,actor_github_id,task_id,pull_request_id,credential_id,summary_json)
    VALUES(NEW.id,'contribution_accepted',NEW.challenge_id,NEW.contributor_github_id,NEW.task_id,NEW.pull_request_id,'ci-cred-'||NEW.id,NEW.summary_json);
  INSERT INTO activity_events(id,event_type,challenge_id,actor_github_id,task_id,pull_request_id,credential_id,summary_json)
    SELECT 'record_'||NEW.id,'record_broken',NEW.challenge_id,NEW.contributor_github_id,NEW.task_id,NEW.pull_request_id,'ci-cred-'||NEW.id,NEW.title_json
    WHERE NEW.contribution_type='RecordImprovement';
END;
CREATE TRIGGER announce_badge AFTER INSERT ON user_badges BEGIN
  INSERT INTO activity_events(id,event_type,challenge_id,actor_github_id,credential_id,badge_code,summary_json)
  SELECT 'badge_'||NEW.id,'badge_awarded',NEW.challenge_id,NEW.github_id,NEW.credential_id,NEW.badge_code,name_json FROM badges WHERE code=NEW.badge_code;
END;
