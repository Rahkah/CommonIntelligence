import { Hono } from 'hono';
import { z } from 'zod';
import { ChessBoard, START_FEN, moveToUci } from '@common-intelligence/grandmaster-engine';
import {
  CHAT_OUTPUT_SCHEMA_KINDS,
  CHESS_RESIGN_SAN,
  CHESS_RESIGN_UCI,
  EFFORT_TIERS,
  RAID_CLASS_IDS,
  buildSelfContainedChatPrompt,
  getRaidClass,
  isChessResignInput,
  isClassAllowedForMode,
  taskSupportsMode,
  trigramSimilarity,
  validateChatSubmission,
  type Challenge,
  type ChatContextPack,
  type ChatOutputSchemaKind,
  type EffortTier,
  type RaidClassId,
  type SubmitChatRelayResponse,
  type Task,
  type VerifyArtifactResponse,
} from '@common-intelligence/shared';
import { anyBearer, browser } from './auth';
import { CANVAS_HEIGHT, CANVAS_PALETTE, CANVAS_WIDTH } from './canvas';
import {
  type App,
  type Ctx,
  digest,
  event,
  fail,
  field,
  id,
  iso,
  json,
  localized,
  now,
  one,
  rate,
  sql,
  unpack,
} from './core';
import * as view from './selects';

export const chatRelay = new Hono<App>();

const SIMILARITY_DUPLICATE_THRESHOLD = 0.75;
const MAX_AUTO_FOLLOWUP_OPEN_TASKS = 30;

const submitChatSchema = z.object({
  classId: z.enum(RAID_CLASS_IDS).default('scout'),
  taskId: z.string().trim().max(150).nullable().optional(),
  outputSchemaKind: z.enum(CHAT_OUTPUT_SCHEMA_KINDS),
  rawResponse: z.string().trim().min(2).max(24000),
});

const verifyArtifactSchema = z.object({
  verdict: z.enum(['confirm', 'refute', 'inconclusive']),
  evidenceSummary: field(2000),
  reproNotes: z.string().trim().max(4000).optional(),
  evidenceUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  agentId: z.string().trim().max(150).optional(),
});

async function resolveChallenge(c: Ctx, slugOrId: string): Promise<Challenge> {
  return one<Challenge>(c.env.DB, view.challenges + ' WHERE c.id=? OR c.slug=?', slugOrId, slugOrId);
}

function isCanvasChallenge(ch: Challenge): boolean {
  return ch.slug === 'shared-canvas' || ch.showcase?.kind === 'shared-canvas';
}

function isChessChallenge(ch: Challenge): boolean {
  return ch.slug === 'grandmaster' || ch.showcase?.kind === 'chess-trainer';
}

async function buildLivePlaygroundSnapshot(db: D1Database, ch: Challenge): Promise<string | null> {
  if (isCanvasChallenge(ch)) {
    const [countRow, strokes] = await db.batch<Record<string, unknown>>([
      sql(
        db,
        `SELECT count(*) paintedPixels, count(DISTINCT author_github_id) uniqueBuilders
         FROM canvas_pixels WHERE challenge_id=?`,
        ch.id
      ),
      sql(
        db,
        `SELECT author_username, pixels_json, note, created_at
         FROM canvas_strokes WHERE challenge_id=? ORDER BY created_at DESC LIMIT 8`,
        ch.id
      ),
    ]);
    const stats = countRow.results[0] ?? {};
    const recentLines = strokes.results.map((r) => {
      let coords = '';
      try {
        const pts = JSON.parse(String(r.pixels_json)) as Array<{ x: number; y: number; color: string }>;
        if (pts.length > 0) {
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          coords = `box(${Math.min(...xs)}..${Math.max(...xs)}, ${Math.min(...ys)}..${Math.max(...ys)}, ${pts.length}px)`;
        }
      } catch {
        coords = '';
      }
      return `- @${r.author_username} ${coords}: ${r.note ?? '(no note)'}`;
    });
    return [
      `Canvas Grid: ${CANVAS_WIDTH}x${CANVAS_HEIGHT} (x: 0..${CANVAS_WIDTH - 1}, y: 0..${CANVAS_HEIGHT - 1})`,
      `Painted Pixels: ${Number(stats.paintedPixels ?? 0)} | Unique Builders: ${Number(stats.uniqueBuilders ?? 0)}`,
      `Suggested Palette: ${CANVAS_PALETTE.slice(0, 14).join(', ')}`,
      `Recent Strokes:`,
      ...(recentLines.length > 0 ? recentLines : ['- (Canvas is fresh — pick any coordinates and start a motif!)']),
    ].join('\n');
  }

  if (isChessChallenge(ch)) {
    const match = await sql(
      db,
      'SELECT game_number, round_number, fen, status, result FROM chess_matches WHERE challenge_id=?',
      ch.id
    ).first<{ game_number: number; round_number: number; fen: string; status: string; result: string }>();
    const fen = match?.fen || START_FEN;
    const board = new ChessBoard(fen);
    const legalMoves = board
      .generateLegalMoves()
      .slice(0, 40)
      .map((m) => `${board.moveToSan(m)}(${moveToUci(m)})`);
    const votes = match
      ? await sql(
          db,
          `SELECT move_san, count(*) c FROM chess_votes
           WHERE challenge_id=? AND game_number=? AND round_number=?
           GROUP BY move_san ORDER BY c DESC LIMIT 5`,
          ch.id,
          match.game_number,
          match.round_number
        ).all<{ move_san: string; c: number }>()
      : { results: [] };
    const tallyLine =
      votes.results.length > 0
        ? votes.results.map((v) => `${v.move_san}: ${v.c}`).join(', ')
        : 'No votes cast yet this round';
    return [
      `Game #${match?.game_number ?? 1} · Round ${match?.round_number ?? 1} · Status: ${match?.status ?? 'playing'}`,
      `Live FEN: ${fen}`,
      `Current Vote Tally: ${tallyLine}`,
      `Legal Moves (SAN(UCI)): ${legalMoves.join(', ')}`,
      `Special Action: Resign(resign) — vote "resign" if the position is hopelessly lost and you want to concede (0-1).`,
    ].join('\n');
  }

  return null;
}

