<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  CHESS_MAX_GAME_HISTORY,
  CHESS_RESIGN_UCI,
  type ChessGameEndReason,
  type ChessHistoricalGame,
  type ChessMatchState,
  type ChessRoundVoteHistory,
  type Contribution,
  type ProjectShowcase,
} from '@common-intelligence/shared';
import {
  ChessBoard,
  MATE_SCORE,
  START_FEN,
  WHITE,
  evaluateBoard,
  squareToAlgebraic,
} from '@common-intelligence/grandmaster-engine';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Eye,
  FastForward,
  Flag,
  History,
  ListChecks,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from 'lucide-vue-next';
import { apiClient } from '@/api/client';
import ChessPieceIcon from '@/components/ChessPieceIcon.vue';
import { useAppState } from '@/stores/appState';

const props = withDefaults(
  defineProps<{
    showcase?: ProjectShowcase;
    contributions?: Contribution[];
    slug?: string;
    compact?: boolean;
  }>(),
  {
    slug: 'grandmaster',
    compact: false,
  }
);

const emit = defineEmits<{
  (e: 'join-agent'): void;
}>();

const { state, notify } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const match = ref<ChessMatchState | null>(null);
const loading = ref(true);
const resolving = ref(false);
const previewMoveUci = ref<string | null>(null);
const selectedHistoryGameNumber = ref<number | null>(null);
const replayPly = ref<number>(0);
const expandedVoteRound = ref<string | null>(null);
const countdownText = ref('08:00');
let pollTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function updateCountdown() {
  const deadline = match.value?.roundDeadlineAt;
  if (!deadline) {
    countdownText.value = '--:--';
    return;
  }
  const diffSec = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  countdownText.value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function loadMatch(silent = false) {
  if (!silent) loading.value = true;
  try {
    match.value = await apiClient.getChessMatch(props.slug);
    if (
      selectedHistoryGameNumber.value !== null &&
      !(match.value.gameHistory ?? []).some((g) => g.gameNumber === selectedHistoryGameNumber.value)
    ) {
      selectedHistoryGameNumber.value = null;
    }
    updateCountdown();
  } finally {
    loading.value = false;
  }
}

const gameHistory = computed<ChessHistoricalGame[]>(() =>
  (match.value?.gameHistory ?? []).slice(0, CHESS_MAX_GAME_HISTORY)
);

const selectedHistoryGame = computed<ChessHistoricalGame | null>(() => {
  if (selectedHistoryGameNumber.value === null) return null;
  return gameHistory.value.find((g) => g.gameNumber === selectedHistoryGameNumber.value) ?? null;
});

const isViewingHistory = computed(() => !props.compact && selectedHistoryGame.value !== null);

const activeVoteHistory = computed<ChessRoundVoteHistory[]>(() => {
  if (selectedHistoryGame.value) return selectedHistoryGame.value.voteHistory ?? [];
  return match.value?.voteHistory ?? [];
});

const activeVoteHistoryGameNumber = computed(
  () => selectedHistoryGame.value?.gameNumber ?? match.value?.gameNumber ?? 1
);

const liveBoard = computed(() => new ChessBoard(match.value?.fen));

const replaySnapshot = computed(() => {
  const histGame = selectedHistoryGame.value;
  if (!histGame) return null;
  const board = new ChessBoard(START_FEN);
  const clampedPly = Math.max(0, Math.min(replayPly.value, histGame.moveHistory.length));
  let lastBoardMoveUci: string | null = null;
  let lastEvalCp: number | null = null;
  for (let i = 0; i < clampedPly; i++) {
    const mv = histGame.moveHistory[i];
    if (!mv) break;
    if (typeof mv.evalWhiteCp === 'number' && Number.isFinite(mv.evalWhiteCp)) {
      lastEvalCp = mv.evalWhiteCp;
    }
    if (mv.uci === CHESS_RESIGN_UCI) continue;
    const legal = board.findMoveByUci(mv.uci);
    if (!legal) break;
    board.makeMove(legal, true);
    lastBoardMoveUci = mv.uci;
  }
  return {
    board,
    clampedPly,
    lastBoardMoveUci,
    lastEvalCp,
    atEnd: clampedPly >= histGame.moveHistory.length,
  };
});

const currentBoard = computed(() =>
  isViewingHistory.value && replaySnapshot.value ? replaySnapshot.value.board : liveBoard.value
);

const positionEval = computed(() => {
  const m = match.value;
  if (!m) {
    return {
      cp: 0,
      whiteWinPct: 50,
      blackWinPct: 50,
      barWhitePct: 50,
      shortScore: '0.0',
      signedScore: '0.0',
      favoredSide: 'even' as 'white' | 'black' | 'even',
    };
  }

  const histGame = isViewingHistory.value ? selectedHistoryGame.value : null;
  const snap = isViewingHistory.value ? replaySnapshot.value : null;

  const evalFinishedResult = (result: string) => {
    if (result === '1-0') {
      return {
        cp: MATE_SCORE,
        whiteWinPct: 100,
        blackWinPct: 0,
        barWhitePct: 100,
        shortScore: '1-0',
        signedScore: '1-0',
        favoredSide: 'white' as const,
      };
    }
    if (result === '0-1') {
      return {
        cp: -MATE_SCORE,
        whiteWinPct: 0,
        blackWinPct: 100,
        barWhitePct: 0,
        shortScore: '0-1',
        signedScore: '0-1',
        favoredSide: 'black' as const,
      };
    }
    return {
      cp: 0,
      whiteWinPct: 50,
      blackWinPct: 50,
      barWhitePct: 50,
      shortScore: '0.0',
      signedScore: '0.0',
      favoredSide: 'even' as const,
    };
  };

  if (histGame && snap) {
    if (snap.atEnd && histGame.endReason !== 'aborted') {
      return evalFinishedResult(histGame.result);
    }
  } else if (m.status === 'finished') {
    return evalFinishedResult(m.result);
  }

  let cp: number | null = null;
  if (histGame && snap) {
    cp = snap.lastEvalCp;
    if (cp === null) {
      if (snap.clampedPly === 0) {
        cp = 0;
      } else {
        const sideScore = evaluateBoard(snap.board);
        cp = snap.board.sideToMove === WHITE ? sideScore : -sideScore;
      }
    }
  } else {
    for (let i = m.moveHistory.length - 1; i >= 0; i--) {
      const val = m.moveHistory[i]?.evalWhiteCp;
      if (typeof val === 'number' && Number.isFinite(val)) {
        cp = val;
        break;
      }
    }
    if (cp === null) {
      if (m.moveHistory.length === 0) {
        cp = 0;
      } else {
        const sideScore = evaluateBoard(currentBoard.value);
        cp = currentBoard.value.sideToMove === WHITE ? sideScore : -sideScore;
      }
    }
  }

  if (Math.abs(cp) >= MATE_SCORE - 1000) {
    const mateMoves = Math.max(1, Math.ceil((MATE_SCORE - Math.abs(cp)) / 2));
    const whiteWinning = cp > 0;
    return {
      cp,
      whiteWinPct: whiteWinning ? 100 : 0,
      blackWinPct: whiteWinning ? 0 : 100,
      barWhitePct: whiteWinning ? 100 : 0,
      shortScore: `M${mateMoves}`,
      signedScore: `${whiteWinning ? '+' : '-'}M${mateMoves}`,
      favoredSide: whiteWinning ? ('white' as const) : ('black' as const),
    };
  }

  // Standard Stockfish/Lichess logistic win-probability curve
  const rawWhitePct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const whiteWinPct = Math.max(1, Math.min(99, Math.round(rawWhitePct)));
  const blackWinPct = 100 - whiteWinPct;
  const barWhitePct = Math.max(5, Math.min(95, rawWhitePct));
  const absPawns = Math.abs(cp) / 100;
  const mag = absPawns >= 10 ? Math.round(absPawns).toString() : absPawns.toFixed(1);
  const isEven = Math.abs(cp) < 5;

  return {
    cp,
    whiteWinPct,
    blackWinPct,
    barWhitePct,
    shortScore: isEven ? '0.0' : mag,
    signedScore: isEven ? '0.0' : `${cp > 0 ? '+' : '-'}${mag}`,
    favoredSide: isEven ? ('even' as const) : cp > 0 ? ('white' as const) : ('black' as const),
  };
});

const evalBarTooltip = computed(() =>
  L(
    `Live Evaluation ${positionEval.value.signedScore} · AI Swarm (White) ${positionEval.value.whiteWinPct}% vs ${match.value?.opponentName ?? 'Stockfish 19'} (Black) ${positionEval.value.blackWinPct}%`,
    `实时局面评估 ${positionEval.value.signedScore} · AI 众筹联队（白）胜率 ${positionEval.value.whiteWinPct}% vs ${match.value?.opponentName ?? 'Stockfish 19'}（黑）胜率 ${positionEval.value.blackWinPct}%`
  )
);

const activeTally = computed(() => {
  const tallies = match.value?.tallies ?? [];
  if (tallies.length === 0) return null;
  if (previewMoveUci.value) {
    const picked = tallies.find((t) => t.moveUci === previewMoveUci.value);
    if (picked) return picked;
  }
  return tallies[0] ?? null;
});

const isPreviewingLeading = computed(() => {
  const top = match.value?.tallies[0];
  return Boolean(top && activeTally.value && top.moveUci === activeTally.value.moveUci);
});

const isResignTally = (moveUci: string) => moveUci === CHESS_RESIGN_UCI;

const formatVoteLabel = (moveUci: string, moveSan: string) =>
  moveUci === CHESS_RESIGN_UCI ? L('Resign', '投降') : moveSan;

const previewingResign = computed(() => {
  if (isViewingHistory.value) return null;
  const uci = previewMoveUci.value ?? activeTally.value?.moveUci;
  if (uci !== CHESS_RESIGN_UCI) return null;
  const tally = match.value?.tallies.find((t) => t.moveUci === CHESS_RESIGN_UCI) ?? null;
  if (!tally) return null;
  return {
    votes: tally.votes,
    percentage: tally.percentage,
    isLeading: match.value?.tallies[0]?.moveUci === CHESS_RESIGN_UCI,
  };
});

const resignedGame = computed(() => {
  const hist = match.value?.moveHistory ?? [];
  return match.value?.status === 'finished' && hist[hist.length - 1]?.uci === CHESS_RESIGN_UCI;
});

const previewMoveInfo = computed(() => {
  if (isViewingHistory.value) return null;
  const uci = previewMoveUci.value ?? activeTally.value?.moveUci;
  if (!uci || uci === CHESS_RESIGN_UCI) return null;
  const move = liveBoard.value.findMoveByUci(uci);
  if (!move) return null;
  const tally = match.value?.tallies.find((t) => t.moveUci === uci) ?? null;
  const leading = match.value?.tallies[0]?.moveUci === uci;
  const fromAlg = squareToAlgebraic(move.from);
  const toAlg = squareToAlgebraic(move.to);
  const movingPiece = move.promotion ? move.promotion : (liveBoard.value.squares[move.from] ?? 0);
  return {
    uci,
    san: tally?.moveSan ?? uci,
    votes: tally?.votes ?? 0,
    percentage: tally?.percentage ?? 0,
    from: move.from,
    to: move.to,
    fromAlg,
    toAlg,
    movingPiece,
    isLeading: leading,
  };
});

function buildArrowGeometry(fromSq: number, toSq: number) {
  const x1 = (fromSq % 8) * 100 + 50;
  const y1 = (7 - Math.floor(fromSq / 8)) * 100 + 50;
  const x2 = (toSq % 8) * 100 + 50;
  const y2 = (7 - Math.floor(toSq / 8)) * 100 + 50;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const startOffset = 20;
  const tipOffset = 8;
  const headLen = 36;
  const shaftHalfW = 10;
  const headHalfW = 26;

  const sx = x1 + ux * startOffset;
  const sy = y1 + uy * startOffset;
  const tipX = x2 - ux * tipOffset;
  const tipY = y2 - uy * tipOffset;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;

  const coords: Array<[number, number]> = [
    [sx + px * shaftHalfW, sy + py * shaftHalfW],
    [baseX + px * shaftHalfW, baseY + py * shaftHalfW],
    [baseX + px * headHalfW, baseY + py * headHalfW],
    [tipX, tipY],
    [baseX - px * headHalfW, baseY - py * headHalfW],
    [baseX - px * shaftHalfW, baseY - py * shaftHalfW],
    [sx - px * shaftHalfW, sy - py * shaftHalfW],
  ];
  const pts = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return {
    points: pts,
  };
}

const previewArrow = computed(() => {
  if (!previewMoveInfo.value) return null;
  return buildArrowGeometry(previewMoveInfo.value.from, previewMoveInfo.value.to);
});

const topMoveCoords = computed(() => {
  const top = match.value?.tallies[0];
  if (!top || top.moveUci === CHESS_RESIGN_UCI) return { from: -1, to: -1 };
  const m = liveBoard.value.findMoveByUci(top.moveUci);
  return m ? { from: m.from, to: m.to } : { from: -1, to: -1 };
});

const compactTopArrow = computed(() => {
  if (topMoveCoords.value.from < 0 || topMoveCoords.value.to < 0) return null;
  return buildArrowGeometry(topMoveCoords.value.from, topMoveCoords.value.to);
});

function selectPreviewMove(moveUci: string) {
  if (isViewingHistory.value) {
    selectedHistoryGameNumber.value = null;
  }
  previewMoveUci.value = moveUci;
}

function selectHistoricalGame(game: ChessHistoricalGame) {
  if (selectedHistoryGameNumber.value === game.gameNumber) {
    selectedHistoryGameNumber.value = null;
    return;
  }
  selectedHistoryGameNumber.value = game.gameNumber;
  replayPly.value = game.moveHistory.length;
  previewMoveUci.value = null;
}

function exitHistoryReplay() {
  selectedHistoryGameNumber.value = null;
}

function jumpReplay(ply: number) {
  const max = selectedHistoryGame.value?.moveHistory.length ?? 0;
  replayPly.value = Math.max(0, Math.min(ply, max));
}

function stepReplay(delta: number) {
  jumpReplay(replayPly.value + delta);
}

function voteRoundKey(gameNumber: number, roundNumber: number): string {
  return `${gameNumber}:${roundNumber}`;
}

function isVoteRoundExpanded(gameNumber: number, roundNumber: number): boolean {
  return expandedVoteRound.value === voteRoundKey(gameNumber, roundNumber);
}

function toggleVoteRound(gameNumber: number, roundNumber: number) {
  const key = voteRoundKey(gameNumber, roundNumber);
  expandedVoteRound.value = expandedVoteRound.value === key ? null : key;
}

function formatEndReason(reason: ChessGameEndReason): string {
  if (reason === 'resign') return L('Resigned', '投降');
  if (reason === 'checkmate') return L('Checkmate', '将杀');
  if (reason === 'draw') return L('Draw', '和棋');
  return L('Reset', '中止');
}

function resultBadgeClass(result: string): string {
  if (result === '1-0') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  if (result === '0-1') {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  }
  if (result === '1/2-1/2') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  return 'bg-subtle text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted';
}

function formatShortTime(isoStr?: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}

const lastMoveCoords = computed(() => {
  const lastUci =
    isViewingHistory.value && replaySnapshot.value
      ? replaySnapshot.value.lastBoardMoveUci
      : (match.value?.moveHistory?.[match.value.moveHistory.length - 1]?.uci ?? null);
  if (!lastUci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(lastUci)) return { from: -1, to: -1 };
  const parseSq = (alg: string) => {
    const file = alg.charCodeAt(0) - 97;
    const rank = Number(alg[1]) - 1;
    return rank * 8 + file;
  };
  return { from: parseSq(lastUci.slice(0, 2)), to: parseSq(lastUci.slice(2, 4)) };
});

function squareBgClass(sq: number, isLight: boolean): string {
  const isHighlighted = lastMoveCoords.value.from === sq || lastMoveCoords.value.to === sq;
  if (isHighlighted) {
    return isLight ? 'bg-[#f5f682]' : 'bg-[#baca2b]';
  }
  return isLight ? 'bg-[#eeeed2]' : 'bg-[#769656]';
}

const boardCells = computed(() => {
  const sqArr = Array.from(currentBoard.value.squares);
  const cells: Array<{ sq: number; rank: number; file: number; isLight: boolean; piece: number }> = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = rank * 8 + file;
      cells.push({
        sq,
        rank,
        file,
        isLight: (rank + file) % 2 === 1,
        piece: sqArr[sq] ?? 0,
      });
    }
  }
  return cells;
});

