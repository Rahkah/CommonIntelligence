import { Hono } from 'hono';
import { z } from 'zod';
import {
  ChessBoard,
  ChessSearcher,
  START_FEN,
  WHITE,
  moveToUci,
  type ChessMove,
} from '@common-intelligence/grandmaster-engine';
import {
  CHESS_RESIGN_SAN,
  CHESS_RESIGN_UCI,
  isChessResignInput,
  type ChessGameMove,
  type ChessMatchState,
  type ChessMoveOption,
  type ChessMoveTally,
  type ChessMoveVote,
} from '@common-intelligence/shared';
import { anyBearer, browser } from './auth';
import { type App, fail, iso, json, now, one, rate, sql } from './core';

const ROUND_DURATION_MS = 10 * 60 * 1000; // 10 minutes per voting round
const OPPONENT_NAME = 'Stockfish 19';
const OPPONENT_ELO = 3650;

const voteSchema = z.object({
  move: z.string().trim().min(2).max(12),
  agentId: z.string().trim().max(150).optional(),
  agentModel: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(200).optional(),
});

interface MatchRow {
  challenge_id: string;
  game_number: number;
  round_number: number;
  fen: string;
  move_history_json: string;
  status: 'playing' | 'finished';
  result: string;
  round_deadline_at: string;
  updated_at: string;
}

interface VoteRow {
  voter_key: string;
  author_github_id: string;
  author_username: string;
  agent_id: string | null;
  agent_model: string | null;
  move_uci: string;
  move_san: string;
  reason: string | null;
  created_at: string;
}

export const chess = new Hono<App>();

async function resolveChallenge(db: D1Database, slugOrId: string) {
  const row = await sql(
    db,
    'SELECT id, slug, status FROM challenges WHERE id=? OR slug=?',
    slugOrId,
    slugOrId
  ).first<{ id: string; slug: string; status: string }>();
  if (!row) fail(404, 'NOT_FOUND', 'Chess arena not found.');
  return row;
}

async function ensureMatch(db: D1Database, challengeId: string): Promise<MatchRow> {
  const existing = await sql(
    db,
    'SELECT * FROM chess_matches WHERE challenge_id=?',
    challengeId
  ).first<MatchRow>();
  if (existing) return existing;

  const deadline = iso(ROUND_DURATION_MS);
  const updated = iso();
  await sql(
    db,
    `INSERT OR IGNORE INTO chess_matches(challenge_id, game_number, round_number, fen, move_history_json, status, result, round_deadline_at, updated_at)
     VALUES(?, 1, 1, ?, '[]', 'playing', '*', ?, ?)`,
    challengeId,
    START_FEN,
    deadline,
    updated
  ).run();
  const created = await sql(
    db,
    'SELECT * FROM chess_matches WHERE challenge_id=?',
    challengeId
  ).first<MatchRow>();
  if (!created) fail(500, 'INTERNAL_ERROR', 'Could not initialize chess match.');
  return created;
}

function listLegalMoveOptions(board: ChessBoard): Array<ChessMoveOption & { raw: ChessMove }> {
  return board.generateLegalMoves().map((m) => ({
    uci: moveToUci(m),
    san: board.moveToSan(m),
    raw: m,
  }));
}

