<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Contribution, ProjectShowcase } from '@common-intelligence/shared';
import {
  ChessBoard,
  ChessTrainingSession,
  PHASE0_BASELINE_REPORT,
  WHITE,
  moveToUci,
  squareToAlgebraic,
  type ChessMove,
  type RecordedGame,
  type TrainingSnapshot,
} from '@common-intelligence/grandmaster-engine';
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ExternalLink,
  FlaskConical,
  Gamepad2,
  GitCommit,
  History,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  StepForward,
} from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  showcase: ProjectShowcase;
  contributions: Contribution[];
}>();

const { state, loc } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

type ArenaMode = 'replay' | 'experiment' | 'play';
const mode = ref<ArenaMode>('replay');

// --- Real Phase 0 Baseline Report (100% real Node.js engine execution data) ---
const report = PHASE0_BASELINE_REPORT;
const selectedGameIndex = ref(0);
const replayPly = ref(0);
const replayPlaying = ref(false);
let replayTimer: ReturnType<typeof setInterval> | null = null;

const selectedGame = computed<RecordedGame>(
  () => report.games[selectedGameIndex.value] ?? report.games[0]!
);

const replayBoardState = computed(() => {
  const g = selectedGame.value;
  const b = new ChessBoard(g.startFen);
  const clampedPly = Math.min(replayPly.value, g.moves.length);
  for (let i = 0; i < clampedPly; i++) {
    const m = b.findMoveByUci(g.moves[i]!.uci);
    if (m) b.makeMove(m, true);
  }
  const lastMove = clampedPly > 0 ? g.moves[clampedPly - 1]! : null;
  return {
    squares: Array.from(b.squares),
    sideToMove: b.sideToMove,
    inCheck: b.isInCheck(b.sideToMove),
    lastFrom: lastMove?.from ?? -1,
    lastTo: lastMove?.to ?? -1,
    evalWhiteCp: lastMove?.evalWhiteCp ?? 0,
    depth: lastMove?.depth ?? report.searchDepth,
    nps: lastMove?.nps ?? report.matchSummary.avgNps,
    pv: lastMove?.pv ?? [],
  };
});

function stopReplayTimer() {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  replayPlaying.value = false;
}

function toggleReplayPlay() {
  if (replayPlaying.value) {
    stopReplayTimer();
    return;
  }
  if (replayPly.value >= selectedGame.value.moves.length) {
    replayPly.value = 0;
  }
  replayPlaying.value = true;
  replayTimer = setInterval(() => {
    if (replayPly.value < selectedGame.value.moves.length) {
      replayPly.value++;
    } else {
      stopReplayTimer();
    }
  }, 850);
}

function selectRecordedGame(idx: number) {
  stopReplayTimer();
  selectedGameIndex.value = idx;
  replayPly.value = Math.min(8, report.games[idx]?.moves.length ?? 0);
}

// --- Real In-Browser Classical Optimization Experiment (Opt-in, never faked) ---
const expDepth = ref(2);
const expSpeedMs = ref(650);
const expRunning = ref(false);
let expTimer: ReturnType<typeof setTimeout> | null = null;
let sessionInstance: ChessTrainingSession | null = null;
const expSnapshot = ref<TrainingSnapshot | null>(null);

function ensureSession(): ChessTrainingSession {
  if (!sessionInstance) {
    sessionInstance = new ChessTrainingSession({
      seed: 20261126,
      depth: expDepth.value,
      baselineElo: report.matchSummary.estimatedElo,
    });
    expSnapshot.value = sessionInstance.getSnapshot();
  }
  return sessionInstance;
}

function stopExperiment() {
  expRunning.value = false;
  if (expTimer) {
    clearTimeout(expTimer);
    expTimer = null;
  }
}

function stepExperimentOnce() {
  const s = ensureSession();
  s.searchDepth = expDepth.value;
  expSnapshot.value = s.stepMove();
}

function scheduleNextExperimentStep() {
  if (!expRunning.value) return;
  expTimer = setTimeout(() => {
    if (!expRunning.value) return;
    if (typeof document !== 'undefined' && document.hidden) {
      stopExperiment();
      return;
    }
    stepExperimentOnce();
    scheduleNextExperimentStep();
  }, expSpeedMs.value);
}

function toggleExperiment() {
  if (expRunning.value) {
    stopExperiment();
  } else {
    stopReplayTimer();
    ensureSession();
    expRunning.value = true;
    stepExperimentOnce();
    scheduleNextExperimentStep();
  }
}

function resetExperiment() {
  stopExperiment();
  sessionInstance = new ChessTrainingSession({
    seed: Date.now() & 0xfffffff,
    depth: expDepth.value,
    baselineElo: report.matchSummary.estimatedElo,
  });
  expSnapshot.value = sessionInstance.getSnapshot();
}

