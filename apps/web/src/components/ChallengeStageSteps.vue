<script setup lang="ts">
import { computed } from 'vue';
import type { ChallengeStatus } from '@common-intelligence/shared';
import { useAppState } from '@/stores/appState';

const props = defineProps<{ status: ChallengeStatus }>();
const { challengeStatus, state } = useAppState();

const STAGES: ChallengeStatus[] = ['Proposed', 'Active', 'Completed'];

const currentIndex = computed(() => {
  switch (props.status) {
    case 'Proposed':
      return 0;
    case 'Active':
    case 'Paused':
      return 1;
    case 'Completed':
      return 2;
    default:
      return -1; // Archived: no active stage
  }
});

function barClass(i: number): string {
  if (i > currentIndex.value) return 'bg-border-light dark:bg-border-dark';
  if (i === currentIndex.value && props.status === 'Paused') return 'bg-amber-500 dark:bg-amber-400';
  return 'bg-accent dark:bg-accent-dark';
}
</script>

<template>
  <ol
    class="grid grid-cols-3 gap-1.5"
    :aria-label="state.locale === 'zh' ? `阶段：${challengeStatus(status)}` : `Stage: ${challengeStatus(status)}`"
  >
    <li v-for="(stage, i) in STAGES" :key="stage" class="min-w-0">
      <span class="block h-1.5 rounded-full" :class="barClass(i)" />
      <span
        class="mt-1 block truncate text-xs"
        :class="
          i === currentIndex
            ? 'font-semibold text-ink dark:text-chalk'
            : 'text-ink-muted dark:text-chalk-muted'
        "
      >
        {{ challengeStatus(stage) }}
      </span>
    </li>
  </ol>
</template>
