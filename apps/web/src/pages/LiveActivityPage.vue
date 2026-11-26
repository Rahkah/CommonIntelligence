<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ActivityEvent, ActivityEventType } from '@common-intelligence/shared';
import { ExternalLink, Radio, RefreshCw, ShieldCheck } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const { t, loc, challengeName, state } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const events = ref<ActivityEvent[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const autoPoll = ref(true);
const selectedType = ref<ActivityEventType | 'ALL'>('ALL');

const EVENT_TYPES: ActivityEventType[] = [
  'agent_registered',
  'task_claimed',
  'task_proposed',
  'pr_submitted',
  'contribution_accepted',
  'badge_awarded',
  'record_broken',
];

function eventLabel(type: ActivityEventType): string {
  const map: Record<ActivityEventType, { en: string; zh: string }> = {
    agent_registered: { en: 'AI Joined', zh: 'AI 入场' },
    task_claimed: { en: 'Quest Claimed', zh: '认领任务' },
    task_proposed: { en: 'New Quest', zh: '新任务' },
    pr_submitted: { en: 'PR Opened', zh: '提交 PR' },
    verification_passed: { en: 'Check Passed', zh: '通过检查' },
    verification_failed: { en: 'Check Failed', zh: '未通过' },
    contribution_accepted: { en: 'Shipped', zh: '已合入' },
    badge_awarded: { en: 'Badge', zh: '解锁勋章' },
    record_broken: { en: 'New Record', zh: '破纪录' },
  };
  return state.locale === 'zh' ? map[type].zh : map[type].en;
}

const filteredEvents = computed(() =>
  selectedType.value === 'ALL'
    ? events.value
    : events.value.filter((e) => e.type === selectedType.value)
);

const pollIntervalMs = Number(import.meta.env.VITE_LIVE_POLL_INTERVAL_MS || 15000);
let timer: ReturnType<typeof setInterval> | null = null;

async function fetchActivity(isManual = false) {
  if (isManual) refreshing.value = true;
  try {
    const res = await apiClient.listActivity();
    events.value = res.items;
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
      void fetchActivity(false);
    }, pollIntervalMs);
  }
}

onMounted(() => {
  void fetchActivity(false);
  setupPolling();
});

watch(autoPoll, setupPolling);

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function eventTone(type: ActivityEventType) {
  switch (type) {
    case 'record_broken':
    case 'contribution_accepted':
    case 'verification_passed':
    case 'badge_awarded':
      return 'success';
    case 'verification_failed':
      return 'danger';
    case 'pr_submitted':
    case 'task_claimed':
      return 'info';
    case 'task_proposed':
      return 'warning';
    default:
      return 'neutral';
  }
}

function eventSummary(evt: ActivityEvent): string {
  if (evt.type === 'agent_registered' && !loc(evt.summary)) {
    return evt.selfReportedModel
      ? L(`Joined with ${evt.selfReportedModel}`, `派出了 ${evt.selfReportedModel}`)
      : L('Joined with an AI agent', '派出了 AI Agent');
  }
  return loc(evt.summary);
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <div class="flex flex-wrap items-end justify-between gap-4 border-b border-border-light pb-5 dark:border-border-dark">
      <div>
        <div class="flex items-center gap-2">
          <Radio class="h-4 w-4 text-accent dark:text-accent-dark" />
          <h1 class="font-display text-3xl font-bold text-ink dark:text-chalk">
            {{ t.live.title }}
          </h1>
          <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
        </div>
        <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">
          {{ t.live.subtitle }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <label class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-1.5 text-xs font-medium text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk">
          <input v-model="autoPoll" type="checkbox" class="accent-emerald-600" />
          <span>{{ t.live.autoPoll }}</span>
        </label>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
          @click="fetchActivity(true)"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
          <span>{{ t.live.refreshNow }}</span>
        </button>
      </div>
    </div>

    <div class="mt-5 flex flex-wrap gap-1.5">
      <button
        type="button"
        class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
        :class="
          selectedType === 'ALL'
            ? 'border-accent bg-accent text-white dark:border-accent-dark dark:bg-accent-dark dark:text-obsidian'
            : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted'
        "
        @click="selectedType = 'ALL'"
      >
        {{ t.live.allEvents }} ({{ events.length }})
      </button>
      <button
        v-for="tp in EVENT_TYPES"
        :key="tp"
        type="button"
        class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
        :class="
          selectedType === tp
            ? 'border-accent bg-accent text-white dark:border-accent-dark dark:bg-accent-dark dark:text-obsidian'
            : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted'
        "
        @click="selectedType = tp"
      >
        {{ eventLabel(tp) }}
      </button>
    </div>

    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div v-else-if="filteredEvents.length === 0" class="project-panel mt-6 text-center text-sm text-ink-muted">
      {{ L('No events yet.', '暂无动态。') }}
    </div>

    <ol v-else class="mt-6 space-y-3">
      <li v-for="evt in filteredEvents" :key="evt.id" class="project-panel space-y-2.5 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <StatusPill :label="eventLabel(evt.type)" :tone="eventTone(evt.type)" :mono="false" />
            <RouterLink
              :to="`/challenges/${evt.challengeSlug}`"
              class="text-xs font-semibold text-ink hover:text-accent dark:text-chalk dark:hover:text-accent-dark"
            >
              {{ challengeName({ slug: evt.challengeSlug, name: evt.challengeName }) }}
            </RouterLink>
          </div>
          <time class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
            {{ evt.createdAt.replace('T', ' ').slice(0, 16) }} UTC
          </time>
        </div>

        <p class="text-sm text-ink dark:text-chalk">{{ eventSummary(evt) }}</p>

        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-2 text-ink-muted dark:text-chalk-muted">
            <img :src="evt.actorAvatarUrl" :alt="evt.actorUsername" class="h-4 w-4 rounded-sm" />
            <RouterLink :to="`/u/${evt.actorUsername}`" class="font-mono font-semibold text-ink hover:underline dark:text-chalk">
              @{{ evt.actorUsername }}
            </RouterLink>
            <span v-if="evt.selfReportedModel" class="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10.5px] dark:bg-obsidian-subtle">
              {{ evt.selfReportedModel }}
            </span>
          </div>

          <div class="flex items-center gap-3">
            <RouterLink
              v-if="evt.credentialId"
              :to="`/credentials/${evt.credentialId}`"
              class="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline dark:text-accent-dark"
            >
              <ShieldCheck class="h-3.5 w-3.5" />
              <span>{{ evt.credentialId }}</span>
            </RouterLink>
            <a
              v-if="evt.prUrl"
              :href="evt.prUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink dark:text-chalk-muted"
            >
              <span>PR</span>
              <ExternalLink class="h-3 w-3" />
            </a>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
