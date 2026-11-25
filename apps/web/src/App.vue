<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isPublicVisitPath } from '@common-intelligence/shared';
import { apiClient } from '@/api/client';
import AppFooter from '@/components/AppFooter.vue';
import AppHeader from '@/components/AppHeader.vue';
import DemoBanner from '@/components/DemoBanner.vue';
import ToastHost from '@/components/ToastHost.vue';
import { useAppState } from '@/stores/appState';

const { state, loadSession } = useAppState();
const route = useRoute();
const publicPath = computed(() => route.name && isPublicVisitPath(route.path) ? route.path : undefined);
let pendingPageView: string | undefined;
let activityTimer: number | undefined;
let activity = Promise.resolve();

function reportActivity() {
  if (document.visibilityState !== 'visible' || !publicPath.value) return;
  const path = pendingPageView;
  pendingPageView = undefined;
  // Let the first request set its visitor cookie before sending the next event.
  activity = activity.then(() => apiClient.recordSiteActivity(path)).catch(() => {});
}

onMounted(() => {
  void loadSession();
  if (state.dataMode !== 'api') return;
  watch(publicPath, (path) => {
    pendingPageView = path;
    reportActivity();
  }, { immediate: true });
  document.addEventListener('visibilitychange', reportActivity);
  activityTimer = window.setInterval(reportActivity, 60000);
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', reportActivity);
  window.clearInterval(activityTimer);
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
