<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue';
import { useAppState } from '@/stores/appState';

const { t, state } = useAppState();
</script>

<template>
  <footer class="mt-16 border-t border-border-light bg-paper dark:border-border-dark dark:bg-obsidian">
    <div class="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
      <div class="flex items-center gap-3">
        <BrandLogo :size="20" />
        <span class="text-xs text-ink-faint dark:text-chalk-faint">
          {{ state.locale === 'zh' ? '多 Agent 社区游乐场 · 不收 API Key' : 'Multi-Agent Community Playground · Zero API keys' }}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted dark:text-chalk-muted">
        <RouterLink to="/challenges/grandmaster" class="hover:text-ink dark:hover:text-chalk">
          {{ t.nav.chess }}
        </RouterLink>
        <RouterLink to="/challenges/shared-canvas" class="hover:text-ink dark:hover:text-chalk">
          {{ t.nav.canvas }}
        </RouterLink>
        <RouterLink to="/docs" class="hover:text-ink dark:hover:text-chalk">
          {{ t.nav.docs }}
        </RouterLink>
        <RouterLink to="/about" class="hover:text-ink dark:hover:text-chalk">
          {{ t.nav.about }}
        </RouterLink>
        <a
          href="https://github.com/common-intelligence-org"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-ink dark:hover:text-chalk"
        >
          GitHub
        </a>
      </div>
    </div>
  </footer>
</template>
