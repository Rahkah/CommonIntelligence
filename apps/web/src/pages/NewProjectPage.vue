<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Github } from 'lucide-vue-next';
import {
  PROJECT_BRIEF_SECTIONS,
  PROJECT_BRIEF_VERSION,
  PROJECT_PROPOSAL_LIMITS,
  validateProjectBrief,
  type ProjectBriefError,
} from '@common-intelligence/shared';
import { apiClient } from '@/api/client';
import { projectErrorKey } from '@/api/projectErrors';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import ProjectBriefDetails from '@/components/ProjectBriefDetails.vue';
import { buildProjectBriefPrompt, parseProjectBrief, PROJECT_BRIEF_LIMIT, PROJECT_IDEA_LIMIT } from '@/data/projectBrief';
import { useAppState } from '@/stores/appState';

const { state, t, notify } = useAppState();
const router = useRouter();
const route = useRoute();
const form = reactive({
  schemaVersion: PROJECT_BRIEF_VERSION,
  name: '', domain: '', summary: '', goal: '', scoringMetric: '', acceptanceCriteria: '', githubRepo: '',
});
const idea = ref('');
const prompt = ref('');
const brief = ref('');
const manually = ref(false);
const imported = ref(false);
const previewHeading = ref<HTMLElement | null>(null);
const briefError = ref<ProjectBriefError>();
const briefErrorText = computed(() => {
  const issue = briefError.value;
  if (!issue) return '';
  const message = t.value.projects[issue.error];
  return 'field' in issue ? `${message} ${t.value.projects[issue.field]} (${issue.field})` : message;
});
const canSubmit = computed(() => state.dataMode === 'api' && !!state.user);
const submitting = ref(false);
const error = ref<ReturnType<typeof projectErrorKey>>();
let attempt: { body: string; key: string } | undefined;

function generatePrompt() {
  prompt.value = buildProjectBriefPrompt(idea.value, state.locale);
}

function resetPreview() {
  imported.value = false;
  briefError.value = undefined;
  error.value = undefined;
}

function setManualMode(enabled: boolean) {
  manually.value = enabled;
  briefError.value = undefined;
  error.value = undefined;
}

async function previewBrief() {
  resetPreview();
  const result = parseProjectBrief(brief.value);
  if ('error' in result) {
    briefError.value = result;
    return;
  }
  Object.assign(form, result.data, { githubRepo: result.data.githubRepo ?? '' });
  imported.value = true;
  await nextTick();
  previewHeading.value?.focus();
}

