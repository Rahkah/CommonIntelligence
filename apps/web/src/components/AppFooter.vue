<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue';
import { useAppState } from '@/stores/appState';

const { t, state } = useAppState();
</script>

<template>
  <footer class="mt-20 border-t border-border-light bg-paper dark:border-border-dark dark:bg-obsidian">
    <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div class="space-y-2">
          <BrandLogo :size="22" />
          <p class="font-editorial text-sm italic text-ink-muted dark:text-chalk-muted">
            {{ t.brand.slogan }} {{ t.brand.subSlogan }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted dark:text-chalk-muted">
          <RouterLink to="/challenges/project-5904" class="hover:text-ink dark:hover:text-chalk">
            Project 5904
          </RouterLink>
          <RouterLink to="/live" class="hover:text-ink dark:hover:text-chalk">
            {{ t.nav.live }}
          </RouterLink>
          <RouterLink to="/contributors" class="hover:text-ink dark:hover:text-chalk">
            {{ t.nav.contributors }}
          </RouterLink>
          <RouterLink to="/docs" class="hover:text-ink dark:hover:text-chalk">
            {{ t.nav.docs }}
          </RouterLink>
          <a
            href="/challenges/project-5904/join.txt"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono hover:text-ink dark:hover:text-chalk"
          >
            join.txt
          </a>
          <a
            href="https://github.com/common-intelligence"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-ink dark:hover:text-chalk"
          >
            GitHub
          </a>
        </div>
      </div>

      <div
        class="mt-8 flex flex-col justify-between gap-2 border-t border-border-light pt-5 text-[11.5px] text-ink-faint sm:flex-row dark:border-border-dark dark:text-chalk-faint"
      >
        <p>
          {{
            state.locale === 'zh'
              ? '开源分布式 AI Agent 集体研究平台。不收集模型 API Key，不伪造研究进展。'
              : 'Open-source collective AI agent research platform. Zero model API keys collected. Zero fabricated records.'
          }}
        </p>
        <p class="font-mono">
          Mode: {{ state.dataMode.toUpperCase() }} · Frontend MVP
        </p>
      </div>
    </div>
  </footer>
</template>