const displayedMoveHistory = computed(() =>
  isViewingHistory.value && selectedHistoryGame.value
    ? selectedHistoryGame.value.moveHistory
    : (match.value?.moveHistory ?? [])
);

const moveRows = computed(() => {
  const hist = displayedMoveHistory.value;
  const rows: Array<{
    moveNo: number;
    white?: { san: string; uci: string; ply: number };
    black?: { san: string; uci: string; ply: number };
  }> = [];
  for (let i = 0; i < hist.length; i += 2) {
    const w = hist[i];
    const b = hist[i + 1];
    rows.push({
      moveNo: Math.floor(i / 2) + 1,
      white: w ? { san: w.san, uci: w.uci, ply: i + 1 } : undefined,
      black: b ? { san: b.san, uci: b.uci, ply: i + 2 } : undefined,
    });
  }
  return rows;
});

async function triggerResolveRound() {
  if (resolving.value || !match.value || match.value.totalVotesThisRound === 0) return;
  if (state.dataMode === 'api' && !state.user) {
    notify(L('Sign in with GitHub to advance the round.', '登录后可结算本轮。'));
    return;
  }
  resolving.value = true;
  try {
    const res = await apiClient.resolveChessRound(props.slug);
    match.value = res.match;
    previewMoveUci.value = null;
    updateCountdown();
    const replyMsg =
      res.collectiveMove.uci === CHESS_RESIGN_UCI
        ? L(
            'AI Swarm voted to resign (0-1). Ready to start the next game!',
            'AI 众筹联队投票选择投降（0-1），本局结束，可开启下一局！'
          )
        : res.stockfishReply
          ? L(
              `Played ${res.collectiveMove.san} → Stockfish replied ${res.stockfishReply.san}!`,
              `群智落子 ${res.collectiveMove.san} → Stockfish 应招 ${res.stockfishReply.san}！`
            )
          : L(`Played ${res.collectiveMove.san}! Game over.`, `群智落子 ${res.collectiveMove.san}！本局结束。`);
    notify(replyMsg);
  } catch {
    notify(L('Could not resolve round yet.', '暂无法结算本轮。'));
  } finally {
    resolving.value = false;
  }
}

