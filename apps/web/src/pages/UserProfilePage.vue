<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  renderContributorReadmeBadgeSvg,
  type BadgeCode,
  type ContributorFullProfile,
} from '@common-intelligence/shared';
import { ExternalLink, GitBranch, Github, KeyRound, ShieldCheck } from 'lucide-vue-next';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import HonorSeal from '@/components/HonorSeal.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient, PUBLIC_APP_URL } from '@/api/client';
import { BADGE_DEFINITIONS } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const route = useRoute();
const { t, loc, challengeName, state } = useAppState();

const profile = ref<ContributorFullProfile | null>(null);
const loading = ref(true);

const isOwnProfile = computed(
  () =>
    !!state.user &&
    !!profile.value &&
    state.user.githubId === profile.value.user.githubId
);

function badgeDef(code: BadgeCode) {
  return BADGE_DEFINITIONS.find((b) => b.code === code);
}

const topHonorLabel = computed(() => {
  const badges = profile.value?.badges ?? [];
  const founding = badges.find((b) => b.code === 'founding_contributor');
  if (founding?.serialNumber) {
    return `Founding Contributor #${String(founding.serialNumber).padStart(3, '0')}`;
  }
  return undefined;
});

const readmeBadgeDataUri = computed(() => {
  if (!profile.value) return '';
  const svg = renderContributorReadmeBadgeSvg(profile.value.user, topHonorLabel.value);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});

const readmeMarkdown = computed(() => {
  if (!profile.value) return '';
  const { githubId, username } = profile.value.user;
  return `[![Common Intelligence Contributor](${PUBLIC_APP_URL}/api/badges/${githubId}.svg)](${PUBLIC_APP_URL}/u/${username})`;
});

