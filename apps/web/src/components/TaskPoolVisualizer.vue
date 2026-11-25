<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Contribution, Task, TaskStatus } from '@common-intelligence/shared';
import {
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Kanban,
  Layers,
  Network,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

export type SchedulerViewMode = 'graph' | 'decomposition' | 'contributors' | 'board';

const props = withDefaults(
  defineProps<{
    tasks: Task[];
    contributions?: Contribution[];
    challengeNameMap?: Record<string, { slug: string; name: string }>;
    showChallengeBadge?: boolean;
    initialView?: SchedulerViewMode;
    initialContributor?: string | null;
  }>(),
  {
    contributions: () => [],
    challengeNameMap: () => ({}),
    showChallengeBadge: false,
    initialView: 'graph',
    initialContributor: null,
  }
);

const { t, loc, challengeName, state } = useAppState();

const activeView = ref<SchedulerViewMode>(props.initialView);
const selectedStage = ref<string>('ALL');
const selectedContributor = ref<string>(props.initialContributor ?? 'ALL');
const searchQuery = ref('');
const selectedTaskId = ref<string>('');

watch(
  () => props.initialView,
  (val) => {
    if (val) activeView.value = val;
  }
);

watch(
  () => props.initialContributor,
  (val) => {
    selectedContributor.value = val || 'ALL';
  }
);

// Build lookup of contributions by taskId as fallback enrichment for live/demo data
const contributionsByTaskId = computed(() => {
  const map = new Map<string, Contribution[]>();
  for (const c of props.contributions) {
    const list = map.get(c.taskId) ?? [];
    list.push(c);
    map.set(c.taskId, list);
  }
  return map;
});

interface EnrichedTask extends Task {
  plannerUsername: string | null;
  plannerAvatarUrl: string | null;
  plannerAgentLabel: string | null;
  plannerAgentModel: string | null;
  completerUsername: string | null;
  completerAvatarUrl: string | null;
  completerAgentLabel: string | null;
  completerAgentModel: string | null;
  effectiveCompletedAt: string | null;
  effectiveCredentialId: string | null;
  effectiveContributionId: string | null;
  matchedContribution: Contribution | null;
  childTaskIds: string[];
}

const enrichedTasks = computed<EnrichedTask[]>(() => {
  const rawById = new Map(props.tasks.map((tk) => [tk.taskId, tk]));
  const childrenMap = new Map<string, string[]>();
  for (const tk of props.tasks) {
    if (tk.planId) {
      const list = childrenMap.get(tk.planId) ?? [];
      list.push(tk.taskId);
      childrenMap.set(tk.planId, list);
    }
  }

  return props.tasks.map((tk) => {
    const parentPlan = tk.planId ? rawById.get(tk.planId) : undefined;
    const matchedList = contributionsByTaskId.value.get(tk.taskId) ?? [];
    const matchedContribution =
      matchedList.find((c) => c.id === tk.contributionId) ?? matchedList[0] ?? null;

    const plannerUsername =
      tk.proposedByUsername ??
      (tk.isPlanning ? tk.completedByUsername ?? tk.assignedUserUsername ?? null : null) ??
      parentPlan?.completedByUsername ??
      parentPlan?.assignedUserUsername ??
      null;
    const plannerAvatarUrl =
      tk.proposedByAvatarUrl ??
      (tk.isPlanning ? tk.completedByAvatarUrl ?? tk.assignedUserAvatarUrl ?? null : null) ??
      parentPlan?.completedByAvatarUrl ??
      parentPlan?.assignedUserAvatarUrl ??
      null;
    const plannerAgentLabel =
      tk.proposedByAgentLabel ??
      (tk.isPlanning ? tk.completedByAgentLabel ?? tk.assignedAgentLabel ?? null : null) ??
      parentPlan?.completedByAgentLabel ??
      parentPlan?.assignedAgentLabel ??
      null;
    const plannerAgentModel =
      tk.proposedByAgentModelSelfReported ??
      (tk.isPlanning
        ? tk.completedByAgentModelSelfReported ?? tk.assignedAgentModelSelfReported ?? null
        : null) ??
      parentPlan?.completedByAgentModelSelfReported ??
      parentPlan?.assignedAgentModelSelfReported ??
      null;

    const isDone = tk.status === 'Accepted';
    const completerUsername = isDone
      ? tk.completedByUsername ??
        matchedContribution?.contributorUsername ??
        tk.assignedUserUsername ??
        null
      : null;
    const completerAvatarUrl = isDone
      ? tk.completedByAvatarUrl ??
        matchedContribution?.contributorAvatarUrl ??
        tk.assignedUserAvatarUrl ??
        null
      : null;
    const completerAgentLabel = isDone
      ? tk.completedByAgentLabel ?? tk.assignedAgentLabel ?? null
      : null;
    const completerAgentModel = isDone
      ? tk.completedByAgentModelSelfReported ??
        matchedContribution?.selfReportedAgentModel ??
        tk.assignedAgentModelSelfReported ??
        null
      : null;

    return {
      ...tk,
      plannerUsername,
      plannerAvatarUrl,
      plannerAgentLabel,
      plannerAgentModel,
      completerUsername,
      completerAvatarUrl,
      completerAgentLabel,
      completerAgentModel,
      effectiveCompletedAt: isDone
        ? tk.completedAt ?? matchedContribution?.acceptedAt ?? tk.updatedAt
        : null,
      effectiveCredentialId: tk.credentialId ?? matchedContribution?.credentialId ?? null,
      effectiveContributionId: tk.contributionId ?? matchedContribution?.id ?? null,
      matchedContribution,
      childTaskIds: childrenMap.get(tk.taskId) ?? [],
    };
  });
});

const enrichedById = computed(() => new Map(enrichedTasks.value.map((tk) => [tk.taskId, tk])));

// Contributor summaries across decomposition, completion, and active execution
interface ContributorScheduleSummary {
  username: string;
  avatarUrl: string | null;
  agents: Array<{ label: string; model: string | null }>;
  planningTasks: EnrichedTask[];
  decomposedSubtasks: EnrichedTask[];
  completedTasks: EnrichedTask[];
  extraContributions: Contribution[];
  activeTasks: EnrichedTask[];
}

const contributorSummaries = computed<ContributorScheduleSummary[]>(() => {
  const map = new Map<
    string,
    {
      username: string;
      avatarUrl: string | null;
      agentKeys: Map<string, { label: string; model: string | null }>;
      planningTasks: EnrichedTask[];
      decomposedSubtasks: EnrichedTask[];
      completedTasks: EnrichedTask[];
      extraContributions: Contribution[];
      activeTasks: EnrichedTask[];
    }
  >();

  function ensure(username: string, avatarUrl?: string | null) {
    let entry = map.get(username);
    if (!entry) {
      entry = {
        username,
        avatarUrl: avatarUrl ?? null,
        agentKeys: new Map(),
        planningTasks: [],
        decomposedSubtasks: [],
        completedTasks: [],
        extraContributions: [],
        activeTasks: [],
      };
      map.set(username, entry);
    } else if (!entry.avatarUrl && avatarUrl) {
      entry.avatarUrl = avatarUrl;
    }
    return entry;
  }

  function recordAgent(
    entry: ReturnType<typeof ensure>,
    label?: string | null,
    model?: string | null
  ) {
    if (!label && !model) return;
    const key = `${label ?? ''}::${model ?? ''}`;
    if (!entry.agentKeys.has(key)) {
      entry.agentKeys.set(key, {
        label: label ?? (state.locale === 'zh' ? '未命名 Agent' : 'Agent'),
        model: model ?? null,
      });
    }
  }

  for (const tk of enrichedTasks.value) {
    if (tk.isPlanning && tk.plannerUsername) {
      const entry = ensure(tk.plannerUsername, tk.plannerAvatarUrl);
      entry.planningTasks.push(tk);
      recordAgent(entry, tk.plannerAgentLabel, tk.plannerAgentModel);
    }

    if (!tk.isPlanning && tk.plannerUsername) {
      const entry = ensure(tk.plannerUsername, tk.plannerAvatarUrl);
      entry.decomposedSubtasks.push(tk);
      recordAgent(entry, tk.plannerAgentLabel, tk.plannerAgentModel);
    }

    if (tk.status === 'Accepted' && tk.completerUsername) {
      const entry = ensure(tk.completerUsername, tk.completerAvatarUrl);
      entry.completedTasks.push(tk);
      recordAgent(entry, tk.completerAgentLabel, tk.completerAgentModel);
    }

    if (
      (tk.status === 'Leased' || tk.status === 'Submitted' || tk.status === 'Verifying') &&
      tk.assignedUserUsername
    ) {
      const entry = ensure(tk.assignedUserUsername, tk.assignedUserAvatarUrl);
      entry.activeTasks.push(tk);
      recordAgent(entry, tk.assignedAgentLabel, tk.assignedAgentModelSelfReported);
    }
  }

  // Also capture verified contributions not already represented by a completed task for the same contributor
  for (const contrib of props.contributions) {
    const entry = ensure(contrib.contributorUsername, contrib.contributorAvatarUrl);
    recordAgent(entry, null, contrib.selfReportedAgentModel);
    const alreadyCovered = entry.completedTasks.some(
      (tk) => tk.effectiveContributionId === contrib.id || tk.taskId === contrib.taskId
    );
    if (!alreadyCovered) {
      entry.extraContributions.push(contrib);
    }
  }

  return Array.from(map.values())
    .map((e) => ({
      username: e.username,
      avatarUrl: e.avatarUrl,
      agents: Array.from(e.agentKeys.values()),
      planningTasks: e.planningTasks,
      decomposedSubtasks: e.decomposedSubtasks,
      completedTasks: e.completedTasks,
      extraContributions: e.extraContributions,
      activeTasks: e.activeTasks,
    }))
    .sort((a, b) => {
      const aDone = a.completedTasks.length + a.extraContributions.length;
      const bDone = b.completedTasks.length + b.extraContributions.length;
      if (bDone !== aDone) return bDone - aDone;
      if (b.decomposedSubtasks.length !== a.decomposedSubtasks.length) {
        return b.decomposedSubtasks.length - a.decomposedSubtasks.length;
      }
      return a.username.localeCompare(b.username);
    });
});

function matchesStage(tk: EnrichedTask, stage: string): boolean {
  if (stage === 'ALL') return true;
  if (stage === 'planning') return Boolean(tk.isPlanning);
  if (stage === 'proposed') return tk.status === 'Proposed';
  if (stage === 'pending') return tk.status === 'Pending';
  if (stage === 'available') return tk.status === 'Available';
  if (stage === 'leased') return tk.status === 'Leased';
  if (stage === 'verifying') return tk.status === 'Submitted' || tk.status === 'Verifying';
  if (stage === 'accepted') return tk.status === 'Accepted';
  if (stage === 'other') {
    return tk.status === 'Rejected' || tk.status === 'Blocked' || tk.status === 'Cancelled';
  }
  return true;
}

function taskInvolvesContributor(tk: EnrichedTask, username: string): boolean {
  if (username === 'ALL') return true;
  const target = username.toLowerCase();
  return (
    tk.plannerUsername?.toLowerCase() === target ||
    tk.completerUsername?.toLowerCase() === target ||
    tk.assignedUserUsername?.toLowerCase() === target
  );
}

function taskMatchesSearch(tk: EnrichedTask, q: string): boolean {
  if (!q) return true;
  const hay = [
    tk.taskId,
    tk.planId ?? '',
    tk.title.en,
    tk.title.zh,
    tk.description.en,
    tk.description.zh,
    tk.taskType,
    tk.plannerUsername ?? '',
    tk.plannerAgentLabel ?? '',
    tk.plannerAgentModel ?? '',
    tk.completerUsername ?? '',
    tk.completerAgentLabel ?? '',
    tk.completerAgentModel ?? '',
    tk.assignedUserUsername ?? '',
    tk.assignedAgentLabel ?? '',
    tk.assignedAgentModelSelfReported ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

const stageStats = computed(() => {
  const list = enrichedTasks.value;
  return [
    {
      key: 'planning',
      label: t.value.scheduler.stages.planning,
      count: list.filter((tk) => tk.isPlanning).length,
      dotClass: 'bg-violet-500',
    },
    {
      key: 'proposed',
      label: t.value.scheduler.stages.proposed,
      count: list.filter((tk) => tk.status === 'Proposed').length,
      dotClass: 'bg-amber-500',
    },
    {
      key: 'pending',
      label: t.value.scheduler.stages.pending,
      count: list.filter((tk) => tk.status === 'Pending').length,
      dotClass: 'bg-amber-400',
    },
    {
      key: 'available',
      label: t.value.scheduler.stages.available,
      count: list.filter((tk) => tk.status === 'Available').length,
      dotClass: 'bg-teal-600 dark:bg-teal-400',
    },
    {
      key: 'leased',
      label: t.value.scheduler.stages.leased,
      count: list.filter((tk) => tk.status === 'Leased').length,
      dotClass: 'bg-sky-500',
    },
    {
      key: 'verifying',
      label: t.value.scheduler.stages.verifying,
      count: list.filter((tk) => tk.status === 'Submitted' || tk.status === 'Verifying').length,
      dotClass: 'bg-blue-500',
    },
    {
      key: 'accepted',
      label: t.value.scheduler.stages.accepted,
      count: list.filter((tk) => tk.status === 'Accepted').length,
      dotClass: 'bg-emerald-600 dark:bg-emerald-400',
    },
  ];
});

const hasActiveFilter = computed(
  () =>
    selectedStage.value !== 'ALL' ||
    selectedContributor.value !== 'ALL' ||
    searchQuery.value.trim().length > 0
);

function resetFilters() {
  selectedStage.value = 'ALL';
  selectedContributor.value = 'ALL';
  searchQuery.value = '';
}

const filteredTasks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return enrichedTasks.value.filter((tk) => {
    if (!matchesStage(tk, selectedStage.value)) return false;
    if (!taskInvolvesContributor(tk, selectedContributor.value)) return false;
    if (!taskMatchesSearch(tk, q)) return false;
    return true;
  });
});

// Keep selectedTaskId pointing at a valid visible task
watch(
  filteredTasks,
  (list) => {
    if (!list.some((tk) => tk.taskId === selectedTaskId.value)) {
      selectedTaskId.value =
        list.find((tk) => tk.isPlanning)?.taskId ??
        list.find((tk) => tk.status === 'Accepted')?.taskId ??
        list[0]?.taskId ??
        '';
    }
  },
  { immediate: true }
);

const selectedTask = computed(
  () =>
    enrichedById.value.get(selectedTaskId.value) ??
    filteredTasks.value[0] ??
    enrichedTasks.value[0] ??
    null
);

// --- Decomposition Groups (Answering: Which subtasks did each contributor's Agent decompose?) ---
interface DecompositionGroup {
  id: string;
  planTask: EnrichedTask | null;
  plannerUsername: string;
  plannerAvatarUrl: string | null;
  agentLabel: string | null;
  agentModel: string | null;
  challengeId: string;
  createdAt: string;
  subtasks: EnrichedTask[];
  completedCount: number;
  activeCount: number;
  openCount: number;
}

const decompositionGroups = computed<DecompositionGroup[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const visibleIds = new Set(filteredTasks.value.map((tk) => tk.taskId));
  const groups: DecompositionGroup[] = [];
  const claimedChildIds = new Set<string>();

  // 1. Explicit planning tasks (isPlanning === true)
  for (const plan of enrichedTasks.value.filter((tk) => tk.isPlanning)) {
    const allChildren = enrichedTasks.value.filter((tk) => tk.planId === plan.taskId);
    for (const c of allChildren) claimedChildIds.add(c.taskId);

    const matchingChildren = allChildren.filter((c) => visibleIds.has(c.taskId));
    const planMatches = visibleIds.has(plan.taskId);
    if (!planMatches && matchingChildren.length === 0) continue;

    const subtasks =
      hasActiveFilter.value && matchingChildren.length > 0 ? matchingChildren : allChildren;

    groups.push({
      id: plan.taskId,
      planTask: plan,
      plannerUsername:
        plan.plannerUsername ?? plan.completerUsername ?? plan.assignedUserUsername ?? 'unknown',
      plannerAvatarUrl:
        plan.plannerAvatarUrl ?? plan.completerAvatarUrl ?? plan.assignedUserAvatarUrl ?? null,
      agentLabel: plan.plannerAgentLabel ?? plan.completerAgentLabel ?? plan.assignedAgentLabel ?? null,
      agentModel:
        plan.plannerAgentModel ??
        plan.completerAgentModel ??
        plan.assignedAgentModelSelfReported ??
        null,
      challengeId: plan.challengeId,
      createdAt: plan.completedAt ?? plan.createdAt,
      subtasks,
      completedCount: subtasks.filter((s) => s.status === 'Accepted').length,
      activeCount: subtasks.filter((s) =>
        ['Leased', 'Submitted', 'Verifying'].includes(s.status)
      ).length,
      openCount: subtasks.filter((s) => ['Available', 'Pending', 'Proposed'].includes(s.status))
        .length,
    });
  }

  // 2. Standalone proposed subtasks (proposedByUsername set, no parent plan in pool)
  const standaloneByPlanner = new Map<string, EnrichedTask[]>();
  for (const tk of filteredTasks.value) {
    if (tk.isPlanning || claimedChildIds.has(tk.taskId)) continue;
    if (!tk.plannerUsername) continue;
    const key = `${tk.challengeId}::${tk.plannerUsername}::${tk.plannerAgentLabel ?? 'direct'}`;
    const list = standaloneByPlanner.get(key) ?? [];
    list.push(tk);
    standaloneByPlanner.set(key, list);
  }

  for (const [key, subtasks] of standaloneByPlanner.entries()) {
    const first = subtasks[0]!;
    if (q && !subtasks.some((s) => taskMatchesSearch(s, q))) continue;
    groups.push({
      id: `direct-${key}`,
      planTask: null,
      plannerUsername: first.plannerUsername!,
      plannerAvatarUrl: first.plannerAvatarUrl,
      agentLabel: first.plannerAgentLabel,
      agentModel: first.plannerAgentModel,
      challengeId: first.challengeId,
      createdAt: first.createdAt,
      subtasks,
      completedCount: subtasks.filter((s) => s.status === 'Accepted').length,
      activeCount: subtasks.filter((s) =>
        ['Leased', 'Submitted', 'Verifying'].includes(s.status)
      ).length,
      openCount: subtasks.filter((s) => ['Available', 'Pending', 'Proposed'].includes(s.status))
        .length,
    });
  }

  return groups.sort((a, b) => b.subtasks.length - a.subtasks.length);
});

