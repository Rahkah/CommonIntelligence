<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { Challenge, ChallengeStatus, Task, TaskPriority, TaskStatus, TaskType } from '@common-intelligence/shared';
import { Lock, Plus, RefreshCw, ShieldCheck, ExternalLink, Trash2, FolderGit2 } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import SiteTrafficPanel from '@/components/SiteTrafficPanel.vue';
import { API_BASE_URL } from '@/api/client';
import { useAppState } from '@/stores/appState';

interface AdminUserRow {
  githubId: string;
  username: string;
  displayName: string;
  role: 'contributor' | 'maintainer' | 'admin';
  joinedAt: string;
  contributionsCount: number;
  agentsCount: number;
}

interface AdminProposalRow {
  id: string;
  name: string;
  domain: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  challengeSlug: string | null;
  authorUsername: string;
}

interface AdminOverview {
  clientIp: string;
  allowlist: string[];
  serverTime: string;
  origin: string;
  githubAutomation?: {
    configured: boolean;
    org: string;
  };
  summary: {
    challengesTotal: number;
    activeChallenges: number;
    tasksTotal: number;
    availableTasks: number;
    pendingTasks: number;
    leasedTasks: number;
    proposedTasks: number;
    acceptedTasks: number;
    usersTotal: number;
    agentsTotal: number;
    pendingProposals: number;
  };
  challenges: Challenge[];
  tasks: Task[];
  users: AdminUserRow[];
  proposals: AdminProposalRow[];
}

const { state, t, loc, challengeName, challengeStatus, notify } = useAppState();

const loading = ref(true);
const forbidden = ref(false);
const errorMessage = ref('');
const overview = ref<AdminOverview | null>(null);
const activeTab = ref<'challenges' | 'tasks' | 'users' | 'proposals' | 'traffic'>('challenges');
const busyKey = ref<string | null>(null);

// Task filtering & quick creation
const taskChallengeFilter = ref<string>('ALL');
const taskStatusFilter = ref<string>('ALL');
const showCreateTask = ref(false);
const creatingTask = ref(false);
const newTask = reactive({
  challengeId: 'grandmaster',
  taskId: '',
  titleZh: '',
  titleEn: '',
  descriptionZh: '',
  descriptionEn: '',
  taskType: 'Implementation' as TaskType,
  priority: 'High' as TaskPriority,
  status: 'Available' as 'Available' | 'Pending' | 'Proposed',
  dependenciesText: '',
  capabilitiesText: '',
  criteriaText: '',
  outputRequirements: '',
});

const CHALLENGE_STATUSES: ChallengeStatus[] = ['Active', 'Proposed', 'Paused', 'Completed', 'Archived'];
const TASK_STATUSES: TaskStatus[] = [
  'Available',
  'Pending',
  'Proposed',
  'Leased',
  'Submitted',
  'Verifying',
  'Accepted',
  'Blocked',
  'Rejected',
  'Cancelled',
];
const TASK_TYPES: TaskType[] = [
  'Implementation',
  'Search',
  'Verification',
  'Optimization',
  'Research',
  'Counterexample',
  'Documentation',
  'Integration',
];

const filteredTasks = computed(() => {
  const list = overview.value?.tasks ?? [];
  return list.filter((task) => {
    if (taskChallengeFilter.value !== 'ALL' && task.challengeId !== taskChallengeFilter.value) return false;
    if (taskStatusFilter.value !== 'ALL' && task.status !== taskStatusFilter.value) return false;
    return true;
  });
});

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (res.status === 403) {
    forbidden.value = true;
    throw new Error('FORBIDDEN');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) msg = data.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

