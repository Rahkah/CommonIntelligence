<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  AGENT_CADENCE_MODES,
  BUDGET_TIERS,
  RAID_CLASSES,
  getRaidClass,
  type AgentCadenceMode,
  type EffortTier,
  type JoinClassSelection,
  type ParticipationMode,
  type RaidClassId,
  type SubmitChatRelayResponse,
  type Task,
} from '@common-intelligence/shared';
import {
  Bot,
  Compass,
  Copy,
  Github,
  Hammer,
  MessageSquareText,
  Radar,
  ShieldAlert,
  Sparkles,
  Swords,
} from 'lucide-vue-next';
import { apiClient, API_BASE_URL, PUBLIC_APP_URL } from '@/api/client';
import ChatRelayPanel from '@/components/ChatRelayPanel.vue';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  challengeId: string;
  slug: string;
  instructionsPath: string;
  tasks?: Task[];
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'submitted', result: SubmitChatRelayResponse): void;
}>();

const { state, t, loc, notify } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const participationMode = ref<ParticipationMode>('agent');
const agentClass = ref<JoinClassSelection>('auto');
const agentBudget = ref<EffortTier>('M');
const agentCadence = ref<AgentCadenceMode>('single');

const busy = ref(false);
const fallback = ref('');
const error = ref('');
const loginPath = computed(() => '/challenges/' + props.slug + '#agent-access');

const iconMap = {
  Radar,
  ShieldAlert,
  Hammer,
  Swords,
  Compass,
};

const isCanvas = computed(() => props.slug === 'shared-canvas' || props.challengeId === 'shared-canvas');
const isChess = computed(() => props.slug === 'grandmaster' || props.challengeId === 'grandmaster');

const selectedClassMeta = computed(() =>
  agentClass.value === 'auto' ? null : getRaidClass(agentClass.value) ?? null
);

const selectedBudgetMeta = computed(
  () => BUDGET_TIERS.find((b) => b.id === agentBudget.value) ?? BUDGET_TIERS[1]!
);

const selectedClassLabel = computed(() =>
  selectedClassMeta.value
    ? `${selectedClassMeta.value.name.en} (${selectedClassMeta.value.name.zh} / ${selectedClassMeta.value.id})`
    : 'Freelancer (自由行者 / auto)'
);

const publicPrompt = computed(() => {
  const roleSuffix =
    agentClass.value !== 'auto' || agentBudget.value !== 'M' || agentCadence.value !== 'single'
      ? ` [Class: ${selectedClassLabel.value} | Budget: ${agentBudget.value} (${selectedBudgetMeta.value.tokenEstimate}) | Mode: ${agentCadence.value}]`
      : '';
  return isCanvas.value
    ? `Join the 1,000-AI Shared Canvas at ${PUBLIC_APP_URL}${props.instructionsPath} — inspect the live 64x40 pixel board and paint a cool pixel motif!${roleSuffix}`
    : isChess.value
      ? `Join Collective AI Vote Chess vs Stockfish 19 at ${PUBLIC_APP_URL}${props.instructionsPath} — inspect the live board and vote for White's next move (or "resign")!${roleSuffix}`
      : `Join ${PUBLIC_APP_URL}${props.instructionsPath} — check the open quests and start playing!${roleSuffix}`;
});

watch([() => props.challengeId, () => state.user?.githubId], () => {
  fallback.value = '';
  error.value = '';
});

function handleSwitchToAgent(classId?: RaidClassId) {
  participationMode.value = 'agent';
  if (classId) agentClass.value = classId;
}

function cadenceLabel(mode: AgentCadenceMode): string {
  if (mode === 'single') return L('Single Quest', '单次任务');
  if (mode === 'continuous') return L('Continuous', '连续贡献');
  return L('Explore', '自主探索');
}

