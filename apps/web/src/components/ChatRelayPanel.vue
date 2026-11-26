<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  BUDGET_TIERS,
  RAID_CLASSES,
  taskSupportsMode,
  validateChatSubmission,
  type ChatContextPack,
  type ChatOutputSchemaKind,
  type EffortTier,
  type RaidClassId,
  type SubmitChatRelayResponse,
  type Task,
} from '@common-intelligence/shared';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Github,
  Hammer,
  Lock,
  Radar,
  Send,
  ShieldAlert,
  Sparkles,
  Swords,
  Wrench,
} from 'lucide-vue-next';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  challengeId: string;
  slug: string;
  tasks?: Task[];
}>();

const emit = defineEmits<{
  (e: 'switch-to-agent', classId?: RaidClassId): void;
  (e: 'submitted', result: SubmitChatRelayResponse): void;
}>();

const { state, loc, notify, signInWithGitHub } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const selectedClass = ref<RaidClassId>('scout');
const selectedBudget = ref<EffortTier>('S');
const selectedTaskId = ref<string>('');
const selectedSchemaOverride = ref<ChatOutputSchemaKind | ''>('');

const contextPack = ref<ChatContextPack | null>(null);
const loadingPack = ref(false);
const packError = ref('');
const showPromptPreview = ref(false);
const copiedPrompt = ref(false);
const copiedRepair = ref(false);

const rawReply = ref('');
const submitting = ref(false);
const submitError = ref('');
const lastReceipt = ref<SubmitChatRelayResponse | null>(null);

const iconMap = {
  Radar,
  ShieldAlert,
  Hammer,
  Swords,
  Compass,
};

const loginPath = computed(() => `/challenges/${props.slug}#agent-access`);

const chatEligibleTasks = computed(() =>
  (props.tasks ?? []).filter((t) => t.status === 'Available' && taskSupportsMode(t, 'chat'))
);

const matchingTasksForClass = computed(() => {
  const byClass = chatEligibleTasks.value.filter((t) => t.recommendedClass === selectedClass.value);
  return byClass.length > 0 ? byClass : chatEligibleTasks.value;
});

const schemaOptions = computed<Array<{ id: ChatOutputSchemaKind; label: string }>>(() => {
  const isCanvas = props.slug === 'shared-canvas';
  const isChess = props.slug === 'grandmaster';
  if (selectedClass.value === 'arbiter') {
    return [
      {
        id: 'counterexample_review',
        label: L('Counterexample / Edge Case Review', '逻辑找茬 / 反例与边界用例'),
      },
    ];
  }
  const opts: Array<{ id: ChatOutputSchemaKind; label: string }> = [
    { id: 'failure_analysis', label: L('Failure Postmortem & Bottleneck', '失败复盘与瓶颈定位') },
    { id: 'hypothesis_proposal', label: L('Hypothesis / Algorithm / Blueprint', '假设 / 算法思路 / 方向提案') },
  ];
  if (isCanvas) {
    opts.unshift({ id: 'canvas_pixels', label: L('Paint 1–16 Pixels on Live Canvas', '画布结构化落笔（1–16 像素）') });
  }
  if (isChess) {
    opts.unshift({ id: 'chess_tactic_vote', label: L('Live Position Analysis & Move Vote', '当前棋局分析与合法着法投票') });
  }
  return opts;
});

const activeSchemaKind = computed<ChatOutputSchemaKind>(() => {
  if (selectedSchemaOverride.value) return selectedSchemaOverride.value;
  if (contextPack.value?.outputSchemaKind) return contextPack.value.outputSchemaKind;
  return schemaOptions.value[0]?.id ?? 'failure_analysis';
});

const liveValidation = computed(() => {
  if (!rawReply.value.trim()) return null;
  return validateChatSubmission(activeSchemaKind.value, rawReply.value);
});

