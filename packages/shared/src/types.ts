// ============================================================================
// Common Intelligence — Shared Domain Contracts & REST API Schemas
// Consumed by apps/web (Frontend) and documented as the canonical contract
// for the Cloudflare Workers + Hono + D1 backend (see API.md).
// ============================================================================

export type Locale = 'en' | 'zh';

export interface LocalizedText {
  en: string;
  zh: string;
}

// --- Challenges ---

export type ChallengeStatus = 'Proposed' | 'Active' | 'Paused' | 'Completed' | 'Archived';

export interface RecordHistoryPoint {
  date: string;
  score: number;
  label: string;
  attribution: string;
  sourceUrl?: string;
  note?: LocalizedText;
  isCurrentRecord?: boolean;
}

export interface ContributionTypeCriterion {
  type: ContributionType;
  label: LocalizedText;
  verificationMode: 'Automated' | 'Automated + Maintainer' | 'Maintainer Review';
  criteria: LocalizedText;
}

export interface ChallengeRecordInfo {
  currentBestDisplay: string;
  currentBestValue?: number;
  targetDisplay: string;
  targetValue?: number;
  lowerBoundDisplay?: string;
  lowerBoundValue?: number;
  /** Direction of improvement for charts & progress indicators (default: 'lower'). */
  scoreDirection?: 'higher' | 'lower';
  /** Optional unit label for chart axis/tooltips (e.g. 'Elo', 'chars'). */
  scoreUnit?: string;
  /** Optional starting baseline value for progress scale computation. */
  scaleStartValue?: number;
  attribution: string;
  recordedAt: string;
  sourceUrl: string;
  sourceLabel: string;
}

export interface Challenge {
  id: string;
  slug: string;
  name: string;
  tagline: LocalizedText;
  domain: LocalizedText;
  status: ChallengeStatus;
  summary: LocalizedText;
  background: LocalizedText;
  ultimateGoal: LocalizedText;
  record: ChallengeRecordInfo;
  recordHistory: RecordHistoryPoint[];
  rules: LocalizedText[];
  scoringMetric: LocalizedText;
  verificationMethod: LocalizedText;
  contributionCriteria: ContributionTypeCriterion[];
  githubRepo: string;
  joinInstructionsPath: string;
  stats: {
    contributorsCount: number;
    verifiedContributionsCount: number;
    openTasksCount: number;
    activeLeasesCount: number;
    completedTasksCount: number;
  };
  isDemoStats: boolean;
}

export interface ChallengeProgress {
  challengeId: string;
  currentBestValue?: number;
  currentBestDisplay: string;
  targetValue?: number;
  lowerBoundValue?: number;
  recordHistory: RecordHistoryPoint[];
  tasksByStatus: Record<TaskStatus, number>;
  verifiedContributionsCount: number;
  refutedApproachesCount: number;
  updatedAt: string;
  isDemo: boolean;
}

// --- Users, Auth & Agent Tokens ---

export interface UserProfileSummary {
  githubId: string; // Primary immutable identifier
  username: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  joinedAt: string;
  bio?: LocalizedText;
  verifiedContributionsCount: number;
  badgesCount: number;
  badges?: AwardedBadge[];
  challengesJoined: string[];
  isDemo?: boolean;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  mode: 'demo' | 'live';
  user: UserProfileSummary | null;
  csrfToken?: string;
}

export type AgentTokenScope =
  | 'agent:register'
  | 'tasks:read'
  | 'tasks:claim'
  | 'tasks:propose'
  | 'knowledge:read';

export interface AgentToken {
  id: string;
  name: string;
  tokenPrefix: string; // e.g., "ci_agt_9f4a..."
  scopes: AgentTokenScope[];
  maxConcurrentTasks: number;
  maxTotalTasks: number;
  tasksClaimedCount: number;
  budgetNote?: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked' | 'expired';
}

export interface CreateAgentTokenRequest {
  name: string;
  expiresInDays: number;
  maxConcurrentTasks: number;
  maxTotalTasks: number;
  scopes: AgentTokenScope[];
  budgetNote?: string;
}

export interface CreateAgentTokenResponse {
  token: AgentToken;
  /** Returned strictly ONCE upon creation; backend stores only SHA-256 hash. */
  plaintextToken: string;
}

export interface AgentRecord {
  id: string;
  ownerGithubId: string;
  ownerUsername: string;
  label: string;
  /** Always treated as self-reported, never independently verified. */
  selfReportedModel: string;
  selfReportedClient: string;
  registeredAt: string;
  lastHeartbeatAt: string | null;
  isDemo?: boolean;
}

// --- Tasks ---

export type TaskType =
  | 'Research'
  | 'Search'
  | 'Implementation'
  | 'Verification'
  | 'Counterexample'
  | 'Optimization'
  | 'Documentation'
  | 'Integration';

export type TaskStatus =
  | 'Proposed'
  | 'Pending'
  | 'Available'
  | 'Leased'
  | 'Submitted'
  | 'Verifying'
  | 'Accepted'
  | 'Rejected'
  | 'Blocked'
  | 'Cancelled';

export type TaskPriority = 'Critical' | 'High' | 'Normal' | 'Low';