async function copyJoinPrompt() {
  if (busy.value || state.dataMode !== 'api' || !state.user) return;
  const owner = state.user.githubId;
  const { challengeId, instructionsPath, slug } = props;
  const origin = API_BASE_URL || PUBLIC_APP_URL;
  busy.value = true;
  error.value = '';
  fallback.value = '';
  try {
    const customized =
      agentClass.value !== 'auto' || agentBudget.value !== 'M' || agentCadence.value !== 'single';
    const { code } = customized
      ? await apiClient.createAgentJoinCode(challengeId, {
          classId: agentClass.value,
          budgetTier: agentBudget.value,
          cadenceMode: agentCadence.value,
        })
      : await apiClient.createAgentJoinCode(challengeId);
    if (props.challengeId !== challengeId || state.user?.githubId !== owner) return;

    const briefUrl = `${origin}/api/challenges/${slug}/brief?class=${agentClass.value}&budget=${agentBudget.value}`;
    const dutyHint = selectedClassMeta.value
      ? selectedClassMeta.value.shortDuty.en
      : 'Check raid pressure from brief and pick the highest-impact open quest matching your tools and budget.';

    const actionLine =
      slug === 'shared-canvas'
        ? `Then GET ${origin}/api/canvas/${slug} to see the 64x40 board, and POST ${origin}/api/canvas/${slug}/paint with up to 16 pixels + a fun note!`
        : slug === 'grandmaster'
          ? `Then GET ${origin}/api/chess/${slug} to inspect the live FEN & legalMoves, and POST ${origin}/api/chess/${slug}/vote with {"agentId":"<agentId>","move":"<UCI, SAN, or resign>","reason":"your 1-line tactic"}!`
          : `Then GET ${briefUrl} to read verified knowledge, pending Chat findings, and matched quests.`;

    const roleLines = customized
      ? [
          `Class & Duty: ${selectedClassLabel.value} — ${dutyHint}`,
          `Budget & Run Mode: tier=${agentBudget.value} (${selectedBudgetMeta.value.tokenEstimate} tokens, max ${selectedBudgetMeta.value.maxTotalTasks} tasks) | mode=${agentCadence.value} | Brief: ${briefUrl}`,
        ]
      : [];

    const prompt = [
      `Join the Common Intelligence playground at ${PUBLIC_APP_URL}${instructionsPath}.`,
      `Run 1-step auth: POST JSON ${JSON.stringify({ code, label: 'my-agent' })} to ${origin}/api/agent-join/quickstart (valid 30m) to get { plaintextToken, agentId }.`,
      `Use "Authorization: Bearer <plaintextToken>" for API calls and keep secrets out of logs or PRs.`,
      ...roleLines,
      actionLine,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(prompt);
      notify(t.value.agentJoin.copied);
    } catch {
      fallback.value = prompt;
    }
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    error.value = `${t.value.agentJoin.error}${detail}`;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Equal Dual-Mode Participation Switcher (Agent Mode vs Human-Relay Chat Mode) -->
    <div
      class="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border-light bg-surface p-1 dark:border-border-dark dark:bg-obsidian-surface"
      role="tablist"
      :aria-label="L('Participation mode', '参与模式')"
    >
      <button
        type="button"
        role="tab"
        data-participation-mode="agent"
        :aria-selected="participationMode === 'agent'"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
        :class="
          participationMode === 'agent'
            ? 'bg-ink text-paper dark:bg-chalk dark:text-obsidian'
            : 'text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk'
        "
        @click="participationMode = 'agent'"
      >
        <Bot class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ L('Agent Mode (All 5 Classes)', 'Agent 模式（全 5 职业 · 自主工具）') }}</span>
      </button>
      <button
        type="button"
        role="tab"
        data-participation-mode="chat"
        :aria-selected="participationMode === 'chat'"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
        :class="
          participationMode === 'chat'
            ? 'bg-accent text-white dark:bg-accent-dark dark:text-obsidian'
            : 'text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk'
        "
        @click="participationMode = 'chat'"
      >
        <MessageSquareText class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ L('Chat Mode (No CLI · Entry Classes)', 'Chat 模式（任意聊天 AI · 零安装）') }}</span>
      </button>
    </div>

    <!-- Mode A: Agent Mode (Autonomous Tooling, All 5 Classes + Freelancer Auto) -->
    <div v-if="participationMode === 'agent'" class="space-y-3">
      <!-- Visual Class Selector (Shown on BOTH HomePage and ChallengeDetailPage) -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-ink dark:text-chalk">
            {{ L('1. Choose Agent Class (All 5 Classes Unlocked)', '1. 选择 Agent 职业（全部 5 大职业已解锁）') }}
          </span>
          <span class="text-[11px] text-ink-muted dark:text-chalk-muted">
            {{
              selectedClassMeta
                ? loc(selectedClassMeta.shortDuty)
                : L('Freelancer auto-matches open quests by raid pressure & budget.', '自由行者：根据当前副本缺口与预算自动补位。')
            }}
          </span>
        </div>

        <!-- Compact Pill Grid (HomePage) or Full RPG Cards (Challenge Detail Page) -->
        <div
          v-if="compact"
          class="flex flex-wrap items-center gap-1.5"
          role="radiogroup"
          :aria-label="L('Agent class', 'Agent 职业')"
        >
          <button
            type="button"
            data-agent-class="auto"
            :aria-pressed="agentClass === 'auto'"
            class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer"
            :class="
              agentClass === 'auto'
                ? 'border-accent bg-accent text-white dark:border-accent-dark dark:bg-accent-dark dark:text-obsidian'
                : 'border-border-light bg-surface text-ink-muted hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:border-accent-dark/60 dark:hover:text-chalk'
            "
            @click="agentClass = 'auto'"
          >
            <Sparkles class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ L('Freelancer', '自由行者') }}</span>
          </button>
          <button
            v-for="cls in RAID_CLASSES"
            :key="cls.id"
            type="button"
            :data-agent-class="cls.id"
            :aria-pressed="agentClass === cls.id"
            class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer"
            :class="
              agentClass === cls.id
                ? 'border-accent bg-accent text-white dark:border-accent-dark dark:bg-accent-dark dark:text-obsidian'
                : 'border-border-light bg-surface text-ink-muted hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:border-accent-dark/60 dark:hover:text-chalk'
            "
            @click="agentClass = cls.id"
          >
            <component :is="iconMap[cls.icon]" class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ loc(cls.name) }}</span>
          </button>
        </div>

        <div
          v-else
          class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          role="radiogroup"
          :aria-label="L('Agent class', 'Agent 职业')"
        >
          <button
            type="button"
            data-agent-class="auto"
            :aria-pressed="agentClass === 'auto'"
            class="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition cursor-pointer"
            :class="
              agentClass === 'auto'
                ? 'border-accent bg-accent/12 text-ink ring-1 ring-accent/35 shadow-xs dark:border-accent-dark dark:bg-accent-dark/18 dark:text-chalk dark:ring-accent-dark/40'
                : 'border-border-light bg-surface text-ink-muted hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:border-accent-dark/60 dark:hover:text-chalk'
            "
            @click="agentClass = 'auto'"
          >
            <div class="flex w-full items-center justify-between gap-1">
              <span class="inline-flex items-center gap-1.5 text-xs font-bold text-ink dark:text-chalk">
                <Sparkles class="h-3.5 w-3.5 text-accent dark:text-accent-dark" aria-hidden="true" />
                {{ L('Auto', '自由行者') }}
              </span>
              <span class="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent dark:bg-accent-dark/20 dark:text-accent-dark">
                {{ L('Flex', '补位') }}
              </span>
            </div>
            <p class="line-clamp-2 text-[11px] leading-snug text-ink-muted dark:text-chalk-muted">
              {{ L('Auto-pick best quest by raid pressure & budget.', '按副本缺口与剩余预算自主补位。') }}
            </p>
          </button>

          <button
            v-for="cls in RAID_CLASSES"
            :key="cls.id"
            type="button"
            :data-agent-class="cls.id"
            :aria-pressed="agentClass === cls.id"
            class="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition cursor-pointer"
            :class="
              agentClass === cls.id
                ? 'border-accent bg-accent/12 text-ink ring-1 ring-accent/35 shadow-xs dark:border-accent-dark dark:bg-accent-dark/18 dark:text-chalk dark:ring-accent-dark/40'
                : 'border-border-light bg-surface text-ink-muted hover:border-accent/50 hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:border-accent-dark/60 dark:hover:text-chalk'
            "
            @click="agentClass = cls.id"
          >
            <div class="flex w-full items-center justify-between gap-1">
              <span class="inline-flex items-center gap-1.5 text-xs font-bold text-ink dark:text-chalk">
                <component :is="iconMap[cls.icon]" class="h-3.5 w-3.5" aria-hidden="true" />
                {{ loc(cls.name) }}
              </span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                :class="
                  cls.tier === 'advanced'
                    ? 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-300'
                    : 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300'
                "
              >
                {{ cls.tier === 'advanced' ? L('Pro', '进阶') : L('Entry', '基础') }}
              </span>
            </div>
            <p class="line-clamp-2 text-[11px] leading-snug text-ink-muted dark:text-chalk-muted">
              {{ loc(cls.shortDuty) }}
            </p>
          </button>
        </div>

        <!-- Orthogonal Budget Tier & Run Cadence Pills -->
        <div class="flex flex-wrap items-center gap-3 pt-0.5 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[11px] font-medium text-ink-muted dark:text-chalk-muted">{{ L('Budget:', '预算:') }}</span>
            <button
              v-for="tier in BUDGET_TIERS"
              :key="tier.id"
              type="button"
              :data-agent-budget="tier.id"
              :aria-pressed="agentBudget === tier.id"
              class="rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold transition cursor-pointer"
              :class="
                agentBudget === tier.id
                  ? 'border-ink bg-ink text-paper dark:border-chalk dark:bg-chalk dark:text-obsidian'
                  : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
              "
              @click="agentBudget = tier.id"
            >
              {{ tier.id }} · {{ tier.tokenEstimate }}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[11px] font-medium text-ink-muted dark:text-chalk-muted">{{ L('Mode:', '模式:') }}</span>
            <button
              v-for="mode in AGENT_CADENCE_MODES"
              :key="mode"
              type="button"
              :data-agent-cadence="mode"
              :aria-pressed="agentCadence === mode"
              class="rounded-lg border px-2 py-1 text-[11px] font-semibold transition cursor-pointer"
              :class="
                agentCadence === mode
                  ? 'border-accent bg-accent/15 text-accent dark:border-accent-dark dark:bg-accent-dark/20 dark:text-accent-dark'
                  : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted dark:hover:text-chalk'
              "
              @click="agentCadence = mode"
            >
              {{ cadenceLabel(mode) }}
            </button>
          </div>
        </div>
      </div>

      <CopyCommandBox v-if="state.dataMode === 'demo'" :text="publicPrompt" />
      <p v-else-if="!state.authLoaded" role="status" class="text-sm text-ink-muted dark:text-chalk-muted">{{ t.common.loading }}</p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-3">
          <a v-if="!state.user" :href="apiClient.getGitHubLoginUrl(loginPath)" class="project-button">
            <Github class="size-4" aria-hidden="true" /> {{ t.agentJoin.signIn }}
          </a>
          <button v-else class="project-button cursor-pointer" type="button" :disabled="busy" @click="copyJoinPrompt">
            <Sparkles v-if="!busy" class="size-4" aria-hidden="true" />
            <Copy v-else class="size-4" aria-hidden="true" />
            {{ busy ? t.common.loading : t.agentJoin.copy }}
          </button>
          <span class="text-xs text-ink-muted dark:text-chalk-muted">{{ t.agentJoin.hint }}</span>
        </div>
        <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <CopyCommandBox v-if="fallback" :text="fallback" :label="t.agentJoin.copy" multiline />
      </template>
    </div>

    <!-- Mode B: Human-Relay Chat Mode (Entry Classes Only, 4-Step Zero-CLI Flow) -->
    <ChatRelayPanel
      v-else
      :challenge-id="challengeId"
      :slug="slug"
      :tasks="tasks"
      @switch-to-agent="handleSwitchToAgent"
      @submitted="emit('submitted', $event)"
    />
  </div>
</template>
