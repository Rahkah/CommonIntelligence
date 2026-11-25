import type {
  ActivityEvent,
  AgentToken,
  AuthSessionResponse,
  Challenge,
  ChallengeProgress,
  Contribution,
  ContributorFullProfile,
  CreateAgentTokenRequest,
  CreateAgentTokenResponse,
  Credential,
  PaginatedResponse,
  ProposeTaskRequest,
  ResearchArtifact,
  Task,
  TaskStatus,
  UserProfileSummary,
} from '@common-intelligence/shared';
import {
  DEMO_ACTIVITY_EVENTS,
  DEMO_BADGES_BY_USER,
  DEMO_CHALLENGES,
  DEMO_CONTRIBUTIONS,
  DEMO_CREDENTIALS,
  DEMO_KNOWLEDGE,
  DEMO_TASKS,
  DEMO_USERS,
  INITIAL_DEMO_TOKENS,
} from '@/data/demoData';

const STORAGE_KEYS = {
  demoSignedIn: 'ci-demo-signed-in',
  demoTokens: 'ci-demo-tokens-v1',
  demoExtraTasks: 'ci-demo-extra-tasks-v1',
  demoExtraEvents: 'ci-demo-extra-events-v1',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const demoAdapter = {
  async getMe(): Promise<AuthSessionResponse> {
    const signedIn = readJson<boolean>(STORAGE_KEYS.demoSignedIn, false);
    return {
      authenticated: signedIn,
      mode: 'demo',
      user: signedIn ? DEMO_USERS[0]! : null,
      csrfToken: signedIn ? 'demo-csrf-token' : undefined,
    };
  },

  async demoSignIn(): Promise<AuthSessionResponse> {
    writeJson(STORAGE_KEYS.demoSignedIn, true);
    return this.getMe();
  },

  async logout(): Promise<void> {
    writeJson(STORAGE_KEYS.demoSignedIn, false);
  },

  async listChallenges(): Promise<Challenge[]> {
    return DEMO_CHALLENGES;
  },

  async getChallenge(slugOrId: string): Promise<Challenge | null> {
    return DEMO_CHALLENGES.find((c) => c.slug === slugOrId || c.id === slugOrId) ?? null;
  },

  async getChallengeProgress(slugOrId: string): Promise<ChallengeProgress | null> {
    const challenge = await this.getChallenge(slugOrId);
    if (!challenge) return null;
    const tasks = await this.listTasks(challenge.id);
    const counts: Record<TaskStatus, number> = {
      Proposed: 0,
      Pending: 0,
      Available: 0,
      Leased: 0,
      Submitted: 0,
      Verifying: 0,
      Accepted: 0,
      Rejected: 0,
      Blocked: 0,
      Cancelled: 0,
    };
    for (const t of tasks) counts[t.status]++;
    const refuted = DEMO_KNOWLEDGE.filter(
      (k) => k.challengeId === challenge.id && k.status === 'Refuted'
    ).length;

    return {
      challengeId: challenge.id,
      currentBestValue: challenge.record.currentBestValue,
      currentBestDisplay: challenge.record.currentBestDisplay,
      targetValue: challenge.record.targetValue,
      lowerBoundValue: challenge.record.lowerBoundValue,
      recordHistory: challenge.recordHistory,
      tasksByStatus: counts,
      verifiedContributionsCount: DEMO_CONTRIBUTIONS.filter((c) => c.challengeId === challenge.id)
        .length,
      refutedApproachesCount: refuted,
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };
  },

  async listTasks(challengeId?: string): Promise<Task[]> {
    const extra = readJson<Task[]>(STORAGE_KEYS.demoExtraTasks, []);
    const merged = [...extra, ...DEMO_TASKS];
    return challengeId ? merged.filter((t) => t.challengeId === challengeId) : merged;
  },

  async proposeTask(payload: ProposeTaskRequest): Promise<Task> {
    const now = new Date().toISOString();
    const extra = readJson<Task[]>(STORAGE_KEYS.demoExtraTasks, []);
    const nextNum = String(DEMO_TASKS.length + extra.length + 1).padStart(3, '0');
    const created: Task = {
      taskId: `TASK-5904-${nextNum}`,
      challengeId: payload.challengeId,
      title: { en: payload.title, zh: payload.title },
      description: { en: payload.description, zh: payload.description },
      taskType: payload.taskType,
      priority: payload.priority,
      status: 'Proposed',
      dependencies: payload.dependencies,
      requiredCapabilities: payload.requiredCapabilities,
      acceptanceCriteria: payload.acceptanceCriteria.map((c) => ({ en: c, zh: c })),
      inputArtifacts: [],
      outputRequirements: { en: payload.outputRequirements, zh: payload.outputRequirements },
      assignedAgentId: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    };
    writeJson(STORAGE_KEYS.demoExtraTasks, [created, ...extra]);

    const extraEvents = readJson<ActivityEvent[]>(STORAGE_KEYS.demoExtraEvents, []);
    const user = DEMO_USERS[0]!;
    const evt: ActivityEvent = {
      id: `evt-demo-${Date.now()}`,
      type: 'task_proposed',
      challengeSlug: payload.challengeId,
      challengeName: 'Project 5904',
      actorUsername: user.username,
      actorGithubId: user.githubId,
      actorAvatarUrl: user.avatarUrl,
      summary: {
        en: `Proposed ${created.taskId}: "${payload.title}" (queued for maintainer review).`,
        zh: `提出新任务提案 ${created.taskId}：「${payload.title}」（已进入维护者审核队列）。`,
      },
      taskId: created.taskId,
      createdAt: now,
      isDemo: true,
    };
    writeJson(STORAGE_KEYS.demoExtraEvents, [evt, ...extraEvents]);
    return created;
  },

  async listKnowledge(challengeId?: string): Promise<ResearchArtifact[]> {
    return challengeId
      ? DEMO_KNOWLEDGE.filter((k) => k.challengeId === challengeId)
      : DEMO_KNOWLEDGE;
  },

  async listContributions(challengeId?: string): Promise<Contribution[]> {
    return challengeId
      ? DEMO_CONTRIBUTIONS.filter((c) => c.challengeId === challengeId)
      : DEMO_CONTRIBUTIONS;
  },

  async listActivity(): Promise<PaginatedResponse<ActivityEvent>> {
    const extraEvents = readJson<ActivityEvent[]>(STORAGE_KEYS.demoExtraEvents, []);
    const items = [...extraEvents, ...DEMO_ACTIVITY_EVENTS];
    return { items, total: items.length, limit: 50, offset: 0, isDemo: true };
  },

  async listContributors(): Promise<UserProfileSummary[]> {
    return [...DEMO_USERS].sort(
      (a, b) => b.verifiedContributionsCount - a.verifiedContributionsCount
    );
  },

  async getContributorProfile(username: string): Promise<ContributorFullProfile | null> {
    const user = DEMO_USERS.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return null;
    const contributions = DEMO_CONTRIBUTIONS.filter((c) => c.contributorGithubId === user.githubId);
    const credentials = DEMO_CREDENTIALS.filter((c) => c.contributorGithubId === user.githubId);
    const badges = DEMO_BADGES_BY_USER[user.githubId] ?? [];
    const challengeMap = new Map<string, { slug: string; name: string; contributionsCount: number }>();
    for (const c of contributions) {
      const existing = challengeMap.get(c.challengeSlug);
      if (existing) {
        existing.contributionsCount++;
      } else {
        challengeMap.set(c.challengeSlug, {
          slug: c.challengeSlug,
          name: c.challengeName,
          contributionsCount: 1,
        });
      }
    }
    return {
      user,
      badges,
      contributions,
      credentials,
      challenges: Array.from(challengeMap.values()),
      isDemo: true,
    };
  },

  async getCredential(id: string): Promise<Credential | null> {
    return DEMO_CREDENTIALS.find((c) => c.id === id) ?? null;
  },

  async listAgentTokens(): Promise<AgentToken[]> {
    return readJson<AgentToken[]>(STORAGE_KEYS.demoTokens, INITIAL_DEMO_TOKENS);
  },

  async createAgentToken(req: CreateAgentTokenRequest): Promise<CreateAgentTokenResponse> {
    const now = new Date();
    const expires = new Date(now.getTime() + req.expiresInDays * 24 * 60 * 60 * 1000);
    const secretPart = randomHex(20);
    const plaintextToken = `ci_agt_demo_${secretPart}`;
    const token: AgentToken = {
      id: `tok-demo-${randomHex(4)}`,
      name: req.name.trim(),
      tokenPrefix: plaintextToken.slice(0, 16),
      scopes: req.scopes,
      maxConcurrentTasks: req.maxConcurrentTasks,
      maxTotalTasks: req.maxTotalTasks,
      tasksClaimedCount: 0,
      budgetNote: req.budgetNote?.trim() || undefined,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
      status: 'active',
    };
    const existing = await this.listAgentTokens();
    writeJson(STORAGE_KEYS.demoTokens, [token, ...existing]);
    return { token, plaintextToken };
  },

  async revokeAgentToken(id: string): Promise<void> {
    const existing = await this.listAgentTokens();
    const now = new Date().toISOString();
    const updated = existing.map((t) =>
      t.id === id ? { ...t, status: 'revoked' as const, revokedAt: now } : t
    );
    writeJson(STORAGE_KEYS.demoTokens, updated);
  },
};
