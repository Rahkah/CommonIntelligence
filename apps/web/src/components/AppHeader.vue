<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { Github, Globe, KeyRound, LogOut, Menu, Moon, Sun, X } from 'lucide-vue-next';
import BrandLogo from '@/components/BrandLogo.vue';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const route = useRoute();
const { state, t, toggleTheme, toggleLocale, signInWithGitHub, signOut } = useAppState();
const mobileOpen = ref(false);

const navItems = [
  { to: '/', key: 'explore' as const },
  { to: '/challenges/grandmaster', key: 'chess' as const },
  { to: '/challenges/shared-canvas', key: 'canvas' as const },
  { to: '/tasks', key: 'tasks' as const },
  { to: '/live', key: 'live' as const },
  { to: '/contributors', key: 'contributors' as const },
];

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(path + '/');
}
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-border-light bg-paper/90 backdrop-blur-md dark:border-border-dark dark:bg-obsidian/90"
  >
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
      <div class="flex items-center gap-5">
        <RouterLink to="/" class="flex items-center gap-2 focus:outline-none">
          <BrandLogo :size="26" />
        </RouterLink>

        <nav class="hidden items-center gap-1 md:flex" aria-label="Primary">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition"
            :class="
              isActive(item.to)
                ? 'bg-accent/12 text-accent dark:bg-accent-dark/15 dark:text-accent-dark'
                : 'text-ink-muted hover:text-ink dark:text-chalk-muted dark:hover:text-chalk'
            "
          >
            {{ t.nav[item.key] }}
          </RouterLink>
        </nav>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-lg border border-border-light px-2.5 font-mono text-[11.5px] text-ink-muted transition hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
          :title="state.locale === 'en' ? '切换中文' : 'Switch to English'"
          @click="toggleLocale"
        >
          <Globe class="h-3.5 w-3.5" />
          <span>{{ state.locale === 'en' ? 'EN / 中' : '中 / EN' }}</span>
        </button>

        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light text-ink-muted transition hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
          :aria-label="state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <Sun v-if="state.theme === 'dark'" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </button>

        <div class="hidden items-center gap-2 sm:flex">
          <template v-if="state.user">
            <RouterLink
              to="/settings/tokens"
              class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-light px-2.5 text-xs font-medium text-ink-muted transition hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk"
            >
              <KeyRound class="h-3.5 w-3.5" />
              <span>{{ t.nav.tokens }}</span>
            </RouterLink>
            <RouterLink
              :to="`/u/${state.user.username}`"
              class="inline-flex h-8 items-center gap-2 rounded-lg border border-border-light bg-surface px-2.5 text-xs font-medium text-ink hover:border-accent dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
            >
              <img :src="state.user.avatarUrl" :alt="state.user.username" class="h-4 w-4 rounded-sm" />
              <span class="font-mono">@{{ state.user.username }}</span>
              <StatusPill v-if="state.user.isDemo" label="DEMO" tone="demo" />
            </RouterLink>
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
              :title="t.nav.signOut"
              @click="signOut"
            >
              <LogOut class="h-3.5 w-3.5" />
            </button>
          </template>
          <button
            v-else
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark dark:text-obsidian cursor-pointer"
            @click="signInWithGitHub"
          >
            <Github class="h-3.5 w-3.5" />
            <span>{{ t.nav.signIn }}</span>
          </button>
        </div>

        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light text-ink-muted md:hidden dark:border-border-dark dark:text-chalk-muted cursor-pointer"
          aria-label="Toggle navigation"
          @click="mobileOpen = !mobileOpen"
        >
          <X v-if="mobileOpen" class="h-4 w-4" />
          <Menu v-else class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div
      v-if="mobileOpen"
      class="border-t border-border-light bg-surface px-4 py-3 md:hidden dark:border-border-dark dark:bg-obsidian-surface"
    >
      <nav class="flex flex-col gap-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-2 text-sm font-medium text-ink dark:text-chalk"
          @click="mobileOpen = false"
        >
          {{ t.nav[item.key] }}
        </RouterLink>
        <RouterLink
          to="/settings/tokens"
          class="rounded-lg px-3 py-2 text-sm font-medium text-ink dark:text-chalk"
          @click="mobileOpen = false"
        >
          {{ t.nav.tokens }}
        </RouterLink>
        <div class="mt-2 border-t border-border-light pt-2.5 dark:border-border-dark">
          <template v-if="state.user">
            <div class="flex items-center justify-between gap-2">
              <RouterLink
                :to="`/u/${state.user.username}`"
                class="font-mono text-xs font-medium text-ink dark:text-chalk"
                @click="mobileOpen = false"
              >
                @{{ state.user.username }}
              </RouterLink>
              <button
                type="button"
                class="text-xs text-ink-muted underline dark:text-chalk-muted"
                @click="signOut(); mobileOpen = false;"
              >
                {{ t.nav.signOut }}
              </button>
            </div>
          </template>
          <button
            v-else
            type="button"
            class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white dark:bg-accent-dark dark:text-obsidian"
            @click="signInWithGitHub(); mobileOpen = false;"
          >
            <Github class="h-3.5 w-3.5" />
            <span>{{ t.nav.signIn }}</span>
          </button>
        </div>
      </nav>
    </div>
  </header>
</template>
