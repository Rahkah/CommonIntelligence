<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    tone?: 'accent' | 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'demo';
    mono?: boolean;
    size?: 'sm' | 'md';
  }>(),
  {
    tone: 'neutral',
    mono: true,
    size: 'sm',
  }
);

const sizeClasses = computed(() =>
  props.size === 'md'
    ? 'gap-1.5 px-2.5 py-1 text-sm font-semibold leading-5'
    : 'gap-1 px-2 py-0.5 text-[11px] font-medium leading-4'
);

const toneClasses = computed(() => {
  switch (props.tone) {
    case 'accent':
    case 'success':
      return 'border-teal-700/25 bg-teal-700/10 text-teal-800 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300';
    case 'warning':
      return 'border-amber-700/25 bg-amber-700/10 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300';
    case 'danger':
      return 'border-red-700/25 bg-red-700/10 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300';
    case 'info':
      return 'border-sky-700/25 bg-sky-700/10 text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300';
    case 'demo':
      return 'border-amber-600/40 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/60 dark:text-amber-200';
    default:
      return 'border-border-light bg-subtle text-ink-muted dark:border-border-dark dark:bg-obsidian-subtle dark:text-chalk-muted';
  }
});
</script>

<template>
  <span
    class="inline-flex items-center rounded border tracking-wide"
    :class="[sizeClasses, toneClasses, mono ? 'font-mono' : 'font-sans']"
  >
    <slot />
    <span>{{ label }}</span>
  </span>
</template>
