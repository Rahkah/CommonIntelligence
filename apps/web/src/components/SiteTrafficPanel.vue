<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import type { SiteTrafficOverview } from '@common-intelligence/shared';
import { apiClient, ApiRequestError } from '@/api/client';
import { useAppState } from '@/stores/appState';

const { state, t } = useAppState();
const traffic = ref<SiteTrafficOverview>();
const loading = ref(false);
const error = ref(0);
let timer: number | undefined;
const locale = computed(() => state.locale === 'zh' ? 'zh-CN' : 'en');
const metrics = computed(() => traffic.value ? [
  { label: t.value.traffic.registered, count: traffic.value.registeredUsers },
  { label: t.value.traffic.online, count: traffic.value.online.total, online: traffic.value.online },
  { label: t.value.traffic.last24Hours, count: traffic.value.pageViews.last24Hours },
  { label: t.value.traffic.total, count: traffic.value.pageViews.total },
] : []);

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  error.value = 0;
  try {
    traffic.value = await apiClient.getSiteTraffic();
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.status : 500;
    if (error.value === 401 || error.value === 403) traffic.value = undefined;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refresh();
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, 30000);
});
onUnmounted(() => window.clearInterval(timer));
</script>

<template>
  <section class="mt-6 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">{{ t.traffic.tab }}</h2>
      <button type="button" :disabled="loading" class="project-link flex items-center gap-1.5" @click="refresh">
        <RefreshCw class="size-4" aria-hidden="true" /> {{ t.traffic.refresh }}
      </button>
    </div>
    <p v-if="loading && !traffic" role="status" class="text-sm">{{ t.common.loading }}</p>
    <div v-if="error" role="alert" class="project-panel space-y-2 text-sm">
      <p>{{ error === 401 ? t.traffic.signIn : error === 403 ? t.traffic.forbidden : t.traffic.error }}</p>
      <a v-if="error === 401" :href="apiClient.getGitHubLoginUrl('/admin')" class="project-link">{{ t.nav.signIn }}</a>
    </div>
    <template v-if="traffic">
      <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="metric in metrics" :key="metric.label" class="project-panel space-y-2">
          <dt class="text-sm text-ink-muted dark:text-chalk-muted">{{ metric.label }}</dt>
          <dd class="font-mono text-2xl font-semibold tabular-nums">{{ metric.count.toLocaleString(locale) }}</dd>
          <dd v-if="metric.online" class="text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
            {{ t.traffic.onlineWindow.replace('{minutes}', String(metric.online.minutes)) }}<br />
            {{ t.traffic.signedIn }} {{ metric.online.registered }} · {{ t.traffic.anonymous }} {{ metric.online.anonymous }}
          </dd>
        </div>
      </dl>
      <div class="space-y-2">
        <h3 class="font-semibold">{{ t.traffic.recent }}</h3>
        <p class="text-sm text-ink-muted dark:text-chalk-muted">{{ t.traffic.note }}</p>
        <div class="overflow-x-auto rounded-lg border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface">
          <p v-if="!traffic.recentVisits.length" class="p-6 text-sm">{{ t.traffic.empty }}</p>
          <table v-else class="w-full text-left text-xs">
            <thead class="bg-subtle dark:bg-obsidian-subtle">
              <tr>
                <th scope="col" class="px-4 py-3">{{ t.traffic.page }}</th>
                <th scope="col" class="px-4 py-3">{{ t.traffic.visitor }}</th>
                <th scope="col" class="px-4 py-3">{{ t.traffic.time }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="visit in traffic.recentVisits" :key="visit.id" class="border-t border-border-light dark:border-border-dark">
                <td class="px-4 py-3 font-mono [overflow-wrap:anywhere]">{{ visit.path }}</td>
                <td class="px-4 py-3">{{ visit.signedIn ? t.traffic.signedIn : t.traffic.anonymous }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <time :datetime="visit.visitedAt">{{ new Date(visit.visitedAt).toLocaleString(locale) }}</time>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
