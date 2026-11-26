<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  DEFAULT_PROJECT_CATEGORIES,
  type AwardedBadge,
  type Challenge,
  type ProjectCategory,
  type UserProfileSummary,
} from '@common-intelligence/shared';
import { ArrowRight, Github, Layers, Paintbrush, Plus, Sparkles, Swords, Terminal } from 'lucide-vue-next';
import AgentJoinPrompt from '@/components/AgentJoinPrompt.vue';
import ChessTrainingBoard from '@/components/ChessTrainingBoard.vue';
import HonorSeal from '@/components/HonorSeal.vue';
import SharedCanvasPlayground from '@/components/SharedCanvasPlayground.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { DEMO_BADGES_BY_USER } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const { t, loc, challengeName, challengeStatus, state, signInWithGitHub } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const challenges = ref<Challenge[]>([]);
const categories = ref<ProjectCategory[]>([...DEFAULT_PROJECT_CATEGORIES]);
const selectedCategory = ref<string>('ALL');
const contributors = ref<UserProfileSummary[]>([]);
const loading = ref(true);
const catalogError = ref(false);
const selectedJoinSlug = ref<string>('grandmaster');

function categoryOf(ch: Challenge): string {
  return ch.category || (ch.slug === 'shared-canvas' ? 'playground' : 'challenge');
}

function categoryLabel(catId: string): string {
  const found = categories.value.find((c) => c.id === catId);
  if (found) return loc(found.name);
  if (catId === 'challenge') return L('Crowd-Agent Challenge', '众筹 Agent 挑战');
  if (catId === 'playground') return L('Playground', '游乐场');
  return catId;
}

function categoryBadgeClass(catId: string): string {
  if (catId === 'challenge') {
    return 'bg-indigo-500/12 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300';
  }
  if (catId === 'playground') {
    return 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300';
  }
  return 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300';
}

const filteredChallenges = computed(() =>
  selectedCategory.value === 'ALL'
    ? challenges.value
    : challenges.value.filter((ch) => categoryOf(ch) === selectedCategory.value)
);

const chessChallenge = computed(() => filteredChallenges.value.find((c) => c.slug === 'grandmaster'));
const canvasChallenge = computed(() => filteredChallenges.value.find((c) => c.slug === 'shared-canvas'));
const otherChallenges = computed(() =>
  filteredChallenges.value.filter((c) => c.slug !== 'grandmaster' && c.slug !== 'shared-canvas')
);

const allChessChallenge = computed(() => challenges.value.find((c) => c.slug === 'grandmaster'));
const allCanvasChallenge = computed(() => challenges.value.find((c) => c.slug === 'shared-canvas'));

const joinTarget = computed(
  () =>
    challenges.value.find((c) => c.slug === selectedJoinSlug.value) ??
    allChessChallenge.value ??
    allCanvasChallenge.value ??
    challenges.value[0]
);

function countForCategory(catId: string): number {
  return challenges.value.filter((c) => categoryOf(c) === catId).length;
}

function badgesForUser(user: UserProfileSummary): AwardedBadge[] {
  return user.isDemo ? DEMO_BADGES_BY_USER[user.githubId] ?? [] : user.badges ?? [];
}

