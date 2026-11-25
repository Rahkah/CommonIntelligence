<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  PROJECT_PROPOSAL_STATUSES,
  type ProjectProposal,
  type ProjectProposalStatus,
} from '@common-intelligence/shared';
import { apiClient } from '@/api/client';
import { projectErrorKey } from '@/api/projectErrors';
import ProjectBriefDetails from '@/components/ProjectBriefDetails.vue';
import ProjectReviewForm from '@/components/ProjectReviewForm.vue';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const props = defineProps<{ review?: boolean }>();
const route = useRoute();
const { state, t, notify } = useAppState();
const filter = ref<ProjectProposalStatus>('Pending');
const proposals = ref<ProjectProposal[]>([]);
const total = ref(0);
const nextOffset = ref(0);
const selected = ref('');
const loading = ref(false);
const error = ref<ReturnType<typeof projectErrorKey>>();
const allowed = computed(() =>
  state.dataMode === 'api' && !!state.user && (!props.review || state.canReviewProjects)
);
let request = 0;

async function load(append = false) {
  const currentRequest = ++request;
  if (!append) {
    proposals.value = [];
    total.value = 0;
    nextOffset.value = 0;
    selected.value = '';
  }
  loading.value = false;
  error.value = undefined;
  if (!allowed.value) return;
  loading.value = true;
  try {
    const page = await apiClient.listProjectProposals(nextOffset.value, props.review ? filter.value : undefined);
    if (currentRequest !== request) return;
    const previous = new Set(proposals.value.map(({ id }) => id));
    proposals.value.push(...page.items.filter(({ id }) => !previous.has(id)));
    total.value = page.total;
    nextOffset.value = page.offset + page.items.length;
  } catch (err) {
    if (currentRequest === request) error.value = projectErrorKey(err);
  } finally {
    if (currentRequest === request) loading.value = false;
  }
}

watch([allowed, () => state.user?.githubId, () => props.review, filter], () => void load(), { immediate: true });

function reviewed(proposal: ProjectProposal) {
  notify(t.value.projects[proposal.status]);
  void load();
}
</script>

<template>
  <section class="mx-auto max-w-4xl space-y-5 px-4 py-10 sm:px-6">
    <RouterLink to="/#challenges" class="project-link">{{ t.challenge.backHome }}</RouterLink>
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="font-editorial text-3xl font-medium">{{ review ? t.projects.review : t.projects.mine }}</h1>
      <RouterLink v-if="allowed && !review" :to="{ name: 'new-project' }" class="project-link">
        {{ t.projects.newProject }}
      </RouterLink>
    </header>
    <p v-if="state.dataMode === 'demo'" class="project-panel text-sm">{{ t.projects.demo }}</p>
    <p v-else-if="!state.authLoaded" role="status">{{ t.common.loading }}</p>
    <div v-else-if="!state.user" class="project-panel space-y-3">
      <p>{{ t.projects.signIn }}</p>
      <a :href="apiClient.getGitHubLoginUrl(route.path)" class="project-button">{{ t.nav.signIn }}</a>
    </div>
    <p v-else-if="!allowed" class="project-panel" role="alert">{{ t.projects.forbidden }}</p>
    <template v-else>
      <select v-if="review" v-model="filter" class="project-field max-w-52" :aria-label="t.challenge.allStatuses">
        <option v-for="status in PROJECT_PROPOSAL_STATUSES" :key="status" :value="status">{{ t.projects[status] }}</option>
      </select>
      <article v-for="proposal in proposals" :key="proposal.id" class="project-panel space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="break-words text-lg font-semibold [overflow-wrap:anywhere]">{{ proposal.name }}</h2>
          <StatusPill :label="t.projects[proposal.status]" :tone="proposal.status === 'Pending' ? 'warning' : proposal.status === 'Rejected' ? 'danger' : 'success'" />
        </div>
        <div class="flex flex-wrap gap-x-3 text-xs text-ink-muted dark:text-chalk-muted">
          <span>{{ proposal.domain }}</span>
          <span v-if="review">@{{ proposal.authorUsername }}</span>
          <time :datetime="proposal.submittedAt">{{ new Date(proposal.submittedAt).toLocaleDateString(state.locale === 'zh' ? 'zh-CN' : 'en') }}</time>
        </div>
        <ProjectBriefDetails :project="proposal" />
        <dl v-if="proposal.rejectionReason" class="text-sm [overflow-wrap:anywhere]">
          <dt class="font-medium">{{ t.projects.reason }}</dt>
          <dd class="whitespace-pre-wrap text-ink-muted dark:text-chalk-muted">{{ proposal.rejectionReason }}</dd>
        </dl>
        <RouterLink v-if="proposal.challengeSlug" :to="{ name: 'challenge', params: { slug: proposal.challengeSlug } }" class="project-link">
          {{ t.projects.view }}
        </RouterLink>
        <template v-if="review && proposal.status === 'Pending'">
          <button type="button" class="project-link block" :aria-expanded="selected === proposal.id" @click="selected = selected === proposal.id ? '' : proposal.id">
            {{ t.projects.review }}
          </button>
          <ProjectReviewForm v-if="selected === proposal.id" :proposal="proposal" @reviewed="reviewed" @refresh="load()" />
        </template>
      </article>
      <p v-if="loading" role="status">{{ t.common.loading }}</p>
      <div v-else-if="error" role="alert" class="space-y-2">
        <p class="text-sm text-red-700 dark:text-red-300">{{ t.projects[error] }}</p>
        <button type="button" class="project-link" @click="load(proposals.length > 0)">{{ t.projects.retry }}</button>
      </div>
      <p v-else-if="!proposals.length" class="project-panel text-sm">{{ t.projects.noProposals }}</p>
      <button v-else-if="nextOffset < total" type="button" class="project-link" @click="load(true)">{{ t.projects.more }}</button>
    </template>
  </section>
</template>
