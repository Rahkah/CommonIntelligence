<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AwardedBadge, UserProfileSummary } from '@common-intelligence/shared';
import HonorSeal from '@/components/HonorSeal.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { BADGE_DEFINITIONS, DEMO_BADGES_BY_USER } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const { t, loc, challengeName, state } = useAppState();
const contributors = ref<UserProfileSummary[]>([]);
const loading = ref(true);

function badgesForUser(user: UserProfileSummary): AwardedBadge[] {
  return user.isDemo ? DEMO_BADGES_BY_USER[user.githubId] ?? [] : user.badges ?? [];
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
    <header class="border-b border-border-light pb-5 dark:border-border-dark">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="font-display text-3xl font-bold text-ink dark:text-chalk">
          {{ t.contributors.title }}
        </h1>
        <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
      </div>
      <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">
        {{ t.contributors.subtitle }}
      </p>
    </header>

    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="user in contributors"
        :key="user.githubId"
        :to="`/u/${user.username}`"
        class="project-panel flex flex-col justify-between gap-4 transition hover:border-accent/50"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <img :src="user.avatarUrl" :alt="user.username" class="h-11 w-11 rounded-xl" />
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-sm font-bold text-ink dark:text-chalk">@{{ user.username }}</span>
                <StatusPill v-if="user.isDemo" label="DEMO" tone="demo" />
              </div>
              <p v-if="user.bio" class="mt-0.5 line-clamp-2 text-xs text-ink-muted dark:text-chalk-muted">
                {{ loc(user.bio) }}
              </p>
            </div>
          </div>
          <span class="shrink-0 rounded-lg bg-accent/12 px-2.5 py-1 font-mono text-sm font-bold text-accent dark:bg-accent-dark/15 dark:text-accent-dark">
            {{ user.verifiedContributionsCount }}
          </span>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-3 dark:border-border-dark">
          <div class="flex items-center gap-1.5">
            <HonorSeal
              v-for="b in badgesForUser(user)"
              :key="b.id"
              :code="b.code"
              :serial-number="b.serialNumber"
              :size="22"
            />
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="slug in user.challengesJoined"
              :key="slug"
              class="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted"
            >
              {{ challengeName({ slug, name: slug }) }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>

    <section class="mt-12 space-y-4">
      <h2 class="font-display text-lg font-bold text-ink dark:text-chalk">
        {{ t.profile.honorsTitle }}
      </h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="badge in BADGE_DEFINITIONS" :key="badge.code" class="project-panel flex items-start gap-3.5 p-4">
          <HonorSeal :code="badge.code" :size="36" />
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-ink dark:text-chalk">{{ loc(badge.name) }}</h3>
            <p class="mt-1 text-xs text-ink-muted dark:text-chalk-muted">{{ loc(badge.description) }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
