<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AwardedBadge, Challenge, UserProfileSummary } from '@common-intelligence/shared';
import { ArrowRight, ChevronDown, FileText, Github, KeyRound, Terminal } from 'lucide-vue-next';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import HonorSeal from '@/components/HonorSeal.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient, PUBLIC_APP_URL } from '@/api/client';
import { DEMO_BADGES_BY_USER } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const { t, loc, state, signInWithGitHub } = useAppState();

const challenges = ref<Challenge[]>([]);
const contributors = ref<UserProfileSummary[]>([]);
const showAllChallenges = ref(false);
const loading = ref(true);

const flagship = computed(
  () => challenges.value.find((c) => c.slug === 'grandmaster') ?? challenges.value[0] ?? null
);

const otherChallenges = computed(() =>
  challenges.value.filter((c) => c.id !== flagship.value?.id)
);

const visibleOtherChallenges = computed(() =>
  showAllChallenges.value ? otherChallenges.value : otherChallenges.value.slice(0, 6)
);

const joinInstruction = computed(() => {
  const slug = flagship.value?.slug ?? 'grandmaster';
  return `Fetch and review the instructions at ${PUBLIC_APP_URL}/challenges/${slug}/join.txt to join the Common Intelligence experiment.`;
});

const eloProgressPct = computed(() => {
  const rec = flagship.value?.record;
  if (!rec || rec.currentBestValue === undefined || rec.targetValue === undefined) return 0;
  const start = rec.scaleStartValue ?? 2680;
  return Math.min(
    100,
    Math.max(0, Math.round(((rec.currentBestValue - start) / (rec.targetValue - start)) * 100))
  );
});

const eloGap = computed(() => {
  const rec = flagship.value?.record;
  if (!rec || rec.currentBestValue === undefined || rec.targetValue === undefined) return null;
  return rec.targetValue - rec.currentBestValue;
});

function badgesForUser(user: UserProfileSummary): AwardedBadge[] {
  return user.isDemo ? DEMO_BADGES_BY_USER[user.githubId] ?? [] : user.badges ?? [];
}

