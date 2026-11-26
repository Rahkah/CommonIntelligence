export const users = `SELECT u.github_id githubId,username,display_name displayName,avatar_url avatarUrl,profile_url profileUrl,joined_at joinedAt,
  (SELECT count(*) FROM contributions WHERE contributor_github_id=u.github_id) verifiedContributionsCount,
  (SELECT count(*) FROM user_badges WHERE github_id=u.github_id) badgesCount,
  (SELECT json_group_array(DISTINCT challenge_id) FROM contributions WHERE contributor_github_id=u.github_id) challengesJoinedJson,
  (SELECT json_group_array(json_object('id',b.id,'code',badge_code,'serialNumber',serial_number,'awardedAt',awarded_at,
    'challengeSlug',c.slug,'contributionId',contribution_id,'credentialId',credential_id))
   FROM user_badges b JOIN challenges c ON c.id=b.challenge_id WHERE github_id=u.github_id) badgesJson FROM users u`;

export const agents = `SELECT a.id,a.owner_github_id ownerGithubId,u.username ownerUsername,a.label,
  a.self_reported_model selfReportedModel,a.self_reported_client selfReportedClient,a.registered_at registeredAt,
  a.last_heartbeat_at lastHeartbeatAt FROM agents a JOIN users u ON u.github_id=a.owner_github_id`;

export const publicAgents = `SELECT a.id,a.owner_github_id ownerGithubId,u.username ownerUsername,
  a.self_reported_model selfReportedModel,a.self_reported_client selfReportedClient,a.registered_at registeredAt,
  a.last_heartbeat_at lastHeartbeatAt FROM agents a JOIN users u ON u.github_id=a.owner_github_id`;

export const tokens = `SELECT id,name,token_prefix tokenPrefix,scopes_json scopesJson,max_concurrent_tasks maxConcurrentTasks,
  max_total_tasks maxTotalTasks,tasks_claimed_count tasksClaimedCount,budget_note budgetNote,created_at createdAt,
  expires_at expiresAt,last_used_at lastUsedAt,revoked_at revokedAt,
  CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired' ELSE 'active' END status
  FROM agent_tokens`;

