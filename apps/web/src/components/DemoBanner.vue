<script setup lang="ts">
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const { state, t } = useAppState();
</script>

<template>
  <div
    v-if="state.dataMode === 'demo'"
    class="border-b border-amber-700/15 bg-amber-50/60 dark:border-amber-400/15 dark:bg-amber-950/25"
  >
    <div
      class="mx-auto flex max-w-5xl items-center gap-2 px-4 py-1.5 text-[11.5px] text-amber-950/90 sm:px-6 dark:text-amber-200/90"
    >
      <StatusPill :label="t.demo.badge" tone="demo" />
      <span>{{ t.demo.bannerBody }}</span>
    </div>
  </div>
</template>
