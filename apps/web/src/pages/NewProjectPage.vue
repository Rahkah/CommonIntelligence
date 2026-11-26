<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Github } from 'lucide-vue-next';
import {
  DEFAULT_PROJECT_CATEGORIES,
  PROJECT_BRIEF_VERSION,
  PROJECT_PROPOSAL_LIMITS,
  validateProjectBrief,
  type ChallengeCategory,
  type ProjectBriefError,
  type ProjectCategory,
} from '@common-intelligence/shared';
import { apiClient } from '@/api/client';
import { projectErrorKey } from '@/api/projectErrors';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import ProjectBriefDetails from '@/components/ProjectBriefDetails.vue';
import { buildProjectBriefPrompt, parseProjectBrief, PROJECT_BRIEF_LIMIT, PROJECT_IDEA_LIMIT } from '@/data/projectBrief';
import { useAppState } from '@/stores/appState';

const { state, t, loc, notify } = useAppState();
const router = useRouter();
const route = useRoute();
const categories = ref<ProjectCategory[]>([...DEFAULT_PROJECT_CATEGORIES]);
onMounted(() => {
  apiClient.listCategories().then((list) => {
    if (list.length > 0) categories.value = list;
  }).catch(() => {});
});
const form = reactive({
  schemaVersion: PROJECT_BRIEF_VERSION,
  category: 'challenge' as ChallengeCategory,
  name: '',
  domain: '',
  summary: '',
  goal: '',
  scoringMetric: '',
  acceptanceCriteria: '',
  githubRepo: '',
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
  Object.assign(form, {
    category: result.data.category ?? 'playground',
    name: result.data.name,
    domain: result.data.domain,
    summary: result.data.summary,
    goal: result.data.goal,
    scoringMetric: result.data.scoringMetric ?? '',
    acceptanceCriteria: result.data.acceptanceCriteria ?? '',
    githubRepo: result.data.githubRepo ?? '',
  });
  imported.value = true;
  await nextTick();
  previewHeading.value?.focus();
}

async function submit() {
  if (submitting.value || !canSubmit.value || (!manually.value && !imported.value)) return;
  error.value = undefined;
  briefError.value = undefined;
  const result = validateProjectBrief({
    schemaVersion: form.schemaVersion,
    category: form.category,
    name: form.name,
    domain: form.domain,
    summary: form.summary,
    goal: form.goal,
    ...(form.scoringMetric.trim() ? { scoringMetric: form.scoringMetric.trim() } : {}),
    ...(form.acceptanceCriteria.trim() ? { acceptanceCriteria: form.acceptanceCriteria.trim() } : {}),
    ...(form.githubRepo.trim() ? { githubRepo: form.githubRepo.trim() } : {}),
  });
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
      <h1 class="font-display text-3xl font-bold">{{ t.projects.newProject }}</h1>
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
      <button type="button" class="project-link cursor-pointer" :disabled="submitting" @click="setManualMode(!manually)">
        {{ manually ? t.projects.useAgent : t.projects.enterManually }}
      </button>
      <template v-if="!manually">
        <form class="project-panel space-y-4" @submit.prevent="generatePrompt">
          <label class="project-field">
            <span>{{ t.projects.idea }}</span>
            <textarea
              v-model.trim="idea"
              :maxlength="PROJECT_IDEA_LIMIT"
              rows="3"
              required
              :placeholder="t.projects.ideaExample"
              :disabled="submitting"
              @input="prompt = ''"
            />
          </label>
          <button class="project-button cursor-pointer" type="submit" :disabled="!idea || submitting">
            {{ t.projects.generatePrompt }}
          </button>
          <div v-if="prompt" class="space-y-2">
            <p class="text-sm text-ink-muted dark:text-chalk-muted">{{ t.projects.promptInstructions }}</p>
            <CopyCommandBox :text="prompt" :label="t.projects.agentPrompt" multiline class="[&_pre]:max-h-64" />
          </div>
        </form>
        <form class="project-panel space-y-4" @submit.prevent="previewBrief">
          <label class="project-field">
            <span>{{ t.projects.pasteBrief }}</span>
            <textarea
              v-model="brief"
              :maxlength="PROJECT_BRIEF_LIMIT"
              rows="5"
              required
              class="font-mono"
              placeholder='{ "schemaVersion": 1, ... }'
              :disabled="submitting"
              @input="resetPreview"
            />
          </label>
          <button class="project-button cursor-pointer" type="submit" :disabled="!brief.trim() || submitting">
            {{ t.projects.previewBrief }}
          </button>
          <p v-if="!imported && briefErrorText" role="alert" class="text-sm text-red-600 dark:text-red-400">
            {{ briefErrorText }}
          </p>
        </form>
        <article v-if="imported" class="project-panel space-y-4">
          <h2 ref="previewHeading" tabindex="-1" class="scroll-mt-20 font-display font-bold">{{ t.projects.briefTitle }}</h2>
          <div class="[overflow-wrap:anywhere]">
            <h3 class="text-lg font-bold">{{ form.name }}</h3>
            <p class="text-sm text-ink-muted dark:text-chalk-muted">{{ form.domain }}</p>
          </div>
          <ProjectBriefDetails :project="form" />
          <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ t.projects[error] }}</p>
          <p v-else-if="briefErrorText" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ briefErrorText }}</p>
          <div class="flex flex-wrap items-center gap-4">
            <button v-if="canSubmit" class="project-button cursor-pointer" type="button" :disabled="submitting" @click="submit">
              {{ submitting ? t.common.loading : t.projects.confirmBrief }}
            </button>
            <button class="project-link cursor-pointer" type="button" :disabled="submitting" @click="setManualMode(true)">
              {{ t.projects.editBrief }}
            </button>
          </div>
        </article>
      </template>

      <form v-else class="project-panel space-y-4" @submit.prevent="submit">
        <fieldset :disabled="submitting" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="project-field">
              <span>{{ t.projects.name }}</span>
              <input v-model.trim="form.name" required :maxlength="PROJECT_PROPOSAL_LIMITS.name" />
            </label>
            <label class="project-field">
              <span>{{ t.projects.domain }}</span>
              <input v-model.trim="form.domain" required :maxlength="PROJECT_PROPOSAL_LIMITS.domain" />
            </label>
            <label class="project-field">
              <span>{{ t.projects.category }}</span>
              <select v-model="form.category">
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ loc(cat.name) }}
                </option>
              </select>
            </label>
          </div>
          <label class="project-field">
            <span>{{ t.projects.summary }}</span>
            <textarea v-model.trim="form.summary" required :maxlength="PROJECT_PROPOSAL_LIMITS.summary" rows="2" />
          </label>
          <label class="project-field">
            <span>{{ t.projects.goal }}</span>
            <textarea v-model.trim="form.goal" required :maxlength="PROJECT_PROPOSAL_LIMITS.goal" rows="3" />
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="project-field">
              <span>{{ t.projects.scoringMetric }}</span>
              <input v-model.trim="form.scoringMetric" :maxlength="PROJECT_PROPOSAL_LIMITS.scoringMetric" />
            </label>
            <label class="project-field">
              <span>{{ t.projects.githubRepo }} ({{ t.projects.optional }})</span>
              <input v-model.trim="form.githubRepo" type="url" :maxlength="PROJECT_PROPOSAL_LIMITS.githubRepo" placeholder="https://github.com/owner/repo" />
            </label>
          </div>
        </fieldset>
        <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ t.projects[error] }}</p>
        <p v-else-if="briefErrorText" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ briefErrorText }}</p>
        <button v-if="canSubmit" type="submit" class="project-button cursor-pointer" :disabled="submitting">
          {{ submitting ? t.common.loading : t.projects.submit }}
        </button>
      </form>
    </template>
  </section>
</template>