function findLegalMove(board: ChessBoard, input: string): (ChessMoveOption & { raw: ChessMove }) | null {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const normalizedSan = trimmed.replace(/[+#!?]+$/g, '');
  const options = listLegalMoveOptions(board);
  return (
    options.find((o) => o.uci.toLowerCase() === lower) ??
    options.find((o) => o.san === trimmed) ??
    options.find((o) => o.san.replace(/[+#!?]+$/g, '') === normalizedSan) ??
    null
  );
}

function findVoteOption(
  board: ChessBoard,
  input: string
): { uci: string; san: string; raw: ChessMove | null; isResign: boolean } | null {
  if (isChessResignInput(input)) {
    return { uci: CHESS_RESIGN_UCI, san: CHESS_RESIGN_SAN, raw: null, isResign: true };
  }
  const legal = findLegalMove(board, input);
  return legal ? { ...legal, isResign: false } : null;
}

function outcomeResult(board: ChessBoard): { finished: boolean; result: string } {
  const outcome = board.getGameOutcome();
  if (outcome.status === 'playing') return { finished: false, result: '*' };
  if (outcome.status === 'checkmate') {
    return { finished: true, result: outcome.winner === WHITE ? '1-0' : '0-1' };
  }
  return { finished: true, result: '1/2-1/2' };
}

function buildTallies(votes: VoteRow[]): ChessMoveTally[] {
  const total = votes.length;
  const groups = new Map<
    string,
    { moveUci: string; moveSan: string; votes: number; earliestAt: string; voters: Array<{ username: string; agentModel?: string | null }> }
  >();
  for (const v of votes) {
    const existing = groups.get(v.move_uci);
    if (existing) {
      existing.votes++;
      if (v.created_at < existing.earliestAt) existing.earliestAt = v.created_at;
      existing.voters.push({ username: v.author_username, agentModel: v.agent_model });
    } else {
      groups.set(v.move_uci, {
        moveUci: v.move_uci,
        moveSan: v.move_san,
        votes: 1,
        earliestAt: v.created_at,
        voters: [{ username: v.author_username, agentModel: v.agent_model }],
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
      voters: g.voters.slice(0, 8),
    }));
}

async function buildMatchState(db: D1Database, match: MatchRow): Promise<ChessMatchState> {
  const board = new ChessBoard(match.fen);
  const legalMoves =
    match.status === 'playing'
      ? listLegalMoveOptions(board).map(({ uci, san }) => ({ uci, san }))
      : [];
  const specialActions: ChessMoveOption[] =
    match.status === 'playing' ? [{ uci: CHESS_RESIGN_UCI, san: CHESS_RESIGN_SAN }] : [];

  const [roundVotesRes, uniqueRes] = await db.batch<Record<string, unknown>>([
    sql(
      db,
      `SELECT voter_key, author_github_id, author_username, agent_id, agent_model, move_uci, move_san, reason, created_at
       FROM chess_votes WHERE challenge_id=? AND game_number=? AND round_number=?
       ORDER BY created_at DESC`,
      match.challenge_id,
      match.game_number,
      match.round_number
    ),
    sql(
      db,
      `SELECT count(DISTINCT voter_key) n FROM chess_votes WHERE challenge_id=?`,
      match.challenge_id
    ),
  ]);

  const voteRows = roundVotesRes.results as unknown as VoteRow[];
  const recentVotes: ChessMoveVote[] = voteRows.slice(0, 30).map((v) => ({
    voterKey: v.voter_key,
    authorGithubId: v.author_github_id,
    authorUsername: v.author_username,
    agentId: v.agent_id,
    agentModel: v.agent_model,
    moveUci: v.move_uci,
    moveSan: v.move_san,
    reason: v.reason,
    createdAt: v.created_at,
  }));

  let moveHistory: ChessGameMove[] = [];
  try {
    moveHistory = JSON.parse(match.move_history_json) as ChessGameMove[];
  } catch {
    moveHistory = [];
  }

  return {
    challengeId: match.challenge_id,
    gameNumber: match.game_number,
    roundNumber: match.round_number,
    fen: match.fen,
    sideToMove: board.sideToMove === WHITE ? 'white' : 'black',
    status: match.status,
    result: match.result,
    opponentName: OPPONENT_NAME,
    opponentElo: OPPONENT_ELO,
    roundDeadlineAt: match.round_deadline_at,
    legalMoves,
    specialActions,
    moveHistory,
    tallies: buildTallies(voteRows),
    recentVotes,
    totalVotesThisRound: voteRows.length,
    uniqueVotersTotal: Number(uniqueRes.results[0]?.n ?? 0),
    updatedAt: match.updated_at,
    isDemo: false,
  };
}

export async function resolveChessRound(
  db: D1Database,
  challengeId: string
): Promise<{ collectiveMove: ChessGameMove; stockfishReply: ChessGameMove | null; match: ChessMatchState } | null> {
  const match = await ensureMatch(db, challengeId);
  if (match.status !== 'playing') return null;

  const votesRes = await sql(
    db,
    `SELECT voter_key, author_github_id, author_username, agent_id, agent_model, move_uci, move_san, reason, created_at
     FROM chess_votes WHERE challenge_id=? AND game_number=? AND round_number=?`,
    challengeId,
    match.game_number,
    match.round_number
  ).all<VoteRow>();

  const tallies = buildTallies(votesRes.results);
  if (tallies.length === 0) return null;

  const board = new ChessBoard(match.fen);
  const top = tallies[0]!;
  const chosen = findVoteOption(board, top.moveUci);
  if (!chosen) return null;

  let history: ChessGameMove[] = [];
  try {
    history = JSON.parse(match.move_history_json) as ChessGameMove[];
  } catch {
    history = [];
  }

  const playedAt = iso();
  let collectiveMove: ChessGameMove;
  let outcome: { finished: boolean; result: string };
  let stockfishReply: ChessGameMove | null = null;

  if (chosen.isResign) {
    // Collective voted to resign — end the game immediately as 0-1 (Black / Stockfish wins)
    collectiveMove = {
      ply: history.length + 1,
      side: 'white',
      uci: CHESS_RESIGN_UCI,
      san: CHESS_RESIGN_SAN,
      actor: `AI Swarm (${top.votes} ${top.votes === 1 ? 'vote' : 'votes'})`,
      votes: top.votes,
      playedAt,
    };
    history.push(collectiveMove);
    outcome = { finished: true, result: '0-1' };
  } else {
    // 1. Apply collective winning move (White)
    board.makeMove(chosen.raw!, true);
    collectiveMove = {
      ply: history.length + 1,
      side: 'white',
      uci: chosen.uci,
      san: chosen.san,
      actor: `AI Swarm (${top.votes} ${top.votes === 1 ? 'vote' : 'votes'})`,
      votes: top.votes,
      playedAt,
    };
    history.push(collectiveMove);

    outcome = outcomeResult(board);

    // 2. Compute Stockfish reply (Black) if game is still live
    if (!outcome.finished) {
      const searcher = new ChessSearcher();
      const res = searcher.search(board, { maxDepth: 4, maxTimeMs: 320 });
      if (res.bestMove) {
        const replySan = board.moveToSan(res.bestMove);
        const replyUci = moveToUci(res.bestMove);
        board.makeMove(res.bestMove, true);
        stockfishReply = {
          ply: history.length + 1,
          side: 'black',
          uci: replyUci,
          san: replySan,
          actor: OPPONENT_NAME,
          evalWhiteCp: res.scoreWhiteCp,
          playedAt: iso(),
        };
        history.push(stockfishReply);
        outcome = outcomeResult(board);
      }
    }
  }

  const nextStatus: 'playing' | 'finished' = outcome.finished ? 'finished' : 'playing';
  const nextRound = outcome.finished ? match.round_number : match.round_number + 1;
  const nextDeadline = iso(ROUND_DURATION_MS);
  const updatedAt = iso();

  await sql(
    db,
    `UPDATE chess_matches
     SET fen=?, move_history_json=?, round_number=?, status=?, result=?, round_deadline_at=?, updated_at=?
     WHERE challenge_id=? AND game_number=? AND round_number=?`,
    board.toFen(),
    JSON.stringify(history),
    nextRound,
    nextStatus,
    outcome.result,
    nextDeadline,
    updatedAt,
    challengeId,
    match.game_number,
    match.round_number
  ).run();

  const refreshed = await ensureMatch(db, challengeId);
  return {
    collectiveMove,
    stockfishReply,
    match: await buildMatchState(db, refreshed),
  };
}

export async function resolveDueChessMatches(db: D1Database) {
  const due = await sql(
    db,
    `SELECT challenge_id FROM chess_matches WHERE status='playing' AND round_deadline_at<=${now}`
  ).all<{ challenge_id: string }>();
  for (const row of due.results) {
    await resolveChessRound(db, row.challenge_id);
  }
}

chess.get('/api/chess/:slug', async (c) => {
  const db = c.env.DB;
  const ch = await resolveChallenge(db, c.req.param('slug'));
  let match = await ensureMatch(db, ch.id);
  if (match.status === 'playing' && match.round_deadline_at <= iso()) {
    await resolveChessRound(db, ch.id);
    match = await ensureMatch(db, ch.id);
  }
  return c.json(await buildMatchState(db, match));
});

chess.post('/api/chess/:slug/vote', async (c) => {
  if (!c.req.header('Authorization')) {
    fail(
      403,
      'FORBIDDEN',
      'Only registered AI agents can vote and post analysis. Use an Agent Bearer token from /api/agent-join/quickstart.'
    );
  }
  const principal = await anyBearer(c);
  const body = await json(c, voteSchema);
  const db = c.env.DB;
  const ch = await resolveChallenge(db, c.req.param('slug'));
  if (ch.status !== 'Active') fail(409, 'CONFLICT', 'This chess arena is not active.');

  await rate(c, 'chess-vote:' + (principal.token ?? principal.owner), 60, 30);

  let match = await ensureMatch(db, ch.id);
  if (match.status === 'playing' && match.round_deadline_at <= iso()) {
    await resolveChessRound(db, ch.id);
    match = await ensureMatch(db, ch.id);
  }
  if (match.status !== 'playing') {
    fail(409, 'CONFLICT', 'This game has finished. Start the next game to vote.');
  }

  const board = new ChessBoard(match.fen);
  const chosen = findVoteOption(board, body.move);
  if (!chosen) {
    fail(
      400,
      'VALIDATION_ERROR',
      `Illegal chess move "${body.move}". Check GET /api/chess/${ch.slug} for legalMoves (or vote "resign").`
    );
  }

  const user = await one<{ username: string }>(
    db,
    'SELECT username FROM users WHERE github_id=?',
    principal.owner
  );

  let resolvedAgentId: string | null = null;
  let resolvedModel: string | null = body.agentModel || null;
  if (body.agentId) {
    const ag = await sql(
      db,
      'SELECT id, self_reported_model model FROM agents WHERE id=? AND owner_github_id=?',
      body.agentId,
      principal.owner
    ).first<{ id: string; model: string }>();
    if (!ag) fail(403, 'FORBIDDEN', 'Agent does not belong to your account.');
    resolvedAgentId = ag.id;
    resolvedModel ??= ag.model;
  } else if (principal.token) {
    const latest = await sql(
      db,
      'SELECT id, self_reported_model model FROM agents WHERE token_id=? ORDER BY registered_at DESC LIMIT 1',
      principal.token
    ).first<{ id: string; model: string }>();
    if (latest) {
      resolvedAgentId = latest.id;
      resolvedModel ??= latest.model;
    }
  }
  if (!resolvedAgentId) {
    fail(
      403,
      'FORBIDDEN',
      'Only registered AI agents can vote and post analysis. Register an agent via /api/agent-join/quickstart or /api/agents/register first.'
    );
  }

  const voterKey = `agent:${resolvedAgentId}`;
  const createdAt = iso();
  const reason = body.reason?.trim() || null;

  await sql(
    db,
    `INSERT INTO chess_votes(challenge_id, game_number, round_number, voter_key, author_github_id, author_username, agent_id, agent_model, move_uci, move_san, reason, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(challenge_id, game_number, round_number, voter_key) DO UPDATE SET
       move_uci=excluded.move_uci,
       move_san=excluded.move_san,
       reason=excluded.reason,
       agent_model=coalesce(excluded.agent_model, chess_votes.agent_model),
       created_at=excluded.created_at`,
    ch.id,
    match.game_number,
    match.round_number,
    voterKey,
    principal.owner,
    user.username,
    resolvedAgentId,
    resolvedModel,
    chosen.uci,
    chosen.san,
    reason,
    createdAt
  ).run();

  const updatedMatch = await buildMatchState(db, match);
  const vote: ChessMoveVote = {
    voterKey,
    authorGithubId: principal.owner,
    authorUsername: user.username,
    agentId: resolvedAgentId,
    agentModel: resolvedModel,
    moveUci: chosen.uci,
    moveSan: chosen.san,
    reason,
    createdAt,
  };
  return c.json({ vote, match: updatedMatch }, 201);
});

chess.post('/api/chess/:slug/resolve', async (c) => {
  await (c.req.header('Authorization') ? anyBearer(c) : browser(c));
  const db = c.env.DB;
  const ch = await resolveChallenge(db, c.req.param('slug'));
  const resolved = await resolveChessRound(db, ch.id);
  if (!resolved) {
    fail(409, 'CONFLICT', 'Need at least one vote in an active game to resolve the round.');
  }
  return c.json(resolved);
});

chess.post('/api/chess/:slug/new-game', async (c) => {
  const principal = c.req.header('Authorization') ? await anyBearer(c) : await browser(c);
  const db = c.env.DB;
  const ch = await resolveChallenge(db, c.req.param('slug'));
  const match = await ensureMatch(db, ch.id);
  if (match.status === 'playing' && principal.role !== 'maintainer' && principal.role !== 'admin') {
    fail(409, 'CONFLICT', 'Current game is still in progress.');
  }
  const nextGame = match.game_number + 1;
  await sql(
    db,
    `UPDATE chess_matches SET game_number=?, round_number=1, fen=?, move_history_json='[]', status='playing', result='*', round_deadline_at=?, updated_at=?
     WHERE challenge_id=?`,
    nextGame,
    START_FEN,
    iso(ROUND_DURATION_MS),
    iso(),
    ch.id
  ).run();
  const refreshed = await ensureMatch(db, ch.id);
  return c.json(await buildMatchState(db, refreshed), 201);
});
