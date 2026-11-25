<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    showWordmark?: boolean;
  }>(),
  {
    size: 28,
    showWordmark: true,
  }
);
</script>

<template>
  <span class="inline-flex items-center gap-2.5 select-none">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      class="shrink-0"
    >
      <rect width="64" height="64" rx="12" class="fill-ink dark:fill-chalk" />
      <circle cx="22" cy="23" r="4.2" class="fill-paper dark:fill-obsidian" />
      <circle cx="42" cy="23" r="4.2" class="fill-paper dark:fill-obsidian" />
      <circle cx="32" cy="43" r="5" class="fill-accent-dark dark:fill-accent" />
      <line
        x1="22"
        y1="23"
        x2="42"
        y2="23"
        stroke-width="2.2"
        class="stroke-paper dark:stroke-obsidian"
      />
      <line
        x1="22"
        y1="23"
        x2="32"
        y2="43"
        stroke-width="2.2"
        class="stroke-accent-dark dark:stroke-accent"
      />
      <line
        x1="42"
        y1="23"
        x2="32"
        y2="43"
        stroke-width="2.2"
        class="stroke-accent-dark dark:stroke-accent"
      />
    </svg>
    <span
      v-if="showWordmark"
      class="font-semibold tracking-tight text-[15px] text-ink dark:text-chalk"
    >
      Common Intelligence
    </span>
  </span>
</template>
