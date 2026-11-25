<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AwardedBadge, UserProfileSummary } from '@common-intelligence/shared';
import HonorSeal from '@/components/HonorSeal.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { BADGE_DEFINITIONS, DEMO_BADGES_BY_USER } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const { t, loc, state } = useAppState();
const contributors = ref<UserProfileSummary[]>([]);
const loading = ref(true);

function badgesForUser(githubId: string): AwardedBadge[] {
  return DEMO_BADGES_BY_USER[githubId] ?? [];
}

onMounted(async () => {
  try {
    contributors.value = await apiClient.listContributors();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <header class="border-b border-border-light pb-6 dark:border-border-dark">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="font-editorial text-3xl font-medium text-ink dark:text-chalk">
          {{ t.contributors.title }}
        </h1>
        <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
      </div>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
        {{ t.contributors.subtitle }}
      </p>
      <p class="mt-2 font-mono text-xs text-ink-faint dark:text-chalk-faint">
        {{ t.contributors.policyNote }}
      </p>
    </header>

    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div
      v-else
      class="mt-6 overflow-x-auto rounded-md border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface"
    >
      <table class="w-full text-left text-sm">
        <thead
          class="border-b border-border-light bg-subtle/60 font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted"
        >
          <tr>
            <th class="px-4 py-3">{{ t.contributors.columns.contributor }}</th>
            <th class="px-4 py-3 text-right">{{ t.contributors.columns.verifiedContributions }}</th>
            <th class="px-4 py-3">{{ t.contributors.columns.honors }}</th>
            <th class="px-4 py-3">{{ t.contributors.columns.challenges }}</th>
            <th class="px-4 py-3">{{ t.contributors.columns.joined }}</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light dark:divide-border-dark">
          <tr
            v-for="user in contributors"
            :key="user.githubId"
            class="transition hover:bg-subtle/40 dark:hover:bg-obsidian-subtle/40"
          >
            <td class="px-4 py-3.5">
              <div class="flex items-center gap-3">
                <img :src="user.avatarUrl" :alt="user.username" class="h-9 w-9 rounded-md" />
                <div>
                  <div class="flex items-center gap-1.5">
                    <RouterLink
                      :to="`/u/${user.username}`"
                      class="font-mono text-sm font-semibold text-ink hover:underline dark:text-chalk"
                    >
                      @{{ user.username }}
                    </RouterLink>
                    <StatusPill v-if="user.isDemo" label="DEMO" tone="demo" />
                  </div>
                  <div class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                    ID {{ user.githubId }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3.5 text-right font-mono text-base font-semibold tabular-nums text-ink dark:text-chalk">
              {{ user.verifiedContributionsCount }}
            </td>
            <td class="px-4 py-3.5">
              <div class="flex items-center gap-2">
                <HonorSeal
                  v-for="b in badgesForUser(user.githubId)"
                  :key="b.id"
                  :code="b.code"
                  :serial-number="b.serialNumber"
                  :size="24"
                />
              </div>
            </td>
            <td class="px-4 py-3.5">
              <div class="flex flex-wrap gap-1.5">
                <RouterLink
                  v-for="slug in user.challengesJoined"
                  :key="slug"
                  :to="`/challenges/${slug}`"
                  class="rounded bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-muted hover:text-ink dark:bg-obsidian-subtle dark:text-chalk-muted dark:hover:text-chalk"
                >
                  {{ slug }}
                </RouterLink>
              </div>
            </td>
            <td class="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-ink-muted dark:text-chalk-muted">
              {{ user.joinedAt.slice(0, 10) }}
            </td>
            <td class="whitespace-nowrap px-4 py-3.5 text-right">
              <RouterLink
                :to="`/u/${user.username}`"
                class="font-mono text-xs text-accent hover:underline dark:text-accent-dark"
              >
                {{ t.contributors.viewProfile }} →
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Public Honor Criteria Reference -->
    <section class="mt-14">
      <h2 class="text-lg font-semibold text-ink dark:text-chalk">
        {{ t.profile.honorsTitle }}
      </h2>
      <p class="mt-1 text-xs text-ink-muted dark:text-chalk-muted">
        {{ t.profile.honorsSubtitle }}
      </p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="badge in BADGE_DEFINITIONS"
          :key="badge.code"
          class="flex items-start gap-3.5 rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
        >
          <HonorSeal :code="badge.code" :size="36" />
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-ink dark:text-chalk">
              {{ loc(badge.name) }}
            </h3>
            <p class="mt-1 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(badge.description) }}
            </p>
            <p class="mt-1.5 font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint">
              {{ loc(badge.criteria) }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
