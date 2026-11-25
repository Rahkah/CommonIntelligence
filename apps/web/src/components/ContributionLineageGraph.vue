<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Contribution } from '@common-intelligence/shared';
import { ArrowRight, ExternalLink, ShieldCheck } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  contributions: Contribution[];
}>();

const { loc, state } = useAppState();
const selectedId = ref<string>(props.contributions[0]?.id ?? '');

interface PositionedNode {
  contribution: Contribution;
  depth: number;
  x: number;
  y: number;
}

const layout = computed(() => {
  const byId = new Map(props.contributions.map((c) => [c.id, c]));
  const depthMap = new Map<string, number>();

  function getDepth(id: string, stack = new Set<string>()): number {
    if (depthMap.has(id)) return depthMap.get(id)!;
    if (stack.has(id)) return 0; // Guard against accidental cycle
    stack.add(id);
    const item = byId.get(id);
    if (!item || item.parentContributionIds.length === 0) {
      depthMap.set(id, 0);
      return 0;
    }
    const maxParent = Math.max(
      ...item.parentContributionIds.map((pid) => (byId.has(pid) ? getDepth(pid, stack) : -1))
    );
    const d = maxParent + 1;
    depthMap.set(id, d);
    return d;
  }

  for (const c of props.contributions) getDepth(c.id);

  const columns = new Map<number, Contribution[]>();
  for (const c of props.contributions) {
    const d = depthMap.get(c.id) ?? 0;
    const list = columns.get(d) ?? [];
    list.push(c);
    columns.set(d, list);
  }

  const colWidth = 235;
  const rowHeight = 104;
  const nodes: PositionedNode[] = [];
  const posById = new Map<string, PositionedNode>();

  const maxDepth = Math.max(0, ...Array.from(columns.keys()));
  const maxRows = Math.max(1, ...Array.from(columns.values()).map((v) => v.length));

  for (let d = 0; d <= maxDepth; d++) {
    const col = columns.get(d) ?? [];
    col.forEach((contribution, rowIdx) => {
      const node: PositionedNode = {
        contribution,
        depth: d,
        x: 24 + d * colWidth,
        y: 28 + rowIdx * rowHeight,
      };
      nodes.push(node);
      posById.set(contribution.id, node);
    });
  }

  const edges: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
  for (const node of nodes) {
    for (const parentId of node.contribution.parentContributionIds) {
      const parent = posById.get(parentId);
      if (parent) {
        edges.push({
          id: `${parent.contribution.id}->${node.contribution.id}`,
          x1: parent.x + 188,
          y1: parent.y + 36,
          x2: node.x,
          y2: node.y + 36,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    width: Math.max(640, (maxDepth + 1) * colWidth + 32),
    height: Math.max(180, maxRows * rowHeight + 40),
  };
});

const selectedContribution = computed(
  () => props.contributions.find((c) => c.id === selectedId.value) ?? props.contributions[0] ?? null
);
</script>

<template>
  <div class="space-y-4">
    <div
      class="overflow-x-auto rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
    >
      <svg
        :width="layout.width"
        :height="layout.height"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        class="block"
        role="img"
        aria-label="Research contribution dependency graph"
      >
        <defs>
          <marker
            id="dag-arrow"
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

        <!-- Directed edges -->
        <path
          v-for="edge in layout.edges"
          :key="edge.id"
          :d="`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2 - 4} ${edge.y2}`"
          fill="none"
          stroke-width="1.5"
          marker-end="url(#dag-arrow)"
          class="stroke-ink-faint/70 dark:stroke-chalk-faint/70"
        />

        <!-- Clickable contribution nodes -->
        <g
          v-for="node in layout.nodes"
          :key="node.contribution.id"
          class="cursor-pointer"
          @click="selectedId = node.contribution.id"
        >
          <rect
            :x="node.x"
            :y="node.y"
            width="188"
            height="72"
            rx="6"
            :class="
              selectedId === node.contribution.id
                ? 'fill-teal-700/10 stroke-accent stroke-[1.75] dark:fill-teal-400/10 dark:stroke-accent-dark'
                : 'fill-paper stroke-border-light stroke-[1.2] hover:stroke-ink/50 dark:fill-obsidian dark:stroke-border-dark dark:hover:stroke-chalk/50'
            "
          />
          <text
            :x="node.x + 12"
            :y="node.y + 20"
            class="fill-ink-faint font-mono text-[10px] dark:fill-chalk-faint"
          >
            {{ node.contribution.id }}
          </text>
          <text
            :x="node.x + 12"
            :y="node.y + 39"
            class="fill-ink text-[11.5px] font-semibold dark:fill-chalk"
          >
            {{
              loc(node.contribution.title).length > 24
                ? `${loc(node.contribution.title).slice(0, 23)}…`
                : loc(node.contribution.title)
            }}
          </text>
          <text
            :x="node.x + 12"
            :y="node.y + 57"
            class="fill-accent font-mono text-[10px] dark:fill-accent-dark"
          >
            @{{ node.contribution.contributorUsername }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Selected contribution detail drawer -->
    <div
      v-if="selectedContribution"
      class="rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-xs text-ink-muted dark:text-chalk-muted">
              {{ selectedContribution.id }}
            </span>
            <StatusPill :label="selectedContribution.status" tone="success" />
            <StatusPill :label="selectedContribution.contributionType" tone="neutral" />
            <StatusPill v-if="selectedContribution.isDemo" label="DEMO" tone="demo" />
          </div>
          <h4 class="text-base font-semibold text-ink dark:text-chalk">
            {{ loc(selectedContribution.title) }}
          </h4>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink
            v-if="selectedContribution.credentialId"
            :to="`/credentials/${selectedContribution.credentialId}`"
            class="inline-flex items-center gap-1.5 rounded border border-border-light px-2.5 py-1 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:text-chalk dark:hover:border-chalk/40"
          >
            <ShieldCheck class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
            <span>{{ state.locale === 'zh' ? '查验凭证' : 'Verify Credential' }}</span>
          </RouterLink>
          <a
            :href="selectedContribution.prUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 rounded border border-border-light px-2.5 py-1 font-mono text-xs text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk"
          >
            <span>PR #{{ selectedContribution.prNumber }}</span>
            <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </div>

      <p class="mt-2.5 text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
        {{ loc(selectedContribution.summary) }}
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-light pt-3 text-xs text-ink-muted dark:border-border-dark dark:text-chalk-muted">
        <span>
          {{ state.locale === 'zh' ? '贡献者：' : 'Contributor: ' }}
          <RouterLink
            :to="`/u/${selectedContribution.contributorUsername}`"
            class="font-mono font-medium text-ink hover:underline dark:text-chalk"
          >
            @{{ selectedContribution.contributorUsername }}
          </RouterLink>
        </span>
        <span class="font-mono">
          SHA {{ selectedContribution.commitSha.slice(0, 10) }}
        </span>
        <span v-if="selectedContribution.parentContributionIds.length > 0" class="inline-flex items-center gap-1.5">
          <span>{{ state.locale === 'zh' ? '前置成果：' : 'Parents:' }}</span>
          <button
            v-for="pid in selectedContribution.parentContributionIds"
            :key="pid"
            type="button"
            class="inline-flex items-center gap-0.5 rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink hover:underline dark:bg-obsidian-subtle dark:text-chalk cursor-pointer"
            @click="selectedId = pid"
          >
            <span>{{ pid }}</span>
            <ArrowRight class="h-3 w-3" />
          </button>
        </span>
      </div>
    </div>
  </div>
</template>
