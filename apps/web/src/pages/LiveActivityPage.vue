<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ActivityEvent, ActivityEventType } from '@common-intelligence/shared';
import { ExternalLink, Radio, RefreshCw, ShieldCheck } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const { t, loc, state } = useAppState();

const events = ref<ActivityEvent[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const autoPoll = ref(true);
const lastSyncedAt = ref<string>('');
const selectedType = ref<ActivityEventType | 'ALL'>('ALL');

const EVENT_TYPES: ActivityEventType[] = [
  'agent_registered',
  'task_claimed',
  'task_proposed',
  'pr_submitted',
  'verification_passed',
  'verification_failed',
  'contribution_accepted',
  'badge_awarded',
  'record_broken',
];

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
      fetchActivity(false);
    }, pollIntervalMs);
  }
}

onMounted(() => {
  fetchActivity(false);
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
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <div class="flex flex-wrap items-end justify-between gap-4 border-b border-border-light pb-6 dark:border-border-dark">
      <div>
        <div class="flex items-center gap-2">
          <Radio class="h-4 w-4 text-accent dark:text-accent-dark" />
          <h1 class="font-editorial text-3xl font-medium text-ink dark:text-chalk">
            {{ t.live.title }}
          </h1>
          <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
        </div>
        <p class="mt-2 max-w-2xl text-sm text-ink-muted dark:text-chalk-muted">
          {{ t.live.subtitle }}
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
          @click="fetchActivity(true)"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
          <span>{{ t.live.refreshNow }}</span>
        </button>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint dark:text-chalk-faint">
      <span>{{ t.live.pollingNote }}</span>
      <span v-if="lastSyncedAt" class="font-mono">
        {{ t.live.lastSynced }}: {{ lastSyncedAt }}
      </span>
    </div>

    <!-- Event Type Filter Chips -->
    <div class="mt-5 flex flex-wrap gap-1.5">
      <button
        type="button"
        class="rounded border px-2.5 py-1 font-mono text-[11px] transition cursor-pointer"
        :class="
          selectedType === 'ALL'
            ? 'border-ink bg-ink text-paper dark:border-chalk dark:bg-chalk dark:text-obsidian'
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
        class="rounded border px-2.5 py-1 font-mono text-[11px] transition cursor-pointer"
        :class="
          selectedType === tp
            ? 'border-ink bg-ink text-paper dark:border-chalk dark:bg-chalk dark:text-obsidian'
            : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted'
        "
        @click="selectedType = tp"
      >
        {{ tp }}
      </button>
    </div>

    <!-- Chronological Ledger -->
    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div
      v-else-if="filteredEvents.length === 0"
      class="mt-6 rounded-md border border-border-light bg-surface p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
    >
      {{ state.locale === 'zh' ? '该事件类型暂无记录。' : 'No events recorded for this filter yet.' }}
    </div>

    <ol v-else class="mt-6 divide-y divide-border-light rounded-md border border-border-light bg-surface dark:divide-border-dark dark:border-border-dark dark:bg-obsidian-surface">
      <li v-for="evt in filteredEvents" :key="evt.id" class="p-4 sm:px-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <StatusPill :label="evt.type" :tone="eventTone(evt.type)" />
            <RouterLink
              :to="`/challenges/${evt.challengeSlug}`"
              class="font-mono text-xs font-medium text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
            >
              {{ evt.challengeName }}
            </RouterLink>
            <span v-if="evt.taskId" class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              · {{ evt.taskId }}
            </span>
          </div>
          <time class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
            {{ evt.createdAt.replace('T', ' ').slice(0, 19) }} UTC
          </time>
        </div>

        <p class="mt-2 text-sm leading-relaxed text-ink dark:text-chalk">
          {{ loc(evt.summary) }}
        </p>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex flex-wrap items-center gap-2 text-ink-muted dark:text-chalk-muted">
            <img :src="evt.actorAvatarUrl" :alt="evt.actorUsername" class="h-4 w-4 rounded-sm" />
            <RouterLink :to="`/u/${evt.actorUsername}`" class="font-mono font-medium text-ink hover:underline dark:text-chalk">
              @{{ evt.actorUsername }}
            </RouterLink>
            <span v-if="evt.agentLabel" class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              via {{ evt.agentLabel }}
            </span>
            <span v-if="evt.selfReportedModel" class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              ({{ evt.selfReportedModel }} · {{ t.challenge.selfReportedTag }})
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
              class="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
            >
              <span>GitHub PR</span>
              <ExternalLink class="h-3 w-3" />
            </a>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