export interface Task {
  isPlanning?: boolean;
  planId?: string | null;
  taskId: string;
  challengeId: string;
  title: LocalizedText;
  description: LocalizedText;
  taskType: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: string[];
  requiredCapabilities: string[];
  acceptanceCriteria: LocalizedText[];
  inputArtifacts: string[];
  outputRequirements: LocalizedText;
  assignedAgentId: string | null;
  assignedAgentLabel?: string | null;
  assignedAgentModelSelfReported?: string | null;
  assignedUserUsername?: string | null;
  leaseExpiresAt: string | null;
  prUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface ProposeTaskRequest {
  challengeId: string;
  title: string;
  description: string;
  taskType: TaskType;
  priority: TaskPriority;
  dependencies: string[];
  requiredCapabilities: string[];
  acceptanceCriteria: string[];
  outputRequirements: string;
}

// --- Knowledge, Research Findings & Contributions ---

export type KnowledgeStatus = 'Verified' | 'Reproduced' | 'Proposed' | 'Refuted' | 'Inconclusive';

export type ContributionType =
  | 'RecordImprovement'
  | 'SearchAlgorithm'
  | 'PruningStrategy'
  | 'Optimization'
  | 'MathematicalLemma'
  | 'VerifiedSearchRegion'
  | 'Counterexample'
  | 'IndependentVerification'
  | 'CandidateStructure'
  | 'FailedApproach';

export interface ResearchArtifact {
  id: string;
  challengeId: string;
  title: LocalizedText;
  kind:
    | 'Lemma'
    | 'Algorithm'
    | 'PruningStrategy'
    | 'CandidateSolution'
    | 'Counterexample'
    | 'Experiment'
    | 'FailedApproach'
    | 'ResearchNote';
  status: KnowledgeStatus;
  summary: LocalizedText;
  methodNotes: LocalizedText;
  limitations?: LocalizedText;
  authorGithubId: string;
  authorUsername: string;
  selfReportedAgentModel?: string;
  prUrl: string | null;
  commitSha: string | null;
  verifierVersion: string | null;
  parentArtifactIds: string[];
  taskId: string | null;
  createdAt: string;
  isDemo?: boolean;
}

export interface Contribution {
  id: string;
  challengeId: string;
  challengeSlug: string;
  challengeName: string;
  taskId: string;
  title: LocalizedText;
  contributionType: ContributionType;
  summary: LocalizedText;
  status: KnowledgeStatus;
  contributorGithubId: string;
  contributorUsername: string;
  contributorAvatarUrl: string;
  selfReportedAgentModel: string;
  prNumber: number;
  prUrl: string;
  commitSha: string;
  verifierVersion: string;
  verificationSummary: LocalizedText;
  parentContributionIds: string[];
  credentialId: string | null;
  acceptedAt: string;
  isDemo?: boolean;
}

// --- Badges & Proof of Contribution Credentials ---

export type BadgeCode =
  | 'founding_contributor'
  | 'first_discovery'
  | 'pathfinder'
  | 'verifier'
  | 'breakthrough_contributor'
  | 'record_breaker';

export interface BadgeDefinition {
  code: BadgeCode;
  name: LocalizedText;
  description: LocalizedText;
  criteria: LocalizedText;
  editionCap?: number;
}

export interface AwardedBadge {
  id: string;
  code: BadgeCode;
  serialNumber?: number; // e.g., Founding Contributor #004 / 100
  awardedAt: string;
  challengeSlug: string;
  contributionId: string;
  credentialId: string;
  isDemo?: boolean;
}

export type CredentialStatus = 'Verified' | 'Revoked' | 'Superseded';

export interface Credential {
  id: string;
  status: CredentialStatus;
  statusNote?: LocalizedText;
  contributorGithubId: string;
  contributorUsername: string;
  contributorAvatarUrl: string;
  contributorProfileUrl: string;
  challengeId: string;
  challengeSlug: string;
  challengeName: string;
  contributionId: string;
  contributionTitle: LocalizedText;
  contributionType: ContributionType;
  contributionSummary: LocalizedText;
  taskId: string;
  prUrl: string;
  commitSha: string;
  verificationRunId: string;
  verificationSummary: LocalizedText;
  verifierVersion: string;
  issuedAt: string;
  parentContributionIds: string[];
  badgesAwarded: BadgeCode[];
  isDemo?: boolean;
}

// --- Live Activity ---

export type ActivityEventType =
  | 'agent_registered'
  | 'task_claimed'
  | 'task_proposed'
  | 'pr_submitted'
  | 'verification_passed'
  | 'verification_failed'
  | 'contribution_accepted'
  | 'badge_awarded'
  | 'record_broken';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  challengeSlug: string;
  challengeName: string;
  actorUsername: string;
  actorGithubId: string;
  actorAvatarUrl: string;
  agentLabel?: string;
  selfReportedModel?: string;
  summary: LocalizedText;
  taskId?: string;
  prUrl?: string;
  credentialId?: string;
  badgeCode?: BadgeCode;
  createdAt: string;
  isDemo?: boolean;
}

// --- Contributor Full Profile ---

export interface ContributorFullProfile {
  user: UserProfileSummary;
  badges: AwardedBadge[];
  contributions: Contribution[];
  credentials: Credential[];
  challenges: Array<{
    slug: string;
    name: string;
    contributionsCount: number;
  }>;
  isDemo?: boolean;
}

// --- Structured API Envelope & Errors ---

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'LEASE_CONFLICT'
  | 'LEASE_EXPIRED'
  | 'INVALID_LEASE_TOKEN'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_WEBHOOK_SIGNATURE'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  isDemo?: boolean;
}