// --- Interactive Play vs Grandmaster-CI v0.1.0 ---
let playBoard = new ChessBoard();
const playSquares = ref<number[]>(Array.from(playBoard.squares));
const selectedSquare = ref<number | null>(null);
const playLastFrom = ref(-1);
const playLastTo = ref(-1);
const playMoves = ref<Array<{ ply: number; san: string; uci: string; evalWhiteCp: number }>>([]);
const playEvalCp = ref(0);
const playThinking = ref(false);
const playStatusText = ref('');

function syncPlayBoard() {
  playSquares.value = Array.from(playBoard.squares);
  const outcome = playBoard.getGameOutcome();
  if (outcome.status === 'checkmate') {
    playStatusText.value =
      outcome.winner === WHITE
        ? L('Checkmate — You win (1-0)!', '将杀 — 你获胜（1-0）！')
        : L('Checkmate — Grandmaster-CI wins (0-1).', '将杀 — Grandmaster-CI 获胜（0-1）。');
  } else if (outcome.status !== 'playing') {
    playStatusText.value = L(`Draw (${outcome.status})`, `和棋（${outcome.status}）`);
  } else {
    playStatusText.value = '';
  }
}

function resetPlayGame() {
  playBoard = new ChessBoard();
  selectedSquare.value = null;
  playLastFrom.value = -1;
  playLastTo.value = -1;
  playMoves.value = [];
  playEvalCp.value = 0;
  playThinking.value = false;
  syncPlayBoard();
}

const legalTargetsForSelected = computed<Map<number, ChessMove>>(() => {
  const map = new Map<number, ChessMove>();
  if (mode.value !== 'play' || selectedSquare.value === null || playThinking.value) return map;
  if (playBoard.sideToMove !== WHITE) return map;
  for (const m of playBoard.generateLegalMoves()) {
    if (m.from === selectedSquare.value) {
      // Prefer Queen promotion when clicking directly
      if (!map.has(m.to) || m.promotion === 5) map.set(m.to, m);
    }
  }
  return map;
});

function handleSquareClick(sq: number) {
  if (mode.value !== 'play' || playThinking.value) return;
  if (playBoard.sideToMove !== WHITE) return;
  if (playBoard.getGameOutcome().status !== 'playing') return;

  const targetMove = legalTargetsForSelected.value.get(sq);
  if (targetMove) {
    const san = playBoard.moveToSan(targetMove);
    playBoard.makeMove(targetMove, true);
    playLastFrom.value = targetMove.from;
    playLastTo.value = targetMove.to;
    playMoves.value.push({
      ply: playMoves.value.length + 1,
      san,
      uci: moveToUci(targetMove),
      evalWhiteCp: playEvalCp.value,
    });
    selectedSquare.value = null;
    syncPlayBoard();

    if (playBoard.getGameOutcome().status === 'playing') {
      playThinking.value = true;
      setTimeout(() => {
        const s = ensureSession();
        const res = s.replyForHuman(playBoard, 3, 240);
        if (res.bestMove) {
          const replySan = playBoard.moveToSan(res.bestMove);
          playBoard.makeMove(res.bestMove, true);
          playLastFrom.value = res.bestMove.from;
          playLastTo.value = res.bestMove.to;
          playEvalCp.value = res.scoreWhiteCp;
          playMoves.value.push({
            ply: playMoves.value.length + 1,
            san: replySan,
            uci: moveToUci(res.bestMove),
            evalWhiteCp: res.scoreWhiteCp,
          });
        }
        playThinking.value = false;
        syncPlayBoard();
      }, 30);
    }
    return;
  }

  const piece = playBoard.squares[sq] ?? 0;
  if (piece > 0) {
    selectedSquare.value = selectedSquare.value === sq ? null : sq;
  } else {
    selectedSquare.value = null;
  }
}

// --- Active View Projection (unified board + eval + telemetry) ---
const activeSquares = computed<number[]>(() => {
  if (mode.value === 'experiment' && expSnapshot.value) {
    return Array.from(new ChessBoard(expSnapshot.value.fen).squares);
  }
  if (mode.value === 'play') return playSquares.value;
  return replayBoardState.value.squares;
});

const activeLastFrom = computed(() => {
  if (mode.value === 'experiment') return expSnapshot.value?.lastMove?.from ?? -1;
  if (mode.value === 'play') return playLastFrom.value;
  return replayBoardState.value.lastFrom;
});

const activeLastTo = computed(() => {
  if (mode.value === 'experiment') return expSnapshot.value?.lastMove?.to ?? -1;
  if (mode.value === 'play') return playLastTo.value;
  return replayBoardState.value.lastTo;
});