function defaultSchemaForClassAndChallenge(ch: Challenge, classId: RaidClassId, task?: Task | null): ChatOutputSchemaKind {
  if (task?.outputSchemaKind && (CHAT_OUTPUT_SCHEMA_KINDS as readonly string[]).includes(task.outputSchemaKind)) {
    return task.outputSchemaKind;
  }
  if (isCanvasChallenge(ch) && classId === 'scout') return 'canvas_pixels';
  if (isChessChallenge(ch) && task?.taskId === 'TASK-GM-01') return 'chess_tactic_vote';
  if (classId === 'arbiter') return 'counterexample_review';
  return 'hypothesis_proposal';
}

// ----------------------------------------------------------------------------
// 1. Extensible Self-Contained Context Pack Builder (Chat Mode)
// ----------------------------------------------------------------------------
chatRelay.get('/api/challenges/:slug/context-pack', async (c) => {
  const db = c.env.DB;
  const ch = await resolveChallenge(c, c.req.param('slug'));
  if (ch.status !== 'Active') fail(409, 'CONFLICT', 'This project is not currently active.');

  const rawClass = (c.req.query('classId') ?? 'scout').trim().toLowerCase();
  const classParsed = z.enum(RAID_CLASS_IDS).safeParse(rawClass);
  if (!classParsed.success) fail(400, 'VALIDATION_ERROR', 'Unknown classId.');
  const classId = classParsed.data;

  // Enforce entry-tier class restriction for Chat mode
  if (!isClassAllowedForMode(classId, 'chat')) {
    fail(
      403,
      'FORBIDDEN',
      `Chat mode only supports entry-tier classes (Scout / Arbiter). Switch to Agent mode to run as "${classId}".`
    );
  }

  const rawBudget = (c.req.query('budgetTier') ?? 'S').trim().toUpperCase();
  const budgetTier: EffortTier = (EFFORT_TIERS as readonly string[]).includes(rawBudget)
    ? (rawBudget as EffortTier)
    : 'S';

  const requestedTaskId = c.req.query('taskId')?.trim() || null;
  let task: Task | null = null;
  if (requestedTaskId) {
    task = await one<Task>(db, view.tasks + ' WHERE t.task_id=? AND t.challenge_id=?', requestedTaskId, ch.id);
    if (!taskSupportsMode(task, 'chat')) {
      fail(
        403,
        'FORBIDDEN',
        `Task ${task.taskId} requires autonomous Agent execution tools and is not open to Chat relay mode.`
      );
    }
  } else {
    const taskRows = await sql(
      db,
      view.tasks + ` WHERE t.challenge_id=? AND t.status='Available' AND t.is_planning=0 ORDER BY t.created_at ASC LIMIT 20`,
      ch.id
    ).all<Record<string, unknown>>();
    const allTasks = taskRows.results.map((r) => unpack<Task>(r));
    const chatTasks = allTasks.filter((t) => taskSupportsMode(t, 'chat'));
    task = chatTasks.find((t) => t.recommendedClass === classId) ?? chatTasks[0] ?? null;
  }

  const rawSchema = c.req.query('schemaKind')?.trim();
  const outputSchemaKind: ChatOutputSchemaKind =
    rawSchema && (CHAT_OUTPUT_SCHEMA_KINDS as readonly string[]).includes(rawSchema)
      ? (rawSchema as ChatOutputSchemaKind)
      : defaultSchemaForClassAndChallenge(ch, classId, task);

  // Restrict playground-only schemas to matching playgrounds
  if (outputSchemaKind === 'canvas_pixels' && !isCanvasChallenge(ch)) {
    fail(400, 'VALIDATION_ERROR', 'canvas_pixels schema is only valid for shared-canvas playgrounds.');
  }
  if (outputSchemaKind === 'chess_tactic_vote' && !isChessChallenge(ch)) {
    fail(400, 'VALIDATION_ERROR', 'chess_tactic_vote schema is only valid for chess arenas.');
  }

  const [verifiedRows, refutedRows, actRows, liveSnapshot] = await Promise.all([
    sql(
      db,
      view.artifacts +
        ` WHERE k.challenge_id=? AND k.status IN ('Verified','Reproduced','Proposed')
          ORDER BY CASE k.status WHEN 'Reproduced' THEN 0 WHEN 'Verified' THEN 1 ELSE 2 END, k.created_at DESC LIMIT 6`,
      ch.id
    ).all<Record<string, unknown>>(),
    sql(
      db,
      view.artifacts +
        ` WHERE k.challenge_id=? AND k.status='Refuted' ORDER BY k.created_at DESC LIMIT 5`,
      ch.id
    ).all<Record<string, unknown>>(),
    sql(
      db,
      view.activity + ` WHERE e.challenge_id=? ORDER BY e.created_at DESC LIMIT 6`,
      ch.id
    ).all<Record<string, unknown>>(),
    buildLivePlaygroundSnapshot(db, ch),
  ]);

  const toPackKnowledge = (row: Record<string, unknown>) => {
    const item = unpack<{
      id: string;
      kind: string;
      status: string;
      title: { en: string; zh: string };
      summary: { en: string; zh: string };
      authorUsername: string;
    }>(row);
    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      title: item.title.en || item.title.zh,
      summary: item.summary.en || item.summary.zh,
      authorUsername: item.authorUsername,
    };
  };

  const verifiedKnowledge = verifiedRows.results.map(toPackKnowledge);
  const refutedDeadEnds = refutedRows.results.map(toPackKnowledge);
  const recentActivity = actRows.results.map((r) => {
    const evt = unpack<{
      type: string;
      summary: { en: string; zh: string };
      actorUsername: string;
      createdAt: string;
    }>(r);
    return {
      type: evt.type,
      summary: evt.summary.en || evt.summary.zh,
      actorUsername: evt.actorUsername,
      createdAt: evt.createdAt,
    };
  });

  const classDef = getRaidClass(classId)!;
  const fallbackTaskTitle =
    outputSchemaKind === 'failure_analysis'
      ? 'Micro-Scout: Diagnose a failure case or bottleneck from current records'
      : outputSchemaKind === 'counterexample_review'
        ? 'Micro-Arbiter: Spot a logical flaw, counterexample, or missing edge test'
        : outputSchemaKind === 'canvas_pixels'
          ? 'Paint a 1–16 pixel motif on the shared 64×40 canvas'
          : outputSchemaKind === 'chess_tactic_vote'
            ? 'Analyze the live board and propose White’s sharpest legal move'
            : 'Micro-Scout: Distill a testable hypothesis or algorithm idea';

  const fallbackTaskDesc =
    task?.description.en ||
    task?.description.zh ||
    `${classDef.shortDuty.en} Keep the deliverable concise, grounded in the context pack, and verifiable by downstream agents.`;

  const built = buildSelfContainedChatPrompt({
    challengeName: ch.name,
    challengeSlug: ch.slug,
    category: ch.category ?? 'challenge',
    goal: ch.ultimateGoal.en || ch.ultimateGoal.zh,
    currentBestDisplay: ch.record.currentBestDisplay,
    targetDisplay: ch.record.targetDisplay,
    rules: ch.rules.map((r) => r.en || r.zh),
    classDef,
    budgetTier,
    taskId: task?.taskId ?? null,
    taskTitle: task ? task.title.en || task.title.zh : fallbackTaskTitle,
    taskDescription: fallbackTaskDesc,
    acceptanceCriteria: task
      ? task.acceptanceCriteria.map((a) => a.en || a.zh)
      : ['Grounded in provided context; zero fabricated execution benchmarks; valid structured JSON.'],
    outputSchemaKind,
    verifiedKnowledge,
    refutedDeadEnds,
    recentActivity,
    livePlaygroundSnapshot: liveSnapshot,
  });

  const pack: ChatContextPack = {
    schemaVersion: 1,
    challengeId: ch.id,
    challengeSlug: ch.slug,
    challengeName: ch.name,
    category: ch.category ?? 'challenge',
    classId,
    budgetTier,
    taskId: task?.taskId ?? null,
    taskTitle: task ? task.title.en || task.title.zh : fallbackTaskTitle,
    taskDescription: fallbackTaskDesc,
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
      recentActivityCount: recentActivity.length,
      hasLivePlaygroundSnapshot: Boolean(liveSnapshot),
    },
    outputTemplateJson: built.outputTemplateJson,
    generatedAt: iso(),
    isDemo: false,
  };

  return c.json(pack);
});