async function loadProfile(username: string) {
  loading.value = true;
  try {
    profile.value = await apiClient.getContributorProfile(username);
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadProfile(String(route.params.username ?? '')));
watch(
  () => route.params.username,
  (val) => {
    if (val) loadProfile(String(val));
  }
);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <div v-if="loading" class="text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div
      v-else-if="!profile"
      class="rounded-md border border-border-light bg-surface p-8 text-center dark:border-border-dark dark:bg-obsidian-surface"
    >
      <h1 class="text-lg font-semibold text-ink dark:text-chalk">{{ t.profile.notFoundTitle }}</h1>
      <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">{{ t.profile.notFoundBody }}</p>
    </div>

    <template v-else>
      <!-- Profile Header -->
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border-light pb-6 dark:border-border-dark">
        <div class="flex items-start gap-4">
          <img
            :src="profile.user.avatarUrl"
            :alt="profile.user.username"
            class="h-16 w-16 rounded-lg border border-border-light dark:border-border-dark"
          />
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-editorial text-2xl font-medium text-ink sm:text-3xl dark:text-chalk">
                {{ profile.user.displayName }}
              </h1>
              <StatusPill v-if="profile.user.isDemo" label="DEMO" tone="demo" />
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-muted dark:text-chalk-muted">
              <span>@{{ profile.user.username }}</span>
              <span>·</span>
              <span>{{ t.profile.githubId }}: {{ profile.user.githubId }}</span>
              <span>·</span>
              <span>{{ t.profile.joined }} {{ profile.user.joinedAt.slice(0, 10) }}</span>
            </div>
            <p
              v-if="profile.user.bio"
              class="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-muted dark:text-chalk-muted"
            >
              {{ loc(profile.user.bio) }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            :to="`/tasks?contributor=${encodeURIComponent(profile.user.username)}&view=contributors`"
            class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
          >
            <GitBranch class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
            <span>{{ t.scheduler.viewInScheduler }}</span>
          </RouterLink>
          <RouterLink
            v-if="isOwnProfile"
            to="/settings/tokens"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian"
          >
            <KeyRound class="h-3.5 w-3.5" />
            <span>{{ t.profile.manageMyTokens }}</span>
          </RouterLink>
          <a
            :href="profile.user.profileUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 font-mono text-xs text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
          >
            <Github class="h-3.5 w-3.5" />
            <span>{{ t.profile.viewOnGithub }}</span>
            <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </header>

      <!-- Academic Honors / Badges -->
      <section class="mt-8 space-y-3">
        <div>
          <h2 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.profile.honorsTitle }}
          </h2>
          <p class="mt-0.5 text-xs text-ink-muted dark:text-chalk-muted">
            {{ t.profile.honorsSubtitle }}
          </p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="badge in profile.badges"
            :key="badge.id"
            :to="`/credentials/${badge.credentialId}`"
            class="flex items-start gap-3.5 rounded-md border border-border-light bg-surface p-4 transition hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-chalk/40"
          >
            <HonorSeal :code="badge.code" :serial-number="badge.serialNumber" :size="36" />
            <div class="min-w-0">
              <div class="text-sm font-semibold text-ink dark:text-chalk">
                {{ badgeDef(badge.code) ? loc(badgeDef(badge.code)!.name) : badge.code }}
                <span v-if="badge.serialNumber" class="font-mono text-xs text-accent dark:text-accent-dark">
                  #{{ String(badge.serialNumber).padStart(3, '0') }}
                </span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{ badgeDef(badge.code) ? loc(badgeDef(badge.code)!.description) : '' }}
              </p>
              <div class="mt-1.5 font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint">
                {{ badge.awardedAt.slice(0, 10) }} · {{ badge.challengeSlug }}
              </div>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- GitHub Profile README Badge Generator -->
      <section
        class="mt-10 rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <h2 class="text-sm font-semibold text-ink dark:text-chalk">
          {{ t.profile.readmeBadgeTitle }}
        </h2>
        <p class="mt-1 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
          {{ t.profile.readmeBadgeSubtitle }}
        </p>

        <div class="mt-4 space-y-3">
          <div class="inline-block rounded border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian">
            <img
              :src="readmeBadgeDataUri"
              :alt="`Common Intelligence README badge for ${profile.user.username}`"
              class="h-14 w-auto"
            />
          </div>
          <CopyCommandBox :text="readmeMarkdown" label="GitHub Profile README Markdown" />
        </div>
      </section>

      <!-- Verified Research Contributions -->
      <section class="mt-10 space-y-3">
        <h2 class="text-base font-semibold text-ink dark:text-chalk">
          {{ t.profile.contributionsTitle }} ({{ profile.contributions.length }})
        </h2>

        <div class="space-y-3">
          <article
            v-for="item in profile.contributions"
            :key="item.id"
            class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <StatusPill :label="item.status" tone="success" />
                <StatusPill :label="item.contributionType" tone="neutral" />
                <RouterLink
                  :to="`/challenges/${item.challengeSlug}`"
                  class="font-mono text-xs text-ink-muted hover:underline dark:text-chalk-muted"
                >
                  {{ challengeName({ slug: item.challengeSlug, name: item.challengeName }) }}
                </RouterLink>
              </div>
              <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                {{ item.acceptedAt.slice(0, 10) }}
              </span>
            </div>

            <h3 class="mt-2 text-sm font-semibold text-ink dark:text-chalk">
              {{ loc(item.title) }}
            </h3>
            <p class="mt-1 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(item.summary) }}
            </p>

            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-2.5 text-xs dark:border-border-dark">
              <div class="flex flex-wrap items-center gap-3 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                <a
                  :href="item.prUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 hover:text-ink dark:hover:text-chalk"
                >
                  <span>PR #{{ item.prNumber }}</span>
                  <ExternalLink class="h-3 w-3" />
                </a>
                <span>SHA {{ item.commitSha.slice(0, 10) }}</span>
                <span>{{ item.selfReportedAgentModel }} ({{ t.challenge.selfReportedTag }})</span>
                <span v-if="item.parentContributionIds.length > 0">
                  {{ t.profile.parents }}: {{ item.parentContributionIds.join(', ') }}
                </span>
              </div>

              <RouterLink
                v-if="item.credentialId"
                :to="`/credentials/${item.credentialId}`"
                class="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline dark:text-accent-dark"
              >
                <ShieldCheck class="h-3.5 w-3.5" />
                <span>{{ item.credentialId }}</span>
              </RouterLink>
            </div>
          </article>
        </div>
      </section>

      <!-- Credentials List -->
      <section class="mt-10 space-y-3">
        <h2 class="text-base font-semibold text-ink dark:text-chalk">
          {{ t.profile.credentialsTitle }} ({{ profile.credentials.length }})
        </h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <RouterLink
            v-for="cred in profile.credentials"
            :key="cred.id"
            :to="`/credentials/${cred.id}`"
            class="rounded-md border border-border-light bg-surface p-4 hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-chalk/40"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-xs font-semibold text-accent dark:text-accent-dark">
                {{ cred.id }}
              </span>
              <StatusPill
                :label="cred.status"
                :tone="
                  cred.status === 'Verified'
                    ? 'success'
                    : cred.status === 'Revoked'
                      ? 'danger'
                      : 'warning'
                "
              />
            </div>
            <div class="mt-2 text-sm font-medium text-ink dark:text-chalk">
              {{ loc(cred.contributionTitle) }}
            </div>
            <div class="mt-1 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              {{ cred.verifierVersion }} · {{ cred.issuedAt.slice(0, 10) }}
            </div>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
