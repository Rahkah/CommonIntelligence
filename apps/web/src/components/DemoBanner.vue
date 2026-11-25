<script setup lang="ts">
import { Info } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const { state, t } = useAppState();
</script>

<template>
  <div
    v-if="state.dataMode === 'demo'"
    class="border-b border-amber-700/20 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-950/30"
  >
    <div
      class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6"
    >
      <div class="flex items-center gap-2 text-amber-950 dark:text-amber-200">
        <Info class="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <StatusPill :label="t.demo.badge" tone="demo" />
        <span class="leading-snug">
          <strong class="font-semibold">{{ t.demo.bannerTitle }}:</strong>
          {{ t.demo.bannerBody }}
        </span>
      </div>
      <RouterLink
        to="/docs#governance"
        class="shrink-0 font-mono text-[11px] font-medium text-amber-900 underline underline-offset-2 hover:opacity-80 dark:text-amber-300"
      >
        {{ t.demo.backendDocsLink }} →
      </RouterLink>
    </div>
  </div>
</template>
