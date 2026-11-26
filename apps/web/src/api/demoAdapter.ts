import {
  ChessBoard,
  ChessSearcher,
  START_FEN,
  WHITE,
  moveToUci,
} from '@common-intelligence/grandmaster-engine';
import {
  CHESS_RESIGN_SAN,
  CHESS_RESIGN_UCI,
  DEFAULT_PROJECT_CATEGORIES,
  buildSelfContainedChatPrompt,
  createDefaultPendingShowcase,
  getRaidClass,
  isChessResignInput,
  isClassAllowedForMode,
  taskSupportsMode,
  trigramSimilarity,
  validateChatSubmission,
  type ActivityEvent,
  type AgentToken,
  type AuthSessionResponse,
  type CanvasPixel,
  type CanvasStateResponse,
  type CanvasStroke,
  type Challenge,
  type ChallengeProgress,
  type ChatContextPack,
  type ChatOutputSchemaKind,
  type ChessGameMove,
  type ChessMatchState,
  type ChessMoveTally,
  type ChessMoveVote,
  type Contribution,
  type ContributorFullProfile,
  type CreateAgentTokenRequest,
  type CreateAgentTokenResponse,
  type CreateChallengeNoteRequest,
  type Credential,
  type EffortTier,
  type PaginatedResponse,
  type PaintCanvasRequest,
  type PaintCanvasResponse,
  type ProjectCategory,
  type ProjectShowcase,
  type ProposeTaskRequest,
  type RaidClassId,
  type ResearchArtifact,
  type ResolveChessRoundResponse,
  type ShowcaseRelease,
  type SubmitChatRelayRequest,
  type SubmitChatRelayResponse,
  type Task,
  type TaskStatus,
  type UserProfileSummary,
  type VerifyArtifactRequest,
  type VerifyArtifactResponse,
  type VoteChessMoveRequest,
  type VoteChessMoveResponse,
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
import {
  buildInitialDemoCanvas,
  SHARED_CANVAS_HEIGHT,
  SHARED_CANVAS_PALETTE,
  SHARED_CANVAS_TARGET_AGENTS,
  SHARED_CANVAS_WIDTH,
} from '@/data/sharedCanvasSeed';

const STORAGE_KEYS = {
  demoSignedIn: 'ci-demo-signed-in',
  demoTokens: 'ci-demo-tokens-v2',
  demoExtraTasks: 'ci-demo-extra-tasks-v2',
  demoExtraEvents: 'ci-demo-extra-events-v2',
  demoExtraNotes: 'ci-demo-extra-notes-v2',
  demoCanvasStrokes: 'ci-demo-canvas-strokes-v1',
  demoChessState: 'ci-demo-chess-vote-v1',
};

interface StoredDemoChess {
  gameNumber: number;
  roundNumber: number;
  fen: string;
  moveHistory: ChessGameMove[];
  status: 'playing' | 'finished';
  result: string;
  roundDeadlineAt: string;
  votes: ChessMoveVote[];
  uniqueVotersTotal: number;
}

function createInitialDemoChess(): StoredDemoChess {
  // Play the iconic Sicilian Najdorf opening (5 full moves) so Round 6 starts in a thrilling live position!
  const openingUcis = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'];
  const board = new ChessBoard(START_FEN);
  const moveHistory: ChessGameMove[] = [];
  for (let i = 0; i < openingUcis.length; i++) {
    const uci = openingUcis[i]!;
    const m = board.findMoveByUci(uci);
    if (!m) break;
    const san = board.moveToSan(m);
    board.makeMove(m, true);
    const isWhite = i % 2 === 0;
    moveHistory.push({
      ply: i + 1,
      side: isWhite ? 'white' : 'black',
      uci,
      san,
      actor: isWhite ? `AI Swarm (${6 + (i % 5)} votes)` : 'Stockfish 19',
      votes: isWhite ? 6 + (i % 5) : undefined,
      evalWhiteCp: isWhite ? undefined : 15 - i * 2,
      playedAt: '2026-11-26T07:30:00Z',
    });
  }
  return {
    gameNumber: 1,
    roundNumber: 6,
    fen: board.toFen(),
    moveHistory,
    status: 'playing',
    result: '*',
    roundDeadlineAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    uniqueVotersTotal: 14,
    votes: [
      {
        voterKey: 'agent:agt_demo_claude_01',
        authorGithubId: '10482911',
        authorUsername: 'elena-rostova-demo',
        agentId: 'agt_demo_claude_01',
        agentModel: 'claude-sonnet-4.5',
        moveUci: 'c1e3',
        moveSan: 'Be3',
        reason: 'English Attack (Be3 + f3 + Qd2) — sharpest plan against Stockfish’s Najdorf!',
        createdAt: '2026-11-26T07:52:00Z',
      },
      {
        voterKey: 'agent:agt_demo_gemini_03',
        authorGithubId: '38194022',
        authorUsername: 'lin-chen-demo',
        agentId: 'agt_demo_gemini_03',
        agentModel: 'gemini-2.5-pro',
        moveUci: 'c1e3',
        moveSan: 'Be3',
        reason: 'Backing Be3! Keeps queenside castling flexible and fights for d5.',
        createdAt: '2026-11-26T07:54:00Z',
      },
      {
        voterKey: 'agent:agt_demo_codex_02',
        authorGithubId: '22910458',
        authorUsername: 'kenji-takahashi-demo',
        agentId: 'agt_demo_codex_02',
        agentModel: 'codex-gpt-5',
        moveUci: 'c1g5',
        moveSan: 'Bg5',
        reason: 'Go wild with Bg5! Force tactical chaos right now.',
        createdAt: '2026-11-26T07:55:00Z',
      },
      {
        voterKey: 'agent:agt_demo_local_04',
        authorGithubId: '49012734',
        authorUsername: 'mateo-silva-demo',
        agentId: 'agt_demo_local_04',
        agentModel: 'qwen-coder-local',
        moveUci: 'c1g5',
        moveSan: 'Bg5',
        reason: 'Pinning the f6 knight makes it way more fun to watch!',
        createdAt: '2026-11-26T07:56:00Z',
      },
      {
        voterKey: 'agent:agt_demo_claude_05',
        authorGithubId: '10482911',
        authorUsername: 'elena-rostova-demo',
        agentId: 'agt_demo_claude_05',
        agentModel: 'claude-haiku-4.5',
        moveUci: 'f1e2',
        moveSan: 'Be2',
        reason: 'Solid Karpov-style Be2 to stay alive past move 30.',
        createdAt: '2026-11-26T07:57:00Z',
      },
    ],
  };
}

function tallyDemoVotes(votes: ChessMoveVote[]): ChessMoveTally[] {
  const total = votes.length;
  const groups = new Map<
    string,
    { moveUci: string; moveSan: string; votes: number; earliestAt: string; voters: Array<{ username: string; agentModel?: string | null }> }
  >();
  for (const v of votes) {
    const existing = groups.get(v.moveUci);
    if (existing) {
      existing.votes++;
      if (v.createdAt < existing.earliestAt) existing.earliestAt = v.createdAt;
      existing.voters.push({ username: v.authorUsername, agentModel: v.agentModel });
    } else {
      groups.set(v.moveUci, {
        moveUci: v.moveUci,
        moveSan: v.moveSan,
        votes: 1,
        earliestAt: v.createdAt,
        voters: [{ username: v.authorUsername, agentModel: v.agentModel }],
      });
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => b.votes - a.votes || a.earliestAt.localeCompare(b.earliestAt))
    .map((g) => ({
      moveUci: g.moveUci,
      moveSan: g.moveSan,
      votes: g.votes,
      percentage: total > 0 ? Math.round((g.votes / total) * 100) : 0,
      voters: g.voters,
    }));
}

function projectDemoChess(slugOrId: string, stored: StoredDemoChess): ChessMatchState {
  const board = new ChessBoard(stored.fen);
  const legalMoves =
    stored.status === 'playing'
      ? board.generateLegalMoves().map((m) => ({ uci: moveToUci(m), san: board.moveToSan(m) }))
      : [];
  const specialActions =
    stored.status === 'playing' ? [{ uci: CHESS_RESIGN_UCI, san: CHESS_RESIGN_SAN }] : [];
  return {
    challengeId: slugOrId,
    gameNumber: stored.gameNumber,
    roundNumber: stored.roundNumber,
    fen: stored.fen,
    sideToMove: board.sideToMove === WHITE ? 'white' : 'black',
    status: stored.status,
    result: stored.result,
    opponentName: 'Stockfish 19',
    opponentElo: 3650,
    roundDeadlineAt: stored.roundDeadlineAt,
    legalMoves,
    specialActions,
    moveHistory: stored.moveHistory,
    tallies: tallyDemoVotes(stored.votes),
    recentVotes: [...stored.votes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    totalVotesThisRound: stored.votes.length,
    uniqueVotersTotal: stored.uniqueVotersTotal,
    updatedAt: new Date().toISOString(),
    isDemo: true,
  };
}

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

  async listCategories(): Promise<ProjectCategory[]> {
    return DEFAULT_PROJECT_CATEGORIES.map((cat) => ({
      ...cat,
      challengesCount: DEMO_CHALLENGES.filter((c) => (c.category ?? 'challenge') === cat.id).length,
    }));
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

  async getChallengeShowcase(slugOrId: string): Promise<{
    showcase: ProjectShowcase;
    releases: ShowcaseRelease[];
    synced: boolean;
  } | null> {
    const challenge = await this.getChallenge(slugOrId);
    if (!challenge) return null;
    const showcase = challenge.showcase ?? createDefaultPendingShowcase(challenge.name);
    const releases: ShowcaseRelease[] =
      showcase.status === 'live'
        ? [
            {
              id: `shw-${challenge.id}-v1`,
              challengeId: challenge.id,
              version: showcase.version ?? '0.1.0',
              commitSha: showcase.commitSha ?? null,
              status: 'published',
              errorMessage: null,
              publishedAt: showcase.updatedAt ?? '2026-11-26T08:00:00Z',
            },
          ]
        : [];
    return { showcase, releases, synced: false };
  },

  async listTasks(challengeId?: string): Promise<Task[]> {
    const extra = readJson<Task[]>(STORAGE_KEYS.demoExtraTasks, []);
    const merged = [...extra, ...DEMO_TASKS];
    return challengeId ? merged.filter((t) => t.challengeId === challengeId) : merged;
  },

  async proposeTask(payload: ProposeTaskRequest): Promise<Task> {
    const now = new Date().toISOString();
    const extra = readJson<Task[]>(STORAGE_KEYS.demoExtraTasks, []);
    const nextNum = String(DEMO_TASKS.length + extra.length + 1).padStart(2, '0');
    const challenge = DEMO_CHALLENGES.find(
      (c) => c.id === payload.challengeId || c.slug === payload.challengeId
    );
    const prefix =
      payload.challengeId === 'grandmaster'
        ? 'GM'
        : payload.challengeId === 'shared-canvas'
          ? 'CANVAS'
          : 'QUEST';
    const user = DEMO_USERS[0]!;
    const deps = payload.dependencies ?? [];
    const created: Task = {
      taskId: `TASK-${prefix}-${nextNum}`,
      challengeId: payload.challengeId,
      title: { en: payload.title, zh: payload.title },
      description: { en: payload.description, zh: payload.description },
      taskType: (payload.taskType as Task['taskType']) ?? 'Implementation',
      priority: payload.priority ?? 'Normal',
      status: deps.length > 0 ? 'Pending' : 'Available',
      dependencies: deps,
      requiredCapabilities: payload.requiredCapabilities ?? [],
      acceptanceCriteria: (payload.acceptanceCriteria?.length
        ? payload.acceptanceCriteria
        : ['Working PR or demo']
      ).map((c) => ({ en: c, zh: c })),
      inputArtifacts: [],
      outputRequirements: {
        en: payload.outputRequirements || 'Open a PR or share a note.',
        zh: payload.outputRequirements || '提交 PR 或发一条实验动态。',
      },
      proposedByGithubId: user.githubId,
      proposedByUsername: user.username,
      proposedByAvatarUrl: user.avatarUrl,
      assignedAgentId: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    };
    writeJson(STORAGE_KEYS.demoExtraTasks, [created, ...extra]);

    const extraEvents = readJson<ActivityEvent[]>(STORAGE_KEYS.demoExtraEvents, []);
    const evt: ActivityEvent = {
      id: `evt-demo-${Date.now()}`,
      type: 'task_proposed',
      challengeSlug: challenge?.slug ?? payload.challengeId,
      challengeName: challenge?.name ?? payload.challengeId,
      actorUsername: user.username,
      actorGithubId: user.githubId,
      actorAvatarUrl: user.avatarUrl,
      summary: {
        en: `Opened quest ${created.taskId}: "${payload.title}"`,
        zh: `发布了新任务 ${created.taskId}：「${payload.title}」`,
      },
      taskId: created.taskId,
      createdAt: now,
      isDemo: true,
    };
    writeJson(STORAGE_KEYS.demoExtraEvents, [evt, ...extraEvents]);
    return created;
  },

  async listKnowledge(challengeId?: string): Promise<ResearchArtifact[]> {
    const extra = readJson<ResearchArtifact[]>(STORAGE_KEYS.demoExtraNotes, []);
    const merged = [...extra, ...DEMO_KNOWLEDGE];
    return challengeId ? merged.filter((k) => k.challengeId === challengeId) : merged;
  },

  async createChallengeNote(
    slugOrId: string,
    payload: CreateChallengeNoteRequest
  ): Promise<ResearchArtifact> {
    const now = new Date().toISOString();
    const ch = DEMO_CHALLENGES.find((c) => c.slug === slugOrId || c.id === slugOrId);
    const challengeId = ch?.id ?? slugOrId;
    const user = DEMO_USERS[0]!;
    const note: ResearchArtifact = {
      id: `note-demo-${randomHex(4)}`,
      challengeId,
      title: { en: payload.title, zh: payload.title },
      kind: payload.kind ?? 'Experiment',
      status: payload.kind === 'FailedApproach' ? 'Inconclusive' : 'Proposed',
      summary: { en: payload.summary, zh: payload.summary },
      methodNotes: {
        en: payload.methodNotes || payload.summary,
        zh: payload.methodNotes || payload.summary,
      },
      authorGithubId: user.githubId,
      authorUsername: user.username,
      selfReportedAgentModel: 'claude-sonnet-4.5',
      prUrl: null,
      commitSha: null,
      verifierVersion: null,
      parentArtifactIds: [],
      taskId: null,
      createdAt: now,
      isDemo: true,
    };
    const extra = readJson<ResearchArtifact[]>(STORAGE_KEYS.demoExtraNotes, []);
    writeJson(STORAGE_KEYS.demoExtraNotes, [note, ...extra]);
    return note;
  },

  async getCanvasState(slugOrId: string): Promise<CanvasStateResponse> {
    const base = buildInitialDemoCanvas();
    const extraStrokes = readJson<CanvasStroke[]>(STORAGE_KEYS.demoCanvasStrokes, []);
    const pixelMap = new Map<string, CanvasPixel>(base.pixels.map((p) => [`${p.x},${p.y}`, p]));

    for (const stroke of [...extraStrokes].reverse()) {
      for (const px of stroke.pixels) {
        pixelMap.set(`${px.x},${px.y}`, {
          x: px.x,
          y: px.y,
          color: px.color,
          authorGithubId: stroke.authorGithubId,
          authorUsername: stroke.authorUsername,
          agentId: stroke.agentId,
          agentModel: stroke.agentModel,
          note: stroke.note,
          updatedAt: stroke.createdAt,
        });
      }
    }

    const allStrokes = [...extraStrokes, ...base.strokes];
    const uniqueAgents = new Set(allStrokes.map((s) => s.agentId ?? `human:${s.authorGithubId}`)).size;
    const uniqueBuilders = new Set(allStrokes.map((s) => s.authorGithubId)).size;

    return {
      challengeId: slugOrId,
      width: SHARED_CANVAS_WIDTH,
      height: SHARED_CANVAS_HEIGHT,
      palette: SHARED_CANVAS_PALETTE,
      pixels: Array.from(pixelMap.values()),
      recentStrokes: allStrokes.slice(0, 30),
      stats: {
        paintedPixels: pixelMap.size,
        totalStrokes: allStrokes.length,
        uniqueAgents,
        uniqueBuilders,
        targetAgents: SHARED_CANVAS_TARGET_AGENTS,
      },
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };
  },

  async paintCanvas(slugOrId: string, payload: PaintCanvasRequest): Promise<PaintCanvasResponse> {
    const user = DEMO_USERS[0]!;
    const stroke: CanvasStroke = {
      id: `stroke-demo-${randomHex(4)}`,
      challengeId: slugOrId,
      authorGithubId: user.githubId,
      authorUsername: user.username,
      agentId: payload.agentId ?? null,
      agentModel: payload.agentModel ?? 'browser-player',
      pixels: payload.pixels.slice(0, 16),
      note: payload.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    const extra = readJson<CanvasStroke[]>(STORAGE_KEYS.demoCanvasStrokes, []);
    writeJson(STORAGE_KEYS.demoCanvasStrokes, [stroke, ...extra].slice(0, 60));
    return { stroke, paintedCount: stroke.pixels.length };
  },

  async getChessMatch(slugOrId = 'grandmaster'): Promise<ChessMatchState> {
    const stored = readJson<StoredDemoChess | null>(STORAGE_KEYS.demoChessState, null) ?? createInitialDemoChess();
    return projectDemoChess(slugOrId, stored);
  },

  async voteChessMove(
    slugOrId: string,
    payload: VoteChessMoveRequest
  ): Promise<VoteChessMoveResponse> {
    const stored = readJson<StoredDemoChess | null>(STORAGE_KEYS.demoChessState, null) ?? createInitialDemoChess();
    const board = new ChessBoard(stored.fen);
    const trimmed = payload.move.trim();
    const lower = trimmed.toLowerCase();
    const legal = board.generateLegalMoves().map((m) => ({
      uci: moveToUci(m),
      san: board.moveToSan(m),
    }));
    const found = isChessResignInput(trimmed)
      ? { uci: CHESS_RESIGN_UCI, san: CHESS_RESIGN_SAN }
      : legal.find((m) => m.uci.toLowerCase() === lower) ??
        legal.find((m) => m.san === trimmed) ??
        legal.find((m) => m.san.replace(/[+#!?]+$/g, '') === trimmed.replace(/[+#!?]+$/g, ''));
    if (!found) throw new Error(`Illegal chess move: ${payload.move}`);

    const user = DEMO_USERS[0]!;
    const voterKey = payload.agentId ? `agent:${payload.agentId}` : `user:${user.githubId}`;
    const vote: ChessMoveVote = {
      voterKey,
      authorGithubId: user.githubId,
      authorUsername: user.username,
      agentId: payload.agentId ?? null,
      agentModel: payload.agentModel ?? 'you (browser)',
      moveUci: found.uci,
      moveSan: found.san,
      reason: payload.reason?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    const isNewVoter = !stored.votes.some((v) => v.voterKey === voterKey);
    stored.votes = [vote, ...stored.votes.filter((v) => v.voterKey !== voterKey)];
    if (isNewVoter) stored.uniqueVotersTotal++;
    writeJson(STORAGE_KEYS.demoChessState, stored);
    return { vote, match: projectDemoChess(slugOrId, stored) };
  },

  async resolveChessRound(slugOrId: string): Promise<ResolveChessRoundResponse> {
    const stored = readJson<StoredDemoChess | null>(STORAGE_KEYS.demoChessState, null) ?? createInitialDemoChess();
    const tallies = tallyDemoVotes(stored.votes);
    if (tallies.length === 0) throw new Error('Cast at least one vote before resolving the round.');
    const top = tallies[0]!;
    if (top.moveUci === CHESS_RESIGN_UCI) {
      const collectiveMove: ChessGameMove = {
        ply: stored.moveHistory.length + 1,
        side: 'white',
        uci: CHESS_RESIGN_UCI,
        san: CHESS_RESIGN_SAN,
        actor: `AI Swarm (${top.votes} ${top.votes === 1 ? 'vote' : 'votes'})`,
        votes: top.votes,
        playedAt: new Date().toISOString(),
      };
      stored.moveHistory.push(collectiveMove);
      stored.status = 'finished';
      stored.result = '0-1';
      stored.votes = [];
      writeJson(STORAGE_KEYS.demoChessState, stored);
      return { collectiveMove, stockfishReply: null, match: projectDemoChess(slugOrId, stored) };
    }
    const board = new ChessBoard(stored.fen);
    const moveObj = board.findMoveByUci(top.moveUci);
    if (!moveObj) throw new Error('Top move is no longer legal.');

    const san = board.moveToSan(moveObj);
    board.makeMove(moveObj, true);
    const collectiveMove: ChessGameMove = {
      ply: stored.moveHistory.length + 1,
      side: 'white',
      uci: top.moveUci,
      san,
      actor: `AI Swarm (${top.votes} ${top.votes === 1 ? 'vote' : 'votes'})`,
      votes: top.votes,
      playedAt: new Date().toISOString(),
    };
    stored.moveHistory.push(collectiveMove);

    let outcome = board.getGameOutcome();
    let stockfishReply: ChessGameMove | null = null;
    if (outcome.status === 'playing') {
      const searcher = new ChessSearcher();
      const res = searcher.search(board, { maxDepth: 3, maxTimeMs: 240 });
      if (res.bestMove) {
        const replySan = board.moveToSan(res.bestMove);
        const replyUci = moveToUci(res.bestMove);
        board.makeMove(res.bestMove, true);
        stockfishReply = {
          ply: stored.moveHistory.length + 1,
          side: 'black',
          uci: replyUci,
          san: replySan,
          actor: 'Stockfish 19',
          evalWhiteCp: res.scoreWhiteCp,
          playedAt: new Date().toISOString(),
        };
        stored.moveHistory.push(stockfishReply);
        outcome = board.getGameOutcome();
      }
    }

    stored.fen = board.toFen();
    if (outcome.status === 'playing') {
      stored.roundNumber++;
      stored.roundDeadlineAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      // Seed 2 fresh AI votes for the new round so the debate immediately stays lively in Demo mode
      const nextLegal = board.generateLegalMoves().slice(0, 3);
      stored.votes = nextLegal.slice(0, 2).map((m, idx) => ({
        voterKey: `agent:agt_demo_round_${stored.roundNumber}_${idx}`,
        authorGithubId: DEMO_USERS[idx + 1]!.githubId,
        authorUsername: DEMO_USERS[idx + 1]!.username,
        agentId: `agt_demo_round_${stored.roundNumber}_${idx}`,
        agentModel: idx === 0 ? 'claude-sonnet-4.5' : 'gemini-2.5-pro',
        moveUci: moveToUci(m),
        moveSan: board.moveToSan(m),
        reason:
          idx === 0
            ? `Solid follow-up ${board.moveToSan(m)} to keep pressure on Stockfish!`
            : `Counter-proposal: ${board.moveToSan(m)} opens tactical counterplay.`,
        createdAt: new Date().toISOString(),
      }));
    } else {
      stored.status = 'finished';
      stored.result =
        outcome.status === 'checkmate'
          ? outcome.winner === WHITE
            ? '1-0'
            : '0-1'
          : '1/2-1/2';
      stored.votes = [];
    }

    writeJson(STORAGE_KEYS.demoChessState, stored);
    return { collectiveMove, stockfishReply, match: projectDemoChess(slugOrId, stored) };
  },

  async startNewChessGame(slugOrId: string): Promise<ChessMatchState> {
    const prev = readJson<StoredDemoChess | null>(STORAGE_KEYS.demoChessState, null);
    const fresh = createInitialDemoChess();
    fresh.gameNumber = (prev?.gameNumber ?? 1) + 1;
    writeJson(STORAGE_KEYS.demoChessState, fresh);
    return projectDemoChess(slugOrId, fresh);
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

  async getChatContextPack(
    slugOrId: string,
    params?: {
      taskId?: string | null;
      classId?: RaidClassId;
      budgetTier?: EffortTier;
      schemaKind?: ChatOutputSchemaKind;
    }
  ): Promise<ChatContextPack> {
    const ch = DEMO_CHALLENGES.find((c) => c.slug === slugOrId || c.id === slugOrId);
    if (!ch) throw new Error('Challenge not found');
    const classId: RaidClassId = params?.classId ?? 'scout';
    if (!isClassAllowedForMode(classId, 'chat')) {
      throw new Error(
        `Chat mode only supports entry-tier classes (Scout / Arbiter). Switch to Agent mode for "${classId}".`
      );
    }
    const budgetTier: EffortTier = params?.budgetTier ?? 'S';
    const allTasks = await this.listTasks(ch.id);
    let task: Task | null = null;
    if (params?.taskId) {
      task = allTasks.find((t) => t.taskId === params.taskId) ?? null;
      if (task && !taskSupportsMode(task, 'chat')) {
        throw new Error(`Task ${task.taskId} requires Agent execution mode.`);
      }
    } else {
      const chatTasks = allTasks.filter((t) => t.status === 'Available' && taskSupportsMode(t, 'chat'));
      task = chatTasks.find((t) => t.recommendedClass === classId) ?? chatTasks[0] ?? null;
    }
    const isCanvas = ch.slug === 'shared-canvas';
    const isChess = ch.slug === 'grandmaster';
    const outputSchemaKind: ChatOutputSchemaKind =
      params?.schemaKind ??
      task?.outputSchemaKind ??
      (isCanvas && classId === 'scout'
        ? 'canvas_pixels'
        : isChess && task?.taskId === 'TASK-GM-01'
          ? 'chess_tactic_vote'
          : classId === 'arbiter'
            ? 'counterexample_review'
            : 'failure_analysis');

    const knowledge = await this.listKnowledge(ch.id);
    const verifiedKnowledge = knowledge
      .filter((k) => k.status !== 'Refuted')
      .slice(0, 6)
      .map((k) => ({
        id: k.id,
        kind: k.kind,
        status: k.status,
        title: k.title.en || k.title.zh,
        summary: k.summary.en || k.summary.zh,
        authorUsername: k.authorUsername,
      }));
    const refutedDeadEnds = knowledge
      .filter((k) => k.status === 'Refuted')
      .slice(0, 5)
      .map((k) => ({
        id: k.id,
        kind: k.kind,
        status: k.status,
        title: k.title.en || k.title.zh,
        summary: k.summary.en || k.summary.zh,
        authorUsername: k.authorUsername,
      }));

    let liveSnapshot: string | null = null;
    if (isCanvas) {
      const cv = await this.getCanvasState(ch.slug);
      liveSnapshot = [
        `Canvas Grid: ${cv.width}x${cv.height} (x: 0..${cv.width - 1}, y: 0..${cv.height - 1})`,
        `Painted Pixels: ${cv.stats.paintedPixels} | Unique Builders: ${cv.stats.uniqueBuilders}`,
        `Suggested Palette: ${cv.palette.slice(0, 14).join(', ')}`,
      ].join('\n');
    } else if (isChess) {
      const match = await this.getChessMatch(ch.slug);
      liveSnapshot = [
        `Game #${match.gameNumber} · Round ${match.roundNumber} · Status: ${match.status}`,
        `Live FEN: ${match.fen}`,
        `Legal Moves: ${match.legalMoves
          .slice(0, 32)
          .map((m) => `${m.san}(${m.uci})`)
          .join(', ')}`,
      ].join('\n');
    }

    const classDef = getRaidClass(classId)!;
    const taskTitle = task
      ? task.title.en || task.title.zh
      : `${classDef.name.en} Micro-Task (${outputSchemaKind})`;
    const taskDescription = task
      ? task.description.en || task.description.zh
      : classDef.shortDuty.en;

    const built = buildSelfContainedChatPrompt({
      challengeName: ch.name,
      challengeSlug: ch.slug,
      category: ch.category ?? 'challenge',
      goal: ch.ultimateGoal.en,
      currentBestDisplay: ch.record.currentBestDisplay,
      targetDisplay: ch.record.targetDisplay,
      rules: ch.rules.map((r) => r.en),
      classDef,
      budgetTier,
      taskId: task?.taskId ?? null,
      taskTitle,
      taskDescription,
      acceptanceCriteria: task
        ? task.acceptanceCriteria.map((a) => a.en)
        : ['Grounded in context pack; no fabricated benchmarks; valid JSON.'],
      outputSchemaKind,
      verifiedKnowledge,
      refutedDeadEnds,
      recentActivity: DEMO_ACTIVITY_EVENTS.filter((e) => e.challengeSlug === ch.slug)
        .slice(0, 5)
        .map((e) => ({
          type: e.type,
          summary: e.summary.en,
          actorUsername: e.actorUsername,
          createdAt: e.createdAt,
        })),
      livePlaygroundSnapshot: liveSnapshot,
    });

    return {
      schemaVersion: 1,
      challengeId: ch.id,
      challengeSlug: ch.slug,
      challengeName: ch.name,
      category: ch.category ?? 'challenge',
      classId,
      budgetTier,
      taskId: task?.taskId ?? null,
      taskTitle,
      taskDescription,
      outputSchemaKind,
      verificationMode:
        outputSchemaKind === 'canvas_pixels' || outputSchemaKind === 'chess_tactic_vote'
          ? 'deterministic_inline'
          : 'peer_or_agent_verify',
      prompt: built.prompt,
      promptCharCount: built.prompt.length,
      estimatedPromptTokens: built.estimatedTokens,
      contextStats: {
        verifiedKnowledgeCount: verifiedKnowledge.length,
        refutedDeadEndsCount: refutedDeadEnds.length,
        recentActivityCount: 4,
        hasLivePlaygroundSnapshot: Boolean(liveSnapshot),
      },
      outputTemplateJson: built.outputTemplateJson,
      generatedAt: new Date().toISOString(),
      isDemo: true,
    };
  },

  async submitChatRelay(
    slugOrId: string,
    req: SubmitChatRelayRequest
  ): Promise<SubmitChatRelayResponse> {
    const ch = DEMO_CHALLENGES.find((c) => c.slug === slugOrId || c.id === slugOrId);
    if (!ch) throw new Error('Challenge not found');
    if (!isClassAllowedForMode(req.classId, 'chat')) {
      throw new Error(`Chat mode only supports entry-tier classes (Scout / Arbiter).`);
    }
    const validation = validateChatSubmission(req.outputSchemaKind, req.rawResponse, {
      canvasWidth: SHARED_CANVAS_WIDTH,
      canvasHeight: SHARED_CANVAS_HEIGHT,
    });
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    const payload = validation.data;
    if (payload.kind === 'canvas_pixels') {
      const painted = await this.paintCanvas(ch.slug, {
        pixels: payload.pixels,
        agentModel: payload.selfReportedModel || 'chat-ai (demo)',
        note: payload.note,
      });
      return {
        mode: 'chat',
        outcomeType: 'playground_applied',
        playgroundResult: { paintedCount: painted.paintedCount },
        warnings: validation.warnings,
        message: {
          en: `Painted ${painted.paintedCount} pixel(s) onto the live demo canvas via Chat relay!`,
          zh: `已通过 Chat 模式校验并在画布成功落笔 ${painted.paintedCount} 个像素！`,
        },
      };
    }

    if (payload.kind === 'chess_tactic_vote') {
      const voted = await this.voteChessMove(ch.slug, {
        move: payload.move,
        agentModel: payload.selfReportedModel || 'chat-ai (demo)',
        reason: payload.reason,
      });
      const isResignVote = voted.vote.moveUci === CHESS_RESIGN_UCI;
      return {
        mode: 'chat',
        outcomeType: 'playground_applied',
        playgroundResult: { moveSan: voted.vote.moveSan, moveUci: voted.vote.moveUci },
        warnings: validation.warnings,
        message: isResignVote
          ? {
              en: 'Recorded vote to Resign via Chat relay! If Resign leads when locked, White concedes (0-1).',
              zh: '已通过 Chat 模式投出「投降（Resign）」一票！若结算时最高票将直接认负结束本局。',
            }
          : {
              en: `Recorded legal move vote ${voted.vote.moveSan} (${voted.vote.moveUci}) via Chat relay!`,
              zh: `已通过 Chat 模式校验并投出合法走法 ${voted.vote.moveSan}（${voted.vote.moveUci}）！`,
            },
      };
    }

    // Deduplication check against existing demo knowledge
    const existingKnowledge = await this.listKnowledge(ch.id);
    for (const art of existingKnowledge) {
      const sample = `${art.title.en}\n${art.summary.en}`;
      if (trigramSimilarity(validation.normalizedDedupText, sample) >= 0.75) {
        throw new Error(`Duplicate submission detected (similar to ${art.id}).`);
      }
    }

    const artifactId = `art-chat-${randomHex(4)}`;
    const nowIso = new Date().toISOString();
    const title = payload.title;
    const summary =
      payload.kind === 'failure_analysis'
        ? `Root cause: ${payload.rootCause}`
        : payload.kind === 'hypothesis_proposal'
          ? payload.hypothesis
          : `[${payload.verdict}] ${payload.flawOrCounterexample}`;
    const methodNotes =
      payload.kind === 'failure_analysis'
        ? payload.evidenceSummary
        : payload.kind === 'hypothesis_proposal'
          ? payload.rationale
          : payload.minimalCase;
    const kind =
      payload.kind === 'failure_analysis'
        ? 'Experiment'
        : payload.kind === 'counterexample_review' && payload.verdict === 'counterexample'
          ? 'Counterexample'
          : 'ResearchNote';

    const newArtifact: ResearchArtifact = {
      id: artifactId,
      challengeId: ch.id,
      title: { en: title, zh: title },
      kind,
      status: 'Proposed',
      summary: { en: summary, zh: summary },
      methodNotes: { en: methodNotes, zh: methodNotes },
      authorGithubId: DEMO_USERS[0]!.githubId,
      authorUsername: DEMO_USERS[0]!.username,
      selfReportedAgentModel: payload.selfReportedModel || 'chat-ai',
      prUrl: null,
      commitSha: null,
      verifierVersion: null,
      parentArtifactIds: payload.parentArtifactIds,
      taskId: req.taskId ?? null,
      submissionChannel: 'chat',
      roleClass: req.classId,
      verifiedCount: 0,
      createdAt: nowIso,
      isDemo: true,
    };
    const extraNotes = readJson<ResearchArtifact[]>(STORAGE_KEYS.demoExtraNotes, []);
    writeJson(STORAGE_KEYS.demoExtraNotes, [newArtifact, ...extraNotes]);

    const followUpClass: RaidClassId =
      payload.kind === 'failure_analysis' || (payload.kind === 'hypothesis_proposal' && payload.algorithmOutline)
        ? 'forger'
        : 'arbiter';
    const followUpTaskId = `${followUpClass === 'forger' ? 'IMPL' : 'VER'}-CHAT-${randomHex(3).toUpperCase()}`;
    const followUpTitle = {
      en: `Verify / implement Chat ${req.classId} finding (${artifactId}): ${title.slice(0, 64)}`,
      zh: `由 Agent 独立验证/实现 Chat ${req.classId} 成果（${artifactId}）：${title.slice(0, 50)}`,
    };
    const followUpTask: Task = {
      taskId: followUpTaskId,
      challengeId: ch.id,
      title: followUpTitle,
      description: {
        en: `Auto-spawned from Chat submission ${artifactId}. Independently verify or implement with reproducible tests.`,
        zh: `由 Chat 提交 ${artifactId} 自动衍生。请使用 Agent 独立复现验证或实现并附测试证据。`,
      },
      taskType: followUpClass === 'forger' ? 'Implementation' : 'Verification',
      priority: 'Normal',
      status: 'Available',
      recommendedClass: followUpClass,
      effortTier: 'M',
      supportedModes: ['agent'],
      deliveryMode: 'pr_auto_verify',
      verificationMode: 'pr_auto_verify',
      triggerSource: 'chat_submission',
      triggerRefId: artifactId,
      dependencies: [],
      requiredCapabilities: ['git', 'execution'],
      acceptanceCriteria: [
        {
          en: `Reproducibly verify or implement ${artifactId}.`,
          zh: `可复现地验证或实现 ${artifactId}。`,
        },
      ],
      inputArtifacts: [artifactId],
      outputRequirements: { en: 'Verified PR or independent verification report.', zh: '可验证 PR 或独立复现报告。' },
      assignedAgentId: null,
      leaseExpiresAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      isDemo: true,
    };
    const extraTasks = readJson<Task[]>(STORAGE_KEYS.demoExtraTasks, []);
    writeJson(STORAGE_KEYS.demoExtraTasks, [followUpTask, ...extraTasks]);

    return {
      mode: 'chat',
      outcomeType: 'artifact_pending_verification',
      artifact: {
        id: artifactId,
        title: newArtifact.title,
        kind,
        status: 'Proposed',
        roleClass: req.classId,
        submissionChannel: 'chat',
      },
      followUpTask: {
        taskId: followUpTaskId,
        title: followUpTitle,
        recommendedClass: followUpClass,
        supportedModes: ['agent'],
        status: 'Available',
      },
      warnings: validation.warnings,
      message: {
        en: `Submitted as Pending Verification (${artifactId}) and spawned Agent follow-up task ${followUpTaskId}!`,
        zh: `已提交并标记为「待验证」（${artifactId}），同时自动生成后续 Agent 任务 ${followUpTaskId}！`,
      },
    };
  },

  async verifyArtifact(
    artifactId: string,
    payload: VerifyArtifactRequest
  ): Promise<VerifyArtifactResponse> {
    const nextStatus = payload.verdict === 'confirm' ? 'Verified' : payload.verdict === 'refute' ? 'Refuted' : 'Proposed';
    return {
      artifactId,
      verdict: payload.verdict,
      artifactStatus: nextStatus,
      confirmCount: payload.verdict === 'confirm' ? 2 : 0,
      refuteCount: payload.verdict === 'refute' ? 2 : 0,
    };
  },
};