export const tasks = `SELECT t.task_id taskId,t.challenge_id challengeId,t.title_json titleJson,t.description_json descriptionJson,
  t.task_type taskType,t.priority,t.status,(SELECT json_group_array(depends_on_task_id) FROM task_dependencies WHERE task_id=t.task_id) dependenciesJson,
  t.required_capabilities_json requiredCapabilitiesJson,t.recommended_class recommendedClass,t.effort_tier effortTier,
  t.supported_modes_json supportedModesJson,t.delivery_mode deliveryMode,t.output_schema_kind outputSchemaKind,
  t.verification_mode verificationMode,t.trigger_source triggerSource,t.trigger_ref_id triggerRefId,
  t.acceptance_criteria_json acceptanceCriteriaJson,t.input_artifacts_json inputArtifactsJson,
  t.output_requirements_json outputRequirementsJson,t.assigned_agent_id assignedAgentId,
  a.self_reported_model assignedAgentModelSelfReported,u.username assignedUserUsername,u.avatar_url assignedUserAvatarUrl,
  coalesce(t.proposed_by_github_id,pa.owner_github_id) proposedByGithubId,
  coalesce(pu.username,pau.username) proposedByUsername,
  coalesce(pu.avatar_url,pau.avatar_url) proposedByAvatarUrl,
  pa.id proposedByAgentId,pa.self_reported_model proposedByAgentModelSelfReported,
  coalesce(c.contributor_github_id,CASE WHEN t.is_planning=1 AND t.status='Accepted' THEN a.owner_github_id END) completedByGithubId,
  coalesce(cu.username,CASE WHEN t.is_planning=1 AND t.status='Accepted' THEN u.username END) completedByUsername,
  coalesce(cu.avatar_url,CASE WHEN t.is_planning=1 AND t.status='Accepted' THEN u.avatar_url END) completedByAvatarUrl,
  coalesce(c.self_reported_agent_model,CASE WHEN t.status='Accepted' THEN a.self_reported_model END,(SELECT ag.self_reported_model FROM task_attempts ta JOIN agents ag ON ag.id=ta.agent_id WHERE ta.task_id=t.task_id AND ta.outcome='accepted' ORDER BY ta.created_at DESC LIMIT 1)) completedByAgentModelSelfReported,
  coalesce(c.accepted_at,CASE WHEN t.is_planning=1 AND t.status='Accepted' THEN t.updated_at END) completedAt,
  c.id contributionId,cr.id credentialId,
  t.lease_expires_at leaseExpiresAt,
  (SELECT pr_url FROM pull_requests WHERE task_id=t.task_id ORDER BY created_at DESC LIMIT 1) prUrl,
  CASE t.is_planning WHEN 1 THEN 'true' ELSE 'false' END isPlanningJson,t.plan_id planId,t.created_at createdAt,t.updated_at updatedAt FROM tasks t
  LEFT JOIN agents a ON a.id=t.assigned_agent_id LEFT JOIN users u ON u.github_id=a.owner_github_id
  LEFT JOIN users pu ON pu.github_id=t.proposed_by_github_id
  LEFT JOIN tasks pt ON pt.task_id=t.plan_id LEFT JOIN agents pa ON pa.id=pt.assigned_agent_id LEFT JOIN users pau ON pau.github_id=pa.owner_github_id
  LEFT JOIN contributions c ON c.task_id=t.task_id LEFT JOIN users cu ON cu.github_id=c.contributor_github_id
  LEFT JOIN credentials cr ON cr.contribution_id=c.id`;

export const categories = `SELECT cc.id,cc.name_json nameJson,cc.description_json descriptionJson,cc.sort_order sortOrder,
  (SELECT count(*) FROM challenges ch WHERE ch.category=cc.id) challengesCount,
  cc.created_at createdAt,cc.updated_at updatedAt FROM challenge_categories cc`;

export const challenges = `SELECT c.id,slug,name,c.category,status,c.created_at createdAt,domain_json domainJson,tagline_json taglineJson,summary_json summaryJson,
  background_json backgroundJson,ultimate_goal_json ultimateGoalJson,record_info_json recordJson,record_history_json recordHistoryJson,
  rules_json rulesJson,scoring_metric_json scoringMetricJson,verification_method_json verificationMethodJson,
  contribution_criteria_json contributionCriteriaJson,c.showcase_json showcaseJson,'https://github.com/'||github_repo_owner||'/'||github_repo_name githubRepo,
  '/challenges/'||slug||'/join.txt' joinInstructionsPath,'false' isDemoStatsJson,
  json_object('contributorsCount',(SELECT count(DISTINCT contributor_github_id) FROM contributions WHERE challenge_id=c.id),
    'verifiedContributionsCount',(SELECT count(*) FROM contributions WHERE challenge_id=c.id),
    'openTasksCount',(SELECT count(*) FROM tasks WHERE challenge_id=c.id AND status='Available'),
    'activeLeasesCount',(SELECT count(*) FROM tasks WHERE challenge_id=c.id AND status='Leased'),
    'completedTasksCount',(SELECT count(*) FROM tasks WHERE challenge_id=c.id AND status='Accepted')) statsJson FROM challenges c`;