const previewSummaryLines = computed(() => {
  if (!liveValidation.value || !liveValidation.value.ok) return [];
  const d = liveValidation.value.data;
  if (d.kind === 'failure_analysis') {
    return [
      { k: L('Title', '标题'), v: d.title },
      { k: L('Root Cause', '根因'), v: d.rootCause },
      { k: L('Next Direction', '建议方向'), v: d.suggestedDirection },
    ];
  }
  if (d.kind === 'hypothesis_proposal') {
    return [
      { k: L('Title', '标题'), v: d.title },
      { k: L('Hypothesis', '核心假设'), v: d.hypothesis },
      { k: L('Checks', '验证用例'), v: `${d.testCasesOrCriteria.length} ${L('criteria', '条标准')}` },
    ];
  }
  if (d.kind === 'counterexample_review') {
    return [
      { k: L('Title', '标题'), v: d.title },
      { k: L('Verdict', '审查结论'), v: d.verdict },
      { k: L('Minimal Case', '最小反例'), v: d.minimalCase },
    ];
  }
  if (d.kind === 'canvas_pixels') {
    return [
      { k: L('Pixels', '落笔像素'), v: `${d.pixels.length} px` },
      { k: L('Note', '宣言'), v: d.note },
    ];
  }
  return [
    { k: L('Move', '着法'), v: d.move },
    { k: L('Pitch', '战术理由'), v: d.reason },
  ];
});

async function loadContextPack() {
  loadingPack.value = true;
  packError.value = '';
  try {
    contextPack.value = await apiClient.getChatContextPack(props.slug, {
      taskId: selectedTaskId.value || undefined,
      classId: selectedClass.value,
      budgetTier: selectedBudget.value,
      schemaKind: selectedSchemaOverride.value || undefined,
    });
  } catch (err) {
    packError.value = err instanceof Error ? err.message : L('Failed to build context pack.', '生成上下文包失败。');
    contextPack.value = null;
  } finally {
    loadingPack.value = false;
  }
}

function selectClass(classId: RaidClassId, tier: 'entry' | 'advanced') {
  if (tier === 'advanced') {
    emit('switch-to-agent', classId);
    return;
  }
  selectedClass.value = classId;
  selectedSchemaOverride.value = '';
  const match = chatEligibleTasks.value.find((t) => t.recommendedClass === classId);
  selectedTaskId.value = match?.taskId ?? '';
  lastReceipt.value = null;
}

function onTaskChange() {
  const chosen = chatEligibleTasks.value.find((t) => t.taskId === selectedTaskId.value);
  if (chosen?.outputSchemaKind) {
    selectedSchemaOverride.value = chosen.outputSchemaKind;
  } else {
    selectedSchemaOverride.value = '';
  }
  lastReceipt.value = null;
}

async function copyPrompt() {
  if (!contextPack.value) return;
  try {
    await navigator.clipboard.writeText(contextPack.value.prompt);
    copiedPrompt.value = true;
    notify(L('Self-contained Chat prompt copied! Paste it into any AI chat.', '自包含 Prompt 已复制！直接发给任意聊天 AI 即可。'));
    setTimeout(() => {
      copiedPrompt.value = false;
    }, 2200);
  } catch {
    showPromptPreview.value = true;
  }
}

async function copyRepairPrompt() {
  if (!liveValidation.value || liveValidation.value.ok) return;
  try {
    await navigator.clipboard.writeText(liveValidation.value.repairPrompt);
    copiedRepair.value = true;
    notify(L('Format repair prompt copied — paste it back to your Chat AI.', '格式纠错指令已复制，发回给聊天 AI 重新生成即可。'));
    setTimeout(() => {
      copiedRepair.value = false;
    }, 2200);
  } catch {
    // fallback ignored
  }
}

async function submitReply() {
  if (submitting.value || !liveValidation.value?.ok) return;
  submitting.value = true;
  submitError.value = '';
  try {
    const res = await apiClient.submitChatRelay(props.slug, {
      classId: selectedClass.value,
      taskId: selectedTaskId.value || contextPack.value?.taskId || null,
      outputSchemaKind: activeSchemaKind.value,
      rawResponse: rawReply.value,
    });
    lastReceipt.value = res;
    rawReply.value = '';
    notify(loc(res.message));
    emit('submitted', res);
    void loadContextPack();
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : L('Submission failed.', '提交失败。');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  const first = matchingTasksForClass.value[0];
  if (first) selectedTaskId.value = first.taskId;
  void loadContextPack();
});

watch([() => props.slug, selectedClass, selectedBudget, selectedTaskId, selectedSchemaOverride], () => {
  void loadContextPack();
});
</script>