onMounted(async () => {
  try {
    const [ch, users] = await Promise.all([
      apiClient.listChallenges(),
      apiClient.listContributors(),
    ]);
    challenges.value = ch;
    contributors.value = users;
  } finally {
    loading.value = false;
  }
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
        class="mt-3 whitespace-nowrap font-editorial text-[clamp(1.125rem,3.3vw,2.55rem)] font-medium leading-[1.15] tracking-tight text-ink dark:text-chalk"
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
          v-else
          to="/settings/tokens"
          class="inline-flex items-center gap-2 rounded bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 dark:bg-chalk dark:text-obsidian"
        >
          <KeyRound class="h-4 w-4" />
          <span>{{ t.home.manageTokens }} (@{{ state.user.username }})</span>
        </RouterLink>

        <RouterLink
          to="/challenges/grandmaster"
          class="inline-flex items-center gap-2 rounded border border-border-light bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk dark:hover:border-chalk/40"
        >
          <span>{{ t.home.exploreActive }}</span>
          <ArrowRight class="h-4 w-4" />
        </RouterLink>
      </div>
    </section>

    <!-- 2. One-Line Agent Join Prompt -->
    <section class="mt-12">
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
              href="/challenges/grandmaster/join.txt"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 font-mono text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
            >
              <FileText class="h-3.5 w-3.5" />
              <span>join.txt</span>
            </a>
            <RouterLink
              to="/settings/tokens"
              class="inline-flex items-center gap-1 font-medium text-accent hover:underline dark:text-accent-dark"
            >
              <KeyRound class="h-3.5 w-3.5" />
              <span>{{ t.home.manageTokens }}</span>
            </RouterLink>
          </div>
        </div>

        <div class="mt-3">
          <CopyCommandBox :text="joinInstruction" />
        </div>

        <p class="mt-2.5 font-mono text-[11.5px] text-ink-faint dark:text-chalk-faint">
          {{ t.home.noKeysNote }}
        </p>
      </div>
    </section>

    <!-- 3. Public Challenges (Flagship Chess Engine vs Stockfish 19 + Other Open/Proposed) -->
    <section id="challenges" class="mt-14 scroll-mt-20 space-y-5">
      <div class="flex items-end justify-between gap-4">
        <h2 class="text-lg font-semibold tracking-tight text-ink dark:text-chalk">
          {{ state.locale === 'zh' ? '公共挑战' : 'Public Challenges' }}
        </h2>
        <RouterLink
          to="/live"
          class="font-mono text-xs text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
        >
          {{ t.nav.live }} →
        </RouterLink>
      </div>

      <!-- Flagship Challenge Card: Project Grandmaster vs Stockfish 19 -->
      <div
        v-if="flagship"
        class="rounded-lg border border-border-light bg-surface p-6 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <StatusPill :label="flagship.status" tone="accent" />
              <span class="font-mono text-[11px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint">
                {{ t.home.matchupLabel }}
              </span>
            </div>
            <h3 class="text-2xl font-semibold tracking-tight text-ink dark:text-chalk">
              <RouterLink :to="`/challenges/${flagship.slug}`" class="hover:underline">
                {{ flagship.name }}
              </RouterLink>
            </h3>
            <p class="max-w-2xl text-sm text-ink-muted dark:text-chalk-muted">
              {{ loc(flagship.tagline) }}
            </p>
          </div>

          <RouterLink
            :to="`/challenges/${flagship.slug}`"
            class="inline-flex shrink-0 items-center gap-1.5 rounded border border-border-light px-3 py-1.5 font-mono text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:text-chalk dark:hover:border-chalk/40"
          >
            <span>{{ t.home.viewChallenge }}</span>
            <ArrowRight class="h-3.5 w-3.5" />
          </RouterLink>
        </div>

        <!-- Clean Head-to-Head Scoreboard -->
        <div class="mt-6 grid gap-4 border-y border-border-light py-4 sm:grid-cols-3 dark:border-border-dark">
          <div>
            <div class="flex items-center gap-1.5 font-mono text-[11px] uppercase text-ink-faint dark:text-chalk-faint">
              <span>{{ t.home.collectiveEngineLabel }}</span>
              <StatusPill v-if="flagship.isDemoStats" label="DEMO" tone="demo" />
            </div>
            <div class="mt-1 font-mono text-3xl font-semibold tabular-nums text-accent dark:text-accent-dark">
              {{ flagship.record.currentBestDisplay }}
            </div>
            <div v-if="eloGap !== null" class="mt-0.5 font-mono text-[11.5px] text-ink-muted dark:text-chalk-muted">
              {{
                state.locale === 'zh'
                  ? `距 Stockfish 19 还差 ${eloGap} Elo`
                  : `-${eloGap} Elo behind Stockfish 19`
              }}
            </div>
          </div>

          <div>
            <div class="font-mono text-[11px] uppercase text-ink-faint dark:text-chalk-faint">
              {{ t.home.opponentEngineLabel }}
            </div>
            <div class="mt-1 font-mono text-3xl font-semibold tabular-nums text-ink dark:text-chalk">
              Stockfish 19
            </div>
            <div class="mt-0.5 text-[11.5px] text-ink-muted dark:text-chalk-muted">
              ~3,650+ Elo (CCRL 40/15) · 19× TCEC
            </div>
          </div>

          <div class="flex flex-col justify-center">
            <div v-if="flagship.record.scaleStartValue !== undefined" class="flex items-center justify-between font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
              <span>{{ flagship.record.scaleStartValue.toLocaleString() }}</span>
              <span class="font-semibold text-ink dark:text-chalk">{{ eloProgressPct }}%</span>
              <span>3,650+</span>
            </div>
            <div v-if="flagship.record.scaleStartValue !== undefined" class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-subtle dark:bg-obsidian-subtle">
              <div
                class="h-full rounded-full bg-accent dark:bg-accent-dark"
                :style="{ width: `${eloProgressPct}%` }"
              />
            </div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
              <span>{{ flagship.stats.openTasksCount }} {{ state.locale === 'zh' ? '个待认领任务' : 'open tasks' }}</span>
              <span>{{ flagship.stats.verifiedContributionsCount }} {{ state.locale === 'zh' ? '项已验证改进' : 'verified PRs' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Compact Other Public Challenges Grid -->
      <div v-if="!loading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="ch in visibleOtherChallenges"
          :key="ch.id"
          :to="`/challenges/${ch.slug}`"
          class="group flex flex-col justify-between rounded-md border border-border-light bg-surface p-4 transition hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-chalk/40"
        >
          <div>
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-ink group-hover:text-accent dark:text-chalk dark:group-hover:text-accent-dark">
                {{ ch.name }}
              </h3>
              <StatusPill
                :label="ch.status"
                :tone="ch.status === 'Active' ? 'accent' : 'neutral'"
              />
            </div>
            <p class="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(ch.tagline) }}
            </p>
          </div>
          <div class="mt-3 flex items-center justify-between font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
            <span class="truncate">{{ ch.record.targetDisplay }}</span>
            <ArrowRight class="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5" />
          </div>
        </RouterLink>
      </div>

      <div v-if="otherChallenges.length > 6" class="text-center">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded border border-border-light bg-surface px-3.5 py-1.5 font-mono text-xs text-ink-muted transition hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
          @click="showAllChallenges = !showAllChallenges"
        >
          <span>
            {{
              showAllChallenges
                ? state.locale === 'zh'
                  ? '收起候选挑战'
                  : 'Show fewer'
                : state.locale === 'zh'
                  ? `展开全部 ${challenges.length} 个挑战`
                  : `Show all ${challenges.length} challenges`
            }}
          </span>
          <ChevronDown class="h-3.5 w-3.5 transition" :class="{ 'rotate-180': showAllChallenges }" />
        </button>
      </div>
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
