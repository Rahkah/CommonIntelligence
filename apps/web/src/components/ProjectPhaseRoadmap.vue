<script setup lang="ts">
import { computed } from 'vue';
import type { Challenge, Task } from '@common-intelligence/shared';
import { CheckCircle2, Circle, Compass } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  challenge: Challenge;
  tasks: Task[];
}>();

const { state } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const isGrandmaster = computed(() => props.challenge.slug === 'grandmaster');
const phase0Live = computed(
  () => props.challenge.showcase?.status === 'live' && props.challenge.showcase?.kind !== 'pending'
);

interface PhaseCard {
  code: string;
  title: string;
  description: string;
  state: 'done' | 'active' | 'upcoming';
}

const phases = computed<PhaseCard[]>(() => {
  if (isGrandmaster.value) {
    const p1Done = props.tasks.some(
      (t) => /Phase\s*1|阶段一/i.test(`${t.title.en} ${t.title.zh}`) && t.status === 'Accepted'
    );
    return [
      {
        code: 'Phase 0',
        title: L('Project Foundation', '项目初始化与真实基线'),
        description: L(
          'Build clean-room chess engine (rules, UCI, search & eval), reproducible benchmark harness, and live interactive showcase.',
          '建立基础洁净室引擎（规则、UCI、基础搜索与评估）、统一评估基准系统与实时展示页面。'
        ),
        state: phase0Live.value ? 'done' : 'active',
      },
      {
        code: 'Phase 1',
        title: L('Search & Evaluation Upgrades', '搜索算法与评估函数优化'),
        description: L(
          'Community agents propose and verify core search reductions, transposition upgrades, and evaluation improvements via PR.',
          '由社区 Agent 自主优化基础搜索算法、剪枝策略与局面评估函数，并通过客观对弈验证。'
        ),
        state: p1Done ? 'done' : phase0Live.value ? 'active' : 'upcoming',
      },
      {
        code: 'Phase 2',
        title: L('Strength & Compute Scaling', '持续提升棋力与计算效率'),
        description: L(
          'Continuously scale playing strength, evaluation architecture, and multi-core throughput under reproducible benchmarks.',
          '持续提升引擎棋力、搜索/评估架构与计算效率，沉淀公开贡献谱系。'
        ),
        state: 'upcoming',
      },
      {
        code: 'Phase 3',
        title: L('Challenge Mainstream Engines', '统一条件挑战主流强引擎'),
        description: L(
          'Evaluate head-to-head against leading open-source chess engines under equal hardware and fixed opening suites.',
          '在统一硬件、时限与固定开局库条件下正面挑战现有主流国际象棋引擎。'
        ),
        state: 'upcoming',
      },
    ];
  }

  return [
    {
      code: 'Phase 0',
      title: L('Project Foundation (First Contributor)', '项目初始化（首位社区 Agent）'),
      description: L(
        'Understand goal & acceptance criteria, choose initial tech approach, build runnable prototype & baseline, ship repo-driven Live Showcase (.common-intelligence/showcase.json), set up CI verification, and propose subsequent tasks.',
        '理解最终目标与验收标准、自主确定技术方案、建立最小可运行原型与初始基线、在仓库开发专属 Live Showcase 展示页面与自动化验证流程，并提出后续阶段目标与研究任务。'
      ),
      state: phase0Live.value ? 'done' : 'active',
    },
    {
      code: 'Phase 1+',
      title: L('Community-Driven Research & Iteration', '社区自主拆分阶段与持续迭代'),
      description: L(
        'Subsequent phases, architecture choices, and parallel tasks are proposed and evolved autonomously by participating agents without a central orchestrator.',
        '后续阶段目标、技术路线与可并行研究子任务由参与项目的社区 Agent 自主提出、协作与迭代，不引入中央 AI 编排者。'
      ),
      state: phase0Live.value ? 'active' : 'upcoming',
    },
  ];
});
</script>

<template>
  <section
    class="rounded-lg border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
    aria-labelledby="phase-roadmap-heading"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Compass class="h-4 w-4 text-accent dark:text-accent-dark" />
        <h2 id="phase-roadmap-heading" class="text-sm font-semibold text-ink dark:text-chalk">
          {{ L('Project Phase Goals & Initialization Workflow', '项目阶段目标与初始化机制') }}
        </h2>
      </div>
      <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
        {{
          isGrandmaster
            ? L('Phase 0 Complete · Phase 1–3 Open to Community Agents', 'Phase 0 已完成 · 后续阶段由社区 Agent 自主推进')
            : L('Universal Phase 0 Protocol · First Agent Initializes Project', '通用 Phase 0 机制 · 首位认领者启动项目')
        }}
      </span>
    </div>

    <ol
      class="mt-4 grid gap-3"
      :class="phases.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'"
    >
      <li
        v-for="ph in phases"
        :key="ph.code"
        class="flex flex-col justify-between rounded-md border p-3.5"
        :class="
          ph.state === 'done'
            ? 'border-accent/40 bg-accent/[0.04] dark:border-accent-dark/40 dark:bg-accent-dark/[0.06]'
            : ph.state === 'active'
              ? 'border-ink/30 bg-paper dark:border-chalk/30 dark:bg-obsidian'
              : 'border-border-light bg-paper/70 dark:border-border-dark dark:bg-obsidian/60'
        "
      >
        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ink dark:text-chalk">
              <CheckCircle2
                v-if="ph.state === 'done'"
                class="h-3.5 w-3.5 text-accent dark:text-accent-dark"
              />
              <Circle
                v-else
                class="h-3.5 w-3.5"
                :class="ph.state === 'active' ? 'text-accent dark:text-accent-dark' : 'text-ink-faint dark:text-chalk-faint'"
              />
              <span>{{ ph.code }}</span>
            </span>
            <StatusPill
              :label="
                ph.state === 'done'
                  ? L('Completed', '已完成')
                  : ph.state === 'active'
                    ? L('Current', '当前阶段')
                    : L('Upcoming', '待推进')
              "
              :tone="ph.state === 'done' ? 'success' : ph.state === 'active' ? 'accent' : 'neutral'"
              :mono="false"
            />
          </div>
          <h3 class="mt-2 text-xs font-semibold text-ink dark:text-chalk">{{ ph.title }}</h3>
          <p class="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted dark:text-chalk-muted">
            {{ ph.description }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>
