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
  CHESS_MAX_GAME_HISTORY,
  CHESS_RESIGN_SAN,
  CHESS_RESIGN_UCI,
  isChessResignInput,
  type ChessGameEndReason,
  type ChessGameMove,
  type ChessHistoricalGame,
  type ChessMatchState,
  type ChessMoveOption,
  type ChessMoveTally,
  type ChessMoveVote,
  type ChessRoundVoteHistory,
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

interface VoteRowWithRound extends VoteRow {
  round_number: number;
}

interface HistoricalGameRow {
  game_number: number;
  result: string;
  end_reason: ChessGameEndReason;
  final_fen: string;
  total_plies: number;
  total_rounds: number;
  total_votes: number;
  unique_voters: number;
  opponent_name: string;
  opponent_elo: number;
  move_history_json: string;
  vote_history_json: string;
  finished_at: string;
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

function mapVoteRow(v: VoteRow): ChessMoveVote {
  return {
    voterKey: v.voter_key,
    authorGithubId: v.author_github_id,
    authorUsername: v.author_username,
    agentId: v.agent_id,
    agentModel: v.agent_model,
    moveUci: v.move_uci,
    moveSan: v.move_san,
    reason: v.reason,
    createdAt: v.created_at,
  };
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function inferEndReason(
  status: 'playing' | 'finished',
  result: string,
  history: ChessGameMove[]
): ChessGameEndReason {
  if (status !== 'finished') return 'aborted';
  if (history[history.length - 1]?.uci === CHESS_RESIGN_UCI) return 'resign';
  if (result === '1-0' || result === '0-1') return 'checkmate';
  return 'draw';
}

function buildVoteHistory(
  allVotes: VoteRowWithRound[],
  moveHistory: ChessGameMove[],
  maxRound: number
): ChessRoundVoteHistory[] {
  if (maxRound <= 0) return [];
  const byRound = new Map<number, VoteRowWithRound[]>();
  for (const v of allVotes) {
    if (v.round_number < 1 || v.round_number > maxRound) continue;
    const list = byRound.get(v.round_number);
    if (list) list.push(v);
    else byRound.set(v.round_number, [v]);
  }
  const rounds = new Set<number>(byRound.keys());
  const movedRounds = Math.min(maxRound, Math.ceil(moveHistory.length / 2));
  for (let r = 1; r <= movedRounds; r++) rounds.add(r);

  return Array.from(rounds)
    .sort((a, b) => b - a)
    .map((roundNumber) => {
      const roundVotes = [...(byRound.get(roundNumber) ?? [])].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
      const whiteMove = moveHistory[(roundNumber - 1) * 2] ?? null;
      const blackMove = moveHistory[(roundNumber - 1) * 2 + 1] ?? null;
      const tallies = buildTallies(roundVotes);
      return {
        roundNumber,
        winningMoveUci: whiteMove?.uci ?? tallies[0]?.moveUci ?? null,
        winningMoveSan: whiteMove?.san ?? tallies[0]?.moveSan ?? null,
        stockfishReplyUci: blackMove?.uci ?? null,
        stockfishReplySan: blackMove?.san ?? null,
        totalVotes: roundVotes.length,
        tallies,
        votes: roundVotes.slice(0, 20).map(mapVoteRow),
        resolvedAt: whiteMove?.playedAt ?? blackMove?.playedAt ?? roundVotes[0]?.created_at ?? null,
      };
    });
}

async function archiveChessGame(
  db: D1Database,
  match: MatchRow,
  history: ChessGameMove[],
  endReason: ChessGameEndReason,
  finishedAt: string
) {
  const allVotesRes = await sql(
    db,
    `SELECT round_number, voter_key, author_github_id, author_username, agent_id, agent_model, move_uci, move_san, reason, created_at
     FROM chess_votes WHERE challenge_id=? AND game_number=?
     ORDER BY round_number DESC, created_at DESC`,
    match.challenge_id,
    match.game_number
  ).all<VoteRowWithRound>();

  const allVotes = allVotesRes.results;
  const voteHistory = buildVoteHistory(allVotes, history, match.round_number);
  const uniqueVoters = new Set(allVotes.map((v) => v.voter_key)).size;
  const totalRounds = Math.max(voteHistory.length, Math.ceil(history.length / 2));

  await db.batch([
    sql(
      db,
      `INSERT INTO chess_game_history(
         challenge_id, game_number, result, end_reason, final_fen,
         total_plies, total_rounds, total_votes, unique_voters,
         opponent_name, opponent_elo, move_history_json, vote_history_json, finished_at
       )
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(challenge_id, game_number) DO UPDATE SET
         result=excluded.result,
         end_reason=excluded.end_reason,
         final_fen=excluded.final_fen,
         total_plies=excluded.total_plies,
         total_rounds=excluded.total_rounds,
         total_votes=excluded.total_votes,
         unique_voters=excluded.unique_voters,
         move_history_json=excluded.move_history_json,
         vote_history_json=excluded.vote_history_json,
         finished_at=excluded.finished_at`,
      match.challenge_id,
      match.game_number,
      match.result,
      endReason,
      match.fen,
      history.length,
      totalRounds,
      allVotes.length,
      uniqueVoters,
      OPPONENT_NAME,
      OPPONENT_ELO,
      JSON.stringify(history),
      JSON.stringify(voteHistory),
      finishedAt
    ),
    sql(
      db,
      `DELETE FROM chess_game_history
       WHERE challenge_id=?
         AND game_number NOT IN (
           SELECT game_number FROM chess_game_history
           WHERE challenge_id=?
           ORDER BY game_number DESC
           LIMIT ?
         )`,
      match.challenge_id,
      match.challenge_id,
      CHESS_MAX_GAME_HISTORY
    ),
    sql(
      db,
      `DELETE FROM chess_votes
       WHERE challenge_id=?
         AND game_number < ?
         AND game_number NOT IN (
           SELECT game_number FROM chess_game_history WHERE challenge_id=?
         )`,
      match.challenge_id,
      match.game_number,
      match.challenge_id
    ),
  ]);
}

async function buildMatchState(db: D1Database, match: MatchRow): Promise<ChessMatchState> {
  const board = new ChessBoard(match.fen);
  const legalMoves =
    match.status === 'playing'
      ? listLegalMoveOptions(board).map(({ uci, san }) => ({ uci, san }))
      : [];
  const specialActions: ChessMoveOption[] =
    match.status === 'playing' ? [{ uci: CHESS_RESIGN_UCI, san: CHESS_RESIGN_SAN }] : [];

  const [gameVotesRes, uniqueRes, historyGamesRes] = await db.batch<Record<string, unknown>>([
    sql(
      db,
      `SELECT round_number, voter_key, author_github_id, author_username, agent_id, agent_model, move_uci, move_san, reason, created_at
       FROM chess_votes WHERE challenge_id=? AND game_number=?
       ORDER BY round_number DESC, created_at DESC`,
      match.challenge_id,
      match.game_number
    ),
    sql(
      db,
      `SELECT count(DISTINCT voter_key) n FROM chess_votes WHERE challenge_id=?`,
      match.challenge_id
    ),
    sql(
      db,
      `SELECT game_number, result, end_reason, final_fen, total_plies, total_rounds, total_votes, unique_voters,
              opponent_name, opponent_elo, move_history_json, vote_history_json, finished_at
       FROM chess_game_history
       WHERE challenge_id=?
       ORDER BY game_number DESC
       LIMIT ?`,
      match.challenge_id,
      CHESS_MAX_GAME_HISTORY
    ),
  ]);

  const allGameVotes = gameVotesRes.results as unknown as VoteRowWithRound[];
  const currentRoundVotes = allGameVotes.filter((v) => v.round_number === match.round_number);
  const recentVotes: ChessMoveVote[] = currentRoundVotes.slice(0, 30).map(mapVoteRow);
  const moveHistory = parseJsonArray<ChessGameMove>(match.move_history_json);
  const voteHistory = buildVoteHistory(
    allGameVotes,
    moveHistory,
    match.status === 'finished' ? match.round_number : match.round_number - 1
  );

  const gameHistory: ChessHistoricalGame[] = (
    historyGamesRes.results as unknown as HistoricalGameRow[]
  ).map((g) => ({
    gameNumber: Number(g.game_number),
    result: g.result,
    endReason: g.end_reason,
    finalFen: g.final_fen,
    totalPlies: Number(g.total_plies),
    totalRounds: Number(g.total_rounds),
    totalVotes: Number(g.total_votes),
    uniqueVoters: Number(g.unique_voters),
    opponentName: g.opponent_name,
    opponentElo: Number(g.opponent_elo),
    moveHistory: parseJsonArray<ChessGameMove>(g.move_history_json),
    voteHistory: parseJsonArray<ChessRoundVoteHistory>(g.vote_history_json),
    finishedAt: g.finished_at,
  }));

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
    tallies: buildTallies(currentRoundVotes),
    recentVotes,
    voteHistory,
    gameHistory,
    totalVotesThisRound: currentRoundVotes.length,
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
  const nextFen = board.toFen();
  const historyJson = JSON.stringify(history);

  await sql(
    db,
    `UPDATE chess_matches
     SET fen=?, move_history_json=?, round_number=?, status=?, result=?, round_deadline_at=?, updated_at=?
     WHERE challenge_id=? AND game_number=? AND round_number=?`,
    nextFen,
    historyJson,
    nextRound,
    nextStatus,
    outcome.result,
    nextDeadline,
    updatedAt,
    challengeId,
    match.game_number,
    match.round_number
  ).run();

  if (outcome.finished) {
    const finishedRow: MatchRow = {
      ...match,
      fen: nextFen,
      move_history_json: historyJson,
      round_number: nextRound,
      status: 'finished',
      result: outcome.result,
      round_deadline_at: nextDeadline,
      updated_at: updatedAt,
    };
    await archiveChessGame(
      db,
      finishedRow,
      history,
      inferEndReason('finished', outcome.result, history),
      updatedAt
    );
  }

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
  const prevHistory = parseJsonArray<ChessGameMove>(match.move_history_json);
  if (match.status === 'finished' || prevHistory.length > 0) {
    await archiveChessGame(
      db,
      match,
      prevHistory,
      inferEndReason(match.status, match.result, prevHistory),
      match.status === 'finished' ? match.updated_at : iso()
    );
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