<template>
  <div class="space-y-4">
    <!-- Entry-tier Class Bar (Chat limited to Entry classes; Advanced classes link cleanly to Agent mode) -->
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-semibold text-ink dark:text-chalk">
          {{ L('1. Choose an Entry Class & Chat Micro-Task', '1. 选择基础职业与 Chat 微型任务') }}
        </span>
        <span class="text-[11px] text-ink-muted dark:text-chalk-muted">
          {{ L('Chat mode supports entry classes; advanced execution classes require Agent mode.', 'Chat 模式仅开放基础职业；进阶执行职业需切换至 Agent 模式。') }}
        </span>
      </div>

      <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="cls in RAID_CLASSES"
          :key="cls.id"
          type="button"
          :data-chat-class="cls.id"
          class="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition cursor-pointer"
          :class="
            cls.tier === 'advanced'
              ? 'border-dashed border-border-light bg-paper/60 text-ink-faint opacity-75 hover:border-accent/50 hover:opacity-100 dark:border-border-dark dark:bg-obsidian/60 dark:text-chalk-faint dark:hover:border-accent-dark/60 dark:hover:text-chalk-muted'
              : selectedClass === cls.id
                ? 'border-accent bg-accent/12 text-ink ring-1 ring-accent/35 shadow-xs dark:border-accent-dark dark:bg-accent-dark/18 dark:text-chalk dark:ring-accent-dark/40'
                : 'border-border-light bg-surface text-ink-muted hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:border-accent-dark/60 dark:hover:text-chalk'
          "
          @click="selectClass(cls.id, cls.tier)"
        >
          <div class="flex w-full items-center justify-between gap-1">
            <span
              class="inline-flex items-center gap-1.5 text-xs font-bold"
              :class="cls.tier === 'entry' ? 'text-ink dark:text-chalk' : ''"
            >
              <component :is="iconMap[cls.icon]" class="h-3.5 w-3.5" aria-hidden="true" />
              {{ loc(cls.name) }}
            </span>
            <span
              v-if="cls.tier === 'entry'"
              class="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent dark:bg-accent-dark/20 dark:text-accent-dark"
            >
              {{ L('Entry', '基础') }}
            </span>
            <span
              v-else
              class="inline-flex items-center gap-0.5 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint dark:bg-obsidian-subtle dark:text-chalk-faint"
            >
              <Lock class="h-2.5 w-2.5" aria-hidden="true" />
              {{ L('Agent', '需Agent') }}
            </span>
          </div>
          <p class="line-clamp-2 text-[11px] leading-snug">
            {{ cls.tier === 'entry' ? loc(cls.shortDuty) : L('Switch to Agent mode to unlock execution & PRs.', '切换 Agent 模式解锁代码执行与实测。') }}
          </p>
        </button>
      </div>

      <!-- Task + Output Type + Effort Tier selectors -->
      <div class="grid gap-2.5 pt-1 sm:grid-cols-3">
        <label class="block space-y-1 text-xs">
          <span class="font-medium text-ink-muted dark:text-chalk-muted">{{ L('Chat Micro-Task', '微型任务') }}</span>
          <select
            v-model="selectedTaskId"
            class="w-full rounded-xl border border-border-light bg-surface px-3 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            @change="onTaskChange"
          >
            <option value="">{{ L('Auto-pick best micro-task for this class', '自动生成该职业的当前最佳微任务') }}</option>
            <option v-for="tk in matchingTasksForClass" :key="tk.taskId" :value="tk.taskId">
              [{{ tk.effortTier ?? 'S' }}] {{ loc(tk.title) }}
            </option>
          </select>
        </label>

        <label class="block space-y-1 text-xs">
          <span class="font-medium text-ink-muted dark:text-chalk-muted">{{ L('Contribution Format', '交付类型') }}</span>
          <select
            v-model="selectedSchemaOverride"
            class="w-full rounded-xl border border-border-light bg-surface px-3 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
          >
            <option value="">{{ L('Match task default', '跟随任务默认结构') }}</option>
            <option v-for="opt in schemaOptions" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <div class="space-y-1 text-xs">
          <span class="block font-medium text-ink-muted dark:text-chalk-muted">{{ L('Token Budget Tier', '投入预算档位') }}</span>
          <div class="flex items-center gap-1.5">
            <button
              v-for="tier in BUDGET_TIERS.slice(0, 2)"
              :key="tier.id"
              type="button"
              class="flex-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer"
              :class="
                selectedBudget === tier.id
                  ? 'border-accent bg-accent text-white dark:border-accent-dark dark:bg-accent-dark dark:text-obsidian'
                  : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
              "
              @click="selectedBudget = tier.id"
            >
              {{ tier.id }} · {{ tier.tokenEstimate }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: Copy Self-Contained Context Pack Prompt -->
    <div class="rounded-xl border border-border-light bg-surface p-3.5 dark:border-border-dark dark:bg-obsidian-surface">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="space-y-0.5">
          <div class="text-xs font-semibold text-ink dark:text-chalk">
            {{ L('2. Copy Self-Contained Prompt → Send to Any AI Chat (ChatGPT / Claude / Gemini / DeepSeek)', '2. 一键复制自包含 Prompt → 发给任意 AI 聊天软件') }}
          </div>
          <div v-if="contextPack" class="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
            <span>~{{ contextPack.estimatedPromptTokens }} tokens</span>
            <span>·</span>
            <span>{{ contextPack.contextStats.verifiedKnowledgeCount }} {{ L('knowledge items', '条知识') }}</span>
            <span>·</span>
            <span>{{ contextPack.contextStats.refutedDeadEndsCount }} {{ L('dead ends', '条避坑') }}</span>
            <span v-if="contextPack.verificationMode === 'peer_or_agent_verify'" class="text-amber-600 dark:text-amber-400">
              · {{ L('Auto-spawns Agent verification', '提交后自动触发 Agent 验真') }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-border-light bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
            @click="showPromptPreview = !showPromptPreview"
          >
            <component :is="showPromptPreview ? ChevronUp : ChevronDown" class="h-3.5 w-3.5" />
            <span>{{ L('Preview', '预览') }}</span>
          </button>
          <button
            type="button"
            data-copy-chat-prompt
            class="project-button cursor-pointer"
            :disabled="loadingPack || !contextPack"
            @click="copyPrompt"
          >
            <Check v-if="copiedPrompt" class="h-4 w-4" aria-hidden="true" />
            <Copy v-else class="h-4 w-4" aria-hidden="true" />
            <span>
              {{
                loadingPack
                  ? L('Packing context...', '正在打包上下文...')
                  : copiedPrompt
                    ? L('Copied!', '已复制！')
                    : L('Copy Chat Prompt', '一键复制 Chat Prompt')
              }}
            </span>
          </button>
        </div>
      </div>

      <p v-if="packError" role="alert" class="mt-2 text-xs text-red-600 dark:text-red-400">{{ packError }}</p>

      <pre
        v-if="showPromptPreview && contextPack"
        class="mt-3 max-h-56 overflow-auto rounded-lg border border-border-light bg-paper p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
      >{{ contextPack.prompt }}</pre>
    </div>

    <!-- Step 3 & 4: Paste AI Reply, Live Structured Validation & Submit -->
    <div class="rounded-xl border border-border-light bg-surface p-3.5 space-y-3 dark:border-border-dark dark:bg-obsidian-surface">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label for="chat-relay-reply" class="text-xs font-semibold text-ink dark:text-chalk">
          {{ L('3. Paste the AI Chat Reply Here → 4. Validate & Submit', '3. 将 AI 聊天回复粘贴到这里 → 4. 自动校验并提交') }}
        </label>
        <span class="text-[11px] text-ink-faint dark:text-chalk-faint">
          {{ L('Extra prose around the JSON block is stripped automatically.', '会自动提取 JSON 代码块并过滤未验证的 AI 自评分数。') }}
        </span>
      </div>

      <textarea
        id="chat-relay-reply"
        v-model="rawReply"
        rows="4"
        data-chat-reply-input
        class="w-full rounded-xl border border-border-light bg-paper p-3 font-mono text-xs text-ink focus-visible:outline-accent dark:border-border-dark dark:bg-obsidian dark:text-chalk"
        :placeholder="L('Paste the full reply from ChatGPT, Claude, Gemini, DeepSeek, etc. (must contain the JSON block)...', '直接粘贴 ChatGPT / Claude / Gemini / DeepSeek 的完整回复（包含 ```json 代码块即可）...')"
      />

      <!-- Live Validation Feedback -->
      <div
        v-if="liveValidation && !liveValidation.ok"
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle class="h-3.5 w-3.5" />
            {{ L('Format check found issues before submit:', '提交前格式校验发现以下问题：') }}
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 cursor-pointer"
            @click="copyRepairPrompt"
          >
            <Wrench class="h-3 w-3" />
            <span>{{ copiedRepair ? L('Copied Repair Prompt!', '已复制纠错提示！') : L('Copy Fix Prompt for AI', '一键复制纠错提示发回 AI') }}</span>
          </button>
        </div>
        <ul class="list-disc pl-5 space-y-0.5 text-amber-900 dark:text-amber-200">
          <li v-for="(err, idx) in liveValidation.errors" :key="idx">{{ err }}</li>
        </ul>
      </div>

      <div
        v-else-if="liveValidation && liveValidation.ok"
        class="rounded-xl border border-emerald-500/35 bg-emerald-500/8 p-3 text-xs space-y-1.5"
      >
        <div class="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 class="h-3.5 w-3.5" />
          <span>{{ L('Valid structured contribution ready to submit!', '结构化格式校验通过，可以提交！') }}</span>
        </div>
        <dl class="grid gap-1 sm:grid-cols-3 pt-1">
          <div v-for="row in previewSummaryLines" :key="row.k" class="min-w-0">
            <dt class="text-[10px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint">{{ row.k }}</dt>
            <dd class="truncate font-medium text-ink dark:text-chalk">{{ row.v }}</dd>
          </div>
        </dl>
        <p
          v-for="(w, idx) in liveValidation.warnings"
          :key="idx"
          class="pt-1 text-[11px] text-amber-700 dark:text-amber-300"
        >
          ⚠ {{ w }}
        </p>
      </div>

      <p v-if="submitError" role="alert" class="text-xs text-red-600 dark:text-red-400">{{ submitError }}</p>

      <!-- Action Row -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-[11px] text-ink-muted dark:text-chalk-muted">
          {{ L('Shared identity, knowledge base, provenance & points — no CLI required.', '与 Agent 共享统一账号、知识库、贡献积分与成果溯源。') }}
        </div>

        <div class="flex items-center gap-2">
          <a
            v-if="state.dataMode === 'api' && !state.user"
            :href="apiClient.getGitHubLoginUrl(loginPath)"
            class="project-button"
          >
            <Github class="h-4 w-4" aria-hidden="true" />
            <span>{{ L('Sign in with GitHub to Submit', '登录 GitHub 后提交') }}</span>
          </a>
          <button
            v-else-if="state.dataMode === 'demo' && !state.user"
            type="button"
            class="rounded-xl border border-border-light bg-paper px-3 py-2 text-xs font-semibold text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian dark:text-chalk cursor-pointer"
            @click="signInWithGitHub"
          >
            {{ L('Sign in (Demo)', '登录 Demo 账号') }}
          </button>
          <button
            v-if="state.dataMode === 'demo' || state.user"
            type="button"
            data-chat-submit-btn
            class="project-button cursor-pointer"
            :disabled="submitting || !liveValidation?.ok"
            @click="submitReply"
          >
            <Send class="h-4 w-4" aria-hidden="true" />
            <span>{{ submitting ? L('Submitting...', '提交中...') : L('Submit Contribution', '提交贡献') }}</span>
          </button>
        </div>
      </div>

      <!-- Instant Receipt Feedback Card -->
      <div
        v-if="lastReceipt"
        data-chat-receipt
        class="rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-xs space-y-1.5 dark:border-accent-dark/40 dark:bg-accent-dark/12"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 font-bold text-ink dark:text-chalk">
            <Sparkles class="h-4 w-4 text-accent dark:text-accent-dark" />
            {{ loc(lastReceipt.message) }}
          </span>
          <span
            v-if="lastReceipt.artifact"
            class="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-800 dark:text-amber-300"
          >
            {{ L('Pending Verification', '待独立验证') }} · {{ lastReceipt.artifact.id }}
          </span>
        </div>
        <div
          v-if="lastReceipt.followUpTask"
          class="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted dark:text-chalk-muted"
        >
          <Bot class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
          <span>
            {{ L('Cross-Mode Relay:', '跨模式异步接力：') }}
            <strong class="font-mono text-ink dark:text-chalk">{{ lastReceipt.followUpTask.taskId }}</strong>
            <ArrowRight class="mx-1 inline h-3 w-3" />
            {{ loc(lastReceipt.followUpTask.title) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
