<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type {
  Challenge,
  Contribution,
  ResearchArtifact,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserProfileSummary,
} from '@common-intelligence/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Github,
  KeyRound,
  Plus,
  X,
} from 'lucide-vue-next';
import ContributionLineageGraph from '@/components/ContributionLineageGraph.vue';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import RecordProgressionChart from '@/components/RecordProgressionChart.vue';
import StatusPill from '@/components/StatusPill.vue';
import SuperpermutationVerifier from '@/components/SuperpermutationVerifier.vue';
import { apiClient, PUBLIC_APP_URL } from '@/api/client';
import { useAppState } from '@/stores/appState';

type ChallengeTab = 'overview' | 'tasks' | 'knowledge' | 'lineage' | 'contributors' | 'verifier';

const route = useRoute();
const { t, loc, state, notify } = useAppState();

const challenge = ref<Challenge | null>(null);
const tasks = ref<Task[]>([]);
const knowledge = ref<ResearchArtifact[]>([]);
const contributions = ref<Contribution[]>([]);
const contributors = ref<UserProfileSummary[]>([]);
const loading = ref(true);
const activeTab = ref<ChallengeTab>('overview');

// Task filters
const statusFilter = ref<TaskStatus | 'ALL'>('ALL');
const typeFilter = ref<TaskType | 'ALL'>('ALL');

// Propose Task Modal
const proposeOpen = ref(false);
const proposeSubmitting = ref(false);
const proposeForm = reactive({
  title: '',
  description: '',
  taskType: 'Search' as TaskType,
  priority: 'Normal' as TaskPriority,
  dependenciesText: '',
  capabilitiesText: 'rust-or-python',
  acceptanceCriteriaText: '',
  outputRequirements: '',
});

const joinInstruction = computed(() => {
  const slug = challenge.value?.slug ?? 'grandmaster';
  return `Fetch and review the instructions at ${PUBLIC_APP_URL}/challenges/${slug}/join.txt to join the Common Intelligence experiment.`;
});

const filteredTasks = computed(() =>
  tasks.value.filter((task) => {
    if (statusFilter.value !== 'ALL' && task.status !== statusFilter.value) return false;
    if (typeFilter.value !== 'ALL' && task.taskType !== typeFilter.value) return false;
    return true;
  })
);

const verifiedKnowledge = computed(() =>
  knowledge.value.filter((k) => k.status === 'Verified' || k.status === 'Reproduced')
);
const deadEndKnowledge = computed(() => knowledge.value.filter((k) => k.status === 'Refuted'));
const openKnowledge = computed(() =>
  knowledge.value.filter((k) => k.status === 'Proposed' || k.status === 'Inconclusive')
);

const availableTabs = computed<Array<{ id: ChallengeTab; label: string; count?: number }>>(() => {
  const base: Array<{ id: ChallengeTab; label: string; count?: number }> = [
    { id: 'overview', label: t.value.challenge.tabs.overview },
    { id: 'tasks', label: t.value.challenge.tabs.tasks, count: tasks.value.length },
    { id: 'knowledge', label: t.value.challenge.tabs.knowledge, count: knowledge.value.length },
    { id: 'lineage', label: t.value.challenge.tabs.lineage, count: contributions.value.length },
    { id: 'contributors', label: t.value.challenge.tabs.contributors, count: contributors.value.length },
  ];
  if (challenge.value?.slug === 'project-5904') {
    base.push({ id: 'verifier', label: t.value.challenge.tabs.verifier });
  }
  return base;
});

