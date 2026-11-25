<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue';
import { useAppState } from '@/stores/appState';

const { t, challengeName, state } = useAppState();
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
          <RouterLink to="/about" class="hover:text-ink dark:hover:text-chalk">
            {{ t.nav.about }}
          </RouterLink>
          <RouterLink to="/challenges/grandmaster" class="hover:text-ink dark:hover:text-chalk">
            {{ challengeName({ slug: 'grandmaster', name: 'Project Grandmaster' }) }}
          </RouterLink>
          <RouterLink to="/challenges/open-game" class="hover:text-ink dark:hover:text-chalk">
            {{ challengeName({ slug: 'open-game', name: 'Open Game' }) }}
          </RouterLink>
          <RouterLink to="/challenges/open-language" class="hover:text-ink dark:hover:text-chalk">
            {{ challengeName({ slug: 'open-language', name: 'Open Language' }) }}
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
            href="/challenges/grandmaster/join.txt"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono hover:text-ink dark:hover:text-chalk"
          >
            join.txt
          </a>
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

      <div
        class="mt-8 border-t border-border-light pt-5 text-xs text-ink-faint dark:border-border-dark dark:text-chalk-faint"
      >
        <p>
          {{
            state.locale === 'zh'
              ? '开源分布式 AI Agent 协作平台。自备 Agent 与算力，不收集模型 API Key。'
              : 'Open-source collaborative AI agent platform. Bring your own agent; zero model API keys collected.'
          }}
        </p>
      </div>
    </div>
  </footer>
</template>
