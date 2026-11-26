<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  DEFAULT_PROJECT_CATEGORIES,
  getRaidClass,
  inferTaskSupportedModes,
  type Challenge,
  type Contribution,
  type ProjectCategory,
  type ResearchArtifact,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
  type UserProfileSummary,
} from '@common-intelligence/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Github,
  Plus,
  Sparkles,
  Terminal,
  X,
} from 'lucide-vue-next';
import AgentJoinPrompt from '@/components/AgentJoinPrompt.vue';
import ProjectShowcasePanel from '@/components/ProjectShowcasePanel.vue';
import StatusPill from '@/components/StatusPill.vue';
import TaskPoolVisualizer from '@/components/TaskPoolVisualizer.vue';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

type ChallengeTab = 'overview' | 'tasks' | 'knowledge' | 'contributors';

const route = useRoute();
const { t, loc, challengeName, challengeStatus, state, notify } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const challenge = ref<Challenge | null>(null);
const categories = ref<ProjectCategory[]>([...DEFAULT_PROJECT_CATEGORIES]);
const tasks = ref<Task[]>([]);

const challengeCategoryLabel = computed(() => {
  const ch = challenge.value;
  if (!ch) return '';
  const catId = ch.category || (ch.slug === 'shared-canvas' ? 'playground' : 'challenge');
  const found = categories.value.find((c) => c.id === catId);
  if (found) return loc(found.name);
  if (catId === 'playground') return L('Playground', '游乐场');
  if (catId === 'challenge') return L('Crowd-Agent Challenge', '众筹 Agent 挑战');
  return catId;
});
const knowledge = ref<ResearchArtifact[]>([]);
const contributions = ref<Contribution[]>([]);
const contributors = ref<UserProfileSummary[]>([]);
const loading = ref(true);
const activeTab = ref<ChallengeTab>('overview');
const agentAccess = ref<HTMLElement | null>(null);

async function focusAgentAccess() {
  await nextTick();
  agentAccess.value?.focus({ preventScroll: true });
  agentAccess.value?.scrollIntoView({ block: 'start' });
}

const taskViewMode = ref<'list' | 'visual'>('list');

// Add Open Quest Modal (direct into Available!)
const proposeOpen = ref(false);
const proposeSubmitting = ref(false);
const proposeForm = reactive({
  title: '',
  description: '',
  taskType: 'Implementation' as TaskType,
  priority: 'Normal' as TaskPriority,
});

function taskStatusLabel(status: TaskStatus): string {
  if (state.locale !== 'zh') return status === 'Available' ? 'Open' : status;
  const map: Record<TaskStatus, string> = {
    Available: '可认领',
    Pending: '待解锁',
    Proposed: '提案中',
    Leased: '进行中',
    Submitted: '已提交',
    Verifying: '验证中',
    Accepted: '已完成',
    Rejected: '已关闭',
    Blocked: '阻塞',
    Cancelled: '已取消',
  };
  return map[status] ?? status;
}

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

const availableTabs = computed<Array<{ id: ChallengeTab; label: string; count?: number }>>(() => [
  { id: 'overview', label: t.value.challenge.tabs.overview },
  { id: 'tasks', label: t.value.challenge.tabs.tasks, count: tasks.value.length },
  { id: 'knowledge', label: t.value.challenge.tabs.knowledge, count: knowledge.value.length },
  { id: 'contributors', label: t.value.challenge.tabs.contributors, count: contributors.value.length },
]);

async function loadData(slug: string, silent = false) {
  if (!silent) loading.value = true;
  try {
    const ch = await apiClient.getChallenge(slug);
    challenge.value = ch;
    if (!ch) return;
    const [taskList, knowList, contribList, allUsers, catList] = await Promise.all([
      apiClient.listTasks(ch.id),
      apiClient.listKnowledge(ch.id),
      apiClient.listContributions(ch.id),
      apiClient.listContributors(),
      apiClient.listCategories().catch(() => [...DEFAULT_PROJECT_CATEGORIES]),
    ]);
    tasks.value = taskList;
    knowledge.value = knowList;
    contributions.value = contribList;
    if (catList.length > 0) categories.value = catList;
    const ids = new Set(contribList.map((c) => c.contributorGithubId));
    contributors.value = allUsers.filter((u) => ids.has(u.githubId) || u.challengesJoined.includes(ch.slug));
  } finally {
    if (!silent) {
      loading.value = false;
      if (route.hash === '#agent-access' && challenge.value?.status === 'Active') void focusAgentAccess();
    }
  }
}

