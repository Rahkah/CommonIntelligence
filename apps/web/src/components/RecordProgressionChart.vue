<script setup lang="ts">
import { computed } from 'vue';
import type { RecordHistoryPoint } from '@common-intelligence/shared';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  history: RecordHistoryPoint[];
  targetValue?: number;
  lowerBoundValue?: number;
}>();

const { loc, state } = useAppState();

const width = 680;
const height = 220;
const padLeft = 58;
const padRight = 32;
const padTop = 24;
const padBottom = 38;

const chartRange = computed(() => {
  const scores = props.history.map((h) => h.score);
  if (props.targetValue !== undefined) scores.push(props.targetValue);
  if (props.lowerBoundValue !== undefined) scores.push(props.lowerBoundValue);
  const maxVal = Math.max(...scores) + 2;
  const minVal = Math.min(...scores) - 2;
  return { minVal, maxVal };
});

function yFor(val: number): number {
  const { minVal, maxVal } = chartRange.value;
  const ratio = (maxVal - val) / Math.max(1, maxVal - minVal);
  return padTop + ratio * (height - padTop - padBottom);
}

const plottedPoints = computed(() => {
  const count = props.history.length;
  const innerW = width - padLeft - padRight;
  return props.history.map((item, idx) => {
    const x = count <= 1 ? padLeft + innerW / 2 : padLeft + (idx / (count - 1)) * innerW;
    return {
      ...item,
      x,
      y: yFor(item.score),
    };
  });
});

const stepPolyline = computed(() => {
  const pts = plottedPoints.value;
  if (pts.length === 0) return '';
  const segments: string[] = [`M ${pts[0]!.x} ${pts[0]!.y}`];
  for (let i = 1; i < pts.length; i++) {
    segments.push(`L ${pts[i]!.x} ${pts[i - 1]!.y}`);
    segments.push(`L ${pts[i]!.x} ${pts[i]!.y}`);
  }
  return segments.join(' ');
});

const yTicks = computed(() => {
  const ticks = [5913, 5908, 5905, 5900, 5890, 5884].filter(
    (v) => v <= chartRange.value.maxVal && v >= chartRange.value.minVal
  );
  return ticks;
});
</script>

<template>
  <div class="space-y-4">
    <div
      class="overflow-x-auto rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
    >
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        class="h-auto w-full min-w-[500px]"
        role="img"
        aria-label="Historical superpermutation upper bound progression"
      >
        <!-- Horizontal grid lines & Y axis labels -->
        <g v-for="tick in yTicks" :key="tick">
          <line
            :x1="padLeft"
            :y1="yFor(tick)"
            :x2="width - padRight"
            :y2="yFor(tick)"
            stroke-width="1"
            class="stroke-border-light dark:stroke-border-dark"
          />
          <text
            :x="padLeft - 8"
            :y="yFor(tick) + 3.5"
            text-anchor="end"
            class="fill-ink-faint font-mono text-[10px] dark:fill-chalk-faint"
          >
            {{ tick.toLocaleString() }}
          </text>
        </g>

        <!-- Target dashed line -->
        <g v-if="targetValue !== undefined">
          <line
            :x1="padLeft"
            :y1="yFor(targetValue)"
            :x2="width - padRight"
            :y2="yFor(targetValue)"
            stroke-width="1.2"
            stroke-dasharray="4 3"
            class="stroke-accent dark:stroke-accent-dark"
          />
          <text
            :x="width - padRight"
            :y="yFor(targetValue) - 5"
            text-anchor="end"
            class="fill-accent font-mono text-[9.5px] font-medium dark:fill-accent-dark"
          >
            {{ state.locale === 'zh' ? `目标 ≤ ${targetValue.toLocaleString()}` : `Target ≤ ${targetValue.toLocaleString()}` }}
          </text>
        </g>

        <!-- Proven lower bound line -->
        <g v-if="lowerBoundValue !== undefined">
          <line
            :x1="padLeft"
            :y1="yFor(lowerBoundValue)"
            :x2="width - padRight"
            :y2="yFor(lowerBoundValue)"
            stroke-width="1.2"
            stroke-dasharray="2 3"
            class="stroke-ink-muted dark:stroke-chalk-muted"
          />
          <text
            :x="width - padRight"
            :y="yFor(lowerBoundValue) - 5"
            text-anchor="end"
            class="fill-ink-muted font-mono text-[9.5px] dark:fill-chalk-muted"
          >
            {{ state.locale === 'zh' ? `已证明下界 ${lowerBoundValue.toLocaleString()}` : `Proven lower bound ${lowerBoundValue.toLocaleString()}` }}
          </text>
        </g>

        <!-- Step progression path -->
        <path
          :d="stepPolyline"
          fill="none"
          stroke-width="2"
          class="stroke-ink dark:stroke-chalk"
        />

        <!-- Data points -->
        <g v-for="pt in plottedPoints" :key="pt.date + pt.score">
          <circle
            :cx="pt.x"
            :cy="pt.y"
            :r="pt.isCurrentRecord ? 5 : 3.5"
            :class="
              pt.isCurrentRecord
                ? 'fill-accent stroke-surface stroke-2 dark:fill-accent-dark dark:stroke-obsidian-surface'
                : 'fill-ink dark:fill-chalk'
            "
          />
          <text
            :x="pt.x"
            :y="pt.y - 9"
            text-anchor="middle"
            class="font-mono text-[10.5px] font-semibold"
            :class="pt.isCurrentRecord ? 'fill-accent dark:fill-accent-dark' : 'fill-ink dark:fill-chalk'"
          >
            {{ pt.score.toLocaleString() }}
          </text>
          <text
            :x="pt.x"
            :y="height - 14"
            text-anchor="middle"
            class="fill-ink-faint font-mono text-[9.5px] dark:fill-chalk-faint"
          >
            {{ pt.date.slice(0, 7) }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Clear tabular log of historical records -->
    <div class="overflow-x-auto rounded-md border border-border-light dark:border-border-dark">
      <table class="w-full text-left text-xs">
        <thead
          class="border-b border-border-light bg-subtle/60 font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle/60 dark:text-chalk-muted"
        >
          <tr>
            <th class="px-3.5 py-2">{{ state.locale === 'zh' ? '日期' : 'Date' }}</th>
            <th class="px-3.5 py-2">{{ state.locale === 'zh' ? '长度' : 'Length' }}</th>
            <th class="px-3.5 py-2">{{ state.locale === 'zh' ? '归属与来源' : 'Attribution' }}</th>
            <th class="px-3.5 py-2">{{ state.locale === 'zh' ? '方法说明' : 'Method Note' }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light dark:divide-border-dark">
          <tr
            v-for="item in history"
            :key="item.date + item.score"
            :class="item.isCurrentRecord ? 'bg-teal-700/[0.04] dark:bg-teal-400/[0.05]' : 'bg-surface dark:bg-obsidian-surface'"
          >
            <td class="whitespace-nowrap px-3.5 py-2.5 font-mono text-ink-muted dark:text-chalk-muted">
              {{ item.date }}
            </td>
            <td class="whitespace-nowrap px-3.5 py-2.5 font-mono font-semibold tabular-nums">
              <span :class="item.isCurrentRecord ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-chalk'">
                {{ item.score.toLocaleString() }}
              </span>
            </td>
            <td class="px-3.5 py-2.5 font-medium text-ink dark:text-chalk">
              {{ item.attribution }}
            </td>
            <td class="px-3.5 py-2.5 text-ink-muted dark:text-chalk-muted">
              {{ item.note ? loc(item.note) : item.label }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
