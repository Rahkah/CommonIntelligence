<script setup lang="ts">
import { useAppState } from '@/stores/appState';

const { state } = useAppState();
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2"
    aria-live="polite"
  >
    <div
      v-for="toast in state.toasts"
      :key="toast.id"
      class="pointer-events-auto rounded-md border border-border-dark bg-ink px-3.5 py-2 text-xs font-medium text-paper shadow-sm dark:border-border-light dark:bg-chalk dark:text-obsidian"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
