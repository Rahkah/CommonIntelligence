import { describe, expect, it } from 'vitest';
import {
  RAID_CLASSES,
  buildSelfContainedChatPrompt,
  extractJsonCandidate,
  getRaidClass,
  isClassAllowedForMode,
  listClassesForMode,
  taskSupportsMode,
  trigramSimilarity,
  validateChatSubmission,
} from './participation';

describe('Dual-Mode Participation & Raid Class Gating', () => {
  it('restricts Chat mode strictly to entry-tier classes while Agent mode accesses all classes', () => {
    expect(isClassAllowedForMode('scout', 'chat')).toBe(true);
    expect(isClassAllowedForMode('arbiter', 'chat')).toBe(true);
    expect(isClassAllowedForMode('forger', 'chat')).toBe(false);
    expect(isClassAllowedForMode('tactician', 'chat')).toBe(false);
    expect(isClassAllowedForMode('pioneer', 'chat')).toBe(false);
    expect(isClassAllowedForMode('auto', 'chat')).toBe(false);

    for (const cls of RAID_CLASSES) {
      expect(isClassAllowedForMode(cls.id, 'agent')).toBe(true);
    }
    expect(isClassAllowedForMode('auto', 'agent')).toBe(true);
    expect(listClassesForMode('chat').map((c) => c.id)).toEqual(['scout', 'arbiter']);
  });

  it('matches tasks accurately by declared supportedModes or inferred capabilities', () => {
    expect(
      taskSupportsMode({ taskType: 'Research', requiredCapabilities: ['analysis'] }, 'chat')
    ).toBe(true);
    expect(
      taskSupportsMode({ taskType: 'Implementation', requiredCapabilities: ['rust'] }, 'chat')
    ).toBe(false);
    expect(
      taskSupportsMode(
        { taskType: 'Implementation', requiredCapabilities: ['api'], supportedModes: ['chat', 'agent'] },
        'chat'
      )
    ).toBe(true);
  });

  it('extracts JSON from chat replies wrapped in prose and strips self-evaluation claims', () => {
    const rawReply = `Sure! Here is my Scout failure analysis based on the context pack:

\`\`\`json
{
  "schemaVersion": 1,
  "kind": "failure_analysis",
  "title": "Futility pruning skips tactical checks at depth 2",
  "rootCause": "Quiet move futility pruning triggers even when the move delivers discovered check or promotes.",
  "evidenceSummary": "Observed in note-gm-02 where 4 consecutive games dropped a queen to shallow forks.",
  "suggestedDirection": "Guard futility pruning by excluding checking moves and pawn promotions.",
  "parentArtifactIds": ["note-gm-02"],
  "verified": true,
  "measuredElo": 3999,
  "selfReportedModel": "chatgpt-5"
}
\`\`\`

Hope this helps!`;

    const extracted = extractJsonCandidate(rawReply);
    expect(extracted.parsed?.title).toContain('Futility pruning');

    const validated = validateChatSubmission('failure_analysis', rawReply);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.strippedSelfEvalKeys).toEqual(['verified', 'measuredElo']);
      expect(validated.warnings.length).toBeGreaterThan(0);
      expect(validated.data.kind).toBe('failure_analysis');
      expect((validated.data as Record<string, unknown>).verified).toBeUndefined();
      expect((validated.data as Record<string, unknown>).measuredElo).toBeUndefined();
    }
  });

  it('returns actionable errors and a one-click repair prompt for malformed chat JSON', () => {
    const bad = '```json\n{"schemaVersion": 1, "kind": "hypothesis_proposal", "title": "Hi"}\n```';
    const validated = validateChatSubmission('hypothesis_proposal', bad);
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      expect(validated.errors.length).toBeGreaterThan(0);
      expect(validated.repairPrompt).toContain('hypothesis_proposal');
      expect(validated.repairPrompt).toContain('```json');
    }
  });

  it('detects near-duplicate submissions across English and Chinese using character trigrams', () => {
    const a = '浅层 Futility 剪枝在将军局面误裁了关键战术解杀走法，导致连输四盘。';
    const b = '浅层 Futility 剪枝在将军局面误裁了关键战术解杀走法，结果连输四盘！';
    const c = '在残局王翼兵型结构中引入通路兵距离加权可以显著改善胜率。';
    expect(trigramSimilarity(a, b)).toBeGreaterThan(0.75);
    expect(trigramSimilarity(a, c)).toBeLessThan(0.15);
  });

  it('builds a bounded self-contained prompt pack with anti-hallucination constraints', () => {
    const scout = getRaidClass('scout')!;
    const built = buildSelfContainedChatPrompt({
      challengeName: 'Project Grandmaster',
      challengeSlug: 'grandmaster',
      category: 'challenge',
      goal: 'Defeat Stockfish 19 through cumulative verified improvements.',
      currentBestDisplay: '1,905 Elo',
      targetDisplay: '3,650 Elo',
      rules: ['All benchmarks must be reproducible.'],
      classDef: scout,
      budgetTier: 'S',
      taskId: 'TASK-GM-02',
      taskTitle: 'Diagnose shallow tactical blunder patterns',
      taskDescription: 'Inspect recent refuted runs and identify the core trigger.',
      acceptanceCriteria: ['Cite at least one recorded failure artifact.'],
      outputSchemaKind: 'failure_analysis',
      verifiedKnowledge: [
        {
          id: 'note-gm-01',
          kind: 'Experiment',
          status: 'Verified',
          title: 'MVV-LVA cuts nodes by 62%',
          summary: 'Ordering captures before quiet moves speeds up search.',
          authorUsername: 'elena',
        },
      ],
      refutedDeadEnds: [
        {
          id: 'note-gm-02',
          kind: 'FailedApproach',
          status: 'Refuted',
          title: 'Aggressive futility margin 120cp',
          summary: 'Blundered queen tactics in 4 games.',
          authorUsername: 'mateo',
        },
      ],
      recentActivity: [],
    });

    expect(built.prompt).toContain('Project Grandmaster');
    expect(built.prompt).toContain('note-gm-01');
    expect(built.prompt).toContain('note-gm-02');
    expect(built.prompt).toContain('NEVER claim you executed code');
    expect(built.prompt).toContain('"kind": "failure_analysis"');
    expect(built.prompt.length).toBeLessThanOrEqual(11500);
    expect(built.estimatedTokens).toBeGreaterThan(50);
  });
});
