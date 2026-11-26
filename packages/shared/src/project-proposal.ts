import {
  CHALLENGE_CATEGORY_ID_PATTERN,
  PROJECT_BRIEF_VERSION,
  type ChallengeCategory,
  type ProjectBrief,
  type ProjectBriefContent,
} from './types';

export const PROJECT_PROPOSAL_LIMITS = {
  name: 150,
  domain: 120,
  summary: 4000,
  goal: 4000,
  scoringMetric: 4000,
  acceptanceCriteria: 4000,
  visualizationGoal: 2000,
  githubRepo: 300,
} as const;

export const PROJECT_BRIEF_SECTIONS = ['summary', 'goal', 'scoringMetric', 'acceptanceCriteria'] as const;
export const PROJECT_BRIEF_REQUIRED_FIELDS = ['name', 'domain', 'summary', 'goal'] as const;
const optionalTextFields = ['scoringMetric', 'acceptanceCriteria', 'visualizationGoal'] as const;
const briefFields = new Set([
  'schemaVersion',
  'category',
  'githubRepo',
  ...optionalTextFields,
  ...PROJECT_BRIEF_REQUIRED_FIELDS,
]);

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
    name: '',
    domain: '',
    summary: '',
    goal: '',
  };
  for (const field of PROJECT_BRIEF_REQUIRED_FIELDS) {
    const text = brief[field];
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed || trimmed.length > PROJECT_PROPOSAL_LIMITS[field]) {
      return { error: 'briefField', field };
    }
    data[field] = trimmed;
  }

  if (brief.category != null && brief.category !== '') {
    const rawCat = typeof brief.category === 'string' ? brief.category.trim().toLowerCase() : '';
    if (!CHALLENGE_CATEGORY_ID_PATTERN.test(rawCat)) {
      return { error: 'briefField', field: 'category' };
    }
    data.category = rawCat as ChallengeCategory;
  }

  for (const field of optionalTextFields) {
    const raw = brief[field];
    if (raw == null || raw === '') continue;
    if (typeof raw !== 'string') return { error: 'briefField', field };
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > PROJECT_PROPOSAL_LIMITS[field]) {
      return { error: 'briefField', field };
    }
    data[field] = trimmed;
  }

  if (brief.githubRepo != null && brief.githubRepo !== '') {
    const url = typeof brief.githubRepo === 'string' ? brief.githubRepo.trim() : '';
    if (!isProjectRepositoryUrl(url)) return { error: 'briefField', field: 'githubRepo' };
    data.githubRepo = url;
  }
  return { data };
}

export function isProjectRepositoryUrl(value: string) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/.exec(value);
  return (
    value.length <= PROJECT_PROPOSAL_LIMITS.githubRepo &&
    !!match &&
    match[0] === value &&
    match.slice(1).every((segment) => segment !== '.' && segment !== '..')
  );
}
