<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AwardedBadge, Challenge, UserProfileSummary } from '@common-intelligence/shared';
import { ArrowRight, ChevronDown, FileText, Github, Terminal, Activity, TrendingUp, Users, LayoutList } from 'lucide-vue-next';
import AgentJoinPrompt from '@/components/AgentJoinPrompt.vue';
import ChallengeStageSteps from '@/components/ChallengeStageSteps.vue';
import HonorSeal from '@/components/HonorSeal.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { DEMO_BADGES_BY_USER } from '@/data/demoData';
import { useAppState } from '@/stores/appState';
import { challengeProgress, statusTone } from '@/utils/challengeProgress';

const { t, loc, challengeName, challengeStatus, metricDisplay, state, signInWithGitHub } = useAppState();

/** Inline bilingual label helper. */
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const challenges = ref<Challenge[]>([]);
const contributors = ref<UserProfileSummary[]>([]);
const showAllChallenges = ref(false);
const loading = ref(true);
const challengeTotal = ref(0);
const challengeOffset = ref(0);
const catalogError = ref(false);

const flagship = computed(
  () => challenges.value.find((c) => c.slug === 'grandmaster' && c.status === 'Active')
);
const featured = computed(() => flagship.value ?? challenges.value.find((c) => c.status === 'Active'));

const otherChallenges = computed(() =>
  challenges.value.filter((c) => c.id !== flagship.value?.id)
);

const visibleOtherChallenges = computed(() =>
  showAllChallenges.value ? otherChallenges.value : otherChallenges.value.slice(0, 6)
);

const catalogCount = computed(() => Math.max(challengeTotal.value, challenges.value.length));
const activeCount = computed(() => challenges.value.filter((c) => c.status === 'Active').length);
const proposedCount = computed(() => challenges.value.filter((c) => c.status === 'Proposed').length);
const totalParticipants = computed(() =>
  challenges.value.reduce((sum, c) => sum + (c.stats.contributorsCount ?? 0), 0)
);

const progressById = computed(() => new Map(challenges.value.map((c) => [c.id, challengeProgress(c)])));
const progressOf = (ch: Challenge) => progressById.value.get(ch.id) ?? challengeProgress(ch);

const flagshipProgress = computed(() =>
  flagship.value ? progressOf(flagship.value) : { pct: null, kind: 'none' as const }
);

const eloGap = computed(() => {
  const rec = flagship.value?.record;
  if (!rec || rec.currentBestValue === undefined || rec.targetValue === undefined) return null;
  return rec.targetValue - rec.currentBestValue;
});

function badgesForUser(user: UserProfileSummary): AwardedBadge[] {
  return user.isDemo ? DEMO_BADGES_BY_USER[user.githubId] ?? [] : user.badges ?? [];
}