// ----------------------------------------------------------------------------
// 2. Chat Human-Relay Structured Submission + Anti-Cheat + Auto Follow-Up
// ----------------------------------------------------------------------------
chatRelay.post('/api/challenges/:slug/chat-submit', async (c) => {
  const principal = await browser(c);
  const db = c.env.DB;
  const ch = await resolveChallenge(c, c.req.param('slug'));
  if (ch.status !== 'Active') fail(409, 'CONFLICT', 'This project is not currently active.');

  await rate(c, 'chat-submit-hr:' + principal.owner, 3600, 8);
  await rate(c, 'chat-submit-day:' + principal.owner, 86400, 20);

  const body = await json(c, submitChatSchema);
  if (!isClassAllowedForMode(body.classId, 'chat')) {
    fail(
      403,
      'FORBIDDEN',
      `Chat mode only supports entry-tier classes (Scout / Arbiter). Use Agent mode for "${body.classId}".`
    );
  }

  let linkedTask: Task | null = null;
  if (body.taskId) {
    linkedTask = await one<Task>(db, view.tasks + ' WHERE t.task_id=? AND t.challenge_id=?', body.taskId, ch.id);
    if (!taskSupportsMode(linkedTask, 'chat')) {
      fail(403, 'FORBIDDEN', `Task ${linkedTask.taskId} requires Agent execution mode.`);
    }
  }

  const validation = validateChatSubmission(body.outputSchemaKind, body.rawResponse, {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
  });
  if (!validation.ok) {
    return c.json(
      {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join(' '),
        details: { errors: validation.errors, repairPrompt: validation.repairPrompt },
        requestId: crypto.randomUUID(),
      },
      400
    );
  }

  const user = await one<{ username: string }>(
    db,
    'SELECT username FROM users WHERE github_id=?',
    principal.owner
  );
  const payload = validation.data;
  const createdAt = iso();
  const selfModel = payload.selfReportedModel || 'chat-ai (self-reported)';

  // Path A: Deterministic Playground Canvas Paint via Chat Relay
  if (payload.kind === 'canvas_pixels') {
    if (!isCanvasChallenge(ch)) {
      fail(400, 'VALIDATION_ERROR', 'Canvas pixel submission is only supported on shared-canvas playgrounds.');
    }
    const deduped = new Map<string, { x: number; y: number; color: string }>();
    for (const px of payload.pixels) deduped.set(`${px.x},${px.y}`, px);
    const pixels = Array.from(deduped.values());
    const strokeId = id('stroke');

    const writes: D1PreparedStatement[] = pixels.map((px) =>
      sql(
        db,
        `INSERT INTO canvas_pixels(challenge_id, x, y, color, author_github_id, author_username, agent_id, agent_model, note, updated_at)
         VALUES(?,?,?,?,?,?,NULL,?,?,?)
         ON CONFLICT(challenge_id, x, y) DO UPDATE SET
           color=excluded.color,
           author_github_id=excluded.author_github_id,
           author_username=excluded.author_username,
           agent_id=NULL,
           agent_model=excluded.agent_model,
           note=excluded.note,
           updated_at=excluded.updated_at`,
        ch.id,
        px.x,
        px.y,
        px.color,
        principal.owner,
        user.username,
        selfModel,
        payload.note,
        createdAt
      )
    );
    writes.push(
      sql(
        db,
        `INSERT INTO canvas_strokes(id, challenge_id, author_github_id, author_username, agent_id, agent_model, pixels_json, note, created_at)
         VALUES(?,?,?,?,NULL,?,?,?,?)`,
        strokeId,
        ch.id,
        principal.owner,
        user.username,
        selfModel,
        JSON.stringify(pixels),
        payload.note,
        createdAt
      )
    );
    await db.batch(writes);

    const res: SubmitChatRelayResponse = {
      mode: 'chat',
      outcomeType: 'playground_applied',
      playgroundResult: { paintedCount: pixels.length },
      warnings: validation.warnings,
      message: {
        en: `Painted ${pixels.length} pixel(s) onto the live canvas via Chat relay!`,
        zh: `已通过 Chat 模式校验并在实时画布成功落笔 ${pixels.length} 个像素！`,
      },
    };
    return c.json(res, 201);
  }

  // Path B: Deterministic Chess Legal-Move Vote via Chat Relay
  if (payload.kind === 'chess_tactic_vote') {
    if (!isChessChallenge(ch)) {
      fail(400, 'VALIDATION_ERROR', 'Chess move submission is only supported on chess arenas.');
    }
    let match = await sql(
      db,
      'SELECT game_number, round_number, fen, status FROM chess_matches WHERE challenge_id=?',
      ch.id
    ).first<{ game_number: number; round_number: number; fen: string; status: string }>();
    if (!match) {
      await sql(
        db,
        `INSERT OR IGNORE INTO chess_matches(challenge_id, game_number, round_number, fen, move_history_json, status, result, round_deadline_at, updated_at)
         VALUES(?, 1, 1, ?, '[]', 'playing', '*', ?, ?)`,
        ch.id,
        START_FEN,
        iso(10 * 60 * 1000),
        createdAt
      ).run();
      match = { game_number: 1, round_number: 1, fen: START_FEN, status: 'playing' };
    }
    if (match.status !== 'playing') {
      fail(409, 'CONFLICT', 'Current chess game is finished.');
    }
    const board = new ChessBoard(match.fen);
    const trimmed = payload.move.trim();
    const lower = trimmed.toLowerCase();
    const cleanSan = trimmed.replace(/[+#!?]+$/g, '');
    const legal = board.generateLegalMoves().map((m) => ({
      uci: moveToUci(m),
      san: board.moveToSan(m),
    }));
    const chosen = isChessResignInput(trimmed)
      ? { uci: CHESS_RESIGN_UCI, san: CHESS_RESIGN_SAN }
      : legal.find((o) => o.uci.toLowerCase() === lower) ??
        legal.find((o) => o.san === trimmed) ??
        legal.find((o) => o.san.replace(/[+#!?]+$/g, '') === cleanSan);
    if (!chosen) {
      fail(
        400,
        'VALIDATION_ERROR',
        `Illegal chess move "${payload.move}" for the current live position (or vote "resign").`
      );
    }

    const voterKey = `chat:${principal.owner}`;
    await sql(
      db,
      `INSERT INTO chess_votes(challenge_id, game_number, round_number, voter_key, author_github_id, author_username, agent_id, agent_model, move_uci, move_san, reason, created_at)
       VALUES(?,?,?,?,?,?,NULL,?,?,?,?,?)
       ON CONFLICT(challenge_id, game_number, round_number, voter_key) DO UPDATE SET
         move_uci=excluded.move_uci,
         move_san=excluded.move_san,
         reason=excluded.reason,
         agent_model=excluded.agent_model,
         created_at=excluded.created_at`,
      ch.id,
      match.game_number,
      match.round_number,
      voterKey,
      principal.owner,
      user.username,
      selfModel,
      chosen.uci,
      chosen.san,
      payload.reason,
      createdAt
    ).run();

    const isResignVote = chosen.uci === CHESS_RESIGN_UCI;
    const res: SubmitChatRelayResponse = {
      mode: 'chat',
      outcomeType: 'playground_applied',
      playgroundResult: { moveSan: chosen.san, moveUci: chosen.uci },
      warnings: validation.warnings,
      message: isResignVote
        ? {
            en: 'Recorded vote to Resign via Chat relay! If Resign leads when the round locks, White concedes (0-1).',
            zh: '已通过 Chat 模式投出「投降（Resign）」一票！若结算时得票最高，白方将认负结束本局。',
          }
        : {
            en: `Recorded legal move vote ${chosen.san} (${chosen.uci}) via Chat relay!`,
            zh: `已通过 Chat 模式完成合法着法校验并投出 ${chosen.san}（${chosen.uci}）！`,
          },
    };
    return c.json(res, 201);
  }

  // Path C: Challenge Knowledge / Analysis / Hypothesis / Counterexample Artifact
  // 1. Exact SHA-256 deduplication
  const contentHash = await digest(`${ch.id}:${validation.normalizedDedupText}`);
  const exactDup = await sql(
    db,
    'SELECT id FROM research_artifacts WHERE challenge_id=? AND content_sha256=? LIMIT 1',
    ch.id,
    contentHash
  ).first<{ id: string }>();
  if (exactDup) {
    fail(
      409,
      'CONFLICT',
      `Duplicate submission detected (matches existing artifact ${exactDup.id}). Please contribute a distinct finding.`
    );
  }

  // 2. Near-duplicate trigram similarity check against latest 50 artifacts in challenge
  const recentArts = await sql(
    db,
    `SELECT id, title_json, summary_json FROM research_artifacts
     WHERE challenge_id=? ORDER BY created_at DESC LIMIT 50`,
    ch.id
  ).all<{ id: string; title_json: string; summary_json: string }>();
  for (const row of recentArts.results) {
    let textSample = '';
    try {
      const tObj = JSON.parse(row.title_json) as { en?: string; zh?: string };
      const sObj = JSON.parse(row.summary_json) as { en?: string; zh?: string };
      textSample = `${tObj.en ?? tObj.zh ?? ''}\n${sObj.en ?? sObj.zh ?? ''}`;
    } catch {
      textSample = row.title_json;
    }
    if (trigramSimilarity(validation.normalizedDedupText, textSample) >= SIMILARITY_DUPLICATE_THRESHOLD) {
      fail(
        409,
        'CONFLICT',
        `Submission is too similar to existing artifact ${row.id}. Try addressing a distinct angle or edge case.`
      );
    }
  }

  const artifactId = id('art');
  let titleText = '';
  let summaryText = '';
  let methodText = '';
  let limitationsText = 'Submitted via Chat relay mode — pending independent verification or Agent execution.';
  let artifactKind: 'Experiment' | 'ResearchNote' | 'Counterexample' = 'ResearchNote';
  let parentIds: string[] = [];
  let followUpTitleEn = '';
  let followUpTitleZh = '';
  let followUpClass: RaidClassId = 'arbiter';
  let followUpTaskType: 'Verification' | 'Implementation' = 'Verification';
  let linkRelation: 'derived_from' | 'refutes' | 'verifies' = 'derived_from';

  if (payload.kind === 'failure_analysis') {
    artifactKind = 'Experiment';
    titleText = payload.title;
    summaryText = `Root cause: ${payload.rootCause}\nSuggested direction: ${payload.suggestedDirection}`;
    methodText = [
      `Evidence: ${payload.evidenceSummary}`,
      payload.reproductionSteps ? `Reproduction sketch: ${payload.reproductionSteps}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    parentIds = payload.parentArtifactIds;
    followUpTitleEn = payload.followUpTaskTitle || `Verify & fix root cause from ${artifactId}: ${payload.title.slice(0, 80)}`;
    followUpTitleZh = payload.followUpTaskTitle || `验证并修复 ${artifactId} 提出的失败根因：${payload.title.slice(0, 70)}`;
    followUpClass = 'forger';
    followUpTaskType = 'Implementation';
  } else if (payload.kind === 'hypothesis_proposal') {
    artifactKind = 'ResearchNote';
    titleText = payload.title;
    summaryText = payload.hypothesis;
    methodText = [
      `Rationale: ${payload.rationale}`,
      `Proposed checks:\n${payload.testCasesOrCriteria.map((x) => `- ${x}`).join('\n')}`,
      payload.algorithmOutline ? `Algorithm outline:\n${payload.algorithmOutline}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    limitationsText = payload.limitations;
    parentIds = payload.parentArtifactIds;
    followUpTitleEn = `Test & implement Chat hypothesis (${artifactId}): ${payload.title.slice(0, 80)}`;
    followUpTitleZh = `实验验证与实现 Chat 假设（${artifactId}）：${payload.title.slice(0, 70)}`;
    followUpClass = payload.algorithmOutline ? 'forger' : 'arbiter';
    followUpTaskType = payload.algorithmOutline ? 'Implementation' : 'Verification';
  } else {
    // counterexample_review
    artifactKind = payload.verdict === 'counterexample' ? 'Counterexample' : 'ResearchNote';
    titleText = payload.title;
    summaryText = `[${payload.verdict}] ${payload.flawOrCounterexample}`;
    methodText = [
      `Minimal case: ${payload.minimalCase}`,
      payload.suggestedFix ? `Suggested fix: ${payload.suggestedFix}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    parentIds = payload.parentArtifactIds;
    linkRelation = payload.verdict === 'logically_sound' ? 'verifies' : 'refutes';
    followUpTitleEn = `Reproduce counterexample / edge case (${artifactId}): ${payload.title.slice(0, 80)}`;
    followUpTitleZh = `本地复现反例与边界用例（${artifactId}）：${payload.title.slice(0, 70)}`;
    followUpClass = 'arbiter';
    followUpTaskType = 'Verification';
  }

  // Filter parentArtifactIds to real artifacts in the same challenge
  const validParents: string[] = [];
  if (parentIds.length > 0) {
    const parentRows = await sql(
      db,
      `SELECT id FROM research_artifacts WHERE challenge_id=? AND id IN (SELECT value FROM json_each(?))`,
      ch.id,
      JSON.stringify(parentIds)
    ).all<{ id: string }>();
    for (const r of parentRows.results) validParents.push(r.id);
  }

  const openCountRow = await sql(
    db,
    `SELECT count(*) n FROM tasks WHERE challenge_id=? AND status='Available'`,
    ch.id
  ).first<{ n: number }>();
  const canSpawnFollowUp = Number(openCountRow?.n ?? 0) < MAX_AUTO_FOLLOWUP_OPEN_TASKS;
  const followUpTaskId = canSpawnFollowUp
    ? `${followUpClass === 'forger' ? 'IMPL' : 'VER'}-CHAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    : null;

  const writes: D1PreparedStatement[] = [
    sql(
      db,
      `INSERT INTO research_artifacts(
         id, challenge_id, task_id, author_github_id, kind, status,
         title_json, summary_json, method_notes_json, limitations_json,
         parent_artifact_ids_json, submission_channel, role_class,
         content_sha256, structured_payload_json, self_reported_model, created_at
       ) VALUES(?,?,?,?,?,'Proposed',?,?,?,?,?,'chat',?,?,?,?,?)`,
      artifactId,
      ch.id,
      linkedTask?.taskId ?? null,
      principal.owner,
      artifactKind,
      JSON.stringify(localized(titleText)),
      JSON.stringify(localized(summaryText)),
      JSON.stringify(localized(methodText)),
      JSON.stringify(localized(limitationsText)),
      JSON.stringify(validParents),
      body.classId,
      contentHash,
      JSON.stringify(payload),
      selfModel,
      createdAt
    ),
    ...validParents.map((parentId) =>
      sql(
        db,
        `INSERT OR IGNORE INTO artifact_links(from_artifact_id, to_artifact_id, relation_type, created_at)
         VALUES(?,?,?,?)`,
        artifactId,
        parentId,
        linkRelation,
        createdAt
      )
    ),
  ];

  let followUpSummary: SubmitChatRelayResponse['followUpTask'] = null;
  if (followUpTaskId) {
    const followUpTitle = { en: followUpTitleEn, zh: followUpTitleZh };
    const followUpDesc = {
      en: `Auto-generated from Chat ${body.classId} submission ${artifactId} by @${user.username}. Independently execute, verify, or implement this finding with reproducible evidence and cite ${artifactId} in parentArtifactIds.`,
      zh: `由 @${user.username} 通过 Chat 模式（${body.classId}）提交的成果 ${artifactId} 自动衍生。请使用自主 Agent 独立复现、验证或实现该方案，并在提交时引用 ${artifactId} 继承贡献链路。`,
    };
    const followUpCriteria = [
      {
        en: `Independently verify or implement ${artifactId} with reproducible output (do not rely on chat self-claims).`,
        zh: `对 ${artifactId} 进行独立复现或代码实现，并附可复现验证结果（不得直接采信聊天自评）。`,
      },
    ];
    const followUpOutput = {
      en: `Submit a verified PR or call POST /api/artifacts/${artifactId}/verify with reproducible evidence.`,
      zh: `提交可验证 PR，或携带复现证据调用 POST /api/artifacts/${artifactId}/verify。`,
    };
    writes.push(
      sql(
        db,
        `INSERT INTO tasks(
           task_id, challenge_id, title_json, description_json, task_type, priority, status,
           required_capabilities_json, acceptance_criteria_json, input_artifacts_json, output_requirements_json,
           proposed_by_github_id, recommended_class, effort_tier, supported_modes_json,
           delivery_mode, verification_mode, trigger_source, trigger_ref_id, dedup_fingerprint,
           created_at, updated_at
         ) VALUES(?,?,?,?,?,'Normal','Available',?,?,?,?,?,?,?,'["agent"]','pr_auto_verify','pr_auto_verify','chat_submission',?,?,?,?)`,
        followUpTaskId,
        ch.id,
        JSON.stringify(followUpTitle),
        JSON.stringify(followUpDesc),
        followUpTaskType,
        JSON.stringify(['git', 'execution', 'verification']),
        JSON.stringify(followUpCriteria),
        JSON.stringify([artifactId]),
        JSON.stringify(followUpOutput),
        principal.owner,
        followUpClass,
        'M',
        artifactId,
        `chat-followup:${artifactId}`,
        createdAt,
        createdAt
      ),
      event(
        db,
        'task_proposed',
        ch.id,
        principal.owner,
        `[Chat ${body.classId}] ${titleText} → spawned Agent follow-up ${followUpTaskId}`,
        followUpTaskId
      )
    );
    followUpSummary = {
      taskId: followUpTaskId,
      title: followUpTitle,
      recommendedClass: followUpClass,
      supportedModes: ['agent'],
      status: 'Available',
    };
  }

  await db.batch(writes);

  const response: SubmitChatRelayResponse = {
    mode: 'chat',
    outcomeType: 'artifact_pending_verification',
    artifact: {
      id: artifactId,
      title: localized(titleText),
      kind: artifactKind,
      status: 'Proposed',
      roleClass: body.classId,
      submissionChannel: 'chat',
    },
    followUpTask: followUpSummary,
    warnings: validation.warnings,
    message: {
      en: followUpTaskId
        ? `Submitted as Pending Verification (${artifactId}) and automatically spawned Agent follow-up task ${followUpTaskId}!`
        : `Submitted as Pending Verification (${artifactId})! Downstream verifiers and agents can now validate and build on it.`,
      zh: followUpTaskId
        ? `已提交并标记为「待验证」（${artifactId}），同时自动生成了后续 Agent 验证/实现任务 ${followUpTaskId}！`
        : `已提交并标记为「待验证」（${artifactId}），后续验证者与 Agent 现可独立核验并继承你的成果！`,
    },
  };
  return c.json(response, 201);
});

// ----------------------------------------------------------------------------
// 3. Independent Peer / Agent Verification for Pending Artifacts
// ----------------------------------------------------------------------------
chatRelay.post('/api/artifacts/:id/verify', async (c) => {
  const principal = c.req.header('Authorization') ? await anyBearer(c) : await browser(c);
  const db = c.env.DB;
  const artifactId = c.req.param('id').trim();
  await rate(c, 'verify-art:' + principal.owner, 3600, 20);

  const body = await json(c, verifyArtifactSchema);
  const artifact = await sql(
    db,
    'SELECT id, challenge_id, author_github_id, status FROM research_artifacts WHERE id=?',
    artifactId
  ).first<{ id: string; challenge_id: string; author_github_id: string; status: string }>();
  if (!artifact) fail(404, 'NOT_FOUND', 'Artifact not found.');

  // Strict anti-self-verification rule
  if (artifact.author_github_id === principal.owner) {
    fail(403, 'FORBIDDEN', 'You cannot verify your own artifact. Independent third-party verification is required.');
  }

  let resolvedAgentId: string | null = null;
  if (body.agentId) {
    const ag = await sql(
      db,
      'SELECT id FROM agents WHERE id=? AND owner_github_id=?',
      body.agentId,
      principal.owner
    ).first<{ id: string }>();
    if (!ag) fail(403, 'FORBIDDEN', 'Agent does not belong to your account.');
    resolvedAgentId = ag.id;
  }

  const createdAt = iso();
  await sql(
    db,
    `INSERT INTO artifact_verifications(id, artifact_id, verifier_github_id, verifier_agent_id, verdict, evidence_summary, repro_notes, evidence_url, created_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(artifact_id, verifier_github_id) DO UPDATE SET
       verdict=excluded.verdict,
       evidence_summary=excluded.evidence_summary,
       repro_notes=excluded.repro_notes,
       evidence_url=excluded.evidence_url,
       verifier_agent_id=excluded.verifier_agent_id,
       created_at=excluded.created_at`,
    id('aver'),
    artifact.id,
    principal.owner,
    resolvedAgentId,
    body.verdict,
    body.evidenceSummary,
    body.reproNotes ?? null,
    body.evidenceUrl ?? null,
    createdAt
  ).run();

  const counts = await sql(
    db,
    `SELECT
       sum(CASE WHEN verdict='confirm' THEN 1 ELSE 0 END) confirmCount,
       sum(CASE WHEN verdict='refute' THEN 1 ELSE 0 END) refuteCount
     FROM artifact_verifications WHERE artifact_id=?`,
    artifact.id
  ).first<{ confirmCount: number | null; refuteCount: number | null }>();

  const confirmCount = Number(counts?.confirmCount ?? 0);
  const refuteCount = Number(counts?.refuteCount ?? 0);
  const isMaintainer = principal.role === 'maintainer' || principal.role === 'admin';

  let nextStatus = artifact.status;
  if (artifact.status !== 'Refuted' && (refuteCount >= 2 || (isMaintainer && body.verdict === 'refute'))) {
    nextStatus = 'Refuted';
  } else if (artifact.status === 'Proposed' && (confirmCount >= 2 || (isMaintainer && body.verdict === 'confirm'))) {
    nextStatus = 'Verified';
  } else if (artifact.status === 'Verified' && confirmCount >= 3) {
    nextStatus = 'Reproduced';
  }

  await sql(
    db,
    'UPDATE research_artifacts SET status=?, verified_count=? WHERE id=?',
    nextStatus,
    confirmCount,
    artifact.id
  ).run();

  const response: VerifyArtifactResponse = {
    artifactId: artifact.id,
    verdict: body.verdict,
    artifactStatus: nextStatus,
    confirmCount,
    refuteCount,
  };
  return c.json(response);
});

// ----------------------------------------------------------------------------
// 4. Compact Agent-Mode Dynamic Brief (Bridges Chat -> Agent Async Handoff)
// ----------------------------------------------------------------------------
chatRelay.get('/api/challenges/:slug/brief', async (c) => {
  const db = c.env.DB;
  const ch = await resolveChallenge(c, c.req.param('slug'));
  if (ch.status !== 'Active') fail(409, 'CONFLICT', 'This project is not currently active.');

  const classFilter = c.req.query('class')?.trim().toLowerCase() || null;
  const budgetFilter = c.req.query('budget')?.trim().toUpperCase() || null;

  const [taskRows, verifiedRows, pendingChatRows, refutedRows] = await Promise.all([
    sql(
      db,
      view.tasks + ` WHERE t.challenge_id=? AND t.status='Available' ORDER BY t.is_planning ASC, t.created_at ASC LIMIT 25`,
      ch.id
    ).all<Record<string, unknown>>(),
    sql(
      db,
      view.artifacts +
        ` WHERE k.challenge_id=? AND k.status IN ('Verified','Reproduced') ORDER BY k.created_at DESC LIMIT 8`,
      ch.id
    ).all<Record<string, unknown>>(),
    sql(
      db,
      view.artifacts +
        ` WHERE k.challenge_id=? AND k.status='Proposed' AND k.submission_channel='chat' ORDER BY k.created_at DESC LIMIT 8`,
      ch.id
    ).all<Record<string, unknown>>(),
    sql(
      db,
      view.artifacts + ` WHERE k.challenge_id=? AND k.status='Refuted' ORDER BY k.created_at DESC LIMIT 6`,
      ch.id
    ).all<Record<string, unknown>>(),
  ]);

  const tasks = taskRows.results.map((r) => unpack<Task>(r));
  const scoredTasks = tasks
    .map((t) => {
      let score = 0;
      if (classFilter && classFilter !== 'auto' && t.recommendedClass === classFilter) score += 40;
      if (budgetFilter && t.effortTier === budgetFilter) score += 25;
      if (t.triggerSource === 'chat_submission') score += 15;
      if (t.priority === 'Critical') score += 20;
      else if (t.priority === 'High') score += 12;
      return { task: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.task);

  const raidPressure: Record<string, number> = {
    scout: 0,
    arbiter: 0,
    forger: 0,
    tactician: 0,
    pioneer: 0,
  };
  for (const t of tasks) {
    if (t.recommendedClass && raidPressure[t.recommendedClass] !== undefined) {
      raidPressure[t.recommendedClass]!++;
    }
  }

  return c.json({
    challenge: {
      id: ch.id,
      slug: ch.slug,
      name: ch.name,
      category: ch.category ?? 'challenge',
      goal: ch.ultimateGoal,
      record: ch.record,
      githubRepo: ch.githubRepo,
      rules: ch.rules,
    },
    raidPressure,
    matchedTasks: scoredTasks,
    pendingChatArtifacts: pendingChatRows.results.map((r) => unpack(r)),
    verifiedKnowledge: verifiedRows.results.map((r) => unpack(r)),
    refutedDeadEnds: refutedRows.results.map((r) => unpack(r)),
    endpoints: {
      claimTask: '/api/tasks/claim',
      proposeTask: '/api/tasks/propose',
      verifyArtifact: '/api/artifacts/:id/verify',
      contextPack: `/api/challenges/${ch.slug}/context-pack`,
    },
    generatedAt: iso(),
  });
});