const activeEvalCp = computed(() => {
  if (mode.value === 'experiment') return expSnapshot.value?.evalWhiteCp ?? 0;
  if (mode.value === 'play') return playEvalCp.value;
  return replayBoardState.value.evalWhiteCp;
});

const whiteEvalBarPct = computed(() => {
  const cp = Math.max(-900, Math.min(900, activeEvalCp.value));
  const sigmoid = 1 / (1 + Math.exp(-cp / 260));
  return Math.round(sigmoid * 100);
});

const evalDisplay = computed(() => {
  const cp = activeEvalCp.value;
  if (Math.abs(cp) >= 29_000) return cp > 0 ? '+M' : '-M';
  const pawns = (cp / 100).toFixed(2);
  return cp >= 0 ? `+${pawns}` : pawns;
});

const activeDepth = computed(() => {
  if (mode.value === 'experiment') return expSnapshot.value?.currentDepth || expDepth.value;
  if (mode.value === 'play') return 3;
  return replayBoardState.value.depth;
});

const activeNps = computed(() => {
  if (mode.value === 'experiment') return expSnapshot.value?.currentNps ?? 0;
  return replayBoardState.value.nps;
});

const activePv = computed(() => {
  if (mode.value === 'experiment') return expSnapshot.value?.pv ?? [];
  if (mode.value === 'replay') return replayBoardState.value.pv;
  return [];
});

// --- Elo Chart Data (combines real Phase 0 benchmark + live browser experiment points) ---
const eloChartPoints = computed(() => {
  const base = report.eloHistory.map((p, idx) => ({
    idx,
    label: p.version,
    elo: p.elo,
    note: state.locale === 'zh' ? p.noteZh : p.noteEn,
  }));
  if (expSnapshot.value && expSnapshot.value.eloHistory.length > 1) {
    for (const pt of expSnapshot.value.eloHistory.slice(1)) {
      base.push({
        idx: base.length,
        label: `Exp#${pt.gameNumber}`,
        elo: pt.elo,
        note: state.locale === 'zh' ? pt.openingZh : pt.openingEn,
      });
    }
  }
  return base;
});

const eloSvgPath = computed(() => {
  const pts = eloChartPoints.value;
  if (pts.length < 2) return { path: '', coords: [] as Array<{ x: number; y: number; elo: number; label: string }> };
  const w = 320;
  const h = 92;
  const padX = 18;
  const padY = 14;
  const minElo = Math.min(...pts.map((p) => p.elo)) - 40;
  const maxElo = Math.max(...pts.map((p) => p.elo)) + 40;
  const span = Math.max(1, maxElo - minElo);
  const coords = pts.map((p, i) => {
    const x = padX + (i / (pts.length - 1)) * (w - padX * 2);
    const y = h - padY - ((p.elo - minElo) / span) * (h - padY * 2);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, elo: p.elo, label: p.label };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  return { path, coords };
});

// Visual piece glyphs (crisp Unicode chess pieces with high-contrast styling)
const PIECE_GLYPHS: Record<number, string> = {
  1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔',
  [-1]: '♟', [-2]: '♞', [-3]: '♝', [-4]: '♜', [-5]: '♛', [-6]: '♚',
};

// Render visual ranks 7..0 (rank 8 at top, rank 1 at bottom), files 0..7 (a..h)
const boardCells = computed(() => {
  const cells: Array<{ sq: number; rank: number; file: number; isLight: boolean; piece: number }> = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = rank * 8 + file;
      cells.push({
        sq,
        rank,
        file,
        isLight: (rank + file) % 2 === 1,
        piece: activeSquares.value[sq] ?? 0,
      });
    }
  }
  return cells;
});

// Active move pairs for PGN-style display
const activeMoveRows = computed(() => {
  const src =
    mode.value === 'experiment'
      ? (expSnapshot.value?.moves ?? []).map((m) => ({ ply: m.ply, san: m.san, evalWhiteCp: m.evalWhiteCp }))
      : mode.value === 'play'
        ? playMoves.value
        : selectedGame.value.moves.map((m) => ({ ply: m.ply, san: m.san, evalWhiteCp: m.evalWhiteCp }));
  const rows: Array<{ moveNo: number; white?: { ply: number; san: string }; black?: { ply: number; san: string } }> = [];
  for (let i = 0; i < src.length; i += 2) {
    rows.push({
      moveNo: Math.floor(i / 2) + 1,
      white: src[i],
      black: src[i + 1],
    });
  }
  return rows;
});

const realContributions = computed(() => props.contributions.filter((c) => !c.isDemo));

watch(mode, (next) => {
  if (next !== 'replay') stopReplayTimer();
  if (next !== 'experiment') stopExperiment();
  if (next === 'experiment') ensureSession();
});

