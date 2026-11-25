import { Hono } from 'hono';
import { z } from 'zod';
import {
  CONTRIBUTION_TYPES,
  PROJECT_BRIEF_VERSION,
  PROJECT_PROPOSAL_STATUSES,
  createDefaultPendingShowcase,
  isProjectRepositoryUrl,
  validateProjectBrief,
  type ProjectBriefContent,
  type ProjectBriefError,
  type ProjectProposal,
} from '@common-intelligence/shared';
import { browser, maintainer } from './auth';
import { challengeSlug, publishChallenge } from './challenge-write';
import { type App, type Ctx, fail, field, guard, id, iso, json, localized, one, page, rate, sql } from './core';
import { deleteChallengeRepository, provisionChallengeRepository } from './github-repos';
import { mutate } from './mutations';

const repository = z.string().refine(isProjectRepositoryUrl, 'Use the canonical GitHub owner/repository URL.');
const approvalSchema = z.object({
  slug: challengeSlug,
  githubRepo: repository.optional(),
  autoCreateRepo: z.boolean().optional(),
  trustedCheckName: field(150).optional(),
  verificationMethod: field(4000),
  targetDisplay: field(200),
  contributionType: z.enum(CONTRIBUTION_TYPES),
  scoreDirection: z.enum(['higher', 'lower']).optional(),
  baseline: z.object({
    display: field(200),
    sourceUrl: z.url({ protocol: /^https$/ }).max(1000),
    value: z.number().optional(),
  }).strict().optional(),
}).strict().refine(
  (body) => Boolean(body.autoCreateRepo) || (Boolean(body.githubRepo) && Boolean(body.trustedCheckName)),
  { path: ['githubRepo'], message: 'Provide a GitHub repository and trusted check name, or enable autoCreateRepo.' }
).refine(
  (body) => (body.contributionType !== 'RecordImprovement' && body.baseline?.value === undefined) || !!body.scoreDirection,
  { path: ['scoreDirection'], message: 'Choose which direction improves the record.' }
);
const rejectionSchema = z.object({ reason: field(2000) }).strict();
type StoredBrief = ProjectBriefContent & Pick<ProjectProposal, 'schemaVersion'>;
type ProposalRow = Omit<ProjectProposal, keyof StoredBrief> & {
  authorId: string;
  content: StoredBrief;
};
const proposals = `SELECT p.id, p.author_github_id authorId, u.username authorUsername, p.proposal_json contentJson,
  p.status, p.submitted_at submittedAt, p.reviewed_at reviewedAt, p.rejection_reason rejectionReason, h.slug challengeSlug
  FROM project_proposals p JOIN users u ON u.github_id=p.author_github_id LEFT JOIN challenges h ON h.id=p.challenge_id`;
function proposalResponse({ content, authorId: _authorId, ...proposal }: ProposalRow): ProjectProposal {
  return { ...content, ...proposal };
}
async function pendingProposal(c: Ctx, proposalId: string) {
  const proposal = await one<ProposalRow>(c.env.DB, proposals + ' WHERE p.id=?', proposalId);
  if (proposal.status !== 'Pending') fail(409, 'CONFLICT', 'This proposal has already been reviewed.');
  return proposalResponse(proposal);
}
const pending = (db: D1Database, proposalId: string) =>
  guard(db, 'CONFLICT', "EXISTS(SELECT 1 FROM project_proposals WHERE id=? AND status='Pending')", proposalId);

function rejectInvalidBrief(issue: ProjectBriefError): never {
  switch (issue.error) {
    case 'briefVersion':
      fail(400, 'VALIDATION_ERROR', `Project brief requires schemaVersion ${PROJECT_BRIEF_VERSION}.`);
    case 'briefField':
      fail(400, 'VALIDATION_ERROR', `Missing or invalid project brief field '${issue.field}'.`);
    case 'briefFormat':
      fail(400, 'VALIDATION_ERROR', 'Submit a JSON project brief with only the standard fields.');
  }
}

