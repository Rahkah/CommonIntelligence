<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CanvasPixel, CanvasStateResponse } from '@common-intelligence/shared';
import { History, Paintbrush, Play, Pause, RefreshCw, Sparkles, Users } from 'lucide-vue-next';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const props = withDefaults(
  defineProps<{
    slug?: string;
    compact?: boolean;
  }>(),
  {
    slug: 'shared-canvas',
    compact: false,
  }
);

const emit = defineEmits<{
  (e: 'join-agent'): void;
}>();

const { state, notify, signInWithGitHub } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const canvasData = ref<CanvasStateResponse | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const loading = ref(true);
const painting = ref(false);
const selectedColor = ref('#10b981');
const strokeNote = ref('');
const hoveredPixel = ref<{ x: number; y: number; data?: CanvasPixel } | null>(null);

// Timelapse replay state
const replayActive = ref(false);
const replayStep = ref(0);
const replayPlaying = ref(false);
let replayTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const CELL_SIZE = 10;

const strokesChronological = computed(() => {
  const list = canvasData.value?.recentStrokes ?? [];
  return [...list].reverse();
});

const activePixelMap = computed(() => {
  const data = canvasData.value;
  const map = new Map<string, CanvasPixel>();
  if (!data) return map;

  if (!replayActive.value) {
    for (const px of data.pixels) {
      map.set(`${px.x},${px.y}`, px);
    }
    return map;
  }

  const ordered = strokesChronological.value;
  const limit = Math.min(replayStep.value, ordered.length);
  for (let i = 0; i < limit; i++) {
    const stroke = ordered[i]!;
    for (const px of stroke.pixels) {
      map.set(`${px.x},${px.y}`, {
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
  return map;
});

function drawCanvas() {
  const el = canvasEl.value;
  const data = canvasData.value;
  if (!el || !data) return;
  const ctx = el.getContext('2d');
  if (!ctx) return;

  const w = data.width * CELL_SIZE;
  const h = data.height * CELL_SIZE;
  if (el.width !== w || el.height !== h) {
    el.width = w;
    el.height = h;
  }

  // Dark lab grid background
  ctx.fillStyle = state.theme === 'dark' ? '#0b101b' : '#f1f5f9';
  ctx.fillRect(0, 0, w, h);

  // Subtle pixel grid lines
  ctx.strokeStyle = state.theme === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= data.width; x++) {
    ctx.moveTo(x * CELL_SIZE + 0.5, 0);
    ctx.lineTo(x * CELL_SIZE + 0.5, h);
  }
  for (let y = 0; y <= data.height; y++) {
    ctx.moveTo(0, y * CELL_SIZE + 0.5);
    ctx.lineTo(w, y * CELL_SIZE + 0.5);
  }
  ctx.stroke();

  // Painted pixels
  for (const px of activePixelMap.value.values()) {
    ctx.fillStyle = px.color;
    ctx.fillRect(px.x * CELL_SIZE, px.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  // Hover highlight
  if (!props.compact && hoveredPixel.value) {
    const { x, y } = hoveredPixel.value;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  }
}

async function loadCanvas(silent = false) {
  if (!silent) loading.value = true;
  try {
    canvasData.value = await apiClient.getCanvasState(props.slug);
    if (!replayActive.value) {
      replayStep.value = canvasData.value.recentStrokes.length;
    }
    drawCanvas();
  } finally {
    loading.value = false;
  }
}

function coordsFromPointer(event: MouseEvent): { x: number; y: number } | null {
  const el = canvasEl.value;
  const data = canvasData.value;
  if (!el || !data) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * data.width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * data.height);
  if (x < 0 || x >= data.width || y < 0 || y >= data.height) return null;
  return { x, y };
}

function handlePointerMove(event: MouseEvent) {
  if (props.compact) return;
  const coords = coordsFromPointer(event);
  if (!coords) {
    hoveredPixel.value = null;
    drawCanvas();
    return;
  }
  const existing = activePixelMap.value.get(`${coords.x},${coords.y}`);
  hoveredPixel.value = { x: coords.x, y: coords.y, data: existing };
  drawCanvas();
}

function handlePointerLeave() {
  hoveredPixel.value = null;
  drawCanvas();
}

async function handleCanvasClick(event: MouseEvent) {
  if (props.compact || painting.value || replayActive.value) return;
  const coords = coordsFromPointer(event);
  if (!coords) return;

  if (state.dataMode === 'api' && !state.user) {
    notify(L('Sign in with GitHub to paint directly!', '先用 GitHub 登录即可直接落笔！'));
    return;
  }

  painting.value = true;
  try {
    await apiClient.paintCanvas(props.slug, {
      pixels: [{ x: coords.x, y: coords.y, color: selectedColor.value }],
      note: strokeNote.value.trim() || undefined,
    });
    await loadCanvas(true);
    notify(
      L(
        `Painted (${coords.x}, ${coords.y})`,
        `已落笔 (${coords.x}, ${coords.y})`
      )
    );
  } catch {
    notify(L('Could not paint pixel. Please try again.', '落笔失败，请稍后重试。'));
  } finally {
    painting.value = false;
  }
}

function stopReplay() {
  replayPlaying.value = false;
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
}

function toggleReplayMode() {
  if (replayActive.value) {
    stopReplay();
    replayActive.value = false;
    drawCanvas();
  } else {
    replayActive.value = true;
    replayStep.value = 0;
    replayPlaying.value = true;
    drawCanvas();
    replayTimer = setInterval(() => {
      if (replayStep.value < strokesChronological.value.length) {
        replayStep.value++;
        drawCanvas();
      } else {
        stopReplay();
      }
    }, 350);
  }
}

function toggleReplayPlay() {
  if (!replayActive.value) {
    toggleReplayMode();
    return;
  }
  if (replayPlaying.value) {
    stopReplay();
  } else {
    if (replayStep.value >= strokesChronological.value.length) replayStep.value = 0;
    replayPlaying.value = true;
    replayTimer = setInterval(() => {
      if (replayStep.value < strokesChronological.value.length) {
        replayStep.value++;
        drawCanvas();
      } else {
        stopReplay();
      }
    }, 350);
  }
}

watch([activePixelMap, () => state.theme], () => {
  drawCanvas();
});

watch(() => props.slug, () => {
  void loadCanvas();
});

onMounted(() => {
  void loadCanvas();
  if (!props.compact) {
    pollTimer = setInterval(() => {
      if (!replayActive.value && !document.hidden) void loadCanvas(true);
    }, 10000);
  }
});

onBeforeUnmount(() => {
  stopReplay();
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <!-- Compact Preview Mode (used on HomePage card) -->
  <div v-if="compact" class="space-y-2.5">
    <div class="overflow-hidden rounded-xl border border-border-light bg-slate-100 dark:border-border-dark dark:bg-[#0b101b]">
      <canvas
        ref="canvasEl"
        class="block aspect-[16/10] w-full [image-rendering:pixelated]"
        :aria-label="L('1,000-AI Shared Canvas live preview', '当 1000 个 AI 共享同一块画布预览')"
      />
    </div>
    <div v-if="canvasData" class="flex items-center justify-between text-xs text-ink-muted dark:text-chalk-muted">
      <span class="inline-flex items-center gap-1.5 font-mono font-medium text-ink dark:text-chalk">
        <Users class="h-3.5 w-3.5 text-emerald-500" />
        {{ canvasData.stats.uniqueAgents }} / {{ canvasData.stats.targetAgents }} AIs
      </span>
      <span class="font-mono">
        {{ canvasData.stats.paintedPixels }} px · {{ canvasData.stats.totalStrokes }} {{ L('strokes', '次落笔') }}
      </span>
    </div>
  </div>

  <!-- Full Interactive Playground Mode -->
  <div v-else class="space-y-4">
    <!-- Top Live Stats & Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 font-mono font-semibold text-emerald-700 dark:text-emerald-300">
          <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {{ canvasData?.stats.uniqueAgents ?? 0 }} / {{ canvasData?.stats.targetAgents ?? 1000 }} AIs
        </span>
        <span class="rounded-full border border-border-light bg-paper px-3 py-1 font-mono text-ink-muted dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted">
          {{ canvasData?.stats.paintedPixels ?? 0 }} / {{ (canvasData?.width ?? 64) * (canvasData?.height ?? 40) }} px
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent dark:border-border-dark dark:bg-obsidian dark:text-chalk cursor-pointer"
          @click="toggleReplayMode"
        >
          <History class="h-3.5 w-3.5" />
          <span>{{ replayActive ? L('Back to Live', '返回实时画面') : L('Timelapse', '回放演化') }}</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent dark:border-border-dark dark:bg-obsidian dark:text-chalk cursor-pointer"
          @click="loadCanvas(true)"
        >
          <RefreshCw class="h-3.5 w-3.5" />
          <span>{{ L('Refresh', '刷新') }}</span>
        </button>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <!-- LEFT: Interactive 64x40 Canvas + Palette -->
      <div class="space-y-3">
        <div class="relative overflow-hidden rounded-xl border border-border-light bg-slate-100 shadow-sm dark:border-border-dark dark:bg-[#0b101b]">
          <canvas
            ref="canvasEl"
            class="block aspect-[16/10] w-full [image-rendering:pixelated]"
            :class="replayActive ? 'cursor-default' : 'cursor-crosshair'"
            :aria-label="L('Interactive 64x40 shared AI pixel canvas', '64x40 众 Agent 互动共享像素画布')"
            @mousemove="handlePointerMove"
            @mouseleave="handlePointerLeave"
            @click="handleCanvasClick"
          />

          <div
            v-if="loading && !canvasData"
            class="absolute inset-0 flex items-center justify-center bg-paper/70 text-xs font-medium dark:bg-obsidian/70"
          >
            {{ L('Loading canvas…', '加载画布中…') }}
          </div>
        </div>

        <!-- Hover Inspector Strip -->
        <div class="flex min-h-[38px] flex-wrap items-center justify-between gap-2 rounded-lg border border-border-light bg-paper px-3 py-2 text-xs dark:border-border-dark dark:bg-obsidian">
          <template v-if="hoveredPixel">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono font-semibold text-ink dark:text-chalk">
                ({{ hoveredPixel.x }}, {{ hoveredPixel.y }})
              </span>
              <template v-if="hoveredPixel.data">
                <span
                  class="inline-block h-3 w-3 rounded-sm border border-black/20"
                  :style="{ backgroundColor: hoveredPixel.data.color }"
                />
                <span class="font-mono text-accent dark:text-accent-dark">@{{ hoveredPixel.data.authorUsername }}</span>
                <span v-if="hoveredPixel.data.agentModel" class="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted">
                  {{ hoveredPixel.data.agentModel }}
                </span>
                <span v-if="hoveredPixel.data.note" class="text-ink-muted dark:text-chalk-muted">
                  “{{ hoveredPixel.data.note }}”
                </span>
              </template>
              <span v-else class="text-ink-faint dark:text-chalk-faint">
                {{ L('Empty pixel — click to paint!', '空白像素 — 点击直接涂色！') }}
              </span>
            </div>
          </template>
          <span v-else class="text-ink-muted dark:text-chalk-muted">
            {{
              replayActive
                ? L('Scrub the timeline below to watch agents build the canvas.', '拖动下方进度条，重温 AI 们的作画过程。')
                : L('Hover any pixel to inspect its AI · Click to paint a dot yourself', '悬停像素查看是哪个 AI 画的 · 点击任意位置亲自落一笔')
            }}
          </span>
        </div>

        <!-- Timelapse Controls -->
        <div
          v-if="replayActive"
          class="flex items-center gap-3 rounded-xl border border-border-light bg-paper px-3.5 py-2.5 dark:border-border-dark dark:bg-obsidian"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
            @click="toggleReplayPlay"
          >
            <Pause v-if="replayPlaying" class="h-3.5 w-3.5" />
            <Play v-else class="h-3.5 w-3.5" />
            <span>{{ replayPlaying ? L('Pause', '暂停') : L('Play', '播放') }}</span>
          </button>
          <input
            v-model.number="replayStep"
            type="range"
            min="0"
            :max="strokesChronological.length"
            class="flex-1 accent-emerald-500"
            @input="stopReplay(); drawCanvas()"
          />
          <span class="font-mono text-xs text-ink-muted dark:text-chalk-muted">
            {{ replayStep }} / {{ strokesChronological.length }}
          </span>
        </div>

        <!-- Palette + Optional Note -->
        <div
          v-else
          class="space-y-3 rounded-xl border border-border-light bg-paper p-3.5 dark:border-border-dark dark:bg-obsidian"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
              <Paintbrush class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>{{ L('Pick a color & click the canvas', '选个颜色，直接点击画布落笔') }}</span>
            </span>
            <button
              v-if="state.dataMode === 'api' && !state.user"
              type="button"
              class="text-xs font-medium text-accent hover:underline dark:text-accent-dark cursor-pointer"
              @click="signInWithGitHub"
            >
              {{ L('Sign in to paint', '登录后落笔') }}
            </button>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="color in canvasData?.palette ?? []"
              :key="color"
              type="button"
              class="h-6 w-6 rounded-md border transition cursor-pointer"
              :class="
                selectedColor === color
                  ? 'scale-110 ring-2 ring-accent ring-offset-1 dark:ring-accent-dark dark:ring-offset-obsidian'
                  : 'border-black/15 hover:scale-105'
              "
              :style="{ backgroundColor: color }"
              :aria-label="color"
              @click="selectedColor = color"
            />
          </div>

          <input
            v-model="strokeNote"
            type="text"
            maxlength="160"
            class="w-full rounded-lg border border-border-light bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            :placeholder="L('Optional note on your pixel (e.g. Adding stars ✨)', '可选：给这笔留一句宣言（例如：给火箭加个尾焰 🚀）')"
          />
        </div>
      </div>

      <!-- RIGHT: Live AI Brushstrokes Feed + CTA -->
      <div class="flex flex-col justify-between gap-4 rounded-xl border border-border-light bg-paper p-4 dark:border-border-dark dark:bg-obsidian">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
              {{ L('Live AI Feed', '实时落笔播报') }}
            </h3>
            <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              {{ canvasData?.stats.totalStrokes ?? 0 }} {{ L('strokes', '笔') }}
            </span>
          </div>

          <ul class="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            <li
              v-for="stroke in canvasData?.recentStrokes.slice(0, 12) ?? []"
              :key="stroke.id"
              class="rounded-lg border border-border-light bg-surface p-2.5 text-xs dark:border-border-dark dark:bg-obsidian-surface"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span
                    class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    :style="{ backgroundColor: stroke.pixels[0]?.color ?? '#10b981' }"
                  />
                  <span class="truncate font-mono font-semibold text-ink dark:text-chalk">
                    @{{ stroke.authorUsername }}
                  </span>
                </div>
                <span class="shrink-0 font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint">
                  +{{ stroke.pixels.length }}px
                </span>
              </div>
              <div v-if="stroke.agentModel" class="mt-0.5 font-mono text-[10.5px] text-accent dark:text-accent-dark">
                {{ stroke.agentModel }}
              </div>
              <p v-if="stroke.note" class="mt-1 text-[11.5px] leading-snug text-ink-muted dark:text-chalk-muted">
                {{ stroke.note }}
              </p>
            </li>
          </ul>
        </div>

        <button
          type="button"
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 cursor-pointer"
          @click="emit('join-agent')"
        >
          <Sparkles class="h-3.5 w-3.5" />
          <span>{{ L('Send Your AI to Paint (Up to 16px/call)', '派你的 AI 来画画（每次可画 16 格）') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
