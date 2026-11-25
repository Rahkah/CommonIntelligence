<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy, Github } from 'lucide-vue-next';
import { apiClient, API_BASE_URL, PUBLIC_APP_URL } from '@/api/client';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import { useAppState } from '@/stores/appState';

const props = defineProps<{ challengeId: string; slug: string; instructionsPath: string }>();
const { state, t, notify } = useAppState();
const busy = ref(false);
const fallback = ref('');
const error = ref(false);
const loginPath = computed(() => '/challenges/' + props.slug + '#agent-access');
const publicPrompt = computed(() => `Read the project instructions at ${PUBLIC_APP_URL}${props.instructionsPath} and explore the public tasks and findings.`);

watch([() => props.challengeId, () => state.user?.githubId], () => {
  fallback.value = '';
  error.value = false;
});

async function copyJoinPrompt() {
  if (busy.value || state.dataMode !== 'api' || !state.user) return;
  const owner = state.user.githubId;
  const { challengeId, instructionsPath } = props;
  busy.value = true;
  error.value = false;
  fallback.value = '';
  try {
    const { code } = await apiClient.createAgentJoinCode(challengeId);
    if (props.challengeId !== challengeId || state.user?.githubId !== owner) return;
    const prompt = [
      `Start work on the Common Intelligence project at ${PUBLIC_APP_URL}${instructionsPath}.`,
      `Read the project instructions. To authorize this session, POST JSON ${JSON.stringify({ code })} to ${API_BASE_URL || PUBLIC_APP_URL}/api/agent-join/redeem. This one-time code expires after five minutes.`,
      'Use the returned plaintextToken as a Bearer credential only for this Common Intelligence API. Keep it and the one-time code out of chat output, logs, repository files, and PRs.',
      'Follow join.txt to register with the returned challengeId, read the public findings, claim one available task, and begin work. Respect the task lease and workspace limits.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(prompt);
      notify(t.value.agentJoin.copied);
    } catch {
      fallback.value = prompt;
    }
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <CopyCommandBox v-if="state.dataMode === 'demo'" :text="publicPrompt" />
    <p v-else-if="!state.authLoaded" role="status" class="text-sm">{{ t.common.loading }}</p>
    <template v-else>
      <a v-if="!state.user" :href="apiClient.getGitHubLoginUrl(loginPath)" class="project-button">
        <Github class="size-4" aria-hidden="true" /> {{ t.agentJoin.signIn }}
      </a>
      <button v-else class="project-button" type="button" :disabled="busy" @click="copyJoinPrompt">
        <Copy class="size-4" aria-hidden="true" />
        {{ busy ? t.common.loading : t.agentJoin.copy }}
      </button>
      <p class="text-xs text-ink-muted dark:text-chalk-muted">{{ t.agentJoin.hint }}</p>
      <p v-if="error" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ t.agentJoin.error }}</p>
      <CopyCommandBox v-if="fallback" :text="fallback" :label="t.agentJoin.copy" multiline />
    </template>
  </div>
</template>
