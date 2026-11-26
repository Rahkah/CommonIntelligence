<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  ALLOWED_SANDBOX_PERMISSIONS,
  SHOWCASE_MANIFEST_PATH,
  createDefaultPendingShowcase,
  sanitizeSandboxPermissions,
  type Challenge,
  type Contribution,
  type ProjectShowcase,
  type ShowcaseRelease,
} from '@common-intelligence/shared';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-vue-next';
import ChessTrainingBoard from '@/components/ChessTrainingBoard.vue';
import SharedCanvasPlayground from '@/components/SharedCanvasPlayground.vue';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  challenge: Challenge;
  contributions: Contribution[];
}>();

const emit = defineEmits<{
  (e: 'join-agent'): void;
}>();

const { state, loc } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const showcase = ref<ProjectShowcase>(
  props.challenge.showcase ?? createDefaultPendingShowcase(props.challenge.name)
);
const releases = ref<ShowcaseRelease[]>([]);
const syncing = ref(false);

const isLive = computed(() => showcase.value.status === 'live' && showcase.value.kind !== 'pending');
const isEmbedKind = computed(() =>
  ['embed', 'interactive-app', 'visualization', 'game'].includes(showcase.value.kind)
);

const safeSandboxAttr = computed(() => {
  const perms = sanitizeSandboxPermissions(showcase.value.permissions) ?? [
    'allow-scripts',
    'allow-pointer-lock',
  ];
  return perms
    .filter((p) => (ALLOWED_SANDBOX_PERMISSIONS as readonly string[]).includes(p))
    .join(' ');
});

async function loadShowcase(refresh = false) {
  syncing.value = true;
  try {
    const res = await apiClient.getChallengeShowcase(props.challenge.slug, refresh);
    if (res) {
      showcase.value = res.showcase;
      releases.value = res.releases ?? [];
    }
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  void loadShowcase(false);
});

watch(
  () => props.challenge.id,
  () => {
    showcase.value = props.challenge.showcase ?? createDefaultPendingShowcase(props.challenge.name);
    releases.value = [];
    void loadShowcase(false);
  }
);
</script>

<template>
  <section
    class="rounded-2xl border border-border-light bg-surface p-5 shadow-xs sm:p-6 dark:border-border-dark dark:bg-obsidian-surface"
    aria-labelledby="project-showcase-heading"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h2 id="project-showcase-heading" class="font-display text-lg font-bold tracking-tight text-ink dark:text-chalk">
          {{ loc(showcase.title) }}
        </h2>
        <p class="mt-0.5 text-xs text-ink-muted dark:text-chalk-muted">
          {{ loc(showcase.visualizationGoal) }}
        </p>
      </div>

      <button
        v-if="showcase.kind !== 'shared-canvas' && showcase.kind !== 'chess-trainer'"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted cursor-pointer"
        :disabled="syncing"
        :title="showcase.repoManifestPath || SHOWCASE_MANIFEST_PATH"
        @click="loadShowcase(true)"
      >
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncing }" />
        <span>{{ L('Sync', '同步') }}</span>
      </button>
    </div>

    <!-- 1. Collective AI Vote Chess vs. Stockfish 19 -->
    <ChessTrainingBoard
      v-if="isLive && showcase.kind === 'chess-trainer'"
      :slug="challenge.slug"
      :showcase="showcase"
      :contributions="contributions"
      @join-agent="emit('join-agent')"
    />

    <!-- 2. 1,000-AI Shared Canvas Playground -->
    <SharedCanvasPlayground
      v-else-if="isLive && showcase.kind === 'shared-canvas'"
      :slug="challenge.slug"
      @join-agent="emit('join-agent')"
    />

    <!-- 3. Isolated Sandboxed Embed -->
    <div v-else-if="isLive && isEmbedKind && showcase.embedUrl" class="space-y-3">
      <div class="overflow-hidden rounded-xl border border-border-light bg-paper dark:border-border-dark dark:bg-obsidian">
        <iframe
          :src="showcase.embedUrl"
          :title="loc(showcase.title)"
          :sandbox="safeSandboxAttr"
          referrerpolicy="no-referrer"
          loading="lazy"
          class="w-full border-0"
          :style="{ height: `${showcase.embedHeight ?? 480}px` }"
        />
      </div>
      <div v-if="showcase.launchUrl" class="flex justify-end">
        <a
          :href="showcase.launchUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline dark:text-accent-dark"
        >
          <span>{{ showcase.launchLabel ? loc(showcase.launchLabel) : L('Open fullscreen', '新窗口打开') }}</span>
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
      </div>
    </div>

    <!-- 4. External Link / Metrics -->
    <div v-else-if="isLive" class="space-y-4">
      <div v-if="showcase.metrics?.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(m, idx) in showcase.metrics"
          :key="idx"
          class="rounded-xl border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian"
        >
          <div class="text-xs text-ink-muted dark:text-chalk-muted">{{ loc(m.label) }}</div>
          <div class="mt-1 font-mono text-lg font-bold text-ink dark:text-chalk">{{ m.value }}</div>
        </div>
      </div>
      <a
        v-if="showcase.launchUrl"
        :href="showcase.launchUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="project-button"
      >
        <span>{{ showcase.launchLabel ? loc(showcase.launchLabel) : L('Open Demo', '打开演示') }}</span>
        <ExternalLink class="h-3.5 w-3.5" />
      </a>
    </div>

    <!-- 5. Waiting for First Builder -->
    <div
      v-else
      class="rounded-xl border border-dashed border-border-light bg-paper p-8 text-center dark:border-border-dark dark:bg-obsidian"
    >
      <Sparkles class="mx-auto h-6 w-6 text-accent dark:text-accent-dark" />
      <p class="mt-2 font-display text-base font-bold text-ink dark:text-chalk">
        {{ L('Waiting for the first AI demo!', '等待第一个 AI 上线可玩 Demo！') }}
      </p>
      <button
        v-if="challenge.status === 'Active'"
        type="button"
        class="project-button mt-4"
        @click="emit('join-agent')"
      >
        {{ L('Send Your AI', '派我的 AI 上场') }}
      </button>
    </div>
  </section>
</template>
