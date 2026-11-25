import { PROJECT_BRIEF_VERSION, type ProjectBrief, type ProjectBriefContent } from './types';

export const PROJECT_PROPOSAL_LIMITS = {
  name: 150,
  domain: 120,
  summary: 4000,
  goal: 4000,
  scoringMetric: 4000,
  acceptanceCriteria: 4000,
  visualizationGoal: 2000,
  githubRepo: 300,
} as const satisfies Record<keyof ProjectBriefContent, number>;

export const PROJECT_BRIEF_SECTIONS = ['summary', 'goal', 'scoringMetric', 'acceptanceCriteria'] as const;
export const PROJECT_BRIEF_REQUIRED_FIELDS = ['name', 'domain', ...PROJECT_BRIEF_SECTIONS] as const;
const briefFields = new Set(['schemaVersion', 'githubRepo', 'visualizationGoal', ...PROJECT_BRIEF_REQUIRED_FIELDS]);

export type ProjectBriefError =
  | { error: 'briefFormat' | 'briefVersion' }
  | { error: 'briefField'; field: keyof ProjectBriefContent };

export function validateProjectBrief(value: unknown): { data: ProjectBrief } | ProjectBriefError {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'briefFormat' };
  const brief = value as Record<string, unknown>;
  if (brief.schemaVersion !== PROJECT_BRIEF_VERSION) return { error: 'briefVersion' };
  if (Object.keys(brief).some((field) => !briefFields.has(field))) return { error: 'briefFormat' };

  const data: ProjectBrief = {
    schemaVersion: PROJECT_BRIEF_VERSION,
    name: '', domain: '', summary: '', goal: '', scoringMetric: '', acceptanceCriteria: '',
  };
  for (const field of PROJECT_BRIEF_REQUIRED_FIELDS) {
    const text = brief[field];
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed || trimmed.length > PROJECT_PROPOSAL_LIMITS[field])
      return { error: 'briefField', field };
    data[field] = trimmed;
  }
  if (brief.visualizationGoal != null) {
    const text = typeof brief.visualizationGoal === 'string' ? brief.visualizationGoal.trim() : '';
    if (!text || text.length > PROJECT_PROPOSAL_LIMITS.visualizationGoal) {
      return { error: 'briefField', field: 'visualizationGoal' };
    }
    data.visualizationGoal = text;
  }
  if (brief.githubRepo != null) {
    const url = typeof brief.githubRepo === 'string' ? brief.githubRepo.trim() : '';
    if (!isProjectRepositoryUrl(url)) return { error: 'briefField', field: 'githubRepo' };
    data.githubRepo = url;
  }
  return { data };
}

export function isProjectRepositoryUrl(value: string) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/.exec(value);
  return value.length <= PROJECT_PROPOSAL_LIMITS.githubRepo && !!match && match[0] === value &&
    match.slice(1).every((segment) => segment !== '.' && segment !== '..');
}