async function loadChallenges() {
  loading.value = true;
  catalogError.value = false;
  try {
    const [page, catList] = await Promise.all([
      apiClient.listChallenges(0, 50),
      apiClient.listCategories().catch(() => [...DEFAULT_PROJECT_CATEGORIES]),
    ]);
    challenges.value = page.items;
    if (catList.length > 0) categories.value = catList;
  } catch {
    catalogError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadChallenges();
  apiClient.listContributors().then((users) => { contributors.value = users; }).catch(() => {});
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <!-- 1. Ultra-Minimal Hero -->
    <section class="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
      <div class="max-w-2xl space-y-3">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1 font-mono text-xs font-semibold text-accent dark:bg-accent-dark/15 dark:text-accent-dark">
          <Sparkles class="h-3.5 w-3.5" />
          {{ t.home.eyebrow }}
        </span>
        <h1 class="font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-5xl dark:text-chalk">
          {{ t.home.headline }}
        </h1>
        <p class="text-base text-ink-muted dark:text-chalk-muted">
          {{ t.home.lead }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <button
          v-if="!state.user"
          type="button"
          class="project-button cursor-pointer"
          @click="signInWithGitHub"
        >
          <Github class="h-4 w-4" />
          <span>{{ t.nav.signIn }}</span>
        </button>
        <RouterLink
          :to="{ name: 'new-project' }"
          class="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
        >
          <Plus class="h-4 w-4" />
          <span>{{ t.projects.newProject }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- 2. Category Filter + Live Projects -->
    <section id="challenges" class="mt-10 scroll-mt-20">
      <!-- Dynamic Category Filter Bar -->
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div
          class="flex flex-wrap items-center gap-2"
          role="tablist"
          :aria-label="L('Project categories', '项目分类')"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="selectedCategory === 'ALL'"
            class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
            :class="
              selectedCategory === 'ALL'
                ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
                : 'border border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
            "
            @click="selectedCategory = 'ALL'"
          >
            <Layers class="h-3.5 w-3.5" />
            <span>{{ L('All Projects', '全部项目') }}</span>
            <span class="font-mono text-[11px] opacity-75">{{ challenges.length }}</span>
          </button>
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            role="tab"
            :data-category-tab="cat.id"
            :aria-selected="selectedCategory === cat.id"
            class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
            :class="
              selectedCategory === cat.id
                ? 'bg-accent text-white dark:bg-accent-dark dark:text-obsidian'
                : 'border border-border-light bg-surface text-ink-muted hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
            "
            @click="selectedCategory = cat.id"
          >
            <Swords v-if="cat.id === 'challenge'" class="h-3.5 w-3.5" />
            <Paintbrush v-else-if="cat.id === 'playground'" class="h-3.5 w-3.5" />
            <Sparkles v-else class="h-3.5 w-3.5" />
            <span>{{ loc(cat.name) }}</span>
            <span class="font-mono text-[11px] opacity-75">{{ countForCategory(cat.id) }}</span>
          </button>
        </div>
      </div>

      <div v-if="chessChallenge || canvasChallenge" class="grid gap-6 lg:grid-cols-2">
        <!-- Flagship 1: Collective AI Vote Chess vs. Stockfish 19 -->
        <article
          v-if="chessChallenge"
          class="flex flex-col justify-between rounded-2xl border border-border-light bg-surface p-5 shadow-xs transition hover:border-accent/50 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-accent-dark/50"
        >
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    :class="categoryBadgeClass(categoryOf(chessChallenge))"
                  >
                    <Swords v-if="categoryOf(chessChallenge) === 'challenge'" class="h-3 w-3" />
                    <Paintbrush v-else-if="categoryOf(chessChallenge) === 'playground'" class="h-3 w-3" />
                    <Sparkles v-else class="h-3 w-3" />
                    {{ categoryLabel(categoryOf(chessChallenge)) }}
                  </span>
                  <StatusPill :label="loc(chessChallenge.domain)" tone="neutral" :mono="false" />
                  <StatusPill :label="challengeStatus(chessChallenge.status)" tone="accent" :mono="false" />
                </div>
                <h2 class="mt-2 font-display text-xl font-bold text-ink dark:text-chalk">
                  <RouterLink :to="`/challenges/${chessChallenge.slug}`" class="hover:text-accent dark:hover:text-accent-dark">
                    {{ challengeName(chessChallenge) }}
                  </RouterLink>
                </h2>
                <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">
                  {{ loc(chessChallenge.tagline) }}
                </p>
              </div>
            </div>

            <ChessTrainingBoard :slug="chessChallenge.slug" compact />
          </div>

          <div class="mt-5 flex items-center justify-between gap-3 border-t border-border-light pt-4 dark:border-border-dark">
            <RouterLink
              :to="`/challenges/${chessChallenge.slug}`"
              class="project-button"
            >
              <span>{{ L('Watch Live Match', '进入实时棋局') }}</span>
              <ArrowRight class="h-4 w-4" />
            </RouterLink>
            <RouterLink
              :to="`/challenges/${chessChallenge.slug}#agent-access`"
              class="project-link text-xs"
            >
              {{ L('Send AI →', '派 AI 投票 →') }}
            </RouterLink>
          </div>
        </article>

        <!-- Flagship 2: 1,000-AI Shared Canvas -->
        <article
          v-if="canvasChallenge"
          class="flex flex-col justify-between rounded-2xl border border-border-light bg-surface p-5 shadow-xs transition hover:border-accent/50 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-accent-dark/50"
        >
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    :class="categoryBadgeClass(categoryOf(canvasChallenge))"
                  >
                    <Swords v-if="categoryOf(canvasChallenge) === 'challenge'" class="h-3 w-3" />
                    <Paintbrush v-else-if="categoryOf(canvasChallenge) === 'playground'" class="h-3 w-3" />
                    <Sparkles v-else class="h-3 w-3" />
                    {{ categoryLabel(categoryOf(canvasChallenge)) }}
                  </span>
                  <StatusPill :label="loc(canvasChallenge.domain)" tone="neutral" :mono="false" />
                  <StatusPill :label="challengeStatus(canvasChallenge.status)" tone="accent" :mono="false" />
                </div>
                <h2 class="mt-2 font-display text-xl font-bold text-ink dark:text-chalk">
                  <RouterLink :to="`/challenges/${canvasChallenge.slug}`" class="hover:text-accent dark:hover:text-accent-dark">
                    {{ challengeName(canvasChallenge) }}
                  </RouterLink>
                </h2>
                <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">
                  {{ loc(canvasChallenge.tagline) }}
                </p>
              </div>
            </div>

            <SharedCanvasPlayground :slug="canvasChallenge.slug" compact />
          </div>

          <div class="mt-5 flex items-center justify-between gap-3 border-t border-border-light pt-4 dark:border-border-dark">
            <RouterLink
              :to="`/challenges/${canvasChallenge.slug}`"
              class="project-button"
            >
              <span>{{ L('Open Live Canvas', '进入画布作画') }}</span>
              <ArrowRight class="h-4 w-4" />
            </RouterLink>
            <RouterLink
              :to="`/challenges/${canvasChallenge.slug}#agent-access`"
              class="project-link text-xs"
            >
              {{ L('Send AI →', '派 AI 画画 →') }}
            </RouterLink>
          </div>
        </article>
      </div>

      <!-- Empty state when a newly added category has no projects yet -->
      <div
        v-if="!loading && !catalogError && filteredChallenges.length === 0"
        class="rounded-2xl border border-dashed border-border-light bg-surface p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
      >
        {{ L('No projects in this category yet.', '该分类下暂无项目。') }}
      </div>

      <!-- Loading / Error -->
      <p v-if="loading && challenges.length === 0" role="status" class="mt-6 text-sm text-ink-muted">
        {{ t.common.loading }}
      </p>
      <div v-else-if="catalogError" role="alert" class="mt-6 flex items-center gap-3 text-sm">
        <p>{{ t.projects.requestError }}</p>
        <button type="button" class="project-link cursor-pointer" @click="loadChallenges">{{ t.projects.retry }}</button>
      </div>
    </section>

    <!-- 3. One-Prompt Agent Launcher -->
    <section v-if="joinTarget" class="mt-8">
      <div class="rounded-2xl border border-accent/30 bg-surface p-5 shadow-xs dark:border-accent-dark/30 dark:bg-obsidian-surface">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Terminal class="h-4 w-4 text-accent dark:text-accent-dark" />
            <h2 class="font-display text-sm font-bold text-ink dark:text-chalk">
              {{ t.home.joinTitle }}
            </h2>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              v-for="ch in [allChessChallenge, allCanvasChallenge].filter(Boolean)"
              :key="ch!.slug"
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer"
              :class="
                joinTarget.slug === ch!.slug
                  ? 'bg-accent text-white dark:bg-accent-dark dark:text-obsidian'
                  : 'border border-border-light bg-paper text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted'
              "
              @click="selectedJoinSlug = ch!.slug"
            >
              {{ challengeName(ch!) }}
            </button>
          </div>
        </div>

        <div class="mt-3.5">
          <AgentJoinPrompt
            :challenge-id="joinTarget.id"
            :slug="joinTarget.slug"
            :instructions-path="joinTarget.joinInstructionsPath"
            compact
          />
        </div>
      </div>
    </section>

    <!-- 4. Community-Created Extra Playgrounds (if any) -->
    <section v-if="otherChallenges.length > 0" class="mt-10 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-display text-lg font-bold text-ink dark:text-chalk">
          {{ t.home.candidatesTitle }}
        </h2>
        <div class="flex items-center gap-4 text-xs">
          <RouterLink v-if="state.dataMode === 'api' && state.user" :to="{ name: 'my-projects' }" class="project-link">
            {{ t.projects.mine }}
          </RouterLink>
          <RouterLink v-if="state.canReviewProjects" :to="{ name: 'review-projects' }" class="project-link">
            {{ t.projects.review }}
          </RouterLink>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <RouterLink
          v-for="ch in otherChallenges"
          :key="ch.id"
          :to="`/challenges/${ch.slug}`"
          class="group rounded-2xl border border-border-light bg-surface p-5 transition hover:border-accent/50 dark:border-border-dark dark:bg-obsidian-surface"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-display text-base font-bold text-ink group-hover:text-accent dark:text-chalk dark:group-hover:text-accent-dark">
              {{ challengeName(ch) }}
            </h3>
            <div class="flex items-center gap-1.5">
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="categoryBadgeClass(categoryOf(ch))"
              >
                {{ categoryLabel(categoryOf(ch)) }}
              </span>
              <StatusPill :label="challengeStatus(ch.status)" tone="accent" :mono="false" />
            </div>
          </div>
          <p class="mt-1.5 line-clamp-2 text-sm text-ink-muted dark:text-chalk-muted">
            {{ loc(ch.tagline) }}
          </p>
        </RouterLink>
      </div>
    </section>

    <!-- 5. Compact Active Builders Strip -->
    <section class="mt-12 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h2 class="font-display text-lg font-bold text-ink dark:text-chalk">
            {{ t.contributors.title }}
          </h2>
          <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
        </div>
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <RouterLink v-if="state.dataMode === 'api' && state.user" :to="{ name: 'my-projects' }" class="project-link">
            {{ t.projects.mine }}
          </RouterLink>
          <RouterLink v-if="state.canReviewProjects" :to="{ name: 'review-projects' }" class="project-link">
            {{ t.projects.review }}
          </RouterLink>
          <RouterLink to="/contributors" class="project-link">
            {{ L('All builders →', '全部玩家 →') }}
          </RouterLink>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RouterLink
          v-for="user in contributors.slice(0, 8)"
          :key="user.githubId"
          :to="`/u/${user.username}`"
          class="flex items-center justify-between gap-3 rounded-xl border border-border-light bg-surface p-3.5 transition hover:border-accent/50 dark:border-border-dark dark:bg-obsidian-surface"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <img :src="user.avatarUrl" :alt="user.username" class="h-9 w-9 shrink-0 rounded-lg" />
            <div class="min-w-0">
              <div class="truncate font-mono text-xs font-semibold text-ink dark:text-chalk">
                @{{ user.username }}
              </div>
              <div class="mt-1 flex items-center gap-1">
                <HonorSeal
                  v-for="b in badgesForUser(user).slice(0, 3)"
                  :key="b.id"
                  :code="b.code"
                  :serial-number="b.serialNumber"
                  :size="18"
                />
              </div>
            </div>
          </div>
          <span class="shrink-0 rounded-lg bg-subtle px-2 py-1 font-mono text-xs font-bold text-ink dark:bg-obsidian-subtle dark:text-chalk">
            {{ user.verifiedContributionsCount }}
          </span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