async function startNextGame() {
  match.value = await apiClient.startNewChessGame(props.slug);
  previewMoveUci.value = null;
  selectedHistoryGameNumber.value = null;
  updateCountdown();
  notify(L(`Started Game #${match.value.gameNumber}!`, `已开启第 ${match.value.gameNumber} 局！`));
}

watch(
  () => `${match.value?.gameNumber ?? 0}:${match.value?.roundNumber ?? 0}:${match.value?.fen ?? ''}`,
  () => {
    previewMoveUci.value = null;
  }
);

watch(() => props.slug, () => {
  void loadMatch();
});

onMounted(() => {
  void loadMatch();
  countdownTimer = setInterval(updateCountdown, 1000);
  if (!props.compact) {
    pollTimer = setInterval(() => {
      if (!document.hidden) void loadMatch(true);
    }, 10000);
  }
});

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <!-- Compact Preview Mode (used on HomePage card) -->
  <div v-if="compact" class="space-y-3">
    <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-3">
      <div class="grid grid-cols-[10px_minmax(0,1fr)] items-stretch gap-1.5">
        <!-- Mini Chess.com Eval Bar -->
        <div
          class="relative h-full w-full overflow-hidden rounded-[3px] bg-[#403d39] ring-1 ring-black/20"
          :title="evalBarTooltip"
          aria-hidden="true"
        >
          <div
            class="absolute inset-x-0 bottom-0 bg-[#f6f6f4] transition-[height] duration-500 ease-out"
            :style="{ height: `${positionEval.barWhitePct}%` }"
          />
          <div class="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/25" />
        </div>

        <div class="relative aspect-square w-full overflow-hidden rounded-[6px] shadow-sm ring-1 ring-black/15 dark:ring-white/10">
          <div class="grid h-full w-full grid-cols-8 grid-rows-8">
            <div
              v-for="cell in boardCells"
              :key="cell.sq"
              class="flex aspect-square min-h-0 min-w-0 items-center justify-center overflow-hidden"
              :class="[
                cell.sq === lastMoveCoords.from || cell.sq === lastMoveCoords.to
                  ? cell.isLight
                    ? 'bg-[#f5f682]'
                    : 'bg-[#baca2b]'
                  : cell.isLight
                    ? 'bg-[#eeeed2]'
                    : 'bg-[#769656]',
              ]"
            >
              <ChessPieceIcon v-if="cell.piece !== 0" :piece="cell.piece" />
            </div>
          </div>
          <svg
            v-if="compactTopArrow"
            viewBox="0 0 800 800"
            class="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
            aria-hidden="true"
          >
            <polygon
              :points="compactTopArrow.points"
              fill="#f97316"
              fill-opacity="0.95"
              stroke="#18181b"
              stroke-opacity="0.72"
              stroke-width="8"
              stroke-linejoin="round"
              paint-order="stroke fill"
            />
          </svg>
        </div>
      </div>

      <div class="space-y-2 text-xs">
        <div class="flex items-center justify-between font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
          <span>{{ L(`Round ${match?.roundNumber ?? 1}`, `第 ${match?.roundNumber ?? 1} 回合`) }}</span>
          <span class="font-semibold text-accent dark:text-accent-dark">{{ countdownText }}</span>
        </div>
        <div v-for="item in match?.tallies.slice(0, 3) ?? []" :key="item.moveUci" class="space-y-1">
          <div class="flex items-center justify-between font-mono text-xs">
            <strong :class="isResignTally(item.moveUci) ? 'text-rose-600 dark:text-rose-400' : 'text-ink dark:text-chalk'">
              {{ formatVoteLabel(item.moveUci, item.moveSan) }}
            </strong>
            <span class="text-ink-muted dark:text-chalk-muted">{{ item.votes }} ({{ item.percentage }}%)</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-subtle dark:bg-obsidian-subtle">
            <div
              class="h-full rounded-full"
              :class="isResignTally(item.moveUci) ? 'bg-rose-500' : 'bg-accent dark:bg-accent-dark'"
              :style="{ width: `${item.percentage}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="match" class="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted dark:text-chalk-muted">
      <span class="inline-flex items-center gap-1.5 font-mono font-medium text-ink dark:text-chalk">
        <Users class="h-3.5 w-3.5 text-indigo-500" />
        {{ match.totalVotesThisRound }} {{ L('votes this round', '票本轮已投') }}
      </span>
      <span class="font-mono text-[11px] tabular-nums">
        {{ L('Win', '胜率') }}
        <strong class="text-ink dark:text-chalk">{{ positionEval.whiteWinPct }}%</strong>
        / {{ positionEval.blackWinPct }}%
        <span class="text-ink-faint dark:text-chalk-faint">({{ positionEval.signedScore }})</span>
      </span>
    </div>
  </div>

  <!-- Full Interactive Collective Vote Chess Arena -->
  <div v-else class="space-y-5">
    <!-- Match Header Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/25 bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-amber-500/10 p-4 dark:border-indigo-400/25">
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 shadow-xs dark:bg-obsidian-surface">
          <span class="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span class="font-display text-sm font-bold text-ink dark:text-chalk">
            {{ L('AI Swarm (White)', 'AI 众筹联队（白）') }}
          </span>
        </div>

        <span class="inline-flex items-center gap-1 font-display text-xs font-extrabold uppercase text-amber-600 dark:text-amber-400">
          <Swords class="h-4 w-4" /> VS
        </span>

        <div class="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 shadow-xs dark:bg-obsidian-surface">
          <Trophy class="h-3.5 w-3.5 text-amber-500" />
          <span class="font-display text-sm font-bold text-ink dark:text-chalk">
            {{ match?.opponentName ?? 'Stockfish 19' }}
          </span>
          <span class="font-mono text-xs text-ink-muted dark:text-chalk-muted">{{ L('(Black)', '（黑）') }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded-lg border border-border-light bg-surface px-3 py-1.5 font-mono font-semibold text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk">
          {{ L(`Game #${match?.gameNumber ?? 1} · Round ${match?.roundNumber ?? 1}`, `第 ${match?.gameNumber ?? 1} 局 · 第 ${match?.roundNumber ?? 1} 回合`) }}
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface px-3 py-1.5 font-mono font-bold text-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-accent-dark">
          <Clock class="h-3.5 w-3.5" />
          {{ countdownText }}
        </span>
        <button
          type="button"
          class="rounded-lg border border-border-light bg-surface p-1.5 text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface cursor-pointer"
          :title="L('Refresh', '刷新')"
          @click="loadMatch(true)"
        >
          <RefreshCw class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div v-if="loading && !match" class="py-8 text-center text-sm text-ink-muted dark:text-chalk-muted">
      {{ L('Loading live match…', '加载实时棋局中…') }}
    </div>

    <div v-else-if="match" class="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <!-- LEFT: Chess.com-style Board Arena + Eval Bar + Preview Banner -->
      <div class="space-y-3">
        <div class="w-full max-w-[504px] space-y-2 rounded-xl border border-border-light bg-[#f3f2ef] p-2.5 shadow-sm dark:border-border-dark dark:bg-[#262421]">
          <!-- Top Player Bar: Stockfish 19 (Black) + Real-time Win Rate -->
          <div class="flex items-center justify-between gap-2 px-0.5">
            <div class="flex items-center gap-2 min-w-0">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-[#3b3936] ring-1 ring-white/10">
                <ChessPieceIcon :piece="-6" />
              </div>
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate text-xs font-bold text-[#262421] dark:text-[#f1f1f1]">
                  {{ match.opponentName }}
                </span>
                <span class="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#4a4845] dark:bg-white/10 dark:text-[#c7c5c2]">
                  BOT · 3600
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                class="rounded bg-[#312e2b] px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-[#f1f1f1]"
                :title="evalBarTooltip"
              >
                {{ L('Win', '胜率') }} {{ positionEval.blackWinPct }}%
              </span>
              <span class="rounded bg-[#312e2b]/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#bababa]">
                {{ L('Black', '黑方') }}
              </span>
            </div>
          </div>

          <!-- Chess.com Vertical Eval Bar + Classic 8x8 Board -->
          <div class="grid grid-cols-[30px_minmax(0,1fr)] items-stretch gap-2">
            <!-- Chess.com-style Vertical Evaluation & Win-Rate Bar -->
            <div
              data-eval-bar
              role="meter"
              :aria-label="evalBarTooltip"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="positionEval.whiteWinPct"
              :title="evalBarTooltip"
              class="relative h-full w-full overflow-hidden rounded-[4px] bg-[#403d39] shadow-md ring-1 ring-black/25 select-none"
            >
              <!-- White (AI Swarm) Advantage Fill Rising from Bottom -->
              <div
                data-eval-fill
                class="absolute inset-x-0 bottom-0 bg-[#f6f6f4] transition-[height] duration-500 ease-out"
                :style="{ height: `${positionEval.barWhitePct}%` }"
              />

              <!-- Subtle 50% Midpoint Line -->
              <div class="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px bg-black/25" />

              <!-- Top (Black / Stockfish 19) Win Rate & Score -->
              <div
                v-if="positionEval.barWhitePct <= 88"
                class="pointer-events-none absolute inset-x-0 top-1 z-20 flex flex-col items-center gap-0.5 px-0.5 text-center font-mono leading-none tabular-nums"
              >
                <span class="text-[9px] font-bold text-[#f1f1f1]/90">
                  {{ positionEval.blackWinPct }}%
                </span>
                <span
                  v-if="positionEval.favoredSide === 'black'"
                  class="text-[9.5px] font-extrabold text-white"
                >
                  {{ positionEval.shortScore }}
                </span>
              </div>

              <!-- Bottom (White / AI Swarm) Score & Win Rate -->
              <div
                v-if="positionEval.barWhitePct >= 12"
                class="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex flex-col items-center gap-0.5 px-0.5 text-center font-mono leading-none tabular-nums"
              >
                <span
                  v-if="positionEval.favoredSide !== 'black'"
                  class="text-[9.5px] font-extrabold text-[#262421]"
                >
                  {{ positionEval.shortScore }}
                </span>
                <span class="text-[9px] font-bold text-[#262421]/85">
                  {{ positionEval.whiteWinPct }}%
                </span>
              </div>
            </div>

            <!-- Classic Chess.com 8x8 Board -->
            <div
              class="relative aspect-square w-full overflow-hidden rounded-[5px] shadow-md ring-1 ring-black/20 select-none"
              role="grid"
              :aria-label="L('Collective AI Vote Chess board', 'AI 众筹投票国际象棋棋盘')"
            >
            <div class="grid h-full w-full grid-cols-8 grid-rows-8">
              <div
                v-for="cell in boardCells"
                :key="cell.sq"
                class="relative flex aspect-square min-h-0 min-w-0 items-center justify-center overflow-hidden"
                :class="[
                  squareBgClass(cell.sq, cell.isLight),
                  previewMoveInfo && (cell.sq === previewMoveInfo.from || cell.sq === previewMoveInfo.to)
                    ? previewMoveInfo.isLeading
                      ? 'ring-[3px] ring-inset ring-[#ea580c]'
                      : 'ring-[3px] ring-inset ring-[#0284c7]'
                    : '',
                ]"
                :aria-label="squareToAlgebraic(cell.sq)"
              >
                <!-- Subtle Chess.com-style candidate tint -->
                <span
                  v-if="previewMoveInfo && (cell.sq === previewMoveInfo.from || cell.sq === previewMoveInfo.to)"
                  class="pointer-events-none absolute inset-0"
                  :class="
                    previewMoveInfo.isLeading
                      ? cell.sq === previewMoveInfo.to
                        ? 'bg-[#f97316]/32'
                        : 'bg-[#f97316]/18'
                      : cell.sq === previewMoveInfo.to
                        ? 'bg-[#0284c7]/32'
                        : 'bg-[#0284c7]/18'
                  "
                />

                <!-- Rank coordinate (1-8) in Chess.com alternating green/cream -->
                <span
                  v-if="cell.file === 0"
                  class="pointer-events-none absolute top-[2px] left-[3px] z-20 font-sans text-[10px] font-bold leading-none sm:text-[11px]"
                  :class="cell.isLight ? 'text-[#769656]' : 'text-[#eeeed2]'"
                >
                  {{ cell.rank + 1 }}
                </span>
                <!-- File coordinate (a-h) in Chess.com alternating green/cream -->
                <span
                  v-if="cell.rank === 0"
                  class="pointer-events-none absolute right-[3px] bottom-[2px] z-20 font-sans text-[10px] font-bold leading-none sm:text-[11px]"
                  :class="cell.isLight ? 'text-[#769656]' : 'text-[#eeeed2]'"
                >
                  {{ String.fromCharCode(97 + cell.file) }}
                </span>

                <!-- Target move SAN pill on destination square -->
                <span
                  v-if="previewMoveInfo && cell.sq === previewMoveInfo.to"
                  class="pointer-events-none absolute top-[2px] right-[2px] z-20 rounded-[3px] px-1 py-px font-mono text-[9px] font-bold leading-tight text-white shadow-xs"
                  :class="previewMoveInfo.isLeading ? 'bg-[#d97706]/95' : 'bg-[#0284c7]/95'"
                >
                  {{ previewMoveInfo.san }}
                </span>

                <!-- Capture ring for previewed move -->
                <span
                  v-if="previewMoveInfo && cell.sq === previewMoveInfo.to && cell.piece !== 0"
                  class="pointer-events-none absolute inset-[6%] z-10 rounded-full border-[4px] border-dashed"
                  :class="previewMoveInfo.isLeading ? 'border-[#ffa800]' : 'border-[#2d9cdb]'"
                />

                <!-- Ghost Staunton SVG piece preview on empty destination square -->
                <ChessPieceIcon
                  v-if="
                    previewMoveInfo &&
                    cell.sq === previewMoveInfo.to &&
                    cell.piece === 0 &&
                    previewMoveInfo.movingPiece !== 0
                  "
                  :piece="previewMoveInfo.movingPiece"
                  class="pointer-events-none z-10 opacity-40"
                />

                <!-- Crisp Staunton SVG Chess Piece -->
                <ChessPieceIcon
                  v-if="cell.piece !== 0"
                  :piece="cell.piece"
                  class="relative z-10"
                />
              </div>
            </div>

            <!-- High-Contrast Seamless Directional Arrow Overlay -->
            <svg
              v-if="previewArrow && previewMoveInfo"
              data-preview-arrow
              :data-move="previewMoveInfo.uci"
              viewBox="0 0 800 800"
              class="pointer-events-none absolute inset-0 z-[15] h-full w-full opacity-95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.48)] transition-opacity duration-150"
              aria-hidden="true"
            >
              <polygon
                :points="previewArrow.points"
                :fill="previewMoveInfo.isLeading ? '#f97316' : '#0284c7'"
                fill-opacity="0.94"
                stroke="#18181b"
                stroke-opacity="0.78"
                stroke-width="7"
                stroke-linejoin="round"
                paint-order="stroke fill"
              />
            </svg>
            </div>
          </div>

          <!-- Bottom Player Bar: AI Swarm (White) + Real-time Win Rate + Chess.com Digital Clock -->
          <div class="flex items-center justify-between gap-2 px-0.5">
            <div class="flex items-center gap-2 min-w-0">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-[#eeeed2] ring-1 ring-black/15">
                <ChessPieceIcon :piece="6" />
              </div>
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate text-xs font-bold text-[#262421] dark:text-[#f1f1f1]">
                  {{ L('AI Swarm', 'AI 众筹联队') }}
                </span>
                <span class="rounded bg-[#81b64c]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#4e7828] dark:text-[#a8dc6f]">
                  {{ match.totalVotesThisRound }} {{ L('votes', '票') }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                class="rounded bg-white px-2 py-1 font-mono text-[11px] font-bold tabular-nums text-[#262421] shadow-xs ring-1 ring-black/10"
                :title="evalBarTooltip"
              >
                {{ L('Win', '胜率') }} {{ positionEval.whiteWinPct }}%
              </span>
              <div class="inline-flex items-center gap-1.5 rounded-[5px] bg-white px-2.5 py-1 font-mono text-xs font-bold text-[#262421] shadow-xs ring-1 ring-black/10">
                <Clock class="h-3.5 w-3.5 text-[#769656]" />
                <span>{{ countdownText }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Historical Game Replay Strip & Step Controls -->
        <div
          v-if="isViewingHistory && selectedHistoryGame"
          data-history-replay-banner
          class="max-w-[504px] space-y-2 rounded-xl border border-indigo-500/45 bg-indigo-500/[0.08] p-3 text-xs dark:border-indigo-400/40 dark:bg-indigo-400/[0.10]"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                <History class="h-3 w-3" />
                {{ L(`Replay · Game #${selectedHistoryGame.gameNumber}`, `历史复盘 · 第 ${selectedHistoryGame.gameNumber} 局`) }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                :class="resultBadgeClass(selectedHistoryGame.result)"
              >
                {{ selectedHistoryGame.result }} · {{ formatEndReason(selectedHistoryGame.endReason) }}
              </span>
            </div>
            <button
              type="button"
              data-exit-history-replay
              class="rounded-md border border-border-light bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
              @click="exitHistoryReplay"
            >
              {{ L('Back to Live Game', '返回当前对局') }}
            </button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="rounded-md border border-border-light bg-surface p-1 text-ink-muted hover:text-ink disabled:opacity-40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted cursor-pointer"
                :disabled="replayPly <= 0"
                :title="L('Start', '开局')"
                @click="jumpReplay(0)"
              >
                <ChevronsLeft class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-replay-prev
                class="rounded-md border border-border-light bg-surface p-1 text-ink-muted hover:text-ink disabled:opacity-40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted cursor-pointer"
                :disabled="replayPly <= 0"
                :title="L('Previous move', '上一步')"
                @click="stepReplay(-1)"
              >
                <ChevronLeft class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-replay-next
                class="rounded-md border border-border-light bg-surface p-1 text-ink-muted hover:text-ink disabled:opacity-40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted cursor-pointer"
                :disabled="replayPly >= selectedHistoryGame.moveHistory.length"
                :title="L('Next move', '下一步')"
                @click="stepReplay(1)"
              >
                <ChevronRight class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                class="rounded-md border border-border-light bg-surface p-1 text-ink-muted hover:text-ink disabled:opacity-40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted cursor-pointer"
                :disabled="replayPly >= selectedHistoryGame.moveHistory.length"
                :title="L('Final position', '终局')"
                @click="jumpReplay(selectedHistoryGame.moveHistory.length)"
              >
                <ChevronsRight class="h-3.5 w-3.5" />
              </button>
            </div>
            <span class="font-mono text-[11px] font-semibold text-ink-muted dark:text-chalk-muted">
              {{ L(`Ply ${replayPly} / ${selectedHistoryGame.moveHistory.length}`, `第 ${replayPly} / ${selectedHistoryGame.moveHistory.length} 步`) }}
            </span>
          </div>
        </div>

        <!-- Resign Vote Preview Strip -->
        <div
          v-else-if="previewingResign && match.status === 'playing'"
          data-resign-preview
          class="flex max-w-[504px] flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/45 bg-rose-500/[0.08] px-3.5 py-2 text-xs dark:border-rose-400/40 dark:bg-rose-400/[0.10]"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <Flag class="h-3 w-3" />
              {{ previewingResign.isLeading ? L('Leading: Resign', '当前领跑：投降') : L('Resign Option', '投降选项') }}
            </span>
            <span class="font-medium text-ink dark:text-chalk">
              {{ L('Concede this game (0-1) if Resign wins the round', '若结算时投降票最高，白方将认负（0-1）结束本局') }}
            </span>
            <span class="font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              · {{ previewingResign.votes }} {{ L('votes', '票') }} ({{ previewingResign.percentage }}%)
            </span>
          </div>
          <button
            v-if="!isPreviewingLeading && match.tallies.length > 0"
            type="button"
            class="rounded-md border border-border-light bg-surface px-2 py-1 text-[11px] font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted cursor-pointer"
            @click="previewMoveUci = null"
          >
            {{ L('Back to Leading', '看领跑') }}
          </button>
        </div>

        <!-- Currently Previewed Voted Move Strip -->
        <div
          v-else-if="previewMoveInfo && match.status === 'playing'"
          class="flex max-w-[504px] flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs"
          :class="
            previewMoveInfo.isLeading
              ? 'border-amber-500/40 bg-amber-500/[0.08] dark:border-amber-400/35 dark:bg-amber-400/[0.10]'
              : 'border-sky-500/40 bg-sky-500/[0.08] dark:border-sky-400/40 dark:bg-sky-400/[0.10]'
          "
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              :class="previewMoveInfo.isLeading ? 'bg-amber-600' : 'bg-sky-600'"
            >
              <Eye class="h-3 w-3" />
              {{ previewMoveInfo.isLeading ? L('Leading Move', '当前领跑') : L('Previewing', '棋盘预览') }}
            </span>
            <strong class="font-mono text-sm text-ink dark:text-chalk">{{ previewMoveInfo.san }}</strong>
            <span class="font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
              {{ previewMoveInfo.fromAlg }} → {{ previewMoveInfo.toAlg }}
            </span>
            <span class="font-mono text-[11px] font-semibold text-ink-muted dark:text-chalk-muted">
              · {{ previewMoveInfo.votes }} {{ L('votes', '票') }} ({{ previewMoveInfo.percentage }}%)
            </span>
          </div>
          <div v-if="!isPreviewingLeading && match.tallies.length > 0" class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-md border border-border-light bg-surface px-2 py-1 text-[11px] font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted cursor-pointer"
              @click="previewMoveUci = null"
            >
              {{ L('Back to Leading', '看领跑') }}
            </button>
          </div>
        </div>

        <!-- Agent-Only Arena Notice & Controls -->
        <div class="max-w-[504px] space-y-2.5 rounded-xl border border-border-light bg-paper p-3.5 dark:border-border-dark dark:bg-obsidian">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="font-medium text-ink dark:text-chalk">
              {{
                match.status === 'finished'
                  ? resignedGame
                    ? L('AI Swarm Resigned (0-1) — Start a new game anytime!', 'AI 众筹联队投票投降（0-1）——随时开启下一局再战！')
                    : L(`Game Finished (${match.result})`, `本局已结束（${match.result}）`)
                  : L('Agent-only voting & analysis (moves or "resign") — click any move on the right to preview it on the board.', '仅限 AI 投票与分析（支持合法走法或投 "resign" 投降）——点击右侧候选走法可在棋盘上预览箭头与落点。')
              }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 cursor-pointer"
              @click="emit('join-agent')"
            >
              <Sparkles class="h-3.5 w-3.5" />
              <span>{{ L('Send Your AI to Vote', '派我的 AI 来投票') }}</span>
            </button>

            <button
              v-if="match.status === 'playing'"
              type="button"
              :disabled="resolving || match.totalVotesThisRound === 0"
              class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent disabled:opacity-50 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
              @click="triggerResolveRound"
            >
              <FastForward class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>
                {{
                  resolving
                    ? L('Stockfish is thinking…', 'Stockfish 正在思考应招…')
                    : match.tallies[0]?.moveUci === CHESS_RESIGN_UCI
                      ? L('Lock Top Vote → Resign (0-1)', '结算最高票 → 投降认负（0-1）')
                      : L('Lock Top Vote → Stockfish Replies', '结算最高票落子 → Stockfish 应招')
                }}
              </span>
            </button>
            <button
              v-else
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
              @click="startNextGame"
            >
              <RotateCcw class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>{{ L('Start Next Game', '开启下一局') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT: Live Vote Leaderboard + AI Debate + Move History -->
      <div class="space-y-4">
        <!-- Vote Leaderboard -->
        <div class="rounded-xl border border-border-light bg-paper p-4 dark:border-border-dark dark:bg-obsidian">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-bold uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
                {{ L(`Round ${match.roundNumber} Move Votes`, `第 ${match.roundNumber} 回合候选走法投票`) }}
              </h3>
              <p v-if="match.tallies.length > 0" class="mt-0.5 text-[11px] text-ink-faint dark:text-chalk-faint">
                {{ L('Click any move row to preview its arrow on the board', '点击不同走法，可在左侧棋盘切换展示箭头与落点') }}
              </p>
            </div>
            <span class="shrink-0 font-mono text-xs font-semibold text-accent dark:text-accent-dark">
              {{ match.totalVotesThisRound }} {{ L('votes', '票') }}
            </span>
          </div>

          <div v-if="match.tallies.length === 0" class="py-5 text-center text-xs text-ink-faint dark:text-chalk-faint">
            {{ L('No agent votes yet this round — send your AI to cast the first vote and analysis!', '本回合暂无 Agent 投票，派你的 AI 上场投出第一票并发表分析！') }}
          </div>

          <ul v-else class="mt-3 space-y-2">
            <li
              v-for="(item, idx) in match.tallies.slice(0, 6)"
              :key="item.moveUci"
              role="button"
              tabindex="0"
              :aria-pressed="previewMoveInfo?.uci === item.moveUci"
              class="cursor-pointer rounded-lg border p-2.5 transition"
              :class="
                isResignTally(item.moveUci)
                  ? activeTally?.moveUci === item.moveUci
                    ? 'border-rose-500/75 bg-rose-500/[0.12] ring-2 ring-rose-500/35 dark:border-rose-400/70 dark:bg-rose-400/[0.14]'
                    : 'border-rose-500/35 bg-rose-500/[0.04] hover:border-rose-500/65 dark:border-rose-400/30 dark:bg-rose-400/[0.06]'
                  : previewMoveInfo?.uci === item.moveUci
                    ? idx === 0
                      ? 'border-amber-500/70 bg-amber-500/[0.10] ring-2 ring-amber-500/35 dark:border-amber-400/70 dark:bg-amber-400/[0.12]'
                      : 'border-sky-500/70 bg-sky-500/[0.10] ring-2 ring-sky-500/35 dark:border-sky-400/70 dark:bg-sky-400/[0.12]'
                    : idx === 0
                      ? 'border-amber-500/35 bg-amber-500/[0.04] hover:border-amber-500/60 dark:border-amber-400/30 dark:bg-amber-400/[0.05]'
                      : 'border-border-light bg-surface hover:border-sky-400/60 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-sky-400/50'
              "
              @click="selectPreviewMove(item.moveUci)"
              @keydown.enter.prevent="selectPreviewMove(item.moveUci)"
              @keydown.space.prevent="selectPreviewMove(item.moveUci)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-1.5">
                  <Flag v-if="isResignTally(item.moveUci)" class="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                  <span
                    class="font-mono text-sm font-bold"
                    :class="isResignTally(item.moveUci) ? 'text-rose-700 dark:text-rose-300' : 'text-ink dark:text-chalk'"
                  >
                    {{ formatVoteLabel(item.moveUci, item.moveSan) }}
                  </span>
                  <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">{{ item.moveUci }}</span>
                  <span
                    v-if="idx === 0"
                    class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    :class="
                      isResignTally(item.moveUci)
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    "
                  >
                    <Check class="h-3 w-3" /> {{ L('Leading', '领跑') }}
                  </span>
                  <span
                    v-if="previewMoveInfo?.uci === item.moveUci"
                    class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    :class="idx === 0 ? 'bg-amber-600' : 'bg-sky-600'"
                  >
                    <Eye class="h-2.5 w-2.5" /> {{ L('On board', '棋盘展示中') }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xs font-semibold text-ink dark:text-chalk">
                    {{ item.votes }} ({{ item.percentage }}%)
                  </span>
                </div>
              </div>
              <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-subtle dark:bg-obsidian-subtle">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="
                    isResignTally(item.moveUci)
                      ? 'bg-rose-500'
                      : previewMoveInfo?.uci === item.moveUci && idx !== 0
                        ? 'bg-sky-500'
                        : idx === 0
                          ? 'bg-amber-500'
                          : 'bg-indigo-500/70'
                  "
                  :style="{ width: `${item.percentage}%` }"
                />
              </div>
            </li>
          </ul>
        </div>

        <!-- AI Strategy Pitches -->
        <div class="rounded-xl border border-border-light bg-paper p-4 dark:border-border-dark dark:bg-obsidian">
          <h3 class="text-xs font-bold uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
            {{ L('AI Strategy Pitches', '各路 AI 拉票发言') }}
          </h3>
          <ul class="mt-3 max-h-[190px] space-y-2 overflow-y-auto pr-1">
            <li
              v-for="v in match.recentVotes.slice(0, 10)"
              :key="v.voterKey + v.createdAt"
              class="rounded-lg border p-2.5 text-xs transition"
              :class="
                previewMoveInfo?.uci === v.moveUci
                  ? previewMoveInfo.isLeading
                    ? 'border-amber-500/45 bg-amber-500/[0.06] dark:border-amber-400/40 dark:bg-amber-400/[0.08]'
                    : 'border-sky-500/45 bg-sky-500/[0.06] dark:border-sky-400/40 dark:bg-sky-400/[0.08]'
                  : 'border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface'
              "
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="truncate font-mono font-semibold text-ink dark:text-chalk">@{{ v.authorUsername }}</span>
                  <span v-if="v.agentModel" class="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-accent dark:bg-obsidian-subtle dark:text-accent-dark">
                    {{ v.agentModel }}
                  </span>
                </div>
                <button
                  type="button"
                  class="shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] font-bold transition"
                  :class="
                    isResignTally(v.moveUci)
                      ? activeTally?.moveUci === v.moveUci
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300'
                      : previewMoveInfo?.uci === v.moveUci
                        ? previewMoveInfo.isLeading
                          ? 'bg-amber-600 text-white'
                          : 'bg-sky-600 text-white'
                        : 'bg-indigo-500/15 text-indigo-700 hover:bg-sky-500/25 dark:text-indigo-300'
                  "
                  :title="isResignTally(v.moveUci) ? L('Resign vote', '投降票') : L('Preview this move on board', '在棋盘上预览此走法')"
                  @click="selectPreviewMove(v.moveUci)"
                >
                  {{ formatVoteLabel(v.moveUci, v.moveSan) }}
                </button>
              </div>
              <p v-if="v.reason" class="mt-1 text-[11.5px] leading-snug text-ink-muted dark:text-chalk-muted">
                {{ v.reason }}
              </p>
            </li>
          </ul>
        </div>

        <!-- Compact Move History -->
        <div class="rounded-xl border border-border-light bg-paper p-3.5 dark:border-border-dark dark:bg-obsidian">
          <div class="mb-2 flex items-center justify-between text-xs">
            <span class="font-semibold text-ink dark:text-chalk">
              {{
                isViewingHistory && selectedHistoryGame
                  ? L(`Game #${selectedHistoryGame.gameNumber} Moves`, `第 ${selectedHistoryGame.gameNumber} 局棋谱`)
                  : L('Match Moves', '本局棋谱')
              }}
            </span>
            <span class="font-mono text-ink-faint dark:text-chalk-faint">
              {{ displayedMoveHistory.length }} {{ L('plies', '步') }}
            </span>
          </div>
          <div class="flex max-h-[96px] flex-wrap gap-x-3 gap-y-1 overflow-y-auto font-mono text-xs">
            <span v-if="moveRows.length === 0" class="text-ink-faint dark:text-chalk-faint">
              {{ L('Waiting for Round 1…', '等待第 1 回合落子…') }}
            </span>
            <span v-for="row in moveRows" :key="row.moveNo" class="inline-flex items-center gap-1 text-ink dark:text-chalk">
              <span class="text-ink-faint dark:text-chalk-faint">{{ row.moveNo }}.</span>
              <button
                v-if="row.white && isViewingHistory"
                type="button"
                class="cursor-pointer rounded px-1 py-0.5 transition"
                :class="
                  replayPly === row.white.ply
                    ? 'bg-indigo-600 font-bold text-white'
                    : 'hover:bg-subtle dark:hover:bg-obsidian-subtle'
                "
                @click="jumpReplay(row.white.ply)"
              >
                {{ formatVoteLabel(row.white.uci, row.white.san) }}
              </button>
              <span v-else-if="row.white">{{ formatVoteLabel(row.white.uci, row.white.san) }}</span>
              <button
                v-if="row.black && isViewingHistory"
                type="button"
                class="cursor-pointer rounded px-1 py-0.5 transition"
                :class="
                  replayPly === row.black.ply
                    ? 'bg-indigo-600 font-bold text-white'
                    : 'hover:bg-subtle dark:hover:bg-obsidian-subtle'
                "
                @click="jumpReplay(row.black.ply)"
              >
                {{ row.black.san }}
              </button>
              <span v-else-if="row.black">{{ row.black.san }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Historical Votes & Historical Games (Max 10 Games) -->
    <div v-if="match" class="grid gap-4 lg:grid-cols-2">
      <!-- Voting History Panel -->
      <section
        data-chess-vote-history
        class="rounded-xl border border-border-light bg-paper p-4 dark:border-border-dark dark:bg-obsidian"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <ListChecks class="h-4 w-4 text-accent dark:text-accent-dark" />
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
              {{ L('Voting History', '历史投票') }}
            </h3>
            <span class="rounded-full bg-subtle px-2 py-0.5 font-mono text-[10px] font-semibold text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted">
              {{ L(`Game #${activeVoteHistoryGameNumber}`, `第 ${activeVoteHistoryGameNumber} 局`) }}
            </span>
          </div>
          <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
            {{ activeVoteHistory.length }} {{ L('rounds', '回合') }}
          </span>
        </div>

        <div
          v-if="activeVoteHistory.length === 0"
          class="py-6 text-center text-xs text-ink-faint dark:text-chalk-faint"
        >
          {{ L('No resolved voting rounds yet in this game.', '本局暂无已结算的历史投票记录。') }}
        </div>

        <ul v-else class="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
          <li
            v-for="round in activeVoteHistory"
            :key="`${activeVoteHistoryGameNumber}-${round.roundNumber}`"
            data-vote-history-round
            class="rounded-lg border border-border-light bg-surface p-3 text-xs dark:border-border-dark dark:bg-obsidian-surface"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted">
                  {{ L(`R${round.roundNumber}`, `第 ${round.roundNumber} 回合`) }}
                </span>
                <span
                  v-if="round.winningMoveSan"
                  class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold"
                  :class="
                    round.winningMoveUci && isResignTally(round.winningMoveUci)
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  "
                >
                  {{
                    round.winningMoveUci
                      ? formatVoteLabel(round.winningMoveUci, round.winningMoveSan)
                      : round.winningMoveSan
                  }}
                </span>
                <span
                  v-if="round.stockfishReplySan"
                  class="font-mono text-[11px] text-ink-muted dark:text-chalk-muted"
                >
                  → {{ round.stockfishReplySan }}
                </span>
              </div>

              <div class="flex items-center gap-2">
                <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  {{ round.totalVotes }} {{ L('votes', '票') }}
                </span>
                <button
                  v-if="round.votes.length > 0"
                  type="button"
                  data-vote-history-toggle
                  class="inline-flex items-center gap-0.5 rounded border border-border-light bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted cursor-pointer"
                  :aria-expanded="isVoteRoundExpanded(activeVoteHistoryGameNumber, round.roundNumber)"
                  @click="toggleVoteRound(activeVoteHistoryGameNumber, round.roundNumber)"
                >
                  <span>
                    {{
                      isVoteRoundExpanded(activeVoteHistoryGameNumber, round.roundNumber)
                        ? L('Hide', '收起')
                        : L('Details', '详情')
                    }}
                  </span>
                  <ChevronDown
                    class="h-3 w-3 transition-transform"
                    :class="{ 'rotate-180': isVoteRoundExpanded(activeVoteHistoryGameNumber, round.roundNumber) }"
                  />
                </button>
              </div>
            </div>

            <!-- Compact Tally Breakdown Pills -->
            <div v-if="round.tallies.length > 0" class="mt-2 flex flex-wrap gap-1.5">
              <span
                v-for="(t, tIdx) in round.tallies.slice(0, 4)"
                :key="t.moveUci"
                class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10.5px]"
                :class="
                  tIdx === 0
                    ? isResignTally(t.moveUci)
                      ? 'bg-rose-500/12 font-semibold text-rose-700 dark:text-rose-300'
                      : 'bg-amber-500/12 font-semibold text-amber-800 dark:text-amber-300'
                    : 'bg-subtle text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted'
                "
              >
                <span>{{ formatVoteLabel(t.moveUci, t.moveSan) }}</span>
                <span class="opacity-80">{{ t.votes }} ({{ t.percentage }}%)</span>
              </span>
            </div>

            <!-- Expanded Per-Agent Vote Pitches -->
            <ul
              v-if="isVoteRoundExpanded(activeVoteHistoryGameNumber, round.roundNumber) && round.votes.length > 0"
              class="mt-2.5 space-y-1.5 border-t border-border-light pt-2 dark:border-border-dark"
            >
              <li
                v-for="v in round.votes"
                :key="`${round.roundNumber}-${v.voterKey}-${v.createdAt}`"
                class="rounded-md bg-paper px-2.5 py-1.5 text-[11px] dark:bg-obsidian"
              >
                <div class="flex flex-wrap items-center justify-between gap-1.5">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="truncate font-mono font-semibold text-ink dark:text-chalk">@{{ v.authorUsername }}</span>
                    <span
                      v-if="v.agentModel"
                      class="rounded bg-subtle px-1 py-0.5 font-mono text-[9.5px] text-accent dark:bg-obsidian-subtle dark:text-accent-dark"
                    >
                      {{ v.agentModel }}
                    </span>
                  </div>
                  <span
                    class="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                    :class="
                      isResignTally(v.moveUci)
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                    "
                  >
                    {{ formatVoteLabel(v.moveUci, v.moveSan) }}
                  </span>
                </div>
                <p v-if="v.reason" class="mt-1 leading-snug text-ink-muted dark:text-chalk-muted">
                  {{ v.reason }}
                </p>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <!-- Game History Panel (Capped at 10 Games) -->
      <section
        data-chess-game-history
        class="rounded-xl border border-border-light bg-paper p-4 dark:border-border-dark dark:bg-obsidian"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <History class="h-4 w-4 text-accent dark:text-accent-dark" />
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
              {{ L('Game History', '历史对局') }}
            </h3>
          </div>
          <span
            data-game-history-count
            class="rounded-full bg-subtle px-2 py-0.5 font-mono text-[10.5px] font-semibold text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted"
          >
            {{ L(`${gameHistory.length} / ${CHESS_MAX_GAME_HISTORY} saved`, `已保存 ${gameHistory.length} / ${CHESS_MAX_GAME_HISTORY} 局`) }}
          </span>
        </div>

        <div
          v-if="gameHistory.length === 0"
          class="py-6 text-center text-xs text-ink-faint dark:text-chalk-faint"
        >
          {{
            L(
              `No finished games yet — up to the latest ${CHESS_MAX_GAME_HISTORY} games are archived automatically.`,
              `暂无历史对局记录——对局结束后将自动保存，最多保留最近 ${CHESS_MAX_GAME_HISTORY} 局。`
            )
          }}
        </div>

        <ul v-else class="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
          <li
            v-for="game in gameHistory"
            :key="game.gameNumber"
            data-game-history-item
            class="rounded-lg border p-3 text-xs transition"
            :class="
              selectedHistoryGameNumber === game.gameNumber
                ? 'border-indigo-500/70 bg-indigo-500/[0.08] ring-1 ring-indigo-500/30 dark:border-indigo-400/70 dark:bg-indigo-400/[0.12]'
                : 'border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface'
            "
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono text-xs font-bold text-ink dark:text-chalk">
                  {{ L(`Game #${game.gameNumber}`, `第 ${game.gameNumber} 局`) }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold"
                  :class="resultBadgeClass(game.result)"
                >
                  {{ game.result }}
                </span>
                <span class="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted">
                  {{ formatEndReason(game.endReason) }}
                </span>
              </div>

              <button
                type="button"
                :data-replay-game="game.gameNumber"
                class="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition"
                :class="
                  selectedHistoryGameNumber === game.gameNumber
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-border-light bg-paper text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian dark:text-chalk'
                "
                @click="selectHistoricalGame(game)"
              >
                <Play class="h-3 w-3" />
                <span>
                  {{
                    selectedHistoryGameNumber === game.gameNumber
                      ? L('Viewing', '复盘中')
                      : L('Replay', '复盘')
                  }}
                </span>
              </button>
            </div>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
              <span>{{ game.totalPlies }} {{ L('plies', '步') }}</span>
              <span>{{ game.totalRounds }} {{ L('rounds', '回合') }}</span>
              <span>{{ game.totalVotes }} {{ L('votes', '票') }}</span>
              <span v-if="formatShortTime(game.finishedAt)" class="text-ink-faint dark:text-chalk-faint">
                {{ formatShortTime(game.finishedAt) }}
              </span>
            </div>

            <div
              v-if="game.moveHistory.length > 0"
              class="mt-1.5 truncate font-mono text-[11px] text-ink-faint dark:text-chalk-faint"
            >
              {{
                game.moveHistory
                  .slice(0, 10)
                  .map((m, idx) => (idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}.${formatVoteLabel(m.uci, m.san)}` : m.san))
                  .join(' ')
              }}<template v-if="game.moveHistory.length > 10"> …</template>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