async function loadChallenges() {
  loading.value = true;
  catalogError.value = false;
  try {
    const page = await apiClient.listChallenges(challengeOffset.value);
    const previous = new Set(challenges.value.map(({ id }) => id));
    challenges.value.push(...page.items.filter(({ id }) => !previous.has(id)));
    challengeTotal.value = page.total;
    challengeOffset.value = page.offset + page.items.length;
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
  <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
    <!-- 1. Hero + Direct GitHub Login -->
    <section>
      <div class="font-mono text-xs font-medium uppercase tracking-widest text-accent dark:text-accent-dark">
        {{ t.home.eyebrow }}
      </div>

      <h1
        class="mt-3 whitespace-nowrap font-editorial font-medium leading-[1.15] tracking-tight text-ink dark:text-chalk"
        :class="
          state.locale === 'zh'
            ? 'text-[clamp(1rem,4.5vw,2.55rem)]'
            : 'text-[clamp(0.95rem,4vw,2.55rem)]'
        "
      >
        {{ t.home.headline }}
      </h1>

      <p class="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted dark:text-chalk-muted">
        {{ t.home.lead }}
      </p>

      <div class="mt-6 flex flex-wrap items-center gap-3">
        <button
          v-if="!state.user"
          type="button"
          class="inline-flex items-center gap-2 rounded bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
          @click="signInWithGitHub"
        >
          <Github class="h-4 w-4" />
          <span>{{ t.nav.signIn }}</span>
        </button>

        <RouterLink
          v-if="featured"
          :to="{ name: 'challenge', params: { slug: featured.slug } }"
          class="inline-flex items-center gap-2 rounded border border-border-light bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk dark:hover:border-chalk/40"
        >
          <span>{{ flagship ? t.home.exploreActive : t.home.viewChallenge }}</span>
          <ArrowRight class="h-4 w-4" />
        </RouterLink>
      </div>
    </section>

    <!-- 2. One-Line Agent Join Prompt -->
    <section v-if="featured" class="mt-12">
      <div
        class="rounded-lg border border-border-light bg-surface p-5 sm:p-6 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <Terminal class="h-4 w-4 text-accent dark:text-accent-dark" />
            <h2 class="text-sm font-semibold text-ink dark:text-chalk">
              {{ t.home.joinTitle }}
            </h2>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <a
              :href="featured.joinInstructionsPath"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 font-mono text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
            >
              <FileText class="h-3.5 w-3.5" />
              <span>join.txt</span>
            </a>
          </div>
        </div>

        <div class="mt-3">
          <AgentJoinPrompt :challenge-id="featured.id" :slug="featured.slug" :instructions-path="featured.joinInstructionsPath" />
        </div>

        <p class="mt-2.5 font-mono text-[11.5px] text-ink-faint dark:text-chalk-faint">
          {{ t.home.noKeysNote }}
        </p>
      </div>
    </section>

    <!-- 3. Public Challenges: at-a-glance list of projects, status/progress and participants -->
    <section id="challenges" class="mt-14 scroll-mt-20 space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-ink dark:text-chalk">
            {{ L('Public Challenges', '公共挑战') }}
          </h2>
          <!-- Catalog summary -->
          <div v-if="challenges.length" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span class="summary-chip">
              <LayoutList class="h-4 w-4" />
              {{ L(`${catalogCount} projects`, `共 ${catalogCount} 个项目`) }}
            </span>
            <span v-if="activeCount" class="summary-chip text-accent dark:text-accent-dark">
              <span class="h-2 w-2 rounded-full bg-accent dark:bg-accent-dark" />
              {{ L(`${activeCount} active`, `${activeCount} 个进行中`) }}
            </span>
            <span v-if="proposedCount" class="summary-chip">
              <span class="h-2 w-2 rounded-full bg-sky-500" />
              {{ L(`${proposedCount} in preparation`, `${proposedCount} 个筹备中`) }}
            </span>
            <span class="summary-chip">
              <Users class="h-4 w-4" />
              {{ L(`${totalParticipants} participants`, `${totalParticipants} 人参与`) }}
            </span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <RouterLink to="/live" class="project-link">
            {{ t.nav.live }} →
          </RouterLink>
          <RouterLink v-if="state.dataMode === 'api' && state.user" :to="{ name: 'my-projects' }" class="project-link">
            {{ t.projects.mine }}
          </RouterLink>
          <RouterLink v-if="state.canReviewProjects" :to="{ name: 'review-projects' }" class="project-link">
            {{ t.projects.review }}
          </RouterLink>
          <RouterLink :to="{ name: 'new-project' }" class="project-button">{{ t.projects.newProject }}</RouterLink>
        </div>
      </div>

      <!-- Flagship Challenge Card: Project Grandmaster vs Stockfish 19 -->
      <div
        v-if="flagship"
        class="rounded-lg border border-accent/30 bg-surface p-5 sm:p-6 dark:border-accent-dark/30 dark:bg-obsidian-surface"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 space-y-2">
            <div class="text-sm font-medium text-ink-muted dark:text-chalk-muted">
              {{ t.home.matchupLabel }} · Stockfish 19
            </div>
            <h3 class="text-2xl font-bold tracking-tight">
              <RouterLink
                :to="`/challenges/${flagship.slug}`"
                class="project-title-highlight transition hover:opacity-90 hover:underline"
              >
                {{ challengeName(flagship) }}
              </RouterLink>
            </h3>
            <p class="max-w-2xl text-base leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(flagship.tagline) }}
            </p>
          </div>

          <RouterLink
            :to="`/challenges/${flagship.slug}`"
            class="inline-flex shrink-0 items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 dark:bg-chalk dark:text-obsidian"
          >
            <span>{{ t.home.viewChallenge }}</span>
            <ArrowRight class="h-4 w-4" />
          </RouterLink>
        </div>

        <!-- Three key facts: status · progress · participants -->
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <!-- Status -->
          <div class="metric-tile">
            <div class="metric-label">
              <Activity class="h-4 w-4" />
              <span>{{ L('Status', '状态') }}</span>
            </div>
            <div class="mt-2">
              <StatusPill
                :label="challengeStatus(flagship.status)"
                :tone="statusTone(flagship.status)"
                :mono="false"
                size="md"
              />
            </div>
            <ChallengeStageSteps :status="flagship.status" class="mt-3" />
          </div>

          <!-- Progress -->
          <div class="metric-tile">
            <div class="metric-label">
              <TrendingUp class="h-4 w-4" />
              <span>{{ L('Progress to goal', '目标进度') }}</span>
              <StatusPill v-if="flagship.isDemoStats" label="DEMO" tone="demo" />
            </div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-3xl font-bold tabular-nums text-accent dark:text-accent-dark">
                {{ flagshipProgress.pct ?? 0 }}%
              </span>
              <span class="truncate text-sm font-medium text-ink dark:text-chalk">
                {{ metricDisplay(flagship.record.currentBestDisplay) }}
              </span>
            </div>
            <div class="progress-track mt-2">
              <div class="progress-fill" :style="{ width: `${flagshipProgress.pct ?? 0}%` }" />
            </div>
            <div v-if="eloGap !== null" class="mt-2 text-sm text-ink-muted dark:text-chalk-muted">
              {{ L(`${eloGap} Elo behind Stockfish 19 (~3,650+)`, `距 Stockfish 19（~3,650+）还差 ${eloGap} Elo`) }}
            </div>
          </div>

          <!-- Participants -->
          <div class="metric-tile">
            <div class="metric-label">
              <Users class="h-4 w-4" />
              <span>{{ L('Participants', '参与人数') }}</span>
            </div>
            <div class="mt-1 flex items-baseline gap-1.5">
              <span class="text-3xl font-bold tabular-nums text-ink dark:text-chalk">
                {{ flagship.stats.contributorsCount }}
              </span>
              <span class="text-sm font-medium text-ink-muted dark:text-chalk-muted">{{ L('people', '人') }}</span>
            </div>
            <div class="mt-2 space-y-0.5 text-sm text-ink-muted dark:text-chalk-muted">
              <div>{{ L(`${flagship.stats.activeLeasesCount} agents working now`, `${flagship.stats.activeLeasesCount} 个 Agent 正在执行`) }}</div>
              <div>
                {{ L(`${flagship.stats.openTasksCount} open tasks · ${flagship.stats.verifiedContributionsCount} verified`, `${flagship.stats.openTasksCount} 个待认领 · ${flagship.stats.verifiedContributionsCount} 项已验证`) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Project list: one row per challenge -->
      <div
        v-if="visibleOtherChallenges.length"
        class="overflow-hidden rounded-lg border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface"
      >
        <!-- Column headers (desktop) -->
        <div
          class="hidden border-b border-border-light bg-subtle/60 px-5 py-2.5 text-sm font-medium text-ink-muted sm:grid sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_1rem] sm:gap-6 dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted"
        >
          <span>{{ L('Project', '项目') }}</span>
          <span>{{ L('Status', '状态') }}</span>
          <span>{{ L('Progress', '进度') }}</span>
          <span class="text-right">{{ L('Participants', '参与人数') }}</span>
          <span />
        </div>

        <ul class="divide-y divide-border-light dark:divide-border-dark">
          <li v-for="ch in visibleOtherChallenges" :key="ch.id">
            <RouterLink
              :to="`/challenges/${ch.slug}`"
              class="group grid gap-4 px-5 py-4 transition hover:bg-subtle/50 sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_1rem] sm:items-center sm:gap-6 dark:hover:bg-obsidian-subtle/50"
            >
              <!-- Project -->
              <div class="min-w-0">
                <h3 class="text-base font-semibold text-ink group-hover:text-accent dark:text-chalk dark:group-hover:text-accent-dark">
                  {{ challengeName(ch) }}
                </h3>
                <p class="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
                  {{ loc(ch.tagline) }}
                </p>
                <p class="mt-1 truncate text-sm text-ink dark:text-chalk">
                  <span class="text-ink-muted dark:text-chalk-muted">{{ L('Goal: ', '目标：') }}</span>{{ metricDisplay(ch.record.targetDisplay) }}
                </p>
              </div>

              <!-- Status -->
              <div class="min-w-0">
                <div class="mb-1 text-xs font-medium text-ink-muted sm:hidden dark:text-chalk-muted">{{ L('Status', '状态') }}</div>
                <StatusPill
                  :label="challengeStatus(ch.status)"
                  :tone="statusTone(ch.status)"
                  :mono="false"
                  size="md"
                />
                <ChallengeStageSteps :status="ch.status" class="mt-2.5" />
              </div>

              <!-- Progress -->
              <div class="min-w-0">
                <div class="mb-1 text-xs font-medium text-ink-muted sm:hidden dark:text-chalk-muted">{{ L('Progress', '进度') }}</div>
                <template v-if="progressOf(ch).pct !== null">
                  <div class="flex items-baseline justify-between gap-2 text-sm">
                    <span class="text-lg font-bold tabular-nums text-ink dark:text-chalk">{{ progressOf(ch).pct }}%</span>
                    <span v-if="progressOf(ch).kind === 'tasks'" class="text-ink-muted dark:text-chalk-muted">
                      {{ L(`${progressOf(ch).done}/${progressOf(ch).total} tasks`, `任务 ${progressOf(ch).done}/${progressOf(ch).total}`) }}
                    </span>
                  </div>
                  <div class="progress-track mt-1.5">
                    <div class="progress-fill" :style="{ width: `${progressOf(ch).pct}%` }" />
                  </div>
                </template>
                <div v-else class="text-sm font-medium text-ink-muted dark:text-chalk-muted">
                  {{ L('Not started', '尚未开始') }}
                </div>
                <div class="mt-1.5 text-sm text-ink-muted dark:text-chalk-muted">
                  {{ L(`${ch.stats.openTasksCount} open tasks`, `${ch.stats.openTasksCount} 个待认领任务`) }}
                </div>
              </div>

              <!-- Participants -->
              <div class="flex items-center gap-2 sm:justify-end">
                <span class="text-xs font-medium text-ink-muted sm:hidden dark:text-chalk-muted">{{ L('Participants', '参与人数') }}</span>
                <Users class="hidden h-4 w-4 text-ink-muted sm:block dark:text-chalk-muted" />
                <span class="text-2xl font-bold tabular-nums text-ink dark:text-chalk">{{ ch.stats.contributorsCount }}</span>
                <span class="text-sm text-ink-muted dark:text-chalk-muted">{{ L('', '人') }}</span>
              </div>

              <ArrowRight class="hidden h-4 w-4 shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-accent sm:block dark:text-chalk-muted dark:group-hover:text-accent-dark" />
            </RouterLink>
          </li>
        </ul>
      </div>

      <div v-if="otherChallenges.length > 6" class="text-center">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
          @click="showAllChallenges = !showAllChallenges"
        >
          <span>
            {{
              showAllChallenges
                ? L('Show fewer', '收起候选挑战')
                : L(`Show all ${otherChallenges.length} challenges`, `展开全部 ${otherChallenges.length} 个挑战`)
            }}
          </span>
          <ChevronDown class="h-4 w-4 transition" :class="{ 'rotate-180': showAllChallenges }" />
        </button>
      </div>
      <p v-if="loading" role="status" class="text-sm">{{ t.common.loading }}</p>
      <div v-else-if="catalogError" role="alert" class="flex flex-wrap gap-3 text-sm">
        <p>{{ t.projects.requestError }}</p>
        <button type="button" class="project-link" @click="loadChallenges">{{ t.projects.retry }}</button>
      </div>
      <button v-else-if="showAllChallenges && challengeOffset < challengeTotal" type="button" class="project-link" @click="loadChallenges">
        {{ t.projects.more }}
      </button>
    </section>

    <!-- 4. Contributors Roster -->
    <section class="mt-14 space-y-4">
      <div class="flex items-end justify-between gap-4">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold tracking-tight text-ink dark:text-chalk">
            {{ t.contributors.title }}
          </h2>
          <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
        </div>
        <RouterLink
          to="/contributors"
          class="font-mono text-xs text-accent hover:underline dark:text-accent-dark"
        >
          {{ state.locale === 'zh' ? '查看全部贡献者' : 'All contributors' }} →
        </RouterLink>
      </div>

      <div
        class="divide-y divide-border-light rounded-md border border-border-light bg-surface dark:divide-border-dark dark:border-border-dark dark:bg-obsidian-surface"
      >
        <RouterLink
          v-for="user in contributors"
          :key="user.githubId"
          :to="`/u/${user.username}`"
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-subtle/40 dark:hover:bg-obsidian-subtle/40"
        >
          <div class="flex items-center gap-3">
            <img :src="user.avatarUrl" :alt="user.username" class="h-9 w-9 rounded-md" />
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm font-semibold text-ink dark:text-chalk">
                  @{{ user.username }}
                </span>
                <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  #{{ user.githubId }}
                </span>
              </div>
              <div class="mt-0.5 flex flex-wrap gap-1.5 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                <span v-for="slug in user.challengesJoined" :key="slug">{{ slug }}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1.5">
              <HonorSeal
                v-for="b in badgesForUser(user)"
                :key="b.id"
                :code="b.code"
                :serial-number="b.serialNumber"
                :size="22"
              />
            </div>
            <div class="min-w-[64px] text-right font-mono text-xs">
              <span class="font-semibold text-ink dark:text-chalk">
                {{ user.verifiedContributionsCount }}
              </span>
              <span class="ml-1 text-ink-faint dark:text-chalk-faint">
                {{ state.locale === 'zh' ? '贡献' : 'PRs' }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
