import { z } from 'zod';
import type { Challenge } from '@common-intelligence/shared';
import { guard, sql } from './core';

export const challengeSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const githubRepository = z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);

type ChallengeToPublish = Pick<
  Challenge,
  'slug' | 'name' | 'status' | 'domain' | 'tagline' | 'summary' | 'background' |
  'ultimateGoal' | 'record' | 'rules' | 'scoringMetric' | 'verificationMethod' |
  'contributionCriteria' | 'githubRepo'
> & { trustedCheckName: string };

export function publishChallenge(db: D1Database, entry: ChallengeToPublish) {
  const [owner, repo] = new URL(entry.githubRepo).pathname.slice(1).split('/');
  return [
    guard(
      db,
      'CONFLICT',
      `NOT EXISTS(SELECT 1 FROM challenges WHERE id=? OR slug=? OR
        (github_repo_owner=? COLLATE NOCASE AND github_repo_name=? COLLATE NOCASE))`,
      entry.slug,
      entry.slug,
      owner,
      repo
    ),
    sql(
      db,
      `INSERT INTO challenges(id,slug,name,status,domain_json,tagline_json,summary_json,background_json,ultimate_goal_json,record_info_json,
        record_history_json,rules_json,scoring_metric_json,verification_method_json,contribution_criteria_json,github_repo_owner,github_repo_name,trusted_workflow_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,'[]',?,?,?,?,?,?,?)`,
      entry.slug,
      entry.slug,
      entry.name,
      entry.status,
      ...[
        entry.domain, entry.tagline, entry.summary, entry.background, entry.ultimateGoal,
        entry.record, entry.rules, entry.scoringMetric, entry.verificationMethod, entry.contributionCriteria,
      ].map((value) => JSON.stringify(value)),
      owner,
      repo,
      entry.trustedCheckName
    ),
  ];
}
