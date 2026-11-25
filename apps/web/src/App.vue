<script setup lang="ts">
import { onMounted } from 'vue';
import AppFooter from '@/components/AppFooter.vue';
import AppHeader from '@/components/AppHeader.vue';
import DemoBanner from '@/components/DemoBanner.vue';
import ToastHost from '@/components/ToastHost.vue';
import { useAppState } from '@/stores/appState';

const { loadSession } = useAppState();

onMounted(() => {
  loadSession();
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-paper text-ink dark:bg-obsidian dark:text-chalk">
    <AppHeader />
    <DemoBanner />
    <main class="flex-1">
      <RouterView />
    </main>
    <AppFooter />
    <ToastHost />
  </div>
</template>