export const projectProposals = new Hono<App>();
projectProposals.post('/api/project-proposals', async (c) => {
  const principal = await browser(c);
  const brief = validateProjectBrief(await json(c, z.unknown()));
  if ('error' in brief) rejectInvalidBrief(brief);
  const body = brief.data;
  const db = c.env.DB;
  return mutate(c, principal, async () => {
    await rate(c, 'project-proposal:' + principal.owner, 86400, 10);
    const author = await one<{ username: string }>(db, 'SELECT username FROM users WHERE github_id=?', principal.owner);
    const proposal: ProjectProposal = {
      ...body,
      id: id('proposal'),
      authorUsername: author.username,
      status: 'Pending',
      submittedAt: iso(),
      reviewedAt: null,
      rejectionReason: null,
      challengeSlug: null,
    };
    return {
      result: proposal,
      status: 201,
      writes: [sql(db,
        'INSERT INTO project_proposals(id,author_github_id,proposal_json,submitted_at) VALUES(?,?,?,?)',
        proposal.id, principal.owner, JSON.stringify(body), proposal.submittedAt
      )],
    };
  });
});
projectProposals.get('/api/project-proposals', async (c) => {
  const principal = await browser(c, false);
  const result = await page<ProposalRow>(c, proposals, 'authorId=?', [principal.owner], 'submittedAt DESC,id');
  return c.json({ ...result, items: result.items.map(proposalResponse) });
});
projectProposals.get('/api/admin/project-proposals', async (c) => {
  await maintainer(c, false);
  const status = z.enum(PROJECT_PROPOSAL_STATUSES).parse(c.req.query('status') ?? 'Pending');
  const order = status === 'Pending' ? 'submittedAt,id' : 'reviewedAt DESC,id';
  const result = await page<ProposalRow>(c, proposals, 'status=?', [status], order);
  return c.json({ ...result, items: result.items.map(proposalResponse) });
});
projectProposals.post('/api/admin/project-proposals/:id/approve', async (c) => {
  const principal = await maintainer(c);
  const body = await json(c, approvalSchema);
  const proposalId = c.req.param('id');
  const db = c.env.DB;
  const trustedCheckName = body.trustedCheckName?.trim() || `${body.slug}-verifier-v1`;

  let provisioned: Awaited<ReturnType<typeof provisionChallengeRepository>> | null = null;
  if (body.autoCreateRepo) {
    const precheckProposal = await pendingProposal(c, proposalId);
    const conflict = await sql(db, 'SELECT id FROM challenges WHERE id=? OR slug=?', body.slug, body.slug).first();
    if (conflict) fail(409, 'CONFLICT', 'A challenge with this slug already exists.');
    provisioned = await provisionChallengeRepository(c.env, {
      slug: body.slug,
      name: precheckProposal.name,
      summary: precheckProposal.summary,
      goal: precheckProposal.goal,
      scoringMetric: precheckProposal.scoringMetric,
      acceptanceCriteria: precheckProposal.acceptanceCriteria,
      trustedCheckName,
      allowExisting: false,
    });
  }

  const resolvedGithubRepo = provisioned?.githubRepo ?? body.githubRepo!;
  try {
    return await mutate(c, principal, async () => {
      const proposal = await pendingProposal(c, proposalId);
      const reviewedAt = iso();
      const criteria = localized(proposal.acceptanceCriteria);
      const writes = publishChallenge(db, {
        ...body,
        githubRepo: resolvedGithubRepo,
        trustedCheckName,
        name: proposal.name,
        status: 'Active',
        domain: localized(proposal.domain),
        tagline: localized(proposal.summary),
        summary: localized(proposal.summary),
        background: localized(proposal.summary),
        ultimateGoal: localized(proposal.goal),
        scoringMetric: localized(proposal.scoringMetric),
        verificationMethod: localized(body.verificationMethod),
        rules: [criteria],
        contributionCriteria: [{
          type: body.contributionType,
          label: localized(''),
          verificationMode: 'Automated + Maintainer',
          criteria,
        }],
        showcase: createDefaultPendingShowcase(
          proposal.name,
          proposal.visualizationGoal ? localized(proposal.visualizationGoal) : undefined
        ),
        record: {
          currentBestDisplay: body.baseline?.display ?? 'Unrated',
          currentBestValue: body.baseline?.value,
          targetDisplay: body.targetDisplay,
          scoreDirection: body.scoreDirection,
          attribution: '',
          recordedAt: '',
          sourceUrl: body.baseline?.sourceUrl ?? '',
          sourceLabel: '',
        },
      });
      return {
        result: {
          ...proposal,
          status: 'Approved',
          reviewedAt,
          challengeSlug: body.slug,
          githubRepo: resolvedGithubRepo,
        },
        writes: [
          pending(db, proposalId),
          ...writes,
          sql(db, `UPDATE project_proposals SET status='Approved', reviewer_github_id=?, reviewed_at=?, challenge_id=? WHERE id=?`,
            principal.owner, reviewedAt, body.slug, proposalId),
        ],
      };
    });
  } catch (err) {
    if (provisioned?.created) {
      try {
        await deleteChallengeRepository(c.env, provisioned.owner, provisioned.repo);
      } catch (rollbackErr) {
        console.error('Failed to rollback auto-created repository:', rollbackErr);
      }
    }
    throw err;
  }
});
projectProposals.post('/api/admin/project-proposals/:id/reject', async (c) => {
  const principal = await maintainer(c);
  const { reason } = await json(c, rejectionSchema);
  const proposalId = c.req.param('id');
  const db = c.env.DB;
  return mutate(c, principal, async () => {
    const proposal = await pendingProposal(c, proposalId);
    const reviewedAt = iso();
    return {
      result: { ...proposal, status: 'Rejected', reviewedAt, rejectionReason: reason },
      writes: [
        pending(db, proposalId),
        sql(db, `UPDATE project_proposals SET status='Rejected', reviewer_github_id=?, reviewed_at=?, rejection_reason=? WHERE id=?`,
          principal.owner, reviewedAt, reason, proposalId),
      ],
    };
  });
});