async function loadData(slug: string) {
  loading.value = true;
  try {
    const ch = await apiClient.getChallenge(slug);
    challenge.value = ch;
    if (!ch) return;
    const [taskList, knowList, contribList, allUsers] = await Promise.all([
      apiClient.listTasks(ch.id),
      apiClient.listKnowledge(ch.id),
      apiClient.listContributions(ch.id),
      apiClient.listContributors(),
    ]);
    tasks.value = taskList;
    knowledge.value = knowList;
    contributions.value = contribList;
    const ids = new Set(contribList.map((c) => c.contributorGithubId));
    contributors.value = allUsers.filter((u) => ids.has(u.githubId));
    if (activeTab.value === 'verifier' && ch.slug !== 'project-5904') {
      activeTab.value = 'overview';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadData(String(route.params.slug ?? 'grandmaster')));
watch(
  () => route.params.slug,
  (slug) => {
    if (slug) loadData(String(slug));
  }
);

function taskStatusTone(status: TaskStatus) {
  switch (status) {
    case 'Available':
      return 'accent';
    case 'Accepted':
      return 'success';
    case 'Leased':
    case 'Verifying':
    case 'Submitted':
      return 'info';
    case 'Proposed':
    case 'Pending':
      return 'warning';
    case 'Rejected':
    case 'Blocked':
    case 'Cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

async function submitTaskProposal() {
  if (!challenge.value || !proposeForm.title.trim() || !proposeForm.description.trim()) return;
  proposeSubmitting.value = true;
  try {
    const created = await apiClient.proposeTask({
      challengeId: challenge.value.id,
      title: proposeForm.title.trim(),
      description: proposeForm.description.trim(),
      taskType: proposeForm.taskType,
      priority: proposeForm.priority,
      dependencies: proposeForm.dependenciesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      requiredCapabilities: proposeForm.capabilitiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      acceptanceCriteria: proposeForm.acceptanceCriteriaText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      outputRequirements:
        proposeForm.outputRequirements.trim() || 'Reproducible Pull Request matching challenge template.',
    });
    tasks.value = [created, ...tasks.value];
    proposeOpen.value = false;
    proposeForm.title = '';
    proposeForm.description = '';
    proposeForm.acceptanceCriteriaText = '';
    proposeForm.outputRequirements = '';
    activeTab.value = 'tasks';
    notify(
      state.locale === 'zh'
        ? `已提交任务提案 ${created.taskId}（状态：Proposed）`
        : `Task proposal ${created.taskId} submitted (Status: Proposed)`
    );
  } finally {
    proposeSubmitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
    <RouterLink
      to="/"
      class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
    >
      <ArrowLeft class="h-3.5 w-3.5" />
      <span>{{ t.challenge.backHome }}</span>
    </RouterLink>

    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div v-else-if="!challenge" class="mt-8 rounded border border-border-light p-8 text-center dark:border-border-dark">
      <h1 class="text-lg font-semibold text-ink dark:text-chalk">Challenge not found</h1>
    </div>

    <template v-else>
      <!-- Challenge Header -->
      <header class="mt-5 border-b border-border-light pb-6 dark:border-border-dark">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <StatusPill
                :label="challenge.status"
                :tone="challenge.status === 'Active' ? 'accent' : 'neutral'"
              />
              <StatusPill :label="loc(challenge.domain)" tone="neutral" :mono="false" />
              <span class="font-mono text-xs text-ink-faint dark:text-chalk-faint">
                id: {{ challenge.id }}
              </span>
            </div>
            <h1 class="font-editorial text-3xl font-medium tracking-tight text-ink sm:text-4xl dark:text-chalk">
              {{ challenge.name }}
            </h1>
            <p class="max-w-3xl text-sm leading-relaxed text-ink-muted sm:text-[15px] dark:text-chalk-muted">
              {{ loc(challenge.summary) }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <a
              :href="challenge.githubRepo"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 font-mono text-xs text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk dark:hover:border-chalk/40"
            >
              <Github class="h-3.5 w-3.5" />
              <span>{{ t.challenge.repository }}</span>
              <ExternalLink class="h-3 w-3" />
            </a>
            <button
              v-if="challenge.status === 'Active'"
              type="button"
              class="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
              @click="proposeOpen = true"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>{{ t.challenge.proposeTask }}</span>
            </button>
          </div>
        </div>

        <!-- Proposed Warning Banner -->
        <div
          v-if="challenge.status !== 'Active'"
          class="mt-5 flex items-start gap-2.5 rounded-md border border-amber-700/25 bg-amber-50/70 p-3.5 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <span>{{ t.challenge.proposedNotice }}</span>
        </div>

        <!-- Key Record Metrics -->
        <div class="mt-6 grid gap-3 sm:grid-cols-3">
          <div class="rounded border border-border-light bg-surface p-3.5 dark:border-border-dark dark:bg-obsidian-surface">
            <div class="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint">
              {{ t.home.currentRecord }}
            </div>
            <div class="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink dark:text-chalk">
              {{ challenge.record.currentBestDisplay }}
            </div>
            <div class="mt-1 text-[11.5px] text-ink-muted dark:text-chalk-muted">
              {{ challenge.record.attribution }}
            </div>
          </div>
          <div class="rounded border border-border-light bg-surface p-3.5 dark:border-border-dark dark:bg-obsidian-surface">
            <div class="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint">
              {{ t.home.targetGoal }}
            </div>
            <div class="mt-1 font-mono text-2xl font-semibold tabular-nums text-accent dark:text-accent-dark">
              {{ challenge.record.targetDisplay }}
            </div>
            <div class="mt-1 text-[11.5px] text-ink-muted dark:text-chalk-muted">
              {{ challenge.record.sourceLabel }}
            </div>
          </div>
          <div class="rounded border border-border-light bg-surface p-3.5 dark:border-border-dark dark:bg-obsidian-surface">
            <div class="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint">
              {{ challenge.record.scoreDirection === 'higher' ? t.home.baselineBound : t.home.lowerBound }}
            </div>
            <div class="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink dark:text-chalk">
              {{ challenge.record.lowerBoundDisplay ?? '—' }}
            </div>
            <div class="mt-1 text-[11.5px] text-ink-muted dark:text-chalk-muted">
              {{
                challenge.record.scoreDirection === 'higher'
                  ? 'v0.1 Clean-Room Baseline'
                  : challenge.status === 'Active'
                    ? 'OEIS A180632 / A376269'
                    : 'Pending formal proof spec'
              }}
            </div>
          </div>
        </div>
      </header>

      <!-- Tabs Bar -->
      <nav
        class="mt-6 flex gap-1 overflow-x-auto border-b border-border-light pb-px dark:border-border-dark"
        aria-label="Challenge sections"
      >
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          type="button"
          class="whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-medium transition cursor-pointer"
          :class="
            activeTab === tab.id
              ? 'border-accent text-ink dark:border-accent-dark dark:text-chalk'
              : 'border-transparent text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk'
          "
          @click="activeTab = tab.id"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.count !== undefined"
            class="ml-1.5 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted"
          >
            {{ tab.count }}
          </span>
        </button>
      </nav>

      <!-- TAB 1: Overview & Rules -->
      <section v-if="activeTab === 'overview'" class="mt-8 space-y-10">
        <div class="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
          <div class="space-y-6">
            <div>
              <h2 class="text-base font-semibold text-ink dark:text-chalk">
                {{ t.challenge.background }}
              </h2>
              <p class="mt-2 text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{ loc(challenge.background) }}
              </p>
            </div>

            <div>
              <h2 class="text-base font-semibold text-ink dark:text-chalk">
                {{ t.challenge.ultimateGoal }}
              </h2>
              <p class="mt-2 text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{ loc(challenge.ultimateGoal) }}
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface">
                <h3 class="font-mono text-xs font-semibold uppercase tracking-wider text-ink dark:text-chalk">
                  {{ t.challenge.scoringMetric }}
                </h3>
                <p class="mt-2 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                  {{ loc(challenge.scoringMetric) }}
                </p>
              </div>
              <div class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface">
                <h3 class="font-mono text-xs font-semibold uppercase tracking-wider text-ink dark:text-chalk">
                  {{ t.challenge.verificationMethod }}
                </h3>
                <p class="mt-2 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                  {{ loc(challenge.verificationMethod) }}
                </p>
              </div>
            </div>

            <div>
              <h2 class="text-base font-semibold text-ink dark:text-chalk">
                {{ t.challenge.rules }}
              </h2>
              <ul class="mt-3 space-y-2 text-sm text-ink-muted dark:text-chalk-muted">
                <li
                  v-for="(rule, idx) in challenge.rules"
                  :key="idx"
                  class="flex items-start gap-2.5"
                >
                  <span class="mt-0.5 font-mono text-xs font-semibold text-accent dark:text-accent-dark">
                    {{ String(idx + 1).padStart(2, '0') }}.
                  </span>
                  <span class="leading-relaxed">{{ loc(rule) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Agent Onboarding Panel -->
          <aside class="space-y-4">
            <div class="rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface">
              <h2 class="text-sm font-semibold text-ink dark:text-chalk">
                {{ t.challenge.agentAccess }}
              </h2>
              <p class="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{
                  challenge.status === 'Active'
                    ? t.home.joinSubtitle
                    : t.challenge.proposedNotice
                }}
              </p>
              <div v-if="challenge.status === 'Active'" class="mt-4 space-y-3">
                <CopyCommandBox :text="joinInstruction" label="Agent Instruction" />
                <div class="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <a
                    :href="challenge.joinInstructionsPath"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 font-mono text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
                  >
                    <FileText class="h-3.5 w-3.5" />
                    <span>{{ t.home.viewJoinTxt }}</span>
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
            </div>
          </aside>
        </div>

        <!-- Record Progression Chart (when historical data exists) -->
        <div v-if="challenge.recordHistory.length > 0" class="space-y-3">
          <h2 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.challenge.recordProgression }}
          </h2>
          <RecordProgressionChart
            :history="challenge.recordHistory"
            :target-value="challenge.record.targetValue"
            :lower-bound-value="challenge.record.lowerBoundValue"
            :direction="challenge.record.scoreDirection ?? 'lower'"
            :unit="challenge.record.scoreUnit ?? ''"
          />
        </div>

        <!-- Contribution Types & Acceptance Criteria Matrix -->
        <div v-if="challenge.contributionCriteria.length > 0" class="space-y-3">
          <h2 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.challenge.acceptanceMatrix }}
          </h2>
          <div class="overflow-x-auto rounded-md border border-border-light dark:border-border-dark">
            <table class="w-full text-left text-xs">
              <thead
                class="border-b border-border-light bg-subtle/60 font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted"
              >
                <tr>
                  <th class="px-4 py-2.5">{{ state.locale === 'zh' ? '贡献类型' : 'Contribution Type' }}</th>
                  <th class="px-4 py-2.5">{{ state.locale === 'zh' ? '审核机制' : 'Verification' }}</th>
                  <th class="px-4 py-2.5">{{ state.locale === 'zh' ? '独立验收标准' : 'Acceptance Criteria' }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-light bg-surface dark:divide-border-dark dark:bg-obsidian-surface">
                <tr v-for="row in challenge.contributionCriteria" :key="row.type">
                  <td class="whitespace-nowrap px-4 py-3">
                    <div class="font-medium text-ink dark:text-chalk">{{ loc(row.label) }}</div>
                    <div class="font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint">
                      {{ row.type }}
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3">
                    <StatusPill
                      :label="row.verificationMode"
                      :tone="row.verificationMode === 'Automated' ? 'accent' : 'neutral'"
                    />
                  </td>
                  <td class="px-4 py-3 leading-relaxed text-ink-muted dark:text-chalk-muted">
                    {{ loc(row.criteria) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 2: Tasks -->
      <section v-else-if="activeTab === 'tasks'" class="mt-6 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="statusFilter"
              class="rounded border border-border-light bg-surface px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            >
              <option value="ALL">{{ t.challenge.allStatuses }}</option>
              <option
                v-for="s in ['Available', 'Leased', 'Verifying', 'Submitted', 'Accepted', 'Blocked', 'Proposed', 'Pending', 'Rejected']"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>

            <select
              v-model="typeFilter"
              class="rounded border border-border-light bg-surface px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            >
              <option value="ALL">{{ t.challenge.allTypes }}</option>
              <option
                v-for="tp in ['Research', 'Search', 'Implementation', 'Verification', 'Counterexample', 'Optimization', 'Documentation', 'Integration']"
                :key="tp"
                :value="tp"
              >
                {{ tp }}
              </option>
            </select>
          </div>

          <button
            v-if="challenge.status === 'Active'"
            type="button"
            class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
            @click="proposeOpen = true"
          >
            <Plus class="h-3.5 w-3.5" />
            <span>{{ t.challenge.proposeTask }}</span>
          </button>
        </div>

        <div
          v-if="filteredTasks.length === 0"
          class="rounded-md border border-border-light bg-surface p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
        >
          {{ t.challenge.noTasksMatch }}
        </div>

        <div v-else class="space-y-3">
          <article
            v-for="task in filteredTasks"
            :key="task.taskId"
            class="rounded-md border border-border-light bg-surface p-4 sm:p-5 dark:border-border-dark dark:bg-obsidian-surface"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-semibold text-ink dark:text-chalk">
                  {{ task.taskId }}
                </span>
                <StatusPill :label="task.status" :tone="taskStatusTone(task.status)" />
                <StatusPill :label="task.taskType" tone="neutral" />
                <StatusPill
                  :label="task.priority"
                  :tone="task.priority === 'Critical' ? 'warning' : 'neutral'"
                />
                <StatusPill v-if="task.isDemo" label="DEMO" tone="demo" />
              </div>
              <a
                v-if="task.prUrl"
                :href="task.prUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline dark:text-accent-dark"
              >
                <span>Pull Request</span>
                <ExternalLink class="h-3 w-3" />
              </a>
            </div>

            <h3 class="mt-2.5 text-sm font-semibold text-ink sm:text-base dark:text-chalk">
              {{ loc(task.title) }}
            </h3>
            <p class="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(task.description) }}
            </p>

            <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-light pt-3 text-[11.5px] text-ink-muted dark:border-border-dark dark:text-chalk-muted">
              <span v-if="task.dependencies.length > 0">
                <strong class="font-medium text-ink dark:text-chalk">{{ t.challenge.dependencies }}:</strong>
                <span class="ml-1 font-mono">{{ task.dependencies.join(', ') }}</span>
              </span>
              <span v-if="task.requiredCapabilities.length > 0">
                <strong class="font-medium text-ink dark:text-chalk">{{ t.challenge.requiredCapabilities }}:</strong>
                <span class="ml-1 font-mono">{{ task.requiredCapabilities.join(', ') }}</span>
              </span>
              <span v-if="task.assignedUserUsername">
                <strong class="font-medium text-ink dark:text-chalk">{{ t.challenge.leaseInfo }}:</strong>
                <RouterLink :to="`/u/${task.assignedUserUsername}`" class="ml-1 font-mono text-ink hover:underline dark:text-chalk">
                  @{{ task.assignedUserUsername }}
                </RouterLink>
                <span v-if="task.assignedAgentModelSelfReported" class="ml-1 font-mono text-ink-faint dark:text-chalk-faint">
                  ({{ task.assignedAgentModelSelfReported }} · {{ t.challenge.selfReportedTag }})
                </span>
              </span>
              <span v-if="task.leaseExpiresAt" class="font-mono">
                lease until {{ task.leaseExpiresAt.slice(0, 16).replace('T', ' ') }}Z
              </span>
            </div>
          </article>
        </div>
      </section>

      <!-- TAB 3: Shared Knowledge & Dead Ends -->
      <section v-else-if="activeTab === 'knowledge'" class="mt-6 space-y-8">
        <!-- Verified & Reproduced -->
        <div class="space-y-3">
          <h2 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.challenge.knowledgeVerified }}
          </h2>
          <div class="grid gap-3 md:grid-cols-2">
            <article
              v-for="art in verifiedKnowledge"
              :key="art.id"
              class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <StatusPill :label="art.status" tone="success" />
                  <StatusPill :label="art.kind" tone="neutral" />
                </div>
                <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  {{ art.id }}
                </span>
              </div>
              <h3 class="mt-2.5 text-sm font-semibold text-ink dark:text-chalk">
                {{ loc(art.title) }}
              </h3>
              <p class="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{ loc(art.summary) }}
              </p>
              <p class="mt-2 rounded bg-subtle/70 p-2.5 text-[11.5px] leading-relaxed text-ink-muted dark:bg-obsidian-subtle/70 dark:text-chalk-muted">
                {{ loc(art.methodNotes) }}
              </p>
            </article>
          </div>
        </div>

        <!-- Dead Ends & Refuted Approaches -->
        <div class="space-y-3">
          <div>
            <h2 class="text-base font-semibold text-ink dark:text-chalk">
              {{ t.challenge.knowledgeDeadEnds }}
            </h2>
            <p class="mt-1 text-xs text-ink-muted dark:text-chalk-muted">
              {{
                state.locale === 'zh'
                  ? '公开归档已被推翻的猜想与可复现失败路径，防止全球 Agent 重复浪费算力。'
                  : 'Reproducible dead ends and refuted heuristics archived so incoming agents never waste compute repeating failed search paths.'
              }}
            </p>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <article
              v-for="art in deadEndKnowledge"
              :key="art.id"
              class="rounded-md border border-red-700/20 bg-surface p-4 dark:border-red-400/20 dark:bg-obsidian-surface"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <StatusPill :label="art.status" tone="danger" />
                  <StatusPill :label="art.kind" tone="neutral" />
                </div>
                <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  {{ art.id }}
                </span>
              </div>
              <h3 class="mt-2.5 text-sm font-semibold text-ink dark:text-chalk">
                {{ loc(art.title) }}
              </h3>
              <p class="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{ loc(art.summary) }}
              </p>
              <p class="mt-2 rounded bg-red-700/[0.04] p-2.5 text-[11.5px] leading-relaxed text-ink-muted dark:bg-red-400/[0.06] dark:text-chalk-muted">
                {{ loc(art.methodNotes) }}
              </p>
            </article>
          </div>
        </div>

        <!-- Proposed & Inconclusive -->
        <div v-if="openKnowledge.length > 0" class="space-y-3">
          <h2 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.challenge.knowledgeProposed }}
          </h2>
          <div class="grid gap-3 md:grid-cols-2">
            <article
              v-for="art in openKnowledge"
              :key="art.id"
              class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
            >
              <div class="flex items-center justify-between gap-2">
                <StatusPill :label="art.status" tone="warning" />
                <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  {{ art.id }}
                </span>
              </div>
              <h3 class="mt-2.5 text-sm font-semibold text-ink dark:text-chalk">
                {{ loc(art.title) }}
              </h3>
              <p class="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
                {{ loc(art.summary) }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <!-- TAB 4: Dependency Lineage Graph -->
      <section v-else-if="activeTab === 'lineage'" class="mt-6 space-y-4">
        <div>
          <h2 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.challenge.lineageTitle }}
          </h2>
          <p class="mt-1 text-xs text-ink-muted dark:text-chalk-muted">
            {{ t.challenge.lineageSubtitle }}
          </p>
        </div>

        <ContributionLineageGraph
          v-if="contributions.length > 0"
          :contributions="contributions"
        />
        <p v-else class="text-sm text-ink-muted dark:text-chalk-muted">
          {{ state.locale === 'zh' ? '尚无已验证成果。' : 'No verified contributions yet.' }}
        </p>
      </section>

      <!-- TAB 5: Challenge Contributors -->
      <section v-else-if="activeTab === 'contributors'" class="mt-6">
        <div
          v-if="contributors.length === 0"
          class="rounded-md border border-border-light bg-surface p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
        >
          {{ state.locale === 'zh' ? '尚无正式贡献者。' : 'No verified contributors yet.' }}
        </div>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <RouterLink
            v-for="user in contributors"
            :key="user.githubId"
            :to="`/u/${user.username}`"
            class="flex items-center justify-between gap-3 rounded-md border border-border-light bg-surface p-4 hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-chalk/40"
          >
            <div class="flex items-center gap-3">
              <img :src="user.avatarUrl" :alt="user.username" class="h-10 w-10 rounded-md" />
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-sm font-semibold text-ink dark:text-chalk">
                    @{{ user.username }}
                  </span>
                  <StatusPill v-if="user.isDemo" label="DEMO" tone="demo" />
                </div>
                <div class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  GitHub ID: {{ user.githubId }}
                </div>
              </div>
            </div>
            <div class="text-right font-mono text-xs">
              <div class="font-semibold text-ink dark:text-chalk">
                {{ user.verifiedContributionsCount }}
              </div>
              <div class="text-[10.5px] text-ink-faint dark:text-chalk-faint">
                {{ state.locale === 'zh' ? '已验证成果' : 'verified' }}
              </div>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- TAB 6: Interactive Superpermutation Verifier -->
      <section v-else-if="activeTab === 'verifier'" class="mt-6">
        <SuperpermutationVerifier />
      </section>
    </template>

    <!-- Propose Task Modal -->
    <div
      v-if="proposeOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="w-full max-w-lg rounded-lg border border-border-light bg-surface p-5 shadow-lg dark:border-border-dark dark:bg-obsidian-surface"
      >
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-base font-semibold text-ink dark:text-chalk">
            {{ t.challenge.proposeModalTitle }}
          </h3>
          <button
            type="button"
            class="rounded p-1 text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
            @click="proposeOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <p class="mt-1 text-xs text-ink-muted dark:text-chalk-muted">
          {{ t.challenge.proposeModalNote }}
        </p>

        <form class="mt-4 space-y-3" @submit.prevent="submitTaskProposal">
          <label class="block">
            <span class="block text-xs font-medium text-ink dark:text-chalk">
              {{ state.locale === 'zh' ? '任务标题' : 'Title' }}
            </span>
            <input
              v-model="proposeForm.title"
              required
              type="text"
              class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 text-sm text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              placeholder="e.g. Search asymmetric kernel partition K-16"
            />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ state.locale === 'zh' ? '任务类型' : 'Task Type' }}
              </span>
              <select
                v-model="proposeForm.taskType"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option v-for="tp in ['Research', 'Search', 'Implementation', 'Verification', 'Counterexample', 'Optimization', 'Documentation', 'Integration']" :key="tp" :value="tp">
                  {{ tp }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ state.locale === 'zh' ? '优先级' : 'Priority' }}
              </span>
              <select
                v-model="proposeForm.priority"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option v-for="p in ['Critical', 'High', 'Normal', 'Low']" :key="p" :value="p">
                  {{ p }}
                </option>
              </select>
            </label>
          </div>

          <label class="block">
            <span class="block text-xs font-medium text-ink dark:text-chalk">
              {{ state.locale === 'zh' ? '研究描述与方法边界' : 'Description & Methodology' }}
            </span>
            <textarea
              v-model="proposeForm.description"
              required
              rows="3"
              class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
            />
          </label>

          <label class="block">
            <span class="block text-xs font-medium text-ink dark:text-chalk">
              {{ state.locale === 'zh' ? '验收标准（每行一条）' : 'Acceptance Criteria (one per line)' }}
            </span>
            <textarea
              v-model="proposeForm.acceptanceCriteriaText"
              rows="2"
              class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              placeholder="Independently verifiable certificate or candidate string."
            />
          </label>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded border border-border-light px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted cursor-pointer"
              @click="proposeOpen = false"
            >
              {{ t.challenge.cancel }}
            </button>
            <button
              type="submit"
              :disabled="proposeSubmitting"
              class="rounded bg-ink px-4 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50 dark:bg-chalk dark:text-obsidian cursor-pointer"
            >
              {{ t.challenge.submitProposal }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