export const artifacts = `SELECT k.id,k.challenge_id challengeId,k.title_json titleJson,k.kind,k.status,k.summary_json summaryJson,
  k.method_notes_json methodNotesJson,k.limitations_json limitationsJson,k.author_github_id authorGithubId,u.username authorUsername,
  coalesce(c.self_reported_agent_model,k.self_reported_model) selfReportedAgentModel,p.pr_url prUrl,c.merge_commit_sha commitSha,k.verifier_version verifierVersion,
  k.parent_artifact_ids_json parentArtifactIdsJson,k.task_id taskId,k.submission_channel submissionChannel,k.role_class roleClass,
  k.verified_count verifiedCount,k.refuted_by_artifact_id refutedByArtifactId,k.created_at createdAt FROM research_artifacts k
  JOIN users u ON u.github_id=k.author_github_id LEFT JOIN contributions c ON c.id=k.contribution_id LEFT JOIN pull_requests p ON p.id=c.pull_request_id`;

export const contributions = `SELECT c.id,c.challenge_id challengeId,h.slug challengeSlug,h.name challengeName,c.task_id taskId,
  c.title_json titleJson,c.contribution_type contributionType,c.summary_json summaryJson,c.status,c.contributor_github_id contributorGithubId,
  u.username contributorUsername,u.avatar_url contributorAvatarUrl,c.self_reported_agent_model selfReportedAgentModel,p.pr_number prNumber,
  p.pr_url prUrl,c.merge_commit_sha commitSha,c.verifier_version verifierVersion,json_object('en',v.summary_text,'zh',v.summary_text) verificationSummaryJson,
  (SELECT json_group_array(parent_contribution_id) FROM contribution_dependencies WHERE contribution_id=c.id) parentContributionIdsJson,
  cr.id credentialId,c.accepted_at acceptedAt FROM contributions c JOIN users u ON u.github_id=c.contributor_github_id
  JOIN challenges h ON h.id=c.challenge_id JOIN pull_requests p ON p.id=c.pull_request_id JOIN verification_runs v ON v.id=c.verification_run_id
  LEFT JOIN credentials cr ON cr.contribution_id=c.id`;

export const credentials = `SELECT cr.id,cr.status,cr.status_note_json statusNoteJson,c.contributorGithubId,c.contributorUsername,c.contributorAvatarUrl,
  u.profile_url contributorProfileUrl,c.challengeId,c.challengeSlug,c.challengeName,c.id contributionId,c.titleJson contributionTitleJson,
  c.contributionType,c.summaryJson contributionSummaryJson,c.taskId,c.prUrl,c.commitSha,v.verification_run_id verificationRunId,
  c.verificationSummaryJson,c.verifierVersion,cr.issued_at issuedAt,c.parentContributionIdsJson,
  (SELECT json_group_array(badge_code) FROM user_badges WHERE credential_id=cr.id) badgesAwardedJson
  FROM credentials cr JOIN (${contributions}) c ON c.id=cr.contribution_id JOIN users u ON u.github_id=c.contributorGithubId
  JOIN contributions v ON v.id=c.id`;

export const activity = `SELECT e.id,e.event_type type,h.slug challengeSlug,h.id challengeId,h.name challengeName,u.username actorUsername,
  u.github_id actorGithubId,u.avatar_url actorAvatarUrl,a.self_reported_model selfReportedModel,
  CASE WHEN e.event_type='agent_registered'
    THEN json_object(
      'en',CASE WHEN a.self_reported_model IS NOT NULL AND trim(a.self_reported_model)!='' THEN 'Registered agent ('||a.self_reported_model||')' ELSE 'Registered agent' END,
      'zh',CASE WHEN a.self_reported_model IS NOT NULL AND trim(a.self_reported_model)!='' THEN '已注册 Agent（'||a.self_reported_model||'）' ELSE '已注册 Agent' END
    )
    ELSE e.summary_json
  END summaryJson,
  e.task_id taskId,p.pr_url prUrl,e.credential_id credentialId,e.badge_code badgeCode,e.created_at createdAt FROM activity_events e
  JOIN challenges h ON h.id=e.challenge_id JOIN users u ON u.github_id=e.actor_github_id LEFT JOIN agents a ON a.id=e.agent_id
  LEFT JOIN pull_requests p ON p.id=e.pull_request_id`;
