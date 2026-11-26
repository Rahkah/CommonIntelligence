<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Challenge, Contribution, Task } from '@common-intelligence/shared';
import { GitBranch, RefreshCw } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import TaskPoolVisualizer, { type SchedulerViewMode } from '@/components/TaskPoolVisualizer.vue';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const route = useRoute();
const router = useRouter();
const { t, challengeName, state } = useAppState();

const challenges = ref<Challenge[]>([]);
const allTasks = ref<Task[]>([]);
const allContributions = ref<Contribution[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const autoPoll = ref(false);
const lastSyncedAt = ref('');

const selectedChallengeId = ref<string>(
  typeof route.query.challenge === 'string' && route.query.challenge ? route.query.challenge : 'ALL'
);

const initialView = computed<SchedulerViewMode>(() => {
  const q = route.query.view;
  if (q === 'graph' || q === 'decomposition' || q === 'contributors' || q === 'board') {
    return q;
  }
  return 'board';
});

const initialContributor = computed<string | null>(() =>
  typeof route.query.contributor === 'string' && route.query.contributor
    ? route.query.contributor
    : null
);

watch(
  () => route.query.challenge,
  (val) => {
    selectedChallengeId.value = typeof val === 'string' && val ? val : 'ALL';
  }
);

const challengeNameMap = computed<Record<string, { slug: string; name: string }>>(() => {
  const map: Record<string, { slug: string; name: string }> = {};
  for (const ch of challenges.value) {
    map[ch.id] = { slug: ch.slug, name: ch.name };
    map[ch.slug] = { slug: ch.slug, name: ch.name };
  }
  return map;
});

const taskCountByChallenge = computed(() => {
  const map = new Map<string, number>();
  for (const tk of allTasks.value) {
    map.set(tk.challengeId, (map.get(tk.challengeId) ?? 0) + 1);
  }
  return map;
});

const scopedTasks = computed(() => {
  if (selectedChallengeId.value === 'ALL') return allTasks.value;
  const ch = challenges.value.find(
    (c) => c.id === selectedChallengeId.value || c.slug === selectedChallengeId.value
  );
  const targetId = ch?.id ?? selectedChallengeId.value;
  return allTasks.value.filter((tk) => tk.challengeId === targetId);
});

const scopedContributions = computed(() => {
  if (selectedChallengeId.value === 'ALL') return allContributions.value;
  const ch = challenges.value.find(
    (c) => c.id === selectedChallengeId.value || c.slug === selectedChallengeId.value
  );
  const targetId = ch?.id ?? selectedChallengeId.value;
  return allContributions.value.filter(
    (c) => c.challengeId === targetId || c.challengeSlug === selectedChallengeId.value
  );
});

function selectChallenge(idOrAll: string) {
  selectedChallengeId.value = idOrAll;
  const nextQuery = { ...route.query };
  if (idOrAll === 'ALL') {
    delete nextQuery.challenge;
  } else {
    nextQuery.challenge = idOrAll;
  }
  void router.replace({ query: nextQuery });
}

const pollIntervalMs = Number(import.meta.env.VITE_LIVE_POLL_INTERVAL_MS || 15000);
let timer: ReturnType<typeof setInterval> | null = null;

async function fetchData(isManual = false) {
  if (isManual) refreshing.value = true;
  try {
    const [chPage, tasks, contributions] = await Promise.all([
      apiClient.listChallenges(0, 50),
      apiClient.listTasks(),
      apiClient.listContributions(),
    ]);
    challenges.value = chPage.items;
    allTasks.value = tasks;
    allContributions.value = contributions;
    lastSyncedAt.value = new Date().toISOString().slice(11, 19) + ' UTC';
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function setupPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (autoPoll.value) {
    timer = setInterval(() => {
      void fetchData(false);
    }, pollIntervalMs);
  }
}

onMounted(() => {
  void fetchData(false);
  setupPolling();
});

watch(autoPoll, setupPolling);

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <!-- Page Header -->
    <div
      class="flex flex-wrap items-end justify-between gap-4 border-b border-border-light pb-6 dark:border-border-dark"
    >
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <GitBranch class="h-4 w-4 text-accent dark:text-accent-dark" />
          <h1 class="font-editorial text-3xl font-medium text-ink dark:text-chalk">
            {{ t.scheduler.pageTitle }}
          </h1>
          <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
        </div>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
          {{ t.scheduler.pageSubtitle }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label
          class="inline-flex cursor-pointer items-center gap-2 rounded border border-border-light bg-surface px-3 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
        >
          <input v-model="autoPoll" type="checkbox" class="accent-teal-700" />
          <span>{{ t.live.autoPoll }}</span>
        </label>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
          @click="fetchData(true)"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
          <span>{{ t.live.refreshNow }}</span>
        </button>
      </div>
    </div>

    <!-- Challenge Scope Pills -->
    <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="rounded border px-3 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            selectedChallengeId === 'ALL'
              ? 'border-ink bg-ink text-paper dark:border-chalk dark:bg-chalk dark:text-obsidian'
              : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
          "
          @click="selectChallenge('ALL')"
        >
          {{ t.scheduler.allChallenges }} ({{ allTasks.length }})
        </button>
        <button
          v-for="ch in challenges"
          :key="ch.id"
          type="button"
          class="rounded border px-3 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            selectedChallengeId === ch.id || selectedChallengeId === ch.slug
              ? 'border-ink bg-ink text-paper dark:border-chalk dark:bg-chalk dark:text-obsidian'
              : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
          "
          @click="selectChallenge(ch.slug)"
        >
          {{ challengeName(ch) }} ({{ taskCountByChallenge.get(ch.id) ?? 0 }})
        </button>
      </div>

      <span v-if="lastSyncedAt" class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
        {{ t.live.lastSynced }}: {{ lastSyncedAt }}
      </span>
    </div>

    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div v-else class="mt-6">
      <TaskPoolVisualizer
        :tasks="scopedTasks"
        :contributions="scopedContributions"
        :challenge-name-map="challengeNameMap"
        :show-challenge-badge="selectedChallengeId === 'ALL'"
        :initial-view="initialView"
        :initial-contributor="initialContributor"
      />
    </div>
  </div>
</template>