onMounted(() => {
  // Start replay paused at ply 10 of Game 1 so visitors immediately see a rich real middlegame position
  replayPly.value = Math.min(10, selectedGame.value.moves.length);
});

onBeforeUnmount(() => {
  stopReplayTimer();
  stopExperiment();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Mode Selector & Honest Experiment Status Banner -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-4 dark:border-border-dark">
      <div class="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Chess showcase modes">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'replay'"
          class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            mode === 'replay'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'border border-border-light bg-paper text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted'
          "
          @click="mode = 'replay'"
        >
          <History class="h-3.5 w-3.5" />
          <span>{{ L('Recorded Baseline Replay', '真实基准对局回放') }}</span>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'experiment'"
          class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            mode === 'experiment'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'border border-border-light bg-paper text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted'
          "
          @click="mode = 'experiment'"
        >
          <FlaskConical class="h-3.5 w-3.5" />
          <span>{{ L('Run Search/Eval Experiment', '运行真实算法优化实验') }}</span>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'play'"
          class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            mode === 'play'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'border border-border-light bg-paper text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted'
          "
          @click="mode = 'play'"
        >
          <Gamepad2 class="h-3.5 w-3.5" />
          <span>{{ L('Play vs Engine', '与当前引擎对弈') }}</span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <StatusPill
          :label="L('Classical Search & Eval · Non-ML', '传统搜索与评估优化 · 非机器学习训练')"
          tone="info"
          :mono="false"
        />
        <StatusPill
          :label="
            expRunning
              ? L('Live Experiment Running', '实时实验运行中')
              : L('No Live Run · Real Replay', '无实时实验 · 展示最近真实基准')
          "
          :tone="expRunning ? 'accent' : 'neutral'"
          :mono="false"
        />
      </div>
    </div>

    <!-- Main Two-Column Arena: Left = Board + Eval Bar + Controls, Right = Real Metrics, Elo Curve, Games & Moves -->
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <!-- LEFT: Real Chessboard + Eval Bar + Mode Controls -->
      <div class="space-y-3">
        <div class="flex gap-2.5">
          <!-- Vertical Evaluation Bar -->
          <div
            class="flex w-7 shrink-0 flex-col overflow-hidden rounded border border-border-light bg-obsidian dark:border-border-dark"
            :title="L(`Evaluation (White perspective): ${evalDisplay}`, `白方视角评估：${evalDisplay}`)"
          >
            <div
              class="w-full bg-zinc-800 transition-all duration-300"
              :style="{ height: `${100 - whiteEvalBarPct}%` }"
            />
            <div
              class="w-full bg-stone-100 transition-all duration-300"
              :style="{ height: `${whiteEvalBarPct}%` }"
            />
          </div>

          <!-- 8x8 Interactive Chessboard -->
          <div class="flex-1">
            <div
              class="grid aspect-square w-full max-w-[440px] grid-cols-8 overflow-hidden rounded-md border border-border-light shadow-xs select-none dark:border-border-dark"
              role="grid"
              :aria-label="L('Grandmaster-CI live chessboard', 'Grandmaster-CI 国际象棋棋盘')"
            >
              <button
                v-for="cell in boardCells"
                :key="cell.sq"
                type="button"
                class="relative flex items-center justify-center text-[clamp(1.25rem,3.4vw,2.2rem)] leading-none transition-colors"
                :class="[
                  cell.isLight
                    ? 'bg-[#EAE7DC] dark:bg-[#B8B4A6]'
                    : 'bg-[#5E7C74] dark:bg-[#38554E]',
                  cell.sq === activeLastFrom || cell.sq === activeLastTo
                    ? 'ring-2 ring-inset ring-amber-400/90 bg-amber-200/75 dark:bg-amber-500/45'
                    : '',
                  selectedSquare === cell.sq ? 'ring-2 ring-inset ring-accent dark:ring-accent-dark' : '',
                  mode === 'play' ? 'cursor-pointer' : 'cursor-default',
                ]"
                :aria-label="squareToAlgebraic(cell.sq)"
                @click="handleSquareClick(cell.sq)"
              >
                <!-- Rank / File coordinates -->
                <span
                  v-if="cell.file === 0"
                  class="pointer-events-none absolute top-0.5 left-1 font-mono text-[9px] font-semibold opacity-70"
                  :class="cell.isLight ? 'text-stone-700' : 'text-stone-100'"
                >
                  {{ cell.rank + 1 }}
                </span>
                <span
                  v-if="cell.rank === 0"
                  class="pointer-events-none absolute right-1 bottom-0.5 font-mono text-[9px] font-semibold opacity-70"
                  :class="cell.isLight ? 'text-stone-700' : 'text-stone-100'"
                >
                  {{ String.fromCharCode(97 + cell.file) }}
                </span>

                <!-- Legal move dot in Play mode -->
                <span
                  v-if="legalTargetsForSelected.has(cell.sq) && cell.piece === 0"
                  class="h-2.5 w-2.5 rounded-full bg-accent/70 dark:bg-accent-dark/80"
                />
                <span
                  v-else-if="legalTargetsForSelected.has(cell.sq) && cell.piece !== 0"
                  class="pointer-events-none absolute inset-1 rounded-full border-2 border-accent/80 dark:border-accent-dark"
                />

                <!-- Chess Piece -->
                <span
                  v-if="cell.piece !== 0"
                  class="drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                  :class="cell.piece > 0 ? 'text-white' : 'text-zinc-950'"
                >
                  {{ PIECE_GLYPHS[cell.piece] }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Telemetry Strip directly below board -->
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-light bg-paper px-3 py-2 font-mono text-xs dark:border-border-dark dark:bg-obsidian">
          <div class="flex flex-wrap items-center gap-3">
            <span>
              <span class="text-ink-faint dark:text-chalk-faint">Eval:</span>
              <strong class="ml-1 text-ink dark:text-chalk">{{ evalDisplay }}</strong>
            </span>
            <span>
              <span class="text-ink-faint dark:text-chalk-faint">Depth:</span>
              <strong class="ml-1 text-ink dark:text-chalk">{{ activeDepth }}</strong>
            </span>
            <span>
              <span class="text-ink-faint dark:text-chalk-faint">Speed:</span>
              <strong class="ml-1 text-ink dark:text-chalk">
                {{ activeNps >= 1000 ? `${(activeNps / 1000).toFixed(1)}k` : activeNps }} nps
              </strong>
            </span>
          </div>
          <div v-if="activePv.length > 0" class="truncate text-[11px] text-ink-muted dark:text-chalk-muted">
            PV: {{ activePv.slice(0, 6).join(' ') }}
          </div>
        </div>

        <!-- Mode-Specific Controls -->
        <div
          v-if="mode === 'replay'"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-light bg-surface p-3 dark:border-border-dark dark:bg-obsidian-surface"
        >
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded border border-border-light p-1.5 text-ink hover:bg-subtle dark:border-border-dark dark:text-chalk dark:hover:bg-obsidian-subtle cursor-pointer"
              :title="L('Start of game', '回到开局')"
              @click="stopReplayTimer(); replayPly = 0"
            >
              <SkipBack class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="rounded border border-border-light p-1.5 text-ink hover:bg-subtle dark:border-border-dark dark:text-chalk dark:hover:bg-obsidian-subtle cursor-pointer"
              :title="L('Previous move', '上一步')"
              @click="stopReplayTimer(); replayPly = Math.max(0, replayPly - 1)"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
              @click="toggleReplayPlay"
            >
              <Pause v-if="replayPlaying" class="h-3.5 w-3.5" />
              <Play v-else class="h-3.5 w-3.5" />
              <span>{{ replayPlaying ? L('Pause', '暂停') : L('Play Replay', '播放回放') }}</span>
            </button>
            <button
              type="button"
              class="rounded border border-border-light p-1.5 text-ink hover:bg-subtle dark:border-border-dark dark:text-chalk dark:hover:bg-obsidian-subtle cursor-pointer"
              :title="L('Next move', '下一步')"
              @click="stopReplayTimer(); replayPly = Math.min(selectedGame.moves.length, replayPly + 1)"
            >
              <ChevronRight class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="rounded border border-border-light p-1.5 text-ink hover:bg-subtle dark:border-border-dark dark:text-chalk dark:hover:bg-obsidian-subtle cursor-pointer"
              :title="L('End of game', '跳至终局')"
              @click="stopReplayTimer(); replayPly = selectedGame.moves.length"
            >
              <SkipForward class="h-3.5 w-3.5" />
            </button>
          </div>
          <div class="font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
            {{ L(`Game #${selectedGame.gameNumber}`, `第 ${selectedGame.gameNumber} 局`) }} ·
            {{ replayPly }} / {{ selectedGame.moves.length }} plies ·
            {{ selectedGame.result }}
          </div>
        </div>

        <div
          v-else-if="mode === 'experiment'"
          class="space-y-2.5 rounded-md border border-border-light bg-surface p-3 dark:border-border-dark dark:bg-obsidian-surface"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
                @click="toggleExperiment"
              >
                <Pause v-if="expRunning" class="h-3.5 w-3.5" />
                <Play v-else class="h-3.5 w-3.5" />
                <span>{{ expRunning ? L('Pause Experiment', '暂停实验') : L('Start Real Experiment', '启动真实自对弈实验') }}</span>
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-border-light px-2.5 py-1.5 text-xs text-ink hover:bg-subtle dark:border-border-dark dark:text-chalk dark:hover:bg-obsidian-subtle cursor-pointer"
                :disabled="expRunning"
                @click="stepExperimentOnce"
              >
                <StepForward class="h-3.5 w-3.5" />
                <span>{{ L('Step 1 Move', '单步搜索') }}</span>
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-border-light px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted cursor-pointer"
                @click="resetExperiment"
              >
                <RotateCcw class="h-3.5 w-3.5" />
                <span>{{ L('Reset', '重置') }}</span>
              </button>
            </div>

            <div class="flex items-center gap-2 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
              <label class="inline-flex items-center gap-1">
                <span>Depth</span>
                <select
                  v-model.number="expDepth"
                  class="rounded border border-border-light bg-paper px-1.5 py-0.5 text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
                >
                  <option :value="2">2</option>
                  <option :value="3">3</option>
                </select>
              </label>
              <label class="inline-flex items-center gap-1">
                <span>Pace</span>
                <select
                  v-model.number="expSpeedMs"
                  class="rounded border border-border-light bg-paper px-1.5 py-0.5 text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
                >
                  <option :value="1000">1.0s</option>
                  <option :value="650">0.65s</option>
                  <option :value="250">0.25s</option>
                </select>
              </label>
            </div>
          </div>

          <div v-if="expSnapshot" class="space-y-1 text-xs text-ink-muted dark:text-chalk-muted">
            <div class="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <span>
                Gen #{{ expSnapshot.generation }} · {{ L('Testing', '受测权重') }}:
                <strong class="text-ink dark:text-chalk">{{ expSnapshot.candidateDeltaSummary }}</strong>
              </span>
              <span>
                W-D-L: <strong class="text-ink dark:text-chalk">{{ expSnapshot.wins }}-{{ expSnapshot.draws }}-{{ expSnapshot.losses }}</strong>
                · LLR {{ expSnapshot.sprtLlr.toFixed(2) }} / ±{{ expSnapshot.sprtBound }}
              </span>
            </div>
            <p v-if="expSnapshot.lastEvent" class="text-[11.5px] text-accent dark:text-accent-dark">
              {{ loc(expSnapshot.lastEvent) }}
            </p>
          </div>
        </div>

        <div
          v-else
          class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-light bg-surface p-3 text-xs dark:border-border-dark dark:bg-obsidian-surface"
        >
          <span class="text-ink-muted dark:text-chalk-muted">
            <template v-if="playThinking">
              {{ L('Grandmaster-CI v0.1.0 is searching…', 'Grandmaster-CI v0.1.0 正在搜索着法…') }}
            </template>
            <template v-else-if="playStatusText">
              <strong class="text-ink dark:text-chalk">{{ playStatusText }}</strong>
            </template>
            <template v-else>
              {{ L('You play White. Click a White piece to see legal moves.', '你执白先行，点击任意白方棋子查看合法走法并与引擎对弈。') }}
            </template>
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded border border-border-light px-2.5 py-1 text-xs text-ink hover:bg-subtle dark:border-border-dark dark:text-chalk dark:hover:bg-obsidian-subtle cursor-pointer"
            @click="resetPlayGame"
          >
            <RotateCcw class="h-3.5 w-3.5" />
            <span>{{ L('New Game', '重新开局') }}</span>
          </button>
        </div>
      </div>

      <!-- RIGHT: Real Engine Telemetry, W/D/L, Elo History Curve, Recorded Games & Moves -->
      <div class="space-y-4">
        <!-- Key Engine Metrics Grid -->
        <div class="grid grid-cols-2 gap-2.5">
          <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
            <div class="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted dark:text-chalk-muted">
              <Cpu class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>{{ L('Engine Version', '当前引擎版本') }}</span>
            </div>
            <div class="mt-1 font-mono text-base font-semibold text-ink dark:text-chalk">
              {{ report.engineName }} v{{ report.engineVersion }}
            </div>
            <div class="mt-0.5 text-[11px] text-ink-faint dark:text-chalk-faint">
              PVS + QSearch + TT + PST
            </div>
          </div>

          <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
            <div class="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted dark:text-chalk-muted">
              <Activity class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>{{ L('Measured Baseline Elo', '实测基线 Elo') }}</span>
            </div>
            <div class="mt-1 flex items-baseline gap-1.5">
              <span class="font-mono text-base font-semibold tabular-nums text-accent dark:text-accent-dark">
                {{ expSnapshot ? expSnapshot.elo : report.matchSummary.estimatedElo }}
              </span>
              <span class="font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                ({{ report.matchSummary.eloDiff >= 0 ? '+' : '' }}{{ report.matchSummary.eloDiff }} vs Ref-D2)
              </span>
            </div>
            <div class="mt-0.5 text-[11px] text-ink-faint dark:text-chalk-faint">
              {{ L(`Anchor: ${report.matchSummary.opponentAnchorElo} Elo`, `锚点对手：${report.matchSummary.opponentAnchorElo} Elo`) }}
            </div>
          </div>

          <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
            <div class="text-[11px] font-medium text-ink-muted dark:text-chalk-muted">
              {{ L('Bench Speed & Avg Depth', '基准速度与搜索深度') }}
            </div>
            <div class="mt-1 font-mono text-sm font-semibold tabular-nums text-ink dark:text-chalk">
              {{ (report.benchNps / 1000).toFixed(1) }}k NPS · D{{ report.matchSummary.avgDepth }}
            </div>
            <div class="mt-0.5 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              {{ report.benchNodes.toLocaleString() }} nodes / {{ report.benchTimeMs }}ms
            </div>
          </div>

          <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
            <div class="flex items-center gap-1 text-[11px] font-medium text-ink-muted dark:text-chalk-muted">
              <CheckCircle2 class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{{ L('Rule Verification (Perft)', '规则 Perft 校验') }}</span>
            </div>
            <div class="mt-1 font-mono text-sm font-semibold text-ink dark:text-chalk">
              {{ report.perftChecks.filter((p) => p.passed).length }} / {{ report.perftChecks.length }}
              {{ L('Exact', '完全精确') }}
            </div>
            <div class="mt-0.5 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              UCI + Auto-Match Ready
            </div>
          </div>
        </div>

        <!-- Real Win / Draw / Loss Rate Bar -->
        <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-ink dark:text-chalk">
              {{ L('Phase 0 Match W / D / L Rate', 'Phase 0 真实对抗胜 / 和 / 负率') }}
            </span>
            <span class="font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
              {{ report.matchSummary.wins }}W · {{ report.matchSummary.draws }}D · {{ report.matchSummary.losses }}L ({{ report.matchSummary.games }} {{ L('games', '局') }})
            </span>
          </div>
          <div class="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-subtle dark:bg-obsidian-subtle">
            <div
              class="bg-accent dark:bg-accent-dark"
              :style="{ width: `${report.matchSummary.winRatePct}%` }"
              :title="`Win ${report.matchSummary.winRatePct}%`"
            />
            <div
              class="bg-zinc-400 dark:bg-zinc-500"
              :style="{ width: `${report.matchSummary.drawRatePct}%` }"
              :title="`Draw ${report.matchSummary.drawRatePct}%`"
            />
            <div
              class="bg-rose-500/80 dark:bg-rose-400/80"
              :style="{ width: `${report.matchSummary.lossRatePct}%` }"
              :title="`Loss ${report.matchSummary.lossRatePct}%`"
            />
          </div>
          <div class="mt-1.5 flex justify-between font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
            <span>{{ L('Win', '胜率') }} {{ report.matchSummary.winRatePct }}%</span>
            <span>{{ L('Draw', '和率') }} {{ report.matchSummary.drawRatePct }}%</span>
            <span>{{ L('Loss', '负率') }} {{ report.matchSummary.lossRatePct }}%</span>
          </div>
        </div>

        <!-- Elo History Curve (Real Benchmark + Live Experiment) -->
        <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-ink dark:text-chalk">
              {{ L('Measured Elo Progression', '实测 Elo 变化曲线') }}
            </span>
            <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              {{ eloChartPoints.length }} {{ L('checkpoints', '个实测节点') }}
            </span>
          </div>
          <svg
            viewBox="0 0 320 92"
            class="mt-2 h-24 w-full overflow-visible"
            role="img"
            :aria-label="L('Measured Elo history chart', '实测 Elo 历史折线图')"
          >
            <line x1="18" y1="78" x2="302" y2="78" class="stroke-border-light dark:stroke-border-dark" stroke-width="1" />
            <path
              v-if="eloSvgPath.path"
              :d="eloSvgPath.path"
              fill="none"
              class="stroke-accent dark:stroke-accent-dark"
              stroke-width="2"
            />
            <g v-for="c in eloSvgPath.coords" :key="c.label">
              <circle :cx="c.x" :cy="c.y" r="3.5" class="fill-accent dark:fill-accent-dark" />
              <text
                :x="c.x"
                :y="Math.max(10, c.y - 7)"
                text-anchor="middle"
                class="fill-ink font-mono text-[9px] dark:fill-chalk"
              >
                {{ c.elo }}
              </text>
            </g>
          </svg>
        </div>

        <!-- Recorded Match Selector & Move Notation List -->
        <div class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-medium text-ink dark:text-chalk">
              {{
                mode === 'replay'
                  ? L('Recorded Phase 0 Match Games & Move List', 'Phase 0 真实对局记录与棋谱')
                  : L('Current Game Move List', '当前对局棋谱')
              }}
            </span>
            <select
              v-if="mode === 'replay'"
              :value="selectedGameIndex"
              class="rounded border border-border-light bg-surface px-2 py-1 font-mono text-[11px] text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
              @change="selectRecordedGame(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="(g, i) in report.games" :key="g.gameNumber" :value="i">
                #{{ g.gameNumber }} {{ state.locale === 'zh' ? g.openingZh : g.openingEn }} ({{ g.result }})
              </option>
            </select>
          </div>

          <div class="mt-2 max-h-32 overflow-y-auto rounded bg-surface p-2 font-mono text-[11.5px] dark:bg-obsidian-surface">
            <p v-if="activeMoveRows.length === 0" class="text-ink-faint dark:text-chalk-faint">
              {{ L('No moves yet.', '暂无着法。') }}
            </p>
            <div v-else class="flex flex-wrap gap-x-3 gap-y-1">
              <span v-for="row in activeMoveRows" :key="row.moveNo" class="inline-flex items-center gap-1">
                <span class="text-ink-faint dark:text-chalk-faint">{{ row.moveNo }}.</span>
                <button
                  v-if="row.white"
                  type="button"
                  class="rounded px-1 hover:bg-subtle dark:hover:bg-obsidian-subtle"
                  :class="[
                    mode === 'replay' && replayPly === row.white.ply
                      ? 'bg-accent/15 font-semibold text-accent dark:bg-accent-dark/20 dark:text-accent-dark'
                      : 'text-ink dark:text-chalk',
                    mode === 'replay' ? 'cursor-pointer' : 'cursor-default',
                  ]"
                  @click="mode === 'replay' && (stopReplayTimer(), (replayPly = row.white!.ply))"
                >
                  {{ row.white.san }}
                </button>
                <button
                  v-if="row.black"
                  type="button"
                  class="rounded px-1 hover:bg-subtle dark:hover:bg-obsidian-subtle"
                  :class="[
                    mode === 'replay' && replayPly === row.black.ply
                      ? 'bg-accent/15 font-semibold text-accent dark:bg-accent-dark/20 dark:text-accent-dark'
                      : 'text-ink dark:text-chalk',
                    mode === 'replay' ? 'cursor-pointer' : 'cursor-default',
                  ]"
                  @click="mode === 'replay' && (stopReplayTimer(), (replayPly = row.black!.ply))"
                >
                  {{ row.black.san }}
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Verified Improvements & PR/Commit Provenance -->
    <div class="rounded-md border border-border-light bg-paper p-4 dark:border-border-dark dark:bg-obsidian">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-xs font-semibold text-ink dark:text-chalk">
          <GitCommit class="h-4 w-4 text-accent dark:text-accent-dark" />
          <span>{{ L('Recent Verified Improvements & GitHub Provenance', '最近有效改进与 GitHub PR / Commit 溯源') }}</span>
        </div>
        <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
          {{ L(`Baseline executed: ${report.executedAt.slice(0, 10)} · ${report.runtime}`, `基线实测日期：${report.executedAt.slice(0, 10)} · ${report.runtime}`) }}
        </span>
      </div>

      <div v-if="realContributions.length > 0" class="mt-3 divide-y divide-border-light dark:divide-border-dark">
        <div
          v-for="item in realContributions.slice(0, 4)"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
        >
          <div class="min-w-0">
            <div class="font-medium text-ink dark:text-chalk">{{ loc(item.title) }}</div>
            <div class="mt-0.5 text-[11px] text-ink-muted dark:text-chalk-muted">
              @{{ item.contributorUsername }} · {{ loc(item.verificationSummary) }}
            </div>
          </div>
          <a
            :href="item.prUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline dark:text-accent-dark"
          >
            <span>PR #{{ item.prNumber }} · {{ item.commitSha.slice(0, 7) }}</span>
            <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </div>

      <p v-else class="mt-2 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
        {{
          L(
            'Phase 0 clean-room engine (Grandmaster-CI v0.1.0), Perft suite, automated benchmark gauntlet, and this live showcase are now live. No community optimization PRs have been merged yet — claim a Phase 1 task or propose your own search/evaluation upgrade via GitHub PR.',
            'Phase 0 洁净室引擎（Grandmaster-CI v0.1.0）、Perft 规则校验、自动对弈评测与本实时展示页已正式上线。目前尚无后续社区优化 PR 合入——欢迎认领 Phase 1 任务或通过 GitHub PR 提交你的搜索/评估改进。'
          )
        }}
      </p>
    </div>
  </div>
</template>
