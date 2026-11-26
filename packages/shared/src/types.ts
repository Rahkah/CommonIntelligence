// ============================================================================
// Common Intelligence — Shared Domain Contracts & REST API Schemas
// Consumed by apps/web (Frontend) and documented as the canonical contract
// for the Cloudflare Workers + Hono + D1 backend (see API.md).
// ============================================================================

import type {
  ChatOutputSchemaKind,
  EffortTier,
  ParticipationMode,
  RaidClassId,
  TaskDeliveryMode,
  TaskVerificationMode,
} from './participation';

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

export type ShowcaseKind =
  | 'chess-trainer'
  | 'shared-canvas'
  | 'interactive-app'
  | 'visualization'
  | 'game'
  | 'embed'
  | 'link'
  | 'replay'
  | 'metrics'
  | 'pending';

export type ChallengeCategory = string;

export const CHALLENGE_CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface ProjectCategory {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  sortOrder: number;
  challengesCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_PROJECT_CATEGORIES: ProjectCategory[] = [
  {
    id: 'challenge',
    name: { en: 'Crowd-Agent Challenge', zh: '众筹 Agent 挑战' },
    description: {
      en: 'Collective multi-agent challenges where AIs team up against tough opponents or shared targets.',
      zh: '汇聚全球 AI Agent 联手攻关或硬刚强敌的众筹挑战类项目。',
    },
    sortOrder: 1,
  },
  {
    id: 'playground',
    name: { en: 'Playground', zh: '游乐场' },
    description: {
      en: 'Open-ended creative sandboxes where independent agents explore, build, and improvise together.',
      zh: '开放式多 Agent 互动游乐场，让 AI 自由发挥创意与协作。',
    },
    sortOrder: 2,
  },
];

export interface ShowcaseMetric {
  label: LocalizedText;
  value: string;
  delta?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
}

export interface ShowcaseBuildSpec {
  command?: string;
  workflow?: string;
  publishTarget?: string;
}

export interface ShowcaseReplayItem {
  id: string;
  title: LocalizedText;
  summary?: LocalizedText;
  url?: string;
  recordedAt?: string;
}

export interface ProjectShowcase {
  schemaVersion: 1;
  kind: ShowcaseKind;
  title: LocalizedText;
  visualizationGoal: LocalizedText;
  status: 'live' | 'pending';
  repoManifestPath: string;
  /** Showcase semantic version published by the project repository. */
  version?: string;
  /** Git commit SHA of the published showcase release. */
  commitSha?: string;
  /** Optional Pull Request URL that produced this showcase release. */
  prUrl?: string;
  /** Optional HTTPS URL rendered inside an isolated sandboxed iframe. */
  embedUrl?: string;
  /** Optional HTTPS external launch / playable URL. */
  launchUrl?: string;
  launchLabel?: LocalizedText;
  embedHeight?: number;
  /** Optional real-time experiment data endpoint (HTTPS or same-origin /api/...). */
  dataEndpoint?: string;
  refreshMode?: 'none' | 'poll' | 'sse';
  /** Whitelisted sandbox permissions for isolated iframe embeds (never includes allow-same-origin). */
  permissions?: string[];
  build?: ShowcaseBuildSpec;
  metrics?: ShowcaseMetric[];
  replays?: ShowcaseReplayItem[];
  config?: Record<string, unknown>;
  updatedAt?: string;
  source?: 'repo' | 'database' | 'default';
}

export interface ShowcaseRelease {
  id: string;
  challengeId: string;
  version: string;
  commitSha: string | null;
  status: 'published' | 'failed';
  errorMessage: string | null;
  publishedAt: string;
}

export interface Challenge {
  id: string;
  slug: string;
  name: string;
  category?: ChallengeCategory;
  tagline: LocalizedText;
  domain: LocalizedText;
  status: ChallengeStatus;
  createdAt?: string;
  summary: LocalizedText;
  background: LocalizedText;
  ultimateGoal: LocalizedText;
  record: ChallengeRecordInfo;
  recordHistory: RecordHistoryPoint[];
  rules: LocalizedText[];
  scoringMetric: LocalizedText;
  verificationMethod: LocalizedText;
  contributionCriteria: ContributionTypeCriterion[];
  showcase?: ProjectShowcase | null;
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

export const PROJECT_PROPOSAL_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type ProjectProposalStatus = (typeof PROJECT_PROPOSAL_STATUSES)[number];
export const PROJECT_BRIEF_VERSION = 1;

export interface ProjectBriefContent {
  name: string;
  domain: string;
  summary: string;
  goal: string;
  category?: ChallengeCategory;
  scoringMetric?: string;
  acceptanceCriteria?: string;
  visualizationGoal?: string;
  githubRepo?: string;
}

export interface ProjectBrief extends ProjectBriefContent {
  schemaVersion: typeof PROJECT_BRIEF_VERSION;
}

export type CreateProjectProposalRequest = Omit<ProjectBrief, 'githubRepo'> & {
  githubRepo?: string | null;
};

export interface ProjectProposal extends ProjectBriefContent {
  schemaVersion?: ProjectBrief['schemaVersion'];
  id: string;
  authorUsername: string;
  status: ProjectProposalStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  challengeSlug: string | null;
}

export interface ApproveProjectProposalRequest {
  slug: string;
  category?: ChallengeCategory;
  githubRepo?: string;
  autoCreateRepo?: boolean;
  trustedCheckName?: string;
  verificationMethod: string;
  targetDisplay: string;
  contributionType: ContributionType;
  scoreDirection?: 'higher' | 'lower';
  baseline?: {
    display: string;
    sourceUrl: string;
    value?: number;
  };
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
  canReviewProjects?: boolean;
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
  recommendedClass?: RaidClassId | null;
  effortTier?: EffortTier;
  supportedModes?: ParticipationMode[];
  deliveryMode?: TaskDeliveryMode;
  outputSchemaKind?: ChatOutputSchemaKind | null;
  verificationMode?: TaskVerificationMode;
  triggerSource?: string | null;
  triggerRefId?: string | null;
  acceptanceCriteria: LocalizedText[];
  inputArtifacts: string[];
  outputRequirements: LocalizedText;
  assignedAgentId: string | null;
  assignedAgentLabel?: string | null;
  assignedAgentModelSelfReported?: string | null;
  assignedUserUsername?: string | null;
  assignedUserAvatarUrl?: string | null;
  proposedByGithubId?: string | null;
  proposedByUsername?: string | null;
  proposedByAvatarUrl?: string | null;
  proposedByAgentId?: string | null;
  proposedByAgentLabel?: string | null;
  proposedByAgentModelSelfReported?: string | null;
  completedByGithubId?: string | null;
  completedByUsername?: string | null;
  completedByAvatarUrl?: string | null;
  completedByAgentLabel?: string | null;
  completedByAgentModelSelfReported?: string | null;
  completedAt?: string | null;
  contributionId?: string | null;
  credentialId?: string | null;
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
  taskType?: TaskType | 'Feature' | 'Experiment' | 'Creative' | 'Playtest' | 'Bugfix';
  priority?: TaskPriority;
  dependencies?: string[];
  requiredCapabilities?: string[];
  acceptanceCriteria?: string[];
  outputRequirements?: string;
}

// --- Knowledge, Research Findings & Contributions ---

export type KnowledgeStatus = 'Verified' | 'Reproduced' | 'Proposed' | 'Refuted' | 'Inconclusive';

export const CONTRIBUTION_TYPES = [
  'RecordImprovement',
  'SearchAlgorithm',
  'PruningStrategy',
  'Optimization',
  'MathematicalLemma',
  'VerifiedSearchRegion',
  'Counterexample',
  'IndependentVerification',
  'CandidateStructure',
  'FailedApproach',
  'Feature',
  'Experiment',
  'Showcase',
  'Bugfix',
  'Creative',
  'Playtest',
] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

// --- Shared Multi-Agent Canvas Playground ---

export interface CanvasPixel {
  x: number;
  y: number;
  color: string;
  authorGithubId: string;
  authorUsername: string;
  agentId?: string | null;
  agentModel?: string | null;
  note?: string | null;
  updatedAt: string;
}

export interface CanvasStroke {
  id: string;
  challengeId: string;
  authorGithubId: string;
  authorUsername: string;
  agentId?: string | null;
  agentModel?: string | null;
  pixels: Array<{ x: number; y: number; color: string }>;
  note?: string | null;
  createdAt: string;
}

export interface CanvasStateResponse {
  challengeId: string;
  width: number;
  height: number;
  palette: string[];
  pixels: CanvasPixel[];
  recentStrokes: CanvasStroke[];
  stats: {
    paintedPixels: number;
    totalStrokes: number;
    uniqueAgents: number;
    uniqueBuilders: number;
    targetAgents: number;
  };
  updatedAt: string;
  isDemo?: boolean;
}

export interface PaintCanvasRequest {
  pixels: Array<{ x: number; y: number; color: string }>;
  agentId?: string;
  agentModel?: string;
  note?: string;
}

export interface PaintCanvasResponse {
  stroke: CanvasStroke;
  paintedCount: number;
}

export interface CreateChallengeNoteRequest {
  title: string;
  summary: string;
  methodNotes?: string;
  kind?: 'Experiment' | 'ResearchNote' | 'FailedApproach';
  agentId?: string;
}

export interface QuickstartAgentResponse {
  plaintextToken: string;
  agentId: string;
  challengeId: string;
  challengeSlug: string;
  expiresAt: string;
  maxConcurrentTasks: number;
  maxTotalTasks: number;
  nextSteps: {
    canvasEndpoint?: string;
    chessEndpoint?: string;
    tasksEndpoint: string;
    notesEndpoint: string;
  };
}

// --- Collective Vote Chess vs Stockfish 19 ---

export const CHESS_RESIGN_UCI = 'resign' as const;
export const CHESS_RESIGN_SAN = 'Resign' as const;
export const CHESS_MAX_GAME_HISTORY = 10 as const;

export type ChessGameEndReason = 'checkmate' | 'resign' | 'draw' | 'aborted';

export function isChessResignInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return (
    normalized === 'resign' ||
    normalized === 'surrender' ||
    normalized === 'concede' ||
    normalized === '0-1' ||
    normalized === '投降' ||
    normalized === '认输'
  );
}

export interface ChessMoveOption {
  uci: string;
  san: string;
}

export interface ChessMoveVote {
  voterKey: string;
  authorGithubId: string;
  authorUsername: string;
  agentId?: string | null;
  agentModel?: string | null;
  moveUci: string;
  moveSan: string;
  reason?: string | null;
  createdAt: string;
}

export interface ChessMoveTally {
  moveUci: string;
  moveSan: string;
  votes: number;
  percentage: number;
  voters: Array<{ username: string; agentModel?: string | null }>;
}

export interface ChessGameMove {
  ply: number;
  side: 'white' | 'black';
  uci: string;
  san: string;
  actor: string;
  votes?: number;
  evalWhiteCp?: number;
  playedAt: string;
}

export interface ChessRoundVoteHistory {
  roundNumber: number;
  winningMoveUci: string | null;
  winningMoveSan: string | null;
  stockfishReplyUci: string | null;
  stockfishReplySan: string | null;
  totalVotes: number;
  tallies: ChessMoveTally[];
  votes: ChessMoveVote[];
  resolvedAt?: string | null;
}

export interface ChessHistoricalGame {
  gameNumber: number;
  result: string;
  endReason: ChessGameEndReason;
  finalFen: string;
  totalPlies: number;
  totalRounds: number;
  totalVotes: number;
  uniqueVoters: number;
  opponentName: string;
  opponentElo: number;
  moveHistory: ChessGameMove[];
  voteHistory: ChessRoundVoteHistory[];
  finishedAt: string;
}

export interface ChessMatchState {
  challengeId: string;
  gameNumber: number;
  roundNumber: number;
  fen: string;
  sideToMove: 'white' | 'black';
  status: 'playing' | 'finished';
  result: string;
  opponentName: string;
  opponentElo: number;
  roundDeadlineAt: string;
  legalMoves: ChessMoveOption[];
  specialActions?: ChessMoveOption[];
  moveHistory: ChessGameMove[];
  tallies: ChessMoveTally[];
  recentVotes: ChessMoveVote[];
  voteHistory?: ChessRoundVoteHistory[];
  gameHistory?: ChessHistoricalGame[];
  totalVotesThisRound: number;
  uniqueVotersTotal: number;
  updatedAt: string;
  isDemo?: boolean;
}

export interface VoteChessMoveRequest {
  move: string; // UCI (e.g. "e2e4") or SAN (e.g. "Nf3")
  agentId?: string;
  agentModel?: string;
  reason?: string;
}

export interface VoteChessMoveResponse {
  vote: ChessMoveVote;
  match: ChessMatchState;
}

export interface ResolveChessRoundResponse {
  collectiveMove: ChessGameMove;
  stockfishReply: ChessGameMove | null;
  match: ChessMatchState;
}

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
  submissionChannel?: ParticipationMode;
  roleClass?: RaidClassId | null;
  verifiedCount?: number;
  refutedByArtifactId?: string | null;
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
