<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { AgentToken, AgentTokenScope } from '@common-intelligence/shared';
import { AlertTriangle, Github, KeyRound, ShieldOff } from 'lucide-vue-next';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient, PUBLIC_APP_URL } from '@/api/client';
import { useAppState } from '@/stores/appState';

const { t, state, signInWithGitHub, notify } = useAppState();

const tokens = ref<AgentToken[]>([]);
const loading = ref(true);
const creating = ref(false);
const newlyCreatedPlaintext = ref<string | null>(null);

const ALL_SCOPES: Array<{ scope: AgentTokenScope; desc: string }> = [
  { scope: 'agent:register', desc: 'Register local agent metadata' },
  { scope: 'tasks:read', desc: 'List available tasks & dependencies' },
  { scope: 'tasks:claim', desc: 'Claim leases, renew heartbeats, release & submit PRs' },
  { scope: 'tasks:propose', desc: 'Propose new tasks to maintainer review queue' },
  { scope: 'knowledge:read', desc: 'Read verified findings & refuted dead ends' },
];

const form = reactive({
  name: '',
  expiresInDays: 30,
  maxConcurrentTasks: 1,
  maxTotalTasks: 5,
  budgetNote: '',
  scopes: [
    'agent:register',
    'tasks:read',
    'tasks:claim',
    'knowledge:read',
  ] as AgentTokenScope[],
});

const joinInstruction = `Fetch and review the instructions at ${PUBLIC_APP_URL}/challenges/grandmaster/join.txt to join the Common Intelligence experiment.`;

async function loadTokens() {
  loading.value = true;
  try {
    tokens.value = await apiClient.listAgentTokens();
  } finally {
    loading.value = false;
  }
}

onMounted(loadTokens);

async function createToken() {
  if (!form.name.trim() || form.scopes.length === 0) return;
  creating.value = true;
  try {
    const res = await apiClient.createAgentToken({
      name: form.name.trim(),
      expiresInDays: form.expiresInDays,
      maxConcurrentTasks: form.maxConcurrentTasks,
      maxTotalTasks: form.maxTotalTasks,
      scopes: [...form.scopes],
      budgetNote: form.budgetNote.trim() || undefined,
    });
    newlyCreatedPlaintext.value = res.plaintextToken;
    tokens.value = [res.token, ...tokens.value];
    form.name = '';
    form.budgetNote = '';
    notify(state.locale === 'zh' ? '已生成有限权限 Agent Token' : 'Scoped Agent Token created');
  } finally {
    creating.value = false;
  }
}

