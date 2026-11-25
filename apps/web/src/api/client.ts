import type {
  ActivityEvent,
  ApproveProjectProposalRequest,
  AgentToken,
  ApiErrorBody,
  AuthSessionResponse,
  Challenge,
  ChallengeProgress,
  Contribution,
  ContributorFullProfile,
  CreateAgentTokenRequest,
  CreateAgentTokenResponse,
  CreateProjectProposalRequest,
  Credential,
  PaginatedResponse,
  ProposeTaskRequest,
  ProjectProposal,
  ProjectProposalStatus,
  ProjectShowcase,
  ResearchArtifact,
  ShowcaseRelease,
  SiteTrafficOverview,
  Task,
  UserProfileSummary,
} from '@common-intelligence/shared';
import { demoAdapter } from './demoAdapter';

export type DataMode = 'demo' | 'api';

export const DATA_MODE: DataMode =
  (import.meta.env.VITE_DATA_MODE as DataMode | undefined) === 'api' ? 'api' : 'demo';

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export const PUBLIC_APP_URL: string = (
  import.meta.env.VITE_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://commonintelligence.org')
).replace(/\/$/, '');

let currentCsrfToken: string | undefined;

export class ApiRequestError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (currentCsrfToken && init?.method && init.method !== 'GET') {
    headers.set('X-CSRF-Token', currentCsrfToken);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errBody: ApiErrorBody | undefined;
    try {
      errBody = (await res.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body
    }
    throw new ApiRequestError(
      res.status,
      errBody?.message ?? `Request failed (${res.status})`,
      errBody
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const apiClient = {
  mode: DATA_MODE,

  getGitHubLoginUrl(returnTo?: string): string {
    const query = returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '';
    return `${API_BASE_URL}/auth/github${query}`;
  },

  recordSiteActivity(path?: string): Promise<void> {
    return apiFetch('/api/site-traffic', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  getSiteTraffic(): Promise<SiteTrafficOverview> {
    return apiFetch('/api/admin/console/traffic');
  },

  async getMe(): Promise<AuthSessionResponse> {
    if (DATA_MODE === 'demo') return demoAdapter.getMe();
    const session = await apiFetch<AuthSessionResponse>('/api/me');
    currentCsrfToken = session.csrfToken;
    return session;
  },

  async demoSignIn(): Promise<AuthSessionResponse> {
    return demoAdapter.demoSignIn();
  },

  async logout(): Promise<void> {
    if (DATA_MODE === 'demo') return demoAdapter.logout();
    await apiFetch<void>('/auth/logout', { method: 'POST' });
    currentCsrfToken = undefined;
  },

  async listChallenges(offset = 0, limit = 50): Promise<PaginatedResponse<Challenge>> {
    if (DATA_MODE === 'demo') {
      const all = await demoAdapter.listChallenges();
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset, isDemo: true };
    }
    return apiFetch<PaginatedResponse<Challenge>>(`/api/challenges?limit=${limit}&offset=${offset}`);
  },

  createProjectProposal(body: CreateProjectProposalRequest, key: string): Promise<ProjectProposal> {
    return apiFetch('/api/project-proposals', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
  },

  createAgentJoinCode(challengeId: string): Promise<{ code: string; expiresAt: string }> {
    return apiFetch('/api/agent-join', {
      method: 'POST',
      body: JSON.stringify({ challengeId }),
    });
  },

  listProjectProposals(offset: number, reviewStatus?: ProjectProposalStatus): Promise<PaginatedResponse<ProjectProposal>> {
    const url = reviewStatus
      ? `/api/admin/project-proposals?status=${reviewStatus}&offset=${offset}`
      : `/api/project-proposals?offset=${offset}`;
    return apiFetch(url);
  },

  approveProjectProposal(id: string, body: ApproveProjectProposalRequest): Promise<ProjectProposal> {
    return apiFetch(`/api/admin/project-proposals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  rejectProjectProposal(id: string, reason: string): Promise<ProjectProposal> {
    return apiFetch(`/api/admin/project-proposals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getChallenge(slugOrId: string): Promise<Challenge | null> {
    if (DATA_MODE === 'demo') return demoAdapter.getChallenge(slugOrId);
    try {
      return await apiFetch<Challenge>(`/api/challenges/${encodeURIComponent(slugOrId)}`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },

  async getChallengeProgress(slugOrId: string): Promise<ChallengeProgress | null> {
    if (DATA_MODE === 'demo') return demoAdapter.getChallengeProgress(slugOrId);
    try {
      return await apiFetch<ChallengeProgress>(
        `/api/challenges/${encodeURIComponent(slugOrId)}/progress`
      );
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },

  async getChallengeShowcase(
    slugOrId: string,
    refresh = false
  ): Promise<{
    showcase: ProjectShowcase;
    releases: ShowcaseRelease[];
    synced: boolean;
    rawUrl?: string;
    syncError?: string;
  } | null> {
    if (DATA_MODE === 'demo') return demoAdapter.getChallengeShowcase(slugOrId);
    try {
      const qs = refresh ? '?refresh=1' : '';
      return await apiFetch(`/api/challenges/${encodeURIComponent(slugOrId)}/showcase${qs}`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },

  async listTasks(challengeId?: string): Promise<Task[]> {
    if (DATA_MODE === 'demo') return demoAdapter.listTasks(challengeId);
    const qs = challengeId ? `?challengeId=${encodeURIComponent(challengeId)}` : '';
    const data = await apiFetch<PaginatedResponse<Task>>(`/api/tasks${qs}`);
    return data.items;
  },

  async proposeTask(payload: ProposeTaskRequest): Promise<Task> {
    if (DATA_MODE === 'demo') return demoAdapter.proposeTask(payload);
    return apiFetch<Task>('/api/tasks/propose', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listKnowledge(challengeId?: string): Promise<ResearchArtifact[]> {
    if (DATA_MODE === 'demo') return demoAdapter.listKnowledge(challengeId);
    const qs = challengeId ? `?challengeId=${encodeURIComponent(challengeId)}` : '';
    const data = await apiFetch<PaginatedResponse<ResearchArtifact>>(`/api/knowledge${qs}`);
    return data.items;
  },

  async listContributions(challengeId?: string): Promise<Contribution[]> {
    if (DATA_MODE === 'demo') return demoAdapter.listContributions(challengeId);
    const qs = challengeId ? `?challengeId=${encodeURIComponent(challengeId)}` : '';
    const data = await apiFetch<PaginatedResponse<Contribution>>(`/api/contributions${qs}`);
    return data.items;
  },

  async listActivity(): Promise<PaginatedResponse<ActivityEvent>> {
    if (DATA_MODE === 'demo') return demoAdapter.listActivity();
    return apiFetch<PaginatedResponse<ActivityEvent>>('/api/activity?limit=50');
  },

  async listContributors(): Promise<UserProfileSummary[]> {
    if (DATA_MODE === 'demo') return demoAdapter.listContributors();
    const data = await apiFetch<PaginatedResponse<UserProfileSummary>>('/api/contributors');
    return data.items;
  },

  async getContributorProfile(username: string): Promise<ContributorFullProfile | null> {
    if (DATA_MODE === 'demo') return demoAdapter.getContributorProfile(username);
    try {
      return await apiFetch<ContributorFullProfile>(
        `/api/contributors/${encodeURIComponent(username)}`
      );
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },

  async getCredential(id: string): Promise<Credential | null> {
    if (DATA_MODE === 'demo') return demoAdapter.getCredential(id);
    try {
      return await apiFetch<Credential>(`/api/credentials/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },

  async listAgentTokens(): Promise<AgentToken[]> {
    if (DATA_MODE === 'demo') return demoAdapter.listAgentTokens();
    const data = await apiFetch<PaginatedResponse<AgentToken>>('/api/agent-tokens');
    return data.items;
  },

  async createAgentToken(req: CreateAgentTokenRequest): Promise<CreateAgentTokenResponse> {
    if (DATA_MODE === 'demo') return demoAdapter.createAgentToken(req);
    return apiFetch<CreateAgentTokenResponse>('/api/agent-tokens', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async revokeAgentToken(id: string): Promise<void> {
    if (DATA_MODE === 'demo') return demoAdapter.revokeAgentToken(id);
    await apiFetch<void>(`/api/agent-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