async function loadOverview() {
  if (state.dataMode !== 'api') {
    loading.value = false;
    errorMessage.value =
      state.locale === 'zh'
        ? '管理员后台仅在真实后端（API 模式）下可用。'
        : 'Admin console is only available when connected to the live API backend.';
    return;
  }
  loading.value = true;
  forbidden.value = false;
  errorMessage.value = '';
  try {
    overview.value = await adminFetch<AdminOverview>('/api/admin/console/overview');
  } catch (err) {
    if (!forbidden.value) {
      errorMessage.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    loading.value = false;
  }
}

async function updateChallengeStatus(challengeId: string, status: ChallengeStatus) {
  busyKey.value = `ch:${challengeId}`;
  try {
    await adminFetch(`/api/admin/console/challenges/${encodeURIComponent(challengeId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    notify(
      state.locale === 'zh'
        ? `项目状态已更新为「${challengeStatus(status)}」`
        : `Updated challenge status to ${status}`
    );
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Update failed');
  } finally {
    busyKey.value = null;
  }
}

async function provisionChallengeRepo(challengeId: string) {
  busyKey.value = `repo:${challengeId}`;
  try {
    const res = await adminFetch<{ githubRepo: string; created: boolean; filesWritten: string[]; warnings: string[] }>(
      `/api/admin/console/challenges/${encodeURIComponent(challengeId)}/provision-repo`,
      { method: 'POST', body: JSON.stringify({ overwriteFiles: false }) }
    );
    const verb = res.created
      ? (state.locale === 'zh' ? '已自动创建仓库' : 'Created repo')
      : (state.locale === 'zh' ? '已同步仓库' : 'Synced repo');
    notify(`${verb}: ${res.githubRepo} (+${res.filesWritten.length} files)`);
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Provision failed');
  } finally {
    busyKey.value = null;
  }
}

async function provisionAllRepos() {
  busyKey.value = 'repo:all';
  try {
    const res = await adminFetch<{ org: string; total: number; created: number; synced: number }>(
      '/api/admin/console/repos/provision-all',
      { method: 'POST', body: JSON.stringify({ overwriteFiles: false }) }
    );
    notify(
      state.locale === 'zh'
        ? `已在 ${res.org} 完成全部 ${res.total} 个仓库同步（新建 ${res.created}，同步 ${res.synced}）`
        : `Provisioned ${res.total} repos under ${res.org} (${res.created} created, ${res.synced} synced)`
    );
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Batch provision failed');
  } finally {
    busyKey.value = null;
  }
}

async function deleteChallengeAndRepo(ch: Challenge) {
  const managedOrg = overview.value?.githubAutomation?.org ?? 'common-intelligence-org';
  const isManagedRepo = ch.githubRepo.toLowerCase().startsWith(`https://github.com/${managedOrg.toLowerCase()}/`);
  const confirmMsg =
    state.locale === 'zh'
      ? `确定要删除项目「${challengeName(ch)}」(${ch.slug}) 吗？${
          isManagedRepo ? `\n同时将自动删除 GitHub 仓库：${ch.githubRepo}` : '\n（外部仓库不会被删除，仅删除平台记录）'
        }\n注意：已有正式贡献凭证的项目受保护不可删除。`
      : `Delete challenge "${ch.name}" (${ch.slug})?${
          isManagedRepo ? `\nThis will also delete GitHub repo: ${ch.githubRepo}` : '\n(External repo will NOT be deleted)'
        }\nChallenges with verified Proof of Contribution records are protected.`;
  if (!window.confirm(confirmMsg)) return;

  busyKey.value = `del:${ch.id}`;
  try {
    const qs = isManagedRepo && overview.value?.githubAutomation?.configured ? '?deleteRepo=true' : '';
    await adminFetch(`/api/admin/console/challenges/${encodeURIComponent(ch.id)}${qs}`, {
      method: 'DELETE',
    });
    notify(
      state.locale === 'zh'
        ? `已删除项目 ${ch.slug}${qs ? ' 及其 GitHub 仓库' : ''}`
        : `Deleted ${ch.slug}${qs ? ' and its GitHub repo' : ''}`
    );
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Delete failed');
  } finally {
    busyKey.value = null;
  }
}

async function updateTaskStatus(taskId: string, status: TaskStatus) {
  busyKey.value = `task:${taskId}`;
  try {
    await adminFetch(`/api/admin/console/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    notify(
      state.locale === 'zh'
        ? `任务 ${taskId} 状态已更新为 ${status}`
        : `Updated ${taskId} to ${status}`
    );
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Update failed');
  } finally {
    busyKey.value = null;
  }
}

async function createTask() {
  if (!newTask.titleZh.trim() || !newTask.descriptionZh.trim()) return;
  creatingTask.value = true;
  try {
    const criteria = newTask.criteriaText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await adminFetch('/api/admin/console/tasks', {
      method: 'POST',
      body: JSON.stringify({
        challengeId: newTask.challengeId,
        taskId: newTask.taskId.trim() || undefined,
        titleZh: newTask.titleZh.trim(),
        titleEn: newTask.titleEn.trim() || undefined,
        descriptionZh: newTask.descriptionZh.trim(),
        descriptionEn: newTask.descriptionEn.trim() || undefined,
        taskType: newTask.taskType,
        priority: newTask.priority,
        status: newTask.status,
        dependencies: newTask.dependenciesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        requiredCapabilities: newTask.capabilitiesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        acceptanceCriteria: criteria.length > 0 ? criteria : ['通过独立可复现验证并合入主分支。'],
        outputRequirements: newTask.outputRequirements.trim() || undefined,
      }),
    });
    newTask.taskId = '';
    newTask.titleZh = '';
    newTask.titleEn = '';
    newTask.descriptionZh = '';
    newTask.descriptionEn = '';
    newTask.dependenciesText = '';
    newTask.capabilitiesText = '';
    newTask.criteriaText = '';
    newTask.outputRequirements = '';
    showCreateTask.value = false;
    notify(state.locale === 'zh' ? '已成功添加新任务' : 'Task created');
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Create failed');
  } finally {
    creatingTask.value = false;
  }
}

async function updateUserRole(githubId: string, role: AdminUserRow['role']) {
  busyKey.value = `user:${githubId}`;
  try {
    await adminFetch(`/api/admin/console/users/${encodeURIComponent(githubId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    notify(state.locale === 'zh' ? `用户角色已更新为 ${role}` : `Updated role to ${role}`);
    await loadOverview();
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Update failed');
  } finally {
    busyKey.value = null;
  }
}

onMounted(loadOverview);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <!-- Loading -->
    <div v-if="loading" class="text-sm text-ink-muted dark:text-chalk-muted">
      {{ state.locale === 'zh' ? '正在校验 IP 白名单并加载管理后台…' : 'Verifying IP allowlist and loading admin console…' }}
    </div>

    <!-- Forbidden -->
    <section
      v-else-if="forbidden"
      class="mx-auto max-w-lg rounded-lg border border-red-700/30 bg-surface p-8 text-center dark:border-red-400/30 dark:bg-obsidian-surface"
    >
      <Lock class="mx-auto h-8 w-8 text-red-700 dark:text-red-400" />
      <h1 class="mt-4 font-editorial text-2xl font-medium text-ink dark:text-chalk">
        {{ state.locale === 'zh' ? '403 · 仅限白名单 IP 访问' : '403 · Admin Access Restricted' }}
      </h1>
      <p class="mt-2 text-sm text-ink-muted dark:text-chalk-muted">
        {{
          state.locale === 'zh'
            ? '当前来访 IP 不在后台管理员白名单中，服务端已拦截此请求。'
            : 'Your IP address is not in the server-side admin allowlist.'
        }}
      </p>
    </section>

    <!-- Error / Demo mode notice -->
    <section
      v-else-if="errorMessage || !overview"
      class="mx-auto max-w-lg rounded-lg border border-border-light bg-surface p-6 text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
    >
      {{ errorMessage || 'Unable to load admin overview.' }}
    </section>

    <!-- Main Admin Console -->
    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border-light pb-6 dark:border-border-dark">
        <div>
          <div class="inline-flex items-center gap-2 font-mono text-xs text-accent dark:text-accent-dark">
            <ShieldCheck class="h-4 w-4" />
            <span>{{ state.locale === 'zh' ? 'IP 白名单已验证' : 'IP Allowlist Verified' }}</span>
            <span>·</span>
            <span>{{ overview.clientIp }}</span>
          </div>
          <h1 class="mt-2 font-editorial text-3xl font-medium tracking-tight text-ink dark:text-chalk">
            {{ state.locale === 'zh' ? '后台管理控制台' : 'Admin Console' }}
          </h1>
          <p class="mt-1.5 font-mono text-xs text-ink-muted dark:text-chalk-muted">
            {{ state.locale === 'zh' ? '允许 IP：' : 'Allowed IPs: ' }}{{ overview.allowlist.join(', ') }}
          </p>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
          @click="loadOverview"
        >
          <RefreshCw class="h-3.5 w-3.5" />
          <span>{{ state.locale === 'zh' ? '刷新数据' : 'Refresh' }}</span>
        </button>
      </header>

      <!-- Summary KPIs -->
      <section class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface">
          <div class="text-xs text-ink-muted dark:text-chalk-muted">
            {{ state.locale === 'zh' ? '项目总数 / 进行中' : 'Challenges / Active' }}
          </div>
          <div class="mt-1.5 font-mono text-2xl font-semibold text-ink dark:text-chalk">
            {{ overview.summary.challengesTotal }}
            <span class="text-base text-accent dark:text-accent-dark">/ {{ overview.summary.activeChallenges }}</span>
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface">
          <div class="text-xs text-ink-muted dark:text-chalk-muted">
            {{ state.locale === 'zh' ? '任务池（可认领 / 待解锁）' : 'Tasks (Available / Pending)' }}
          </div>
          <div class="mt-1.5 font-mono text-2xl font-semibold text-ink dark:text-chalk">
            {{ overview.summary.tasksTotal }}
            <span class="text-sm font-normal text-ink-muted dark:text-chalk-muted">
              ({{ overview.summary.availableTasks }} / {{ overview.summary.pendingTasks }})
            </span>
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface">
          <div class="text-xs text-ink-muted dark:text-chalk-muted">
            {{ state.locale === 'zh' ? '注册用户 / Agent 数' : 'Users / Agents' }}
          </div>
          <div class="mt-1.5 font-mono text-2xl font-semibold text-ink dark:text-chalk">
            {{ overview.summary.usersTotal }} / {{ overview.summary.agentsTotal }}
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface">
          <div class="text-xs text-ink-muted dark:text-chalk-muted">
            {{ state.locale === 'zh' ? '待审核提案（任务 / 项目）' : 'Pending Review (Tasks / Projects)' }}
          </div>
          <div class="mt-1.5 font-mono text-2xl font-semibold text-ink dark:text-chalk">
            {{ overview.summary.proposedTasks }} / {{ overview.summary.pendingProposals }}
          </div>
        </div>
      </section>

      <!-- Tabs -->
      <nav class="mt-8 flex gap-1 overflow-x-auto border-b border-border-light pb-px dark:border-border-dark">
        <button
          v-for="tab in [
            { id: 'challenges', label: state.locale === 'zh' ? '项目管理' : 'Challenges', count: overview.challenges.length },
            { id: 'tasks', label: state.locale === 'zh' ? '任务池管理' : 'Tasks', count: overview.tasks.length },
            { id: 'users', label: state.locale === 'zh' ? '用户与权限' : 'Users & Roles', count: overview.users.length },
            { id: 'proposals', label: state.locale === 'zh' ? '项目提案' : 'Project Proposals', count: overview.proposals.length },
            { id: 'traffic', label: t.traffic.tab, count: undefined },
          ] as const"
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
          <span v-if="tab.count !== undefined" class="ml-1.5 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted">
            {{ tab.count }}
          </span>
        </button>
      </nav>

      <SiteTrafficPanel v-if="activeTab === 'traffic'" />
      <!-- Tab 1: Challenges -->
      <section v-else-if="activeTab === 'challenges'" class="mt-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-light bg-surface px-4 py-3 text-xs dark:border-border-dark dark:bg-obsidian-surface">
          <div class="flex flex-wrap items-center gap-2">
            <FolderGit2 class="h-4 w-4 text-accent dark:text-accent-dark" />
            <span class="font-medium text-ink dark:text-chalk">
              {{ state.locale === 'zh' ? 'GitHub 仓库自动化' : 'GitHub Repo Automation' }}
            </span>
            <span class="font-mono text-ink-muted dark:text-chalk-muted">
              {{ overview.githubAutomation?.org ?? 'common-intelligence-org' }}
            </span>
            <StatusPill
              :label="
                overview.githubAutomation?.configured
                  ? (state.locale === 'zh' ? 'Token 已就绪' : 'Token Configured')
                  : (state.locale === 'zh' ? '未配置 GITHUB_ADMIN_TOKEN' : 'Missing GITHUB_ADMIN_TOKEN')
              "
              :tone="overview.githubAutomation?.configured ? 'accent' : 'neutral'"
            />
          </div>
          <button
            type="button"
            :disabled="!overview.githubAutomation?.configured || busyKey === 'repo:all'"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-40 dark:bg-chalk dark:text-obsidian cursor-pointer"
            @click="provisionAllRepos"
          >
            <FolderGit2 class="h-3.5 w-3.5" />
            <span>
              {{
                busyKey === 'repo:all'
                  ? (state.locale === 'zh' ? '正在同步…' : 'Provisioning…')
                  : (state.locale === 'zh' ? '一键自动建仓 / 同步全部' : 'Provision / Sync All Repos')
              }}
            </span>
          </button>
        </div>

        <div class="overflow-x-auto rounded-lg border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-border-light bg-subtle/60 text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted">
            <tr>
              <th class="px-4 py-3">{{ state.locale === 'zh' ? '项目名称' : 'Challenge' }}</th>
              <th class="px-4 py-3">{{ state.locale === 'zh' ? '状态' : 'Status' }}</th>
              <th class="px-4 py-3">{{ state.locale === 'zh' ? '任务（可领 / 运行 / 完成）' : 'Tasks (Open / Active / Done)' }}</th>
              <th class="px-4 py-3 text-right">{{ state.locale === 'zh' ? '仓库与状态操作' : 'Repo & Status Actions' }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-light dark:divide-border-dark">
            <tr v-for="ch in overview.challenges" :key="ch.id">
              <td class="px-4 py-3">
                <RouterLink :to="`/challenges/${ch.slug}`" class="font-semibold text-accent hover:underline dark:text-accent-dark">
                  {{ challengeName(ch) }}
                </RouterLink>
                <div class="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  <span>/{{ ch.slug }}</span>
                  <a
                    :href="ch.githubRepo"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-0.5 text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
                  >
                    <span>{{ ch.githubRepo.replace('https://github.com/', '') }}</span>
                    <ExternalLink class="h-3 w-3" />
                  </a>
                </div>
              </td>
              <td class="px-4 py-3">
                <StatusPill
                  :label="challengeStatus(ch.status)"
                  :tone="ch.status === 'Active' ? 'accent' : 'neutral'"
                  :mono="state.locale !== 'zh'"
                />
              </td>
              <td class="px-4 py-3 font-mono text-ink-muted dark:text-chalk-muted">
                {{ ch.stats.openTasksCount }} / {{ ch.stats.activeLeasesCount }} / {{ ch.stats.completedTasksCount }}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="inline-flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    :disabled="!overview.githubAutomation?.configured || busyKey === `repo:${ch.id}`"
                    class="rounded border border-border-light bg-paper px-2 py-1 text-xs text-ink hover:border-ink/40 disabled:opacity-40 dark:border-border-dark dark:bg-obsidian dark:text-chalk cursor-pointer"
                    @click="provisionChallengeRepo(ch.id)"
                  >
                    {{
                      busyKey === `repo:${ch.id}`
                        ? (state.locale === 'zh' ? '同步中…' : 'Syncing…')
                        : (state.locale === 'zh' ? '建仓/同步' : 'Provision')
                    }}
                  </button>
                  <select
                    :value="ch.status"
                    :disabled="busyKey === `ch:${ch.id}`"
                    class="rounded border border-border-light bg-paper px-2 py-1 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
                    @change="updateChallengeStatus(ch.id, ($event.target as HTMLSelectElement).value as ChallengeStatus)"
                  >
                    <option v-for="s in CHALLENGE_STATUSES" :key="s" :value="s">
                      {{ challengeStatus(s) }}
                    </option>
                  </select>
                  <button
                    type="button"
                    :disabled="busyKey === `del:${ch.id}` || ch.stats.verifiedContributionsCount > 0"
                    :title="
                      ch.stats.verifiedContributionsCount > 0
                        ? (state.locale === 'zh' ? '已有正式贡献凭证的项目不可删除' : 'Protected: has verified contributions')
                        : (state.locale === 'zh' ? '删除项目及托管仓库' : 'Delete challenge and managed repo')
                    "
                    class="inline-flex items-center gap-1 rounded border border-red-700/30 bg-paper px-2 py-1 text-xs text-red-700 hover:bg-red-700/10 disabled:opacity-35 dark:border-red-400/30 dark:bg-obsidian dark:text-red-400 cursor-pointer"
                    @click="deleteChallengeAndRepo(ch)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                    <span>{{ state.locale === 'zh' ? '删除' : 'Delete' }}</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>

      <!-- Tab 2: Tasks -->
      <section v-else-if="activeTab === 'tasks'" class="mt-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="taskChallengeFilter"
              class="rounded border border-border-light bg-surface px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            >
              <option value="ALL">{{ state.locale === 'zh' ? '全部项目' : 'All challenges' }}</option>
              <option v-for="ch in overview.challenges" :key="ch.id" :value="ch.id">
                {{ challengeName(ch) }}
              </option>
            </select>
            <select
              v-model="taskStatusFilter"
              class="rounded border border-border-light bg-surface px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            >
              <option value="ALL">{{ state.locale === 'zh' ? '全部状态' : 'All statuses' }}</option>
              <option v-for="s in TASK_STATUSES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
            @click="showCreateTask = !showCreateTask"
          >
            <Plus class="h-3.5 w-3.5" />
            <span>{{ state.locale === 'zh' ? '新建任务' : 'New Task' }}</span>
          </button>
        </div>

        <!-- Quick Create Task Form -->
        <form
          v-if="showCreateTask"
          class="space-y-3 rounded-lg border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
          @submit.prevent="createTask"
        >
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '所属项目' : 'Challenge' }}</span>
              <select
                v-model="newTask.challengeId"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option v-for="ch in overview.challenges" :key="ch.id" :value="ch.id">
                  {{ challengeName(ch) }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '自定义任务 ID（选填）' : 'Task ID (optional)' }}</span>
              <input
                v-model="newTask.taskId"
                type="text"
                placeholder="e.g. TASK-GM-P1-04"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 font-mono text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '初始状态' : 'Initial Status' }}</span>
              <select
                v-model="newTask.status"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option value="Available">Available ({{ state.locale === 'zh' ? '可认领' : 'Open' }})</option>
                <option value="Pending">Pending ({{ state.locale === 'zh' ? '待前置解锁' : 'Waiting deps' }})</option>
                <option value="Proposed">Proposed ({{ state.locale === 'zh' ? '待审核' : 'Draft' }})</option>
              </select>
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '任务标题（中文）*' : 'Title (ZH) *' }}</span>
              <input
                v-model="newTask.titleZh"
                required
                type="text"
                placeholder="[阶段一] ..."
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '任务标题（英文，选填）' : 'Title (EN, optional)' }}</span>
              <input
                v-model="newTask.titleEn"
                type="text"
                placeholder="[Phase 1] ..."
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '类型' : 'Type' }}</span>
              <select
                v-model="newTask.taskType"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option v-for="tp in TASK_TYPES" :key="tp" :value="tp">{{ tp }}</option>
              </select>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '优先级' : 'Priority' }}</span>
              <select
                v-model="newTask.priority"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option v-for="p in ['Critical', 'High', 'Normal', 'Low']" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '前置依赖 ID（逗号分隔）' : 'Dependencies (comma-separated)' }}</span>
              <input
                v-model="newTask.dependenciesText"
                type="text"
                placeholder="TASK-GM-P1-01"
                class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 font-mono text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
          </div>

          <label class="block">
            <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '任务说明 *' : 'Description *' }}</span>
            <textarea
              v-model="newTask.descriptionZh"
              required
              rows="2"
              class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
            />
          </label>

          <label class="block">
            <span class="block text-xs font-medium text-ink dark:text-chalk">{{ state.locale === 'zh' ? '验收标准（每行一条）' : 'Acceptance criteria (one per line)' }}</span>
            <textarea
              v-model="newTask.criteriaText"
              rows="2"
              class="mt-1 w-full rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
            />
          </label>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded border border-border-light px-3 py-1.5 text-xs text-ink-muted dark:border-border-dark dark:text-chalk-muted cursor-pointer"
              @click="showCreateTask = false"
            >
              {{ state.locale === 'zh' ? '取消' : 'Cancel' }}
            </button>
            <button
              type="submit"
              :disabled="creatingTask"
              class="rounded bg-ink px-4 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50 dark:bg-chalk dark:text-obsidian cursor-pointer"
            >
              {{ state.locale === 'zh' ? '确认创建' : 'Create' }}
            </button>
          </div>
        </form>

        <!-- Task Table -->
        <div class="overflow-x-auto rounded-lg border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface">
          <table class="w-full text-left text-xs">
            <thead class="border-b border-border-light bg-subtle/60 text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted">
              <tr>
                <th class="px-4 py-3">{{ state.locale === 'zh' ? '任务' : 'Task' }}</th>
                <th class="px-4 py-3">{{ state.locale === 'zh' ? '所属项目' : 'Challenge' }}</th>
                <th class="px-4 py-3">{{ state.locale === 'zh' ? '前置依赖' : 'Deps' }}</th>
                <th class="px-4 py-3 text-right">{{ state.locale === 'zh' ? '状态管理' : 'Status' }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-light dark:divide-border-dark">
              <tr v-for="task in filteredTasks" :key="task.taskId">
                <td class="px-4 py-3">
                  <div class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">{{ task.taskId }}</div>
                  <div class="mt-0.5 font-medium text-ink dark:text-chalk">{{ loc(task.title) }}</div>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-ink-muted dark:text-chalk-muted">
                  {{ challengeName(task.challengeId) }}
                </td>
                <td class="px-4 py-3 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  {{ task.dependencies.length ? task.dependencies.join(', ') : '—' }}
                </td>
                <td class="px-4 py-3 text-right">
                  <select
                    :value="task.status"
                    :disabled="busyKey === `task:${task.taskId}`"
                    class="rounded border border-border-light bg-paper px-2 py-1 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
                    @change="updateTaskStatus(task.taskId, ($event.target as HTMLSelectElement).value as TaskStatus)"
                  >
                    <option v-for="s in TASK_STATUSES" :key="s" :value="s">{{ s }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Tab 3: Users -->
      <section v-else-if="activeTab === 'users'" class="mt-6 overflow-x-auto rounded-lg border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface">
        <div v-if="overview.users.length === 0" class="p-8 text-center text-sm text-ink-muted dark:text-chalk-muted">
          {{ state.locale === 'zh' ? '暂无已登录用户。' : 'No registered users yet.' }}
        </div>
        <table v-else class="w-full text-left text-xs">
          <thead class="border-b border-border-light bg-subtle/60 text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted">
            <tr>
              <th class="px-4 py-3">{{ state.locale === 'zh' ? '用户' : 'User' }}</th>
              <th class="px-4 py-3">GitHub ID</th>
              <th class="px-4 py-3">{{ state.locale === 'zh' ? '贡献 / Agent' : 'Contributions / Agents' }}</th>
              <th class="px-4 py-3 text-right">{{ state.locale === 'zh' ? '角色' : 'Role' }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-light dark:divide-border-dark">
            <tr v-for="u in overview.users" :key="u.githubId">
              <td class="px-4 py-3 font-medium text-ink dark:text-chalk">@{{ u.username }}</td>
              <td class="px-4 py-3 font-mono text-ink-muted dark:text-chalk-muted">{{ u.githubId }}</td>
              <td class="px-4 py-3 font-mono text-ink-muted dark:text-chalk-muted">
                {{ u.contributionsCount }} / {{ u.agentsCount }}
              </td>
              <td class="px-4 py-3 text-right">
                <select
                  :value="u.role"
                  :disabled="busyKey === `user:${u.githubId}`"
                  class="rounded border border-border-light bg-paper px-2 py-1 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
                  @change="updateUserRole(u.githubId, ($event.target as HTMLSelectElement).value as AdminUserRow['role'])"
                >
                  <option value="contributor">contributor</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Tab 4: Proposals -->
      <section v-else-if="activeTab === 'proposals'" class="mt-6 space-y-4">
        <div class="flex justify-end">
          <RouterLink
            to="/admin/project-proposals"
            class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
          >
            <span>{{ state.locale === 'zh' ? '打开完整项目审核页' : 'Open Full Proposal Review' }}</span>
            <ExternalLink class="h-3.5 w-3.5" />
          </RouterLink>
        </div>
        <div class="overflow-x-auto rounded-lg border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface">
          <div v-if="overview.proposals.length === 0" class="p-8 text-center text-sm text-ink-muted dark:text-chalk-muted">
            {{ state.locale === 'zh' ? '暂无项目提案。' : 'No project proposals yet.' }}
          </div>
          <table v-else class="w-full text-left text-xs">
            <thead class="border-b border-border-light bg-subtle/60 text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted">
              <tr>
                <th class="px-4 py-3">{{ state.locale === 'zh' ? '提案名称' : 'Proposal' }}</th>
                <th class="px-4 py-3">{{ state.locale === 'zh' ? '提交者' : 'Author' }}</th>
                <th class="px-4 py-3">{{ state.locale === 'zh' ? '状态' : 'Status' }}</th>
                <th class="px-4 py-3 text-right">{{ state.locale === 'zh' ? '提交时间' : 'Submitted' }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-light dark:divide-border-dark">
              <tr v-for="p in overview.proposals" :key="p.id">
                <td class="px-4 py-3">
                  <div class="font-medium text-ink dark:text-chalk">{{ p.name }}</div>
                  <div class="text-[11px] text-ink-faint dark:text-chalk-faint">{{ p.domain }}</div>
                </td>
                <td class="px-4 py-3 font-mono text-ink-muted dark:text-chalk-muted">@{{ p.authorUsername }}</td>
                <td class="px-4 py-3">
                  <StatusPill
                    :label="p.status"
                    :tone="p.status === 'Approved' ? 'success' : p.status === 'Rejected' ? 'danger' : 'warning'"
                  />
                </td>
                <td class="px-4 py-3 text-right font-mono text-ink-faint dark:text-chalk-faint">
                  {{ p.submittedAt.slice(0, 16).replace('T', ' ') }}Z
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