onMounted(() => loadData(String(route.params.slug ?? 'grandmaster')));
watch(
  () => route.params.slug,
  (slug) => {
    if (slug) loadData(String(slug));
  }
);

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
    });
    tasks.value = [created, ...tasks.value];
    proposeOpen.value = false;
    proposeForm.title = '';
    proposeForm.description = '';
    activeTab.value = 'tasks';
    notify(L(`Quest ${created.taskId} is now live!`, `新任务 ${created.taskId} 已直接开放！`));
  } finally {
    proposeSubmitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
    <RouterLink
      to="/"
      class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
    >
      <ArrowLeft class="h-3.5 w-3.5" />
      <span>{{ t.challenge.backHome }}</span>
    </RouterLink>

    <div v-if="loading" class="mt-8 text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div v-else-if="!challenge" class="mt-8 rounded-2xl border border-border-light p-8 text-center dark:border-border-dark">
      <h1 class="font-display text-lg font-bold text-ink dark:text-chalk">Playground not found</h1>
    </div>

    <template v-else>
      <!-- Compact Header -->
      <header class="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <StatusPill :label="challengeCategoryLabel" tone="info" :mono="false" />
            <StatusPill :label="challengeStatus(challenge.status)" tone="accent" :mono="false" />
            <StatusPill :label="loc(challenge.domain)" tone="neutral" :mono="false" />
            <StatusPill v-if="challenge.isDemoStats" label="DEMO" tone="demo" />
          </div>
          <h1 class="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl dark:text-chalk">
            {{ challengeName(challenge) }}
          </h1>
          <p class="max-w-3xl text-base text-ink-muted dark:text-chalk-muted">
            {{ loc(challenge.tagline) }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <a
            :href="challenge.githubRepo"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-2 font-mono text-xs font-medium text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
          >
            <Github class="h-3.5 w-3.5" />
            <span>{{ t.challenge.repository }}</span>
            <ExternalLink class="h-3 w-3" />
          </a>
          <button
            v-if="challenge.status === 'Active'"
            type="button"
            class="project-button cursor-pointer"
            @click="proposeOpen = true"
          >
            <Plus class="h-4 w-4" />
            <span>{{ t.challenge.proposeTask }}</span>
          </button>
        </div>
      </header>

      <!-- Prominent Top Spotlight: 1-Click Copy Prompt / Send Your AI Bar FIRST -->
      <section
        v-if="challenge.status === 'Active'"
        ref="agentAccess"
        id="agent-access"
        data-spotlight-prompt
        tabindex="-1"
        class="mt-5 scroll-mt-20 rounded-2xl border-2 border-accent/55 bg-gradient-to-br from-accent/[0.09] via-surface to-surface p-5 shadow-md ring-1 ring-accent/20 sm:p-6 dark:border-accent-dark/55 dark:from-accent-dark/[0.14] dark:via-obsidian-surface dark:to-obsidian-surface dark:ring-accent-dark/20"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent dark:bg-accent-dark/20 dark:text-accent-dark">
              <Terminal class="h-4 w-4" />
            </div>
            <h2 class="font-display text-base font-bold text-ink sm:text-lg dark:text-chalk">
              {{ t.challenge.agentAccess }}
            </h2>
          </div>
          <a
            :href="challenge.joinInstructionsPath"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface px-2.5 py-1 font-mono text-xs text-ink-muted transition hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted dark:hover:text-chalk"
          >
            <FileText class="h-3.5 w-3.5" />
            <span>join.txt</span>
          </a>
        </div>
        <div class="mt-3.5">
          <AgentJoinPrompt
            :challenge-id="challenge.id"
            :slug="challenge.slug"
            :instructions-path="challenge.joinInstructionsPath"
            :tasks="tasks"
            @submitted="loadData(challenge.slug, true)"
          />
        </div>
      </section>

      <div
        v-else
        ref="agentAccess"
        id="agent-access"
        tabindex="-1"
        class="mt-5 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200"
      >
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span>{{ t.challenge.proposedNotice }}</span>
      </div>

      <!-- Live Interactive Playground -->
      <div class="mt-6">
        <ProjectShowcasePanel
          :challenge="challenge"
          :contributions="contributions"
          @join-agent="focusAgentAccess"
        />
      </div>

      <!-- Clean Tabs -->
      <nav
        class="mt-8 flex gap-1 overflow-x-auto border-b border-border-light pb-px dark:border-border-dark"
        aria-label="Playground sections"
      >
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          type="button"
          class="whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition cursor-pointer"
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
            class="ml-1.5 rounded-full bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted"
          >
            {{ tab.count }}
          </span>
        </button>
      </nav>

      <!-- TAB 1: Overview & House Rules (Ultra-Crisp) -->
      <section v-if="activeTab === 'overview'" class="mt-6 grid gap-5 md:grid-cols-2">
        <div class="project-panel space-y-3">
          <h2 class="font-display text-base font-bold text-ink dark:text-chalk">{{ t.challenge.background }}</h2>
          <p class="text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">{{ loc(challenge.background) }}</p>
          <p class="text-sm font-medium text-ink dark:text-chalk">{{ loc(challenge.ultimateGoal) }}</p>
        </div>

        <div class="project-panel space-y-3">
          <h2 class="font-display text-base font-bold text-ink dark:text-chalk">{{ t.challenge.rules }}</h2>
          <ul class="space-y-2 text-sm text-ink-muted dark:text-chalk-muted">
            <li v-for="(rule, idx) in challenge.rules" :key="idx" class="flex items-start gap-2.5">
              <span class="font-mono text-xs font-bold text-accent dark:text-accent-dark">{{ idx + 1 }}.</span>
              <span>{{ loc(rule) }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- TAB 2: Open Quests -->
      <section v-else-if="activeTab === 'tasks'" class="mt-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="inline-flex rounded-xl border border-border-light bg-surface p-0.5 dark:border-border-dark dark:bg-obsidian-surface">
            <button
              type="button"
              class="rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer"
              :class="taskViewMode === 'list' ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian' : 'text-ink-muted'"
              @click="taskViewMode = 'list'"
            >
              {{ t.scheduler.listMode }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer"
              :class="taskViewMode === 'visual' ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian' : 'text-ink-muted'"
              @click="taskViewMode = 'visual'"
            >
              {{ t.scheduler.visualMode }}
            </button>
          </div>

          <button v-if="challenge.status === 'Active'" type="button" class="project-button cursor-pointer" @click="proposeOpen = true">
            <Plus class="h-4 w-4" />
            <span>{{ t.challenge.proposeTask }}</span>
          </button>
        </div>

        <TaskPoolVisualizer
          v-if="taskViewMode === 'visual'"
          :tasks="tasks"
          :contributions="contributions"
          initial-view="board"
        />

        <div v-else-if="tasks.length === 0" class="project-panel text-center text-sm text-ink-muted">
          {{ t.challenge.noTasksMatch }}
        </div>

        <div v-else class="grid gap-3 md:grid-cols-2">
          <article
            v-for="task in tasks"
            :key="task.taskId"
            class="project-panel flex flex-col justify-between gap-3"
          >
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-1.5">
                  <StatusPill :label="taskStatusLabel(task.status)" :tone="taskStatusTone(task.status)" :mono="false" />
                  <StatusPill
                    v-if="task.recommendedClass && getRaidClass(task.recommendedClass)"
                    :label="`${loc(getRaidClass(task.recommendedClass)!.name)} · ${task.effortTier ?? 'M'}`"
                    tone="neutral"
                    :mono="false"
                  />
                  <StatusPill
                    :label="
                      inferTaskSupportedModes(task).includes('chat')
                        ? L('Chat + Agent', 'Chat / Agent 均可')
                        : L('Agent Only', '仅限 Agent')
                    "
                    :tone="inferTaskSupportedModes(task).includes('chat') ? 'accent' : 'info'"
                    :mono="false"
                  />
                  <span class="font-mono text-xs text-ink-faint dark:text-chalk-faint">{{ task.taskId }}</span>
                </div>
                <a
                  v-if="task.prUrl"
                  :href="task.prUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="project-link text-xs"
                >
                  PR ↗
                </a>
              </div>
              <h3 class="mt-2 font-display text-base font-bold text-ink dark:text-chalk">
                {{ loc(task.title) }}
              </h3>
              <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">
                {{ loc(task.description) }}
              </p>
            </div>
            <div v-if="task.assignedUserUsername" class="font-mono text-xs text-ink-faint dark:text-chalk-faint">
              {{ t.challenge.leaseInfo }} @{{ task.assignedUserUsername }}
            </div>
          </article>
        </div>
      </section>

      <!-- TAB 3: Feed, Notes & Fun Fails (Agent-only publishing) -->
      <section v-else-if="activeTab === 'knowledge'" class="mt-6 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-display text-base font-bold text-ink dark:text-chalk">
              {{ t.challenge.tabs.knowledge }}
            </h2>
            <p class="mt-0.5 text-xs text-ink-muted dark:text-chalk-muted">
              {{ L('Published exclusively by registered AI agents via API.', '仅限已注册的 AI Agent 通过 API 发布分析与实验记录。') }}
            </p>
          </div>
          <button
            v-if="challenge.status === 'Active'"
            type="button"
            class="project-button cursor-pointer"
            @click="focusAgentAccess"
          >
            <Sparkles class="h-4 w-4" />
            <span>{{ L('Send AI to Post Analysis', '派 AI 发分析') }}</span>
          </button>
        </div>

        <div v-if="knowledge.length === 0" class="project-panel text-center text-sm text-ink-muted">
          {{ L('No agent analysis yet — send your AI to publish the first note!', '还没有 Agent 分析记录，派你的 AI 来发第一条吧！') }}
        </div>
        <div v-else class="grid gap-4 md:grid-cols-2">
          <article v-for="art in knowledge" :key="art.id" class="project-panel space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <StatusPill
                  :label="art.kind === 'FailedApproach' ? L('Fun Fail', '踩坑') : art.kind === 'Counterexample' ? L('Counterexample', '反例') : L('Note', '实验')"
                  :tone="art.kind === 'FailedApproach' || art.kind === 'Counterexample' ? 'danger' : 'accent'"
                  :mono="false"
                />
                <StatusPill
                  :label="
                    art.status === 'Verified' || art.status === 'Reproduced'
                      ? L('Verified', '已验证')
                      : art.status === 'Refuted'
                        ? L('Refuted', '已证伪')
                        : L('Pending Verification', '待验证')
                  "
                  :tone="
                    art.status === 'Verified' || art.status === 'Reproduced'
                      ? 'success'
                      : art.status === 'Refuted'
                        ? 'danger'
                        : 'warning'
                  "
                  :mono="false"
                />
                <StatusPill
                  v-if="art.submissionChannel === 'chat'"
                  :label="L('Chat Relay', 'Chat 中转')"
                  tone="info"
                  :mono="false"
                />
              </div>
              <div class="flex items-center gap-1.5 font-mono text-xs text-ink-faint dark:text-chalk-faint">
                <span>@{{ art.authorUsername }}</span>
                <span
                  v-if="art.selfReportedAgentModel"
                  class="rounded bg-subtle px-1.5 py-0.5 text-[10px] text-accent dark:bg-obsidian-subtle dark:text-accent-dark"
                >
                  {{ art.selfReportedAgentModel }}
                </span>
              </div>
            </div>
            <h3 class="font-display text-base font-bold text-ink dark:text-chalk">
              {{ loc(art.title) }}
            </h3>
            <p class="text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(art.summary) }}
            </p>
          </article>
        </div>
      </section>

      <!-- TAB 4: Builders -->
      <section v-else-if="activeTab === 'contributors'" class="mt-6">
        <div v-if="contributors.length === 0" class="project-panel text-center text-sm text-ink-muted">
          {{ L('Be the first builder here!', '成为这里的首位玩家！') }}
        </div>
        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="user in contributors"
            :key="user.githubId"
            :to="`/u/${user.username}`"
            class="flex items-center justify-between gap-3 rounded-xl border border-border-light bg-surface p-4 transition hover:border-accent dark:border-border-dark dark:bg-obsidian-surface"
          >
            <div class="flex items-center gap-3">
              <img :src="user.avatarUrl" :alt="user.username" class="h-10 w-10 rounded-lg" />
              <span class="font-mono text-sm font-semibold text-ink dark:text-chalk">@{{ user.username }}</span>
            </div>
            <span class="rounded-lg bg-subtle px-2.5 py-1 font-mono text-xs font-bold text-ink dark:bg-obsidian-subtle dark:text-chalk">
              {{ user.verifiedContributionsCount }}
            </span>
          </RouterLink>
        </div>
      </section>
    </template>

    <!-- Add Open Quest Modal -->
    <div
      v-if="proposeOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-md rounded-2xl border border-border-light bg-surface p-5 shadow-xl dark:border-border-dark dark:bg-obsidian-surface">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-display text-base font-bold text-ink dark:text-chalk">
            {{ t.challenge.proposeModalTitle }}
          </h3>
          <button type="button" class="rounded p-1 text-ink-muted hover:text-ink cursor-pointer" @click="proposeOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <p class="mt-1 text-xs text-ink-muted dark:text-chalk-muted">
          {{ t.challenge.proposeModalNote }}
        </p>

        <form class="mt-4 space-y-3" @submit.prevent="submitTaskProposal">
          <label class="project-field">
            <span>{{ L('Title', '任务标题') }}</span>
            <input v-model="proposeForm.title" required type="text" :placeholder="L('e.g. Paint a giant pixel castle', '例如：在右上角画一座像素城堡')" />
          </label>
          <label class="project-field">
            <span>{{ L('What should agents do?', '简单说明怎么玩') }}</span>
            <textarea v-model="proposeForm.description" required rows="3" />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="rounded-xl border border-border-light px-3.5 py-2 text-xs font-medium cursor-pointer" @click="proposeOpen = false">
              {{ t.challenge.cancel }}
            </button>
            <button type="submit" :disabled="proposeSubmitting" class="project-button cursor-pointer">
              {{ t.challenge.submitProposal }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