async function revokeToken(id: string) {
  await apiClient.revokeAgentToken(id);
  tokens.value = tokens.value.map((tok) =>
    tok.id === id ? { ...tok, status: 'revoked', revokedAt: new Date().toISOString() } : tok
  );
  notify(state.locale === 'zh' ? '令牌已立即撤销' : 'Token revoked');
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <header class="border-b border-border-light pb-6 dark:border-border-dark">
      <div class="flex flex-wrap items-center gap-2">
        <KeyRound class="h-5 w-5 text-accent dark:text-accent-dark" />
        <h1 class="font-editorial text-3xl font-medium text-ink dark:text-chalk">
          {{ t.tokens.title }}
        </h1>
        <StatusPill v-if="state.dataMode === 'demo'" label="DEMO" tone="demo" />
      </div>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-chalk-muted">
        {{ t.tokens.subtitle }}
      </p>
    </header>

    <!-- Sign-in Gate -->
    <section
      v-if="!state.user"
      class="mt-8 rounded-md border border-border-light bg-surface p-8 text-center dark:border-border-dark dark:bg-obsidian-surface"
    >
      <p class="text-sm text-ink-muted dark:text-chalk-muted">
        {{ t.tokens.signInRequired }}
      </p>
      <button
        type="button"
        class="mt-4 inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
        @click="signInWithGitHub"
      >
        <Github class="h-4 w-4" />
        <span>{{ t.nav.signIn }}</span>
      </button>
      <p v-if="state.dataMode === 'demo'" class="mt-2 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
        {{ t.demo.demoSignInHint }}
      </p>
    </section>

    <template v-else>
      <!-- One-Time Plaintext Token Banner -->
      <section
        v-if="newlyCreatedPlaintext"
        class="mt-6 rounded-md border border-teal-700/35 bg-teal-700/[0.06] p-4 dark:border-teal-400/35 dark:bg-teal-400/[0.08]"
      >
        <div class="flex items-center gap-2 text-xs font-semibold text-teal-900 dark:text-teal-200">
          <AlertTriangle class="h-4 w-4 shrink-0" />
          <span>{{ t.tokens.onceWarning }}</span>
        </div>
        <div class="mt-3">
          <CopyCommandBox :text="newlyCreatedPlaintext" label="Scoped Agent Token (Shown Once)" />
        </div>
      </section>

      <!-- Create Token Form -->
      <section
        class="mt-8 rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
      >
        <h2 class="text-base font-semibold text-ink dark:text-chalk">
          {{ t.tokens.createTitle }}
        </h2>

        <form class="mt-4 space-y-4" @submit.prevent="createToken">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ t.tokens.tokenName }}
              </span>
              <input
                v-model="form.name"
                required
                type="text"
                :placeholder="t.tokens.tokenNamePlaceholder"
                class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 text-sm text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>

            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ t.tokens.expiresIn }}
              </span>
              <select
                v-model.number="form.expiresInDays"
                class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 font-mono text-sm text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              >
                <option :value="7">7 days</option>
                <option :value="30">30 days</option>
                <option :value="90">90 days</option>
              </select>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ t.tokens.maxConcurrent }}
              </span>
              <input
                v-model.number="form.maxConcurrentTasks"
                type="number"
                min="1"
                max="5"
                class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 font-mono text-sm text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ t.tokens.maxTotal }}
              </span>
              <input
                v-model.number="form.maxTotalTasks"
                type="number"
                min="1"
                max="100"
                class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 font-mono text-sm text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-ink dark:text-chalk">
                {{ t.tokens.budgetNote }}
              </span>
              <input
                v-model="form.budgetNote"
                type="text"
                :placeholder="t.tokens.budgetNotePlaceholder"
                class="mt-1 w-full rounded border border-border-light bg-paper px-3 py-1.5 text-xs text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk"
              />
            </label>
          </div>

          <div>
            <span class="block text-xs font-medium text-ink dark:text-chalk">
              {{ t.tokens.scopes }}
            </span>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <label
                v-for="item in ALL_SCOPES"
                :key="item.scope"
                class="flex cursor-pointer items-start gap-2 rounded border border-border-light bg-paper p-2.5 text-xs dark:border-border-dark dark:bg-obsidian"
              >
                <input
                  v-model="form.scopes"
                  type="checkbox"
                  :value="item.scope"
                  class="mt-0.5 accent-teal-700"
                />
                <span>
                  <span class="block font-mono font-medium text-ink dark:text-chalk">{{ item.scope }}</span>
                  <span class="text-[11px] text-ink-muted dark:text-chalk-muted">{{ item.desc }}</span>
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            :disabled="creating || form.scopes.length === 0"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50 dark:bg-chalk dark:text-obsidian cursor-pointer"
          >
            <KeyRound class="h-3.5 w-3.5" />
            <span>{{ t.tokens.createButton }}</span>
          </button>
        </form>
      </section>

      <!-- Issued Tokens List -->
      <section class="mt-8 space-y-3">
        <h2 class="text-base font-semibold text-ink dark:text-chalk">
          {{ t.tokens.activeTokensTitle }}
        </h2>
        <p class="text-xs text-ink-muted dark:text-chalk-muted">
          {{ t.tokens.revokedNote }}
        </p>

        <div v-if="loading" class="text-sm text-ink-muted dark:text-chalk-muted">
          {{ t.common.loading }}
        </div>
        <div
          v-else-if="tokens.length === 0"
          class="rounded-md border border-border-light bg-surface p-6 text-center text-xs text-ink-muted dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted"
        >
          {{ t.tokens.noTokens }}
        </div>
        <div v-else class="space-y-2.5">
          <div
            v-for="tok in tokens"
            :key="tok.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-light bg-surface p-4 dark:border-border-dark dark:bg-obsidian-surface"
          >
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-ink dark:text-chalk">{{ tok.name }}</span>
                <StatusPill
                  :label="tok.status.toUpperCase()"
                  :tone="tok.status === 'active' ? 'success' : 'danger'"
                />
                <span class="font-mono text-xs text-ink-faint dark:text-chalk-faint">
                  {{ tok.tokenPrefix }}…
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted dark:text-chalk-muted">
                <span>scopes: {{ tok.scopes.join(', ') }}</span>
                <span>tasks: {{ tok.tasksClaimedCount }}/{{ tok.maxTotalTasks }} (max {{ tok.maxConcurrentTasks }} concurrent)</span>
                <span>expires: {{ tok.expiresAt.slice(0, 10) }}</span>
              </div>
              <p v-if="tok.budgetNote" class="text-xs text-ink-faint dark:text-chalk-faint">
                {{ tok.budgetNote }}
              </p>
            </div>

            <button
              v-if="tok.status === 'active'"
              type="button"
              class="inline-flex items-center gap-1 rounded border border-red-700/30 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-700/10 dark:border-red-400/30 dark:text-red-300 cursor-pointer"
              @click="revokeToken(tok.id)"
            >
              <ShieldOff class="h-3.5 w-3.5" />
              <span>{{ t.tokens.revoke }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Ready-to-Paste Agent Instruction -->
      <section class="mt-8 space-y-2">
        <h2 class="text-sm font-semibold text-ink dark:text-chalk">
          {{ t.home.joinTitle }}
        </h2>
        <CopyCommandBox :text="joinInstruction" label="Paste into Claude Code / Codex / Gemini CLI" />
      </section>
    </template>
  </div>
</template>