const filteredContributorSummaries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return contributorSummaries.value.filter((item) => {
    if (
      selectedContributor.value !== 'ALL' &&
      item.username.toLowerCase() !== selectedContributor.value.toLowerCase()
    ) {
      return false;
    }
    if (!q) return true;
    if (item.username.toLowerCase().includes(q)) return true;
    if (item.agents.some((a) => `${a.label} ${a.model ?? ''}`.toLowerCase().includes(q))) {
      return true;
    }
    return [
      ...item.completedTasks,
      ...item.decomposedSubtasks,
      ...item.activeTasks,
      ...item.planningTasks,
    ].some((tk) => taskMatchesSearch(tk, q));
  });
});

// --- Layered SVG Graph Layout (Decomposition solid lines + Dependency dashed lines) ---
interface GraphNode {
  task: EnrichedTask;
  col: number;
  x: number;
  y: number;
  highlighted: boolean;
}

interface GraphEdge {
  id: string;
  kind: 'plan' | 'dependency';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlighted: boolean;
}

const NODE_W = 236;
const NODE_H = 88;
const COL_STEP = 286;
const ROW_STEP = 112;

const graphLayout = computed(() => {
  // Show tasks in the DAG: when filtering by stage or search, keep parents/dependencies if needed,
  // or render all enrichedTasks while dimming non-matching ones when only contributor filter is active.
  const q = searchQuery.value.trim().toLowerCase();
  const baseTasks = enrichedTasks.value.filter((tk) => {
    if (!matchesStage(tk, selectedStage.value)) return false;
    if (q && !taskMatchesSearch(tk, q)) return false;
    return true;
  });

  const byId = new Map(baseTasks.map((tk) => [tk.taskId, tk]));
  const depthMemo = new Map<string, number>();

  function computeCol(taskId: string, visiting = new Set<string>()): number {
    if (depthMemo.has(taskId)) return depthMemo.get(taskId)!;
    if (visiting.has(taskId)) return 0;
    visiting.add(taskId);
    const tk = byId.get(taskId);
    if (!tk) return 0;
    if (tk.isPlanning) {
      depthMemo.set(taskId, 0);
      return 0;
    }

    let col = 0;
    if (tk.planId && byId.has(tk.planId)) {
      col = Math.max(col, computeCol(tk.planId, visiting) + 1);
    }
    for (const depId of tk.dependencies) {
      if (byId.has(depId)) {
        col = Math.max(col, computeCol(depId, visiting) + 1);
      }
    }
    depthMemo.set(taskId, col);
    return col;
  }

  for (const tk of baseTasks) computeCol(tk.taskId);

  const columns = new Map<number, EnrichedTask[]>();
  for (const tk of baseTasks) {
    const c = depthMemo.get(tk.taskId) ?? 0;
    const list = columns.get(c) ?? [];
    list.push(tk);
    columns.set(c, list);
  }

  // Sort nodes within each column for visual clarity (planId grouping -> status -> taskId)
  const statusOrder: Record<TaskStatus, number> = {
    Accepted: 0,
    Verifying: 1,
    Submitted: 2,
    Leased: 3,
    Available: 4,
    Pending: 5,
    Proposed: 6,
    Blocked: 7,
    Rejected: 8,
    Cancelled: 9,
  };

  for (const [, list] of columns) {
    list.sort((a, b) => {
      const planCmp = (a.planId ?? '').localeCompare(b.planId ?? '');
      if (planCmp !== 0) return planCmp;
      const stCmp = statusOrder[a.status] - statusOrder[b.status];
      if (stCmp !== 0) return stCmp;
      return a.taskId.localeCompare(b.taskId);
    });
  }

  const maxCol = Math.max(0, ...Array.from(columns.keys()));
  const maxRows = Math.max(1, ...Array.from(columns.values()).map((col) => col.length));

  const nodes: GraphNode[] = [];
  const nodeMap = new Map<string, GraphNode>();

  for (let c = 0; c <= maxCol; c++) {
    const colList = columns.get(c) ?? [];
    colList.forEach((task, rowIdx) => {
      const highlighted =
        selectedContributor.value === 'ALL' ||
        taskInvolvesContributor(task, selectedContributor.value);
      const node: GraphNode = {
        task,
        col: c,
        x: 24 + c * COL_STEP,
        y: 28 + rowIdx * ROW_STEP,
        highlighted,
      };
      nodes.push(node);
      nodeMap.set(task.taskId, node);
    });
  }

  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    const tk = node.task;
    if (tk.planId && nodeMap.has(tk.planId)) {
      const parent = nodeMap.get(tk.planId)!;
      edges.push({
        id: `plan:${parent.task.taskId}->${tk.taskId}`,
        kind: 'plan',
        x1: parent.x + NODE_W,
        y1: parent.y + NODE_H * 0.42,
        x2: node.x,
        y2: node.y + NODE_H * 0.42,
        highlighted: parent.highlighted && node.highlighted,
      });
    }
    for (const depId of tk.dependencies) {
      if (nodeMap.has(depId)) {
        const upstream = nodeMap.get(depId)!;
        edges.push({
          id: `dep:${upstream.task.taskId}->${tk.taskId}`,
          kind: 'dependency',
          x1: upstream.x + NODE_W,
          y1: upstream.y + NODE_H * 0.65,
          x2: node.x,
          y2: node.y + NODE_H * 0.65,
          highlighted: upstream.highlighted && node.highlighted,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    width: Math.max(760, (maxCol + 1) * COL_STEP + 32),
    height: Math.max(220, maxRows * ROW_STEP + 44),
  };
});

// --- Swimlane Columns ---
const swimlaneColumns = computed(() => {
  const list = filteredTasks.value;
  return [
    {
      key: 'queued',
      title: state.locale === 'zh' ? '待审核 / 待前置解锁' : 'Proposed / Pending',
      tone: 'warning' as const,
      items: list.filter((tk) => tk.status === 'Proposed' || tk.status === 'Pending'),
    },
    {
      key: 'available',
      title: state.locale === 'zh' ? '可认领任务池' : 'Available Pool',
      tone: 'accent' as const,
      items: list.filter((tk) => tk.status === 'Available'),
    },
    {
      key: 'leased',
      title: state.locale === 'zh' ? 'Agent 租约执行中' : 'Leased (Running)',
      tone: 'info' as const,
      items: list.filter((tk) => tk.status === 'Leased'),
    },
    {
      key: 'verifying',
      title: state.locale === 'zh' ? '已提交 / 自动验证中' : 'Submitted / Verifying',
      tone: 'info' as const,
      items: list.filter((tk) => tk.status === 'Submitted' || tk.status === 'Verifying'),
    },
    {
      key: 'accepted',
      title: state.locale === 'zh' ? '已验收完成' : 'Accepted (Done)',
      tone: 'success' as const,
      items: list.filter((tk) => tk.status === 'Accepted'),
    },
  ];
});

function statusTone(status: TaskStatus) {
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

function statusLabel(status: TaskStatus): string {
  if (state.locale !== 'zh') return status;
  const map: Record<TaskStatus, string> = {
    Available: '可认领',
    Pending: '待解锁',
    Proposed: '待审核',
    Leased: '执行中',
    Submitted: '已提交',
    Verifying: '验证中',
    Accepted: '已完成',
    Rejected: '已驳回',
    Blocked: '已阻塞',
    Cancelled: '已取消',
  };
  return map[status] ?? status;
}

function nodeStrokeClass(node: GraphNode): string {
  if (selectedTask.value?.taskId === node.task.taskId) {
    return 'fill-teal-700/10 stroke-accent stroke-[2] dark:fill-teal-400/12 dark:stroke-accent-dark';
  }
  if (node.task.isPlanning) {
    return 'fill-violet-500/8 stroke-violet-500/65 stroke-[1.4] hover:stroke-violet-500 dark:fill-violet-400/10 dark:stroke-violet-400/60';
  }
  if (node.task.status === 'Accepted') {
    return 'fill-emerald-600/8 stroke-emerald-600/55 stroke-[1.3] hover:stroke-emerald-600 dark:fill-emerald-400/10 dark:stroke-emerald-400/50';
  }
  if (node.task.status === 'Leased' || node.task.status === 'Verifying' || node.task.status === 'Submitted') {
    return 'fill-sky-600/8 stroke-sky-600/55 stroke-[1.3] hover:stroke-sky-600 dark:fill-sky-400/10 dark:stroke-sky-400/50';
  }
  return 'fill-paper stroke-border-light stroke-[1.2] hover:stroke-ink/50 dark:fill-obsidian dark:stroke-border-dark dark:hover:stroke-chalk/50';
}

function nodeAttributionText(tk: EnrichedTask): string {
  if (tk.isPlanning) {
    const who = tk.plannerUsername ? `@${tk.plannerUsername}` : 'Agent';
    const count = tk.childTaskIds.length;
    return state.locale === 'zh'
      ? `拆解: ${who} (${count} 子任务)`
      : `Plan: ${who} (${count} subtasks)`;
  }
  if (tk.status === 'Accepted' && tk.completerUsername) {
    return state.locale === 'zh'
      ? `✓ @${tk.completerUsername} 已完成`
      : `✓ @${tk.completerUsername} completed`;
  }
  if ((tk.status === 'Leased' || tk.status === 'Verifying' || tk.status === 'Submitted') && tk.assignedUserUsername) {
    return state.locale === 'zh'
      ? `⚡ @${tk.assignedUserUsername} 执行中`
      : `⚡ @${tk.assignedUserUsername} running`;
  }
  if (tk.plannerUsername) {
    return state.locale === 'zh'
      ? `↳ @${tk.plannerUsername} 拆解`
      : `↳ by @${tk.plannerUsername}`;
  }
  return tk.taskType;
}

function truncateText(text: string, max = 26): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function challengeDisplay(challengeId: string): string {
  const entry = props.challengeNameMap[challengeId];
  if (!entry) return challengeId;
  return challengeName(entry);
}

function selectAndInspect(taskId: string) {
  selectedTaskId.value = taskId;
  if (activeView.value !== 'graph') {
    activeView.value = 'graph';
  }
}

function focusContributor(username: string) {
  selectedContributor.value = username;
  activeView.value = 'contributors';
}
</script>

<template>
  <div class="space-y-5">
    <!-- 1. Scheduling Pipeline Overview Strip -->
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <button
        v-for="stage in stageStats"
        :key="stage.key"
        type="button"
        class="flex flex-col justify-between rounded-md border px-3 py-2.5 text-left transition cursor-pointer"
        :class="
          selectedStage === stage.key
            ? 'border-accent bg-accent/10 dark:border-accent-dark dark:bg-accent-dark/12'
            : 'border-border-light bg-surface hover:border-ink/30 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-chalk/30'
        "
        @click="selectedStage = selectedStage === stage.key ? 'ALL' : stage.key"
      >
        <div class="flex items-center justify-between gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="stage.dotClass" />
          <span class="font-mono text-lg font-semibold tabular-nums text-ink dark:text-chalk">
            {{ stage.count }}
          </span>
        </div>
        <span class="mt-1.5 truncate text-[11.5px] font-medium text-ink-muted dark:text-chalk-muted">
          {{ stage.label }}
        </span>
      </button>
    </div>

    <!-- 2. View Mode Switcher & Contributor/Search Filters -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-light bg-surface p-3 dark:border-border-dark dark:bg-obsidian-surface"
    >
      <div class="flex flex-wrap items-center gap-1" role="tablist" aria-label="Scheduler views">
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'graph'"
          class="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            activeView === 'graph'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'text-ink-muted hover:bg-subtle hover:text-ink dark:text-chalk-muted dark:hover:bg-obsidian-subtle dark:hover:text-chalk'
          "
          @click="activeView = 'graph'"
        >
          <Network class="h-3.5 w-3.5" />
          <span>{{ t.scheduler.views.graph }}</span>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'decomposition'"
          class="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            activeView === 'decomposition'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'text-ink-muted hover:bg-subtle hover:text-ink dark:text-chalk-muted dark:hover:bg-obsidian-subtle dark:hover:text-chalk'
          "
          @click="activeView = 'decomposition'"
        >
          <GitBranch class="h-3.5 w-3.5" />
          <span>{{ t.scheduler.views.decomposition }}</span>
          <span
            class="rounded px-1 font-mono text-[10px]"
            :class="
              activeView === 'decomposition'
                ? 'bg-paper/20 text-paper dark:bg-obsidian/20 dark:text-obsidian'
                : 'bg-subtle text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted'
            "
          >
            {{ decompositionGroups.length }}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'contributors'"
          class="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            activeView === 'contributors'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'text-ink-muted hover:bg-subtle hover:text-ink dark:text-chalk-muted dark:hover:bg-obsidian-subtle dark:hover:text-chalk'
          "
          @click="activeView = 'contributors'"
        >
          <Users class="h-3.5 w-3.5" />
          <span>{{ t.scheduler.views.contributors }}</span>
          <span
            class="rounded px-1 font-mono text-[10px]"
            :class="
              activeView === 'contributors'
                ? 'bg-paper/20 text-paper dark:bg-obsidian/20 dark:text-obsidian'
                : 'bg-subtle text-ink-muted dark:bg-obsidian-subtle dark:text-chalk-muted'
            "
          >
            {{ contributorSummaries.length }}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'board'"
          class="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition cursor-pointer"
          :class="
            activeView === 'board'
              ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
              : 'text-ink-muted hover:bg-subtle hover:text-ink dark:text-chalk-muted dark:hover:bg-obsidian-subtle dark:hover:text-chalk'
          "
          @click="activeView = 'board'"
        >
          <Kanban class="h-3.5 w-3.5" />
          <span>{{ t.scheduler.views.board }}</span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- Contributor Selector -->
        <select
          v-model="selectedContributor"
          aria-label="Filter by contributor"
          class="rounded border border-border-light bg-paper px-2.5 py-1.5 font-mono text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
        >
          <option value="ALL">{{ t.scheduler.allContributors }} ({{ contributorSummaries.length }})</option>
          <option v-for="c in contributorSummaries" :key="c.username" :value="c.username">
            @{{ c.username }} ({{ c.completedTasks.length + c.extraContributions.length }}✓ / {{ c.decomposedSubtasks.length }}↳)
          </option>
        </select>

        <!-- Search Input -->
        <div class="relative">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint dark:text-chalk-faint"
          />
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="t.scheduler.searchPlaceholder"
            class="w-52 rounded border border-border-light bg-paper py-1.5 pr-2.5 pl-8 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none sm:w-64 dark:border-border-dark dark:bg-obsidian dark:text-chalk dark:placeholder:text-chalk-faint dark:focus:border-accent-dark"
          />
        </div>

        <button
          v-if="hasActiveFilter"
          type="button"
          class="inline-flex items-center gap-1 rounded border border-border-light px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
          @click="resetFilters"
        >
          <RotateCcw class="h-3 w-3" />
          <span>{{ t.scheduler.resetFilters }}</span>
        </button>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- VIEW 1: Scheduling & Decomposition SVG DAG + Provenance Inspector   -->
    <!-- =================================================================== -->
    <div v-if="activeView === 'graph'" class="space-y-4">
      <div
        class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <!-- Legend -->
        <div
          class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border-light pb-2.5 text-[11px] text-ink-muted dark:border-border-dark dark:text-chalk-muted"
        >
          <div class="flex flex-wrap items-center gap-4">
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block h-0.5 w-5 bg-accent dark:bg-accent-dark" />
              <span>{{ t.scheduler.legendDecomposition }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block h-0 w-5 border-t border-dashed border-ink-faint dark:border-chalk-faint" />
              <span>{{ t.scheduler.legendDependency }}</span>
            </span>
          </div>
          <span class="font-mono text-ink-faint dark:text-chalk-faint">
            {{ graphLayout.nodes.length }} {{ state.locale === 'zh' ? '个任务节点' : 'nodes' }} ·
            {{ graphLayout.edges.length }} {{ state.locale === 'zh' ? '条调度边' : 'edges' }}
          </span>
        </div>

        <div
          v-if="graphLayout.nodes.length === 0"
          class="py-10 text-center text-sm text-ink-muted dark:text-chalk-muted"
        >
          {{ t.challenge.noTasksMatch }}
        </div>

        <div v-else class="overflow-x-auto">
          <svg
            :width="graphLayout.width"
            :height="graphLayout.height"
            :viewBox="`0 0 ${graphLayout.width} ${graphLayout.height}`"
            class="block"
            role="img"
            aria-label="Task pool decomposition and scheduling dependency graph"
          >
            <defs>
              <marker
                id="sched-plan-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" class="fill-accent dark:fill-accent-dark" />
              </marker>
              <marker
                id="sched-dep-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" class="fill-ink-faint dark:fill-chalk-faint" />
              </marker>
            </defs>

            <!-- Edges -->
            <path
              v-for="edge in graphLayout.edges"
              :key="edge.id"
              :d="`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2 - 4} ${edge.y2}`"
              fill="none"
              :stroke-width="edge.kind === 'plan' ? 1.8 : 1.3"
              :stroke-dasharray="edge.kind === 'dependency' ? '5 4' : undefined"
              :marker-end="edge.kind === 'plan' ? 'url(#sched-plan-arrow)' : 'url(#sched-dep-arrow)'"
              :class="[
                edge.kind === 'plan'
                  ? 'stroke-accent/80 dark:stroke-accent-dark/80'
                  : 'stroke-ink-faint/65 dark:stroke-chalk-faint/65',
                edge.highlighted ? 'opacity-100' : 'opacity-20',
              ]"
            />

            <!-- Nodes -->
            <g
              v-for="node in graphLayout.nodes"
              :key="node.task.taskId"
              class="cursor-pointer transition-opacity"
              :class="node.highlighted ? 'opacity-100' : 'opacity-25'"
              @click="selectedTaskId = node.task.taskId"
            >
              <rect
                :x="node.x"
                :y="node.y"
                :width="NODE_W"
                :height="NODE_H"
                rx="7"
                :class="nodeStrokeClass(node)"
              />
              <!-- Task ID & Status -->
              <text
                :x="node.x + 12"
                :y="node.y + 21"
                class="fill-ink-faint font-mono text-[10px] font-medium dark:fill-chalk-faint"
              >
                {{ node.task.isPlanning ? `[${t.scheduler.planningBadge}] ` : '' }}{{ node.task.taskId }}
              </text>
              <text
                :x="node.x + NODE_W - 12"
                :y="node.y + 21"
                text-anchor="end"
                class="font-mono text-[10px] font-semibold"
                :class="
                  node.task.status === 'Accepted'
                    ? 'fill-emerald-700 dark:fill-emerald-400'
                    : node.task.status === 'Leased' || node.task.status === 'Verifying'
                      ? 'fill-sky-700 dark:fill-sky-400'
                      : node.task.status === 'Available'
                        ? 'fill-accent dark:fill-accent-dark'
                        : 'fill-ink-faint dark:fill-chalk-faint'
                "
              >
                {{ statusLabel(node.task.status) }}
              </text>

              <!-- Title -->
              <text
                :x="node.x + 12"
                :y="node.y + 44"
                class="fill-ink text-[11.5px] font-semibold dark:fill-chalk"
              >
                {{ truncateText(loc(node.task.title), 25) }}
              </text>

              <!-- Attribution line -->
              <text
                :x="node.x + 12"
                :y="node.y + 68"
                class="font-mono text-[10px]"
                :class="
                  node.task.status === 'Accepted'
                    ? 'fill-emerald-700 dark:fill-emerald-300'
                    : node.task.isPlanning
                      ? 'fill-violet-700 dark:fill-violet-300'
                      : 'fill-accent dark:fill-accent-dark'
                "
              >
                {{ truncateText(nodeAttributionText(node.task), 32) }}
              </text>
            </g>
          </svg>
        </div>
      </div>

      <!-- Task Provenance & Scheduling Inspector -->
      <div
        v-if="selectedTask"
        class="rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs font-semibold text-ink dark:text-chalk">
                {{ selectedTask.taskId }}
              </span>
              <StatusPill
                v-if="selectedTask.isPlanning"
                :label="t.scheduler.planningBadge"
                tone="warning"
                :mono="state.locale !== 'zh'"
              />
              <StatusPill
                :label="statusLabel(selectedTask.status)"
                :tone="statusTone(selectedTask.status)"
                :mono="state.locale !== 'zh'"
              />
              <StatusPill :label="selectedTask.taskType" tone="neutral" />
              <StatusPill
                v-if="showChallengeBadge"
                :label="challengeDisplay(selectedTask.challengeId)"
                tone="neutral"
                :mono="false"
              />
              <StatusPill v-if="selectedTask.isDemo" label="DEMO" tone="demo" />
            </div>
            <h3 class="text-base font-semibold text-ink dark:text-chalk">
              {{ loc(selectedTask.title) }}
            </h3>
            <p class="max-w-3xl text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
              {{ loc(selectedTask.description) }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <RouterLink
              v-if="selectedTask.effectiveCredentialId"
              :to="`/credentials/${selectedTask.effectiveCredentialId}`"
              class="inline-flex items-center gap-1.5 rounded border border-border-light px-2.5 py-1 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:text-chalk"
            >
              <ShieldCheck class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>{{ state.locale === 'zh' ? '查验贡献凭证' : 'Verify Credential' }}</span>
            </RouterLink>
            <a
              v-if="selectedTask.prUrl"
              :href="selectedTask.prUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 rounded border border-border-light px-2.5 py-1 font-mono text-xs text-accent hover:underline dark:border-border-dark dark:text-accent-dark"
            >
              <span>GitHub PR</span>
              <ExternalLink class="h-3 w-3" />
            </a>
          </div>
        </div>

        <!-- Two-Column Attribution Cards: Decomposition Origin + Execution/Completion -->
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <!-- Decomposition Origin Card -->
          <div
            class="rounded border border-border-light bg-paper p-3.5 dark:border-border-dark dark:bg-obsidian"
          >
            <div class="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
              <GitBranch class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
              <span>{{ t.scheduler.decompositionOrigin }}</span>
            </div>

            <template v-if="selectedTask.isPlanning">
              <div class="mt-2.5 flex items-center gap-2.5">
                <img
                  v-if="selectedTask.plannerAvatarUrl"
                  :src="selectedTask.plannerAvatarUrl"
                  :alt="selectedTask.plannerUsername ?? 'planner'"
                  class="h-7 w-7 rounded"
                />
                <div class="min-w-0 text-xs">
                  <div class="text-ink dark:text-chalk">
                    <span v-if="state.locale === 'zh'">贡献者 </span>
                    <button
                      v-if="selectedTask.plannerUsername"
                      type="button"
                      class="font-mono font-semibold text-accent hover:underline dark:text-accent-dark cursor-pointer"
                      @click="focusContributor(selectedTask.plannerUsername)"
                    >
                      @{{ selectedTask.plannerUsername }}
                    </button>
                    <span>
                      {{
                        state.locale === 'zh'
                          ? ` 的 Agent 分解了 ${selectedTask.childTaskIds.length} 个子任务`
                          : `'s agent decomposed ${selectedTask.childTaskIds.length} subtasks`
                      }}
                    </span>
                  </div>
                  <div
                    v-if="selectedTask.plannerAgentLabel || selectedTask.plannerAgentModel"
                    class="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-muted dark:text-chalk-muted"
                  >
                    <Bot class="h-3 w-3" />
                    <span v-if="selectedTask.plannerAgentLabel">{{ selectedTask.plannerAgentLabel }}</span>
                    <span v-if="selectedTask.plannerAgentModel">
                      ({{ selectedTask.plannerAgentModel }} · {{ t.challenge.selfReportedTag }})
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="selectedTask.childTaskIds.length > 0" class="mt-3 flex flex-wrap gap-1.5">
                <button
                  v-for="cid in selectedTask.childTaskIds"
                  :key="cid"
                  type="button"
                  class="inline-flex items-center gap-1 rounded border border-border-light bg-surface px-2 py-0.5 font-mono text-[11px] text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
                  @click="selectedTaskId = cid"
                >
                  <span>{{ cid }}</span>
                  <span
                    v-if="enrichedById.get(cid)"
                    class="text-[10px] text-ink-faint dark:text-chalk-faint"
                  >
                    · {{ statusLabel(enrichedById.get(cid)!.status) }}
                  </span>
                </button>
              </div>
            </template>

            <template v-else-if="selectedTask.plannerUsername">
              <div class="mt-2.5 flex items-center gap-2.5">
                <img
                  v-if="selectedTask.plannerAvatarUrl"
                  :src="selectedTask.plannerAvatarUrl"
                  :alt="selectedTask.plannerUsername"
                  class="h-7 w-7 rounded"
                />
                <div class="min-w-0 text-xs">
                  <div class="text-ink dark:text-chalk">
                    <span>{{ state.locale === 'zh' ? '由贡献者 ' : 'Decomposed by ' }}</span>
                    <button
                      type="button"
                      class="font-mono font-semibold text-accent hover:underline dark:text-accent-dark cursor-pointer"
                      @click="focusContributor(selectedTask.plannerUsername!)"
                    >
                      @{{ selectedTask.plannerUsername }}
                    </button>
                    <span>{{ state.locale === 'zh' ? ' 的 Agent 拆解生成' : `'s agent` }}</span>
                  </div>
                  <div
                    v-if="selectedTask.plannerAgentLabel || selectedTask.plannerAgentModel"
                    class="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-muted dark:text-chalk-muted"
                  >
                    <Bot class="h-3 w-3" />
                    <span v-if="selectedTask.plannerAgentLabel">{{ selectedTask.plannerAgentLabel }}</span>
                    <span v-if="selectedTask.plannerAgentModel">
                      ({{ selectedTask.plannerAgentModel }})
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="selectedTask.planId" class="mt-2.5 text-[11px] text-ink-muted dark:text-chalk-muted">
                <span>{{ t.scheduler.parentPlan }}: </span>
                <button
                  type="button"
                  class="rounded bg-subtle px-1.5 py-0.5 font-mono text-ink hover:underline dark:bg-obsidian-subtle dark:text-chalk cursor-pointer"
                  @click="selectedTaskId = selectedTask.planId!"
                >
                  {{ selectedTask.planId }}
                </button>
              </div>
            </template>

            <p v-else class="mt-2 text-xs text-ink-muted dark:text-chalk-muted">
              {{ t.scheduler.seedTaskNote }}
            </p>
          </div>

          <!-- Execution & Completion Record Card -->
          <div
            class="rounded border border-border-light bg-paper p-3.5 dark:border-border-dark dark:bg-obsidian"
          >
            <div class="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
              <UserCheck class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{{ t.scheduler.executionRecord }}</span>
            </div>

            <template v-if="selectedTask.status === 'Accepted' && selectedTask.completerUsername">
              <div class="mt-2.5 flex items-center gap-2.5">
                <img
                  v-if="selectedTask.completerAvatarUrl"
                  :src="selectedTask.completerAvatarUrl"
                  :alt="selectedTask.completerUsername"
                  class="h-7 w-7 rounded"
                />
                <div class="min-w-0 text-xs">
                  <div class="text-ink dark:text-chalk">
                    <span>{{ state.locale === 'zh' ? '贡献者 ' : 'Completed by ' }}</span>
                    <button
                      type="button"
                      class="font-mono font-semibold text-emerald-700 hover:underline dark:text-emerald-300 cursor-pointer"
                      @click="focusContributor(selectedTask.completerUsername!)"
                    >
                      @{{ selectedTask.completerUsername }}
                    </button>
                    <span>{{ state.locale === 'zh' ? ' 完成了此任务' : '' }}</span>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                    <CheckCircle2 class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <span v-if="selectedTask.completerAgentLabel">{{ selectedTask.completerAgentLabel }}</span>
                    <span v-if="selectedTask.completerAgentModel">
                      ({{ selectedTask.completerAgentModel }})
                    </span>
                    <span v-if="selectedTask.effectiveCompletedAt">
                      · {{ selectedTask.effectiveCompletedAt.slice(0, 10) }}
                    </span>
                  </div>
                </div>
              </div>
              <p
                v-if="selectedTask.matchedContribution"
                class="mt-2 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted"
              >
                {{ loc(selectedTask.matchedContribution.verificationSummary) }}
              </p>
            </template>

            <template
              v-else-if="
                (selectedTask.status === 'Leased' ||
                  selectedTask.status === 'Submitted' ||
                  selectedTask.status === 'Verifying') &&
                selectedTask.assignedUserUsername
              "
            >
              <div class="mt-2.5 flex items-center gap-2.5">
                <img
                  v-if="selectedTask.assignedUserAvatarUrl"
                  :src="selectedTask.assignedUserAvatarUrl"
                  :alt="selectedTask.assignedUserUsername"
                  class="h-7 w-7 rounded"
                />
                <div class="min-w-0 text-xs">
                  <div class="text-ink dark:text-chalk">
                    <span>{{ state.locale === 'zh' ? '贡献者 ' : 'In progress by ' }}</span>
                    <button
                      type="button"
                      class="font-mono font-semibold text-sky-700 hover:underline dark:text-sky-300 cursor-pointer"
                      @click="focusContributor(selectedTask.assignedUserUsername!)"
                    >
                      @{{ selectedTask.assignedUserUsername }}
                    </button>
                    <span>{{ state.locale === 'zh' ? ' 的 Agent 正在执行' : `'s agent` }}</span>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                    <Clock class="h-3 w-3 text-sky-600 dark:text-sky-400" />
                    <span v-if="selectedTask.assignedAgentLabel">{{ selectedTask.assignedAgentLabel }}</span>
                    <span v-if="selectedTask.assignedAgentModelSelfReported">
                      ({{ selectedTask.assignedAgentModelSelfReported }})
                    </span>
                    <span v-if="selectedTask.leaseExpiresAt">
                      · lease until {{ selectedTask.leaseExpiresAt.slice(0, 16).replace('T', ' ') }}Z
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <p class="mt-2 text-xs text-ink-muted dark:text-chalk-muted">
                {{
                  selectedTask.status === 'Pending'
                    ? t.scheduler.waitingForDeps
                    : t.scheduler.waitingForClaim
                }}
              </p>
              <div v-if="selectedTask.dependencies.length > 0" class="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span class="text-ink-muted dark:text-chalk-muted">{{ t.challenge.dependencies }}:</span>
                <button
                  v-for="depId in selectedTask.dependencies"
                  :key="depId"
                  type="button"
                  class="rounded border border-border-light bg-surface px-1.5 py-0.5 font-mono text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
                  @click="selectedTaskId = depId"
                >
                  {{ depId }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- VIEW 2: Agent Subtask Decomposition Breakdown                       -->
    <!-- =================================================================== -->
    <div v-else-if="activeView === 'decomposition'" class="space-y-4">
      <div
        v-if="decompositionGroups.length === 0"
        class="rounded-md border border-border-light bg-surface p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
      >
        {{ t.scheduler.noDecompositions }}
      </div>

      <article
        v-for="group in decompositionGroups"
        :key="group.id"
        class="rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <!-- Planning Agent Header -->
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-4 dark:border-border-dark">
          <div class="flex items-start gap-3">
            <img
              v-if="group.plannerAvatarUrl"
              :src="group.plannerAvatarUrl"
              :alt="group.plannerUsername"
              class="mt-0.5 h-10 w-10 rounded-md border border-border-light dark:border-border-dark"
            />
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink dark:text-chalk">
                <RouterLink
                  :to="`/u/${group.plannerUsername}`"
                  class="font-mono text-accent hover:underline dark:text-accent-dark"
                >
                  @{{ group.plannerUsername }}
                </RouterLink>
                <span>
                  {{
                    state.locale === 'zh'
                      ? `的 Agent 分解了 ${group.subtasks.length} 个子任务`
                      : `'s agent decomposed ${group.subtasks.length} subtasks`
                  }}
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                <span v-if="group.agentLabel" class="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 text-ink dark:bg-obsidian-subtle dark:text-chalk">
                  <Bot class="h-3 w-3 text-accent dark:text-accent-dark" />
                  {{ group.agentLabel }}
                </span>
                <span v-if="group.agentModel">
                  {{ group.agentModel }} ({{ t.challenge.selfReportedTag }})
                </span>
                <span v-if="group.planTask">· {{ group.planTask.taskId }}</span>
                <span v-if="showChallengeBadge">· {{ challengeDisplay(group.challengeId) }}</span>
              </div>

              <p
                v-if="group.planTask"
                class="pt-1 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted"
              >
                {{ loc(group.planTask.title) }} — {{ loc(group.planTask.description) }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill
              :label="`${group.completedCount}/${group.subtasks.length} ${state.locale === 'zh' ? '已完成' : 'done'}`"
              tone="success"
              :mono="false"
            />
            <StatusPill
              v-if="group.activeCount > 0"
              :label="`${group.activeCount} ${state.locale === 'zh' ? '执行/验证中' : 'active'}`"
              tone="info"
              :mono="false"
            />
          </div>
        </div>

        <!-- Stacked Progress Bar of Decomposed Subtasks -->
        <div
          v-if="group.subtasks.length > 0"
          class="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-subtle dark:bg-obsidian-subtle"
        >
          <div
            class="h-full bg-emerald-600 transition-all dark:bg-emerald-400"
            :style="{ width: `${(group.completedCount / group.subtasks.length) * 100}%` }"
          />
          <div
            class="h-full bg-sky-500 transition-all"
            :style="{ width: `${(group.activeCount / group.subtasks.length) * 100}%` }"
          />
          <div
            class="h-full bg-teal-600/45 transition-all dark:bg-teal-400/45"
            :style="{ width: `${(group.openCount / group.subtasks.length) * 100}%` }"
          />
        </div>

        <!-- Decomposed Subtask Tree -->
        <ul class="mt-4 space-y-2 border-l-2 border-accent/30 pl-4 dark:border-accent-dark/30">
          <li
            v-for="sub in group.subtasks"
            :key="sub.taskId"
            class="relative rounded border border-border-light bg-paper p-3 transition hover:border-accent/50 dark:border-border-dark dark:bg-obsidian dark:hover:border-accent-dark/50"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    class="font-mono text-xs font-semibold text-ink hover:text-accent hover:underline dark:text-chalk dark:hover:text-accent-dark cursor-pointer"
                    @click="selectAndInspect(sub.taskId)"
                  >
                    {{ sub.taskId }}
                  </button>
                  <StatusPill
                    :label="statusLabel(sub.status)"
                    :tone="statusTone(sub.status)"
                    :mono="state.locale !== 'zh'"
                  />
                  <StatusPill :label="sub.taskType" tone="neutral" />
                  <span
                    v-if="sub.dependencies.length > 0"
                    class="font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint"
                  >
                    ← {{ sub.dependencies.join(', ') }}
                  </span>
                </div>
                <div class="text-xs font-medium text-ink dark:text-chalk">
                  {{ loc(sub.title) }}
                </div>
              </div>

              <!-- Downstream Completion / Execution Status -->
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <template v-if="sub.status === 'Accepted' && sub.completerUsername">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded bg-emerald-600/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-800 hover:underline dark:bg-emerald-400/12 dark:text-emerald-300 cursor-pointer"
                    @click="focusContributor(sub.completerUsername!)"
                  >
                    <CheckCircle2 class="h-3 w-3" />
                    <span>
                      {{
                        state.locale === 'zh'
                          ? `@${sub.completerUsername} 已完成`
                          : `Completed by @${sub.completerUsername}`
                      }}
                    </span>
                  </button>
                </template>
                <template
                  v-else-if="
                    (sub.status === 'Leased' || sub.status === 'Verifying' || sub.status === 'Submitted') &&
                    sub.assignedUserUsername
                  "
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded bg-sky-600/10 px-2 py-0.5 font-mono text-[11px] font-medium text-sky-900 hover:underline dark:bg-sky-400/12 dark:text-sky-300 cursor-pointer"
                    @click="focusContributor(sub.assignedUserUsername!)"
                  >
                    <Clock class="h-3 w-3" />
                    <span>
                      {{
                        state.locale === 'zh'
                          ? `@${sub.assignedUserUsername} 执行中`
                          : `@${sub.assignedUserUsername} running`
                      }}
                    </span>
                  </button>
                </template>
                <a
                  v-if="sub.prUrl"
                  :href="sub.prUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-0.5 font-mono text-[11px] text-accent hover:underline dark:text-accent-dark"
                >
                  <span>PR</span>
                  <ExternalLink class="h-3 w-3" />
                </a>
              </div>
            </div>
          </li>
        </ul>
      </article>
    </div>

    <!-- =================================================================== -->
    <!-- VIEW 3: Contributor Task Completions & Decomposition Ledger         -->
    <!-- =================================================================== -->
    <div v-else-if="activeView === 'contributors'" class="space-y-4">
      <div
        v-if="filteredContributorSummaries.length === 0"
        class="rounded-md border border-border-light bg-surface p-8 text-center text-sm text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
      >
        {{ t.scheduler.noContributorRecords }}
      </div>

      <article
        v-for="person in filteredContributorSummaries"
        :key="person.username"
        class="rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <!-- Contributor Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-4 dark:border-border-dark">
          <div class="flex items-center gap-3">
            <img
              v-if="person.avatarUrl"
              :src="person.avatarUrl"
              :alt="person.username"
              class="h-11 w-11 rounded-md border border-border-light dark:border-border-dark"
            />
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <RouterLink
                  :to="`/u/${person.username}`"
                  class="font-mono text-base font-semibold text-ink hover:text-accent hover:underline dark:text-chalk dark:hover:text-accent-dark"
                >
                  @{{ person.username }}
                </RouterLink>
                <span
                  v-for="ag in person.agents"
                  :key="`${ag.label}-${ag.model}`"
                  class="inline-flex items-center gap-1 rounded border border-border-light bg-subtle px-2 py-0.5 font-mono text-[10.5px] text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle dark:text-chalk-muted"
                >
                  <Bot class="h-3 w-3 text-accent dark:text-accent-dark" />
                  <span>{{ ag.label }}</span>
                  <span v-if="ag.model" class="text-ink-faint dark:text-chalk-faint">· {{ ag.model }}</span>
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted dark:text-chalk-muted">
                <span>
                  <strong class="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                    {{ person.completedTasks.length + person.extraContributions.length }}
                  </strong>
                  {{ state.locale === 'zh' ? ' 项已完成任务' : ' completed tasks' }}
                </span>
                <span>
                  <strong class="font-mono font-semibold text-accent dark:text-accent-dark">
                    {{ person.decomposedSubtasks.length }}
                  </strong>
                  {{ state.locale === 'zh' ? ' 项 Agent 分解子任务' : ' subtasks decomposed' }}
                </span>
                <span v-if="person.activeTasks.length > 0">
                  <strong class="font-mono font-semibold text-sky-700 dark:text-sky-300">
                    {{ person.activeTasks.length }}
                  </strong>
                  {{ state.locale === 'zh' ? ' 项执行/验证中' : ' active/verifying' }}
                </span>
              </div>
            </div>
          </div>

          <RouterLink
            :to="`/u/${person.username}`"
            class="rounded border border-border-light px-2.5 py-1 text-xs font-medium text-ink-muted hover:border-ink/40 hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk"
          >
            {{ t.contributors.viewProfile }} →
          </RouterLink>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <!-- Completed Tasks by Contributor -->
          <div class="space-y-2.5">
            <h4 class="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
              <CheckCircle2 class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                {{
                  state.locale === 'zh'
                    ? `贡献者 @${person.username} 完成的任务`
                    : `Tasks Completed by @${person.username}`
                }}
              </span>
            </h4>

            <div
              v-if="person.completedTasks.length === 0 && person.extraContributions.length === 0"
              class="rounded border border-dashed border-border-light p-3 text-xs text-ink-faint dark:border-border-dark dark:text-chalk-faint"
            >
              {{ state.locale === 'zh' ? '暂无已验收完成的任务。' : 'No completed tasks yet.' }}
            </div>

            <ul v-else class="space-y-2">
              <li
                v-for="tk in person.completedTasks"
                :key="tk.taskId"
                class="rounded border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      class="font-mono text-xs font-semibold text-ink hover:text-accent hover:underline dark:text-chalk dark:hover:text-accent-dark cursor-pointer"
                      @click="selectAndInspect(tk.taskId)"
                    >
                      {{ tk.taskId }}
                    </button>
                    <StatusPill
                      v-if="tk.isPlanning"
                      :label="t.scheduler.planningBadge"
                      tone="warning"
                      :mono="state.locale !== 'zh'"
                    />
                    <StatusPill :label="tk.taskType" tone="neutral" />
                  </div>
                  <span
                    v-if="tk.effectiveCompletedAt"
                    class="font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint"
                  >
                    {{ tk.effectiveCompletedAt.slice(0, 10) }}
                  </span>
                </div>
                <div class="mt-1 text-xs font-medium text-ink dark:text-chalk">
                  {{ loc(tk.title) }}
                </div>
                <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted dark:text-chalk-muted">
                  <span class="font-mono">
                    <span v-if="tk.completerAgentLabel">{{ tk.completerAgentLabel }}</span>
                    <span v-if="tk.completerAgentModel"> ({{ tk.completerAgentModel }})</span>
                  </span>
                  <div class="flex items-center gap-2.5">
                    <RouterLink
                      v-if="tk.effectiveCredentialId"
                      :to="`/credentials/${tk.effectiveCredentialId}`"
                      class="inline-flex items-center gap-0.5 font-mono text-accent hover:underline dark:text-accent-dark"
                    >
                      <ShieldCheck class="h-3 w-3" />
                      <span>{{ tk.effectiveCredentialId }}</span>
                    </RouterLink>
                    <a
                      v-if="tk.prUrl"
                      :href="tk.prUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-0.5 font-mono text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
                    >
                      <span>PR</span>
                      <ExternalLink class="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </li>

              <!-- Extra verified contributions linked to tasks -->
              <li
                v-for="contrib in person.extraContributions"
                :key="contrib.id"
                class="rounded border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-mono text-xs font-semibold text-ink dark:text-chalk">
                      {{ contrib.taskId }}
                    </span>
                    <StatusPill :label="contrib.contributionType" tone="success" />
                  </div>
                  <span class="font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint">
                    {{ contrib.acceptedAt.slice(0, 10) }}
                  </span>
                </div>
                <div class="mt-1 text-xs font-medium text-ink dark:text-chalk">
                  {{ loc(contrib.title) }}
                </div>
                <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted dark:text-chalk-muted">
                  <span class="font-mono">{{ contrib.selfReportedAgentModel }}</span>
                  <div class="flex items-center gap-2.5">
                    <RouterLink
                      v-if="contrib.credentialId"
                      :to="`/credentials/${contrib.credentialId}`"
                      class="inline-flex items-center gap-0.5 font-mono text-accent hover:underline dark:text-accent-dark"
                    >
                      <ShieldCheck class="h-3 w-3" />
                      <span>{{ contrib.credentialId }}</span>
                    </RouterLink>
                    <a
                      :href="contrib.prUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-0.5 font-mono text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk"
                    >
                      <span>PR #{{ contrib.prNumber }}</span>
                      <ExternalLink class="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- Subtasks Decomposed by Contributor's Agent (+ Active Work) -->
          <div class="space-y-4">
            <div class="space-y-2.5">
              <h4 class="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
                <Sparkles class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
                <span>
                  {{
                    state.locale === 'zh'
                      ? `@${person.username} 的 Agent 分解的子任务`
                      : `Subtasks Decomposed by @${person.username}'s Agent`
                  }}
                </span>
              </h4>

              <div
                v-if="person.decomposedSubtasks.length === 0"
                class="rounded border border-dashed border-border-light p-3 text-xs text-ink-faint dark:border-border-dark dark:text-chalk-faint"
              >
                {{
                  state.locale === 'zh'
                    ? '该贡献者的 Agent 尚未拆解规划子任务。'
                    : 'No subtasks decomposed by this contributor’s agent yet.'
                }}
              </div>

              <ul v-else class="space-y-2">
                <li
                  v-for="sub in person.decomposedSubtasks"
                  :key="sub.taskId"
                  class="rounded border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        class="font-mono text-xs font-semibold text-ink hover:text-accent hover:underline dark:text-chalk dark:hover:text-accent-dark cursor-pointer"
                        @click="selectAndInspect(sub.taskId)"
                      >
                        {{ sub.taskId }}
                      </button>
                      <StatusPill
                        :label="statusLabel(sub.status)"
                        :tone="statusTone(sub.status)"
                        :mono="state.locale !== 'zh'"
                      />
                    </div>
                    <span
                      v-if="sub.planId"
                      class="font-mono text-[10.5px] text-ink-faint dark:text-chalk-faint"
                    >
                      {{ sub.planId }}
                    </span>
                  </div>
                  <div class="mt-1 text-xs font-medium text-ink dark:text-chalk">
                    {{ loc(sub.title) }}
                  </div>
                  <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                    <span v-if="sub.plannerAgentLabel">
                      via {{ sub.plannerAgentLabel }}
                    </span>
                    <span
                      v-if="sub.status === 'Accepted' && sub.completerUsername"
                      class="text-emerald-700 dark:text-emerald-300"
                    >
                      ✓ @{{ sub.completerUsername }}
                    </span>
                    <span
                      v-else-if="sub.assignedUserUsername"
                      class="text-sky-700 dark:text-sky-300"
                    >
                      ⚡ @{{ sub.assignedUserUsername }}
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Currently Leased / Verifying -->
            <div v-if="person.activeTasks.length > 0" class="space-y-2">
              <h4 class="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
                <Clock class="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span>{{ t.scheduler.activeTasks }}</span>
              </h4>
              <ul class="space-y-2">
                <li
                  v-for="act in person.activeTasks"
                  :key="act.taskId"
                  class="rounded border border-sky-700/25 bg-sky-50/40 p-3 dark:border-sky-400/25 dark:bg-sky-950/20"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      class="font-mono text-xs font-semibold text-ink hover:underline dark:text-chalk cursor-pointer"
                      @click="selectAndInspect(act.taskId)"
                    >
                      {{ act.taskId }}
                    </button>
                    <StatusPill
                      :label="statusLabel(act.status)"
                      :tone="statusTone(act.status)"
                      :mono="state.locale !== 'zh'"
                    />
                  </div>
                  <div class="mt-1 text-xs font-medium text-ink dark:text-chalk">
                    {{ loc(act.title) }}
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- =================================================================== -->
    <!-- VIEW 4: Scheduling Status Swimlanes (Kanban)                        -->
    <!-- =================================================================== -->
    <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <div
        v-for="col in swimlaneColumns"
        :key="col.key"
        class="flex flex-col rounded-md border border-border-light bg-subtle/40 p-3 dark:border-border-dark dark:bg-obsidian-subtle/40"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-ink dark:text-chalk">{{ col.title }}</span>
          <StatusPill :label="String(col.items.length)" :tone="col.tone" />
        </div>

        <div
          v-if="col.items.length === 0"
          class="rounded border border-dashed border-border-light py-6 text-center text-xs text-ink-faint dark:border-border-dark dark:text-chalk-faint"
        >
          {{ t.scheduler.noTasksInColumn }}
        </div>

        <div v-else class="space-y-2.5">
          <button
            v-for="tk in col.items"
            :key="tk.taskId"
            type="button"
            class="block w-full rounded border border-border-light bg-surface p-3 text-left transition hover:border-accent/60 dark:border-border-dark dark:bg-obsidian-surface dark:hover:border-accent-dark/60 cursor-pointer"
            @click="selectAndInspect(tk.taskId)"
          >
            <div class="flex flex-wrap items-center justify-between gap-1">
              <span class="font-mono text-[11px] font-semibold text-ink dark:text-chalk">
                {{ tk.taskId }}
              </span>
              <StatusPill
                v-if="tk.isPlanning"
                :label="t.scheduler.planningBadge"
                tone="warning"
                :mono="state.locale !== 'zh'"
              />
              <span
                v-else
                class="font-mono text-[10px] text-ink-faint dark:text-chalk-faint"
              >
                {{ tk.taskType }}
              </span>
            </div>

            <div class="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-ink dark:text-chalk">
              {{ loc(tk.title) }}
            </div>

            <div class="mt-2.5 space-y-1 border-t border-border-light pt-2 font-mono text-[10.5px] dark:border-border-dark">
              <div
                v-if="tk.plannerUsername"
                class="truncate text-ink-muted dark:text-chalk-muted"
              >
                <Layers class="mr-1 inline h-3 w-3 text-accent dark:text-accent-dark" />
                <span>
                  {{
                    state.locale === 'zh'
                      ? `@${tk.plannerUsername} 拆解`
                      : `Plan @${tk.plannerUsername}`
                  }}
                </span>
              </div>
              <div
                v-if="tk.status === 'Accepted' && tk.completerUsername"
                class="truncate text-emerald-700 dark:text-emerald-300"
              >
                ✓ {{ state.locale === 'zh' ? `@${tk.completerUsername} 完成` : `@${tk.completerUsername} done` }}
              </div>
              <div
                v-else-if="tk.assignedUserUsername"
                class="truncate text-sky-700 dark:text-sky-300"
              >
                ⚡ @{{ tk.assignedUserUsername }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