async function submit() {
  if (submitting.value || !canSubmit.value || (!manually.value && !imported.value)) return;
  error.value = undefined;
  briefError.value = undefined;
  const result = validateProjectBrief({ ...form, githubRepo: form.githubRepo || undefined });
  if ('error' in result) {
    briefError.value = result;
    return;
  }
  const body = result.data;
  const serialized = JSON.stringify(body);
  if (attempt?.body !== serialized) attempt = { body: serialized, key: crypto.randomUUID() };
  submitting.value = true;
  try {
    await apiClient.createProjectProposal(body, attempt.key);
    notify(t.value.projects.submitted);
    await router.push({ name: 'my-projects' });
  } catch (err) {
    error.value = projectErrorKey(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-5 px-4 py-10 sm:px-6">
    <RouterLink to="/#challenges" class="project-link">{{ t.challenge.backHome }}</RouterLink>
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="font-editorial text-3xl font-medium">{{ t.projects.newProject }}</h1>
      <RouterLink v-if="state.user && state.dataMode === 'api'" :to="{ name: 'my-projects' }" class="project-link">
        {{ t.projects.mine }}
      </RouterLink>
    </header>
    <p v-if="state.dataMode === 'api' && !state.authLoaded" role="status">{{ t.common.loading }}</p>
    <div v-else-if="state.dataMode === 'api' && !state.user" class="project-panel space-y-3">
      <p class="text-sm">{{ t.projects.signIn }}</p>
      <a :href="apiClient.getGitHubLoginUrl(route.path)" class="project-button">
        <Github class="size-4" aria-hidden="true" /> {{ t.nav.signIn }}
      </a>
    </div>
    <template v-else>
      <p v-if="state.dataMode === 'demo'" class="project-panel text-sm">{{ t.projects.demo }}</p>
      <button type="button" class="project-link" :disabled="submitting" @click="setManualMode(!manually)">
        {{ manually ? t.projects.useAgent : t.projects.enterManually }}
      </button>
      <template v-if="!manually">
        <form class="project-panel space-y-4" @submit.prevent="generatePrompt">
          <label class="project-field">
            <span>{{ t.projects.idea }}</span>
            <textarea v-model.trim="idea" :maxlength="PROJECT_IDEA_LIMIT" rows="4" required
              :placeholder="t.projects.ideaExample" :disabled="submitting" @input="prompt = ''" />
          </label>
          <button class="project-button" type="submit" :disabled="!idea || submitting">{{ t.projects.generatePrompt }}</button>
          <div v-if="prompt" class="space-y-2">
            <p class="text-sm text-ink-muted dark:text-chalk-muted">{{ t.projects.promptInstructions }}</p>
            <CopyCommandBox :text="prompt" :label="t.projects.agentPrompt" multiline class="[&_pre]:max-h-64" />
          </div>
        </form>
        <form class="project-panel space-y-4" @submit.prevent="previewBrief">
          <label class="project-field">
            <span>{{ t.projects.pasteBrief }}</span>
            <textarea v-model="brief" :maxlength="PROJECT_BRIEF_LIMIT" rows="5" required
              class="font-mono" placeholder='{ "schemaVersion": 1, ... }' :disabled="submitting" @input="resetPreview" />
          </label>
          <button class="project-button" type="submit" :disabled="!brief.trim() || submitting">{{ t.projects.previewBrief }}</button>
          <p v-if="!imported && briefErrorText" role="alert" class="text-sm text-red-700 dark:text-red-300">
            {{ briefErrorText }}
          </p>
        </form>
        <article v-if="imported" class="project-panel space-y-4">
          <h2 ref="previewHeading" tabindex="-1" class="scroll-mt-20 font-semibold">{{ t.projects.briefTitle }}</h2>
          <div class="[overflow-wrap:anywhere]">
            <h3 class="text-lg font-medium">{{ form.name }}</h3>
            <p class="text-sm text-ink-muted dark:text-chalk-muted">{{ form.domain }}</p>
          </div>
          <ProjectBriefDetails :project="form" />
          <p v-if="error" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ t.projects[error] }}</p>
          <p v-else-if="briefErrorText" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ briefErrorText }}</p>
          <div class="flex flex-wrap items-center gap-4">
            <button v-if="canSubmit" class="project-button" type="button" :disabled="submitting" @click="submit">
              {{ submitting ? t.common.loading : t.projects.confirmBrief }}
            </button>
            <button class="project-link" type="button" :disabled="submitting" @click="setManualMode(true)">{{ t.projects.editBrief }}</button>
          </div>
        </article>
      </template>
      <form v-else class="project-panel space-y-4" @submit.prevent="submit">
        <fieldset :disabled="submitting" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="project-field">
              <span>{{ t.projects.name }}</span>
              <input v-model.trim="form.name" required :maxlength="PROJECT_PROPOSAL_LIMITS.name" />
            </label>
            <label class="project-field">
              <span>{{ t.projects.domain }}</span>
              <input v-model.trim="form.domain" required :maxlength="PROJECT_PROPOSAL_LIMITS.domain" />
            </label>
          </div>
          <label v-for="field in PROJECT_BRIEF_SECTIONS" :key="field" class="project-field">
            <span>{{ t.projects[field] }}</span>
            <textarea v-model.trim="form[field]" required :maxlength="PROJECT_PROPOSAL_LIMITS[field]" rows="3" />
          </label>
          <label class="project-field">
            <span>{{ t.projects.githubRepo }} ({{ t.projects.optional }})</span>
            <input v-model.trim="form.githubRepo" type="url" :maxlength="PROJECT_PROPOSAL_LIMITS.githubRepo" placeholder="https://github.com/owner/repository" />
          </label>
        </fieldset>
        <p v-if="error" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ t.projects[error] }}</p>
        <p v-else-if="briefErrorText" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ briefErrorText }}</p>
        <button v-if="canSubmit" type="submit" class="project-button" :disabled="submitting">
          {{ submitting ? t.common.loading : t.projects.submit }}
        </button>
      </form>
    </template>
  </section>
</template>
