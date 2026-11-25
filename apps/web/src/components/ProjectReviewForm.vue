<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  CONTRIBUTION_TYPES,
  type ApproveProjectProposalRequest,
  type ContributionType,
  type ProjectProposal,
} from '@common-intelligence/shared';
import { apiClient, ApiRequestError } from '@/api/client';
import { projectErrorKey } from '@/api/projectErrors';
import { useAppState } from '@/stores/appState';

const props = defineProps<{ proposal: ProjectProposal }>();
const emit = defineEmits<{ reviewed: [ProjectProposal]; refresh: [] }>();
const { t } = useAppState();
const action = ref<'approve' | 'reject'>('approve');
const saving = ref(false);
const error = ref<ReturnType<typeof projectErrorKey>>();
const reason = ref('');
const form = reactive({
  slug: props.proposal.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80),
  autoCreateRepo: !props.proposal.githubRepo,
  githubRepo: props.proposal.githubRepo ?? '',
  trustedCheckName: '',
  verificationMethod: '',
  targetDisplay: '',
  contributionType: 'IndependentVerification' as ContributionType,
  scoreDirection: '' as '' | 'higher' | 'lower',
  baselineDisplay: '',
  baselineSource: '',
  baselineValue: '',
});

function onManualRepoInput() {
  if (form.githubRepo.trim()) {
    form.autoCreateRepo = false;
  }
}

async function review() {
  if (saving.value) return;
  error.value = undefined;
  saving.value = true;
  try {
    if (action.value === 'reject') {
      emit('reviewed', await apiClient.rejectProjectProposal(props.proposal.id, reason.value));
      return;
    }
    const { baselineDisplay, baselineSource, baselineValue, scoreDirection, autoCreateRepo, githubRepo, trustedCheckName, ...metadata } = form;
    const useAuto = autoCreateRepo && !githubRepo.trim();
    const body: ApproveProjectProposalRequest = {
      ...metadata,
      autoCreateRepo: useAuto || undefined,
      githubRepo: useAuto ? undefined : githubRepo,
      trustedCheckName: trustedCheckName || (useAuto ? `${form.slug}-verifier-v1` : ''),
      scoreDirection: scoreDirection || undefined,
      baseline: baselineDisplay || baselineSource || baselineValue !== ''
        ? { display: baselineDisplay, sourceUrl: baselineSource, value: baselineValue === '' ? undefined : Number(baselineValue) }
        : undefined,
    };
    emit('reviewed', await apiClient.approveProjectProposal(props.proposal.id, body));
  } catch (err) {
    error.value = projectErrorKey(err);
    if (err instanceof ApiRequestError && err.body?.message === 'This proposal has already been reviewed.')
      emit('refresh');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="space-y-4 border-t border-border-light pt-4 dark:border-border-dark" @submit.prevent="review">
    <fieldset :disabled="saving" class="space-y-4">
      <div class="flex flex-wrap gap-4 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="action" type="radio" value="approve" /> {{ t.projects.approve }}
        </label>
        <label class="flex items-center gap-2">
          <input v-model="action" type="radio" value="reject" /> {{ t.projects.reject }}
        </label>
      </div>
      <template v-if="action === 'approve'">
        <p class="text-sm text-ink-muted dark:text-chalk-muted">{{ t.projects.readiness }}</p>
        <label class="flex items-start gap-2 rounded border border-border-light bg-subtle/40 p-3 text-xs dark:border-border-dark dark:bg-obsidian-subtle/40">
          <input v-model="form.autoCreateRepo" type="checkbox" class="mt-0.5" />
          <span class="space-y-0.5">
            <span class="block font-medium text-ink dark:text-chalk">{{ t.projects.autoCreateRepo }}</span>
            <span class="block text-ink-muted dark:text-chalk-muted">{{ t.projects.autoCreateRepoHint }}</span>
          </span>
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="project-field">
            <span>{{ t.projects.slug }}</span>
            <input v-model.trim="form.slug" required maxlength="80" pattern="[a-z0-9][a-z0-9\-]{0,79}" placeholder="project-name" />
          </label>
          <label class="project-field">
            <span>{{ t.projects.githubRepo }}</span>
            <input
              v-model.trim="form.githubRepo"
              :required="!form.autoCreateRepo"
              type="url"
              maxlength="300"
              :placeholder="form.autoCreateRepo ? `https://github.com/common-intelligence-org/${form.slug || 'project-name'}` : 'https://github.com/owner/repository'"
              @input="onManualRepoInput"
            />
          </label>
          <label class="project-field">
            <span>{{ t.projects.trustedCheckName }}</span>
            <input
              v-model.trim="form.trustedCheckName"
              :required="!form.autoCreateRepo"
              maxlength="150"
              :placeholder="form.slug ? `${form.slug}-verifier-v1` : 'project-verifier-v1'"
            />
          </label>
          <label class="project-field">
            <span>{{ t.projects.targetDisplay }}</span>
            <input v-model.trim="form.targetDisplay" required maxlength="200" />
          </label>
          <label class="project-field">
            <span>{{ t.projects.contributionType }}</span>
            <select v-model="form.contributionType">
              <option v-for="type in CONTRIBUTION_TYPES" :key="type" :value="type">{{ type }}</option>
            </select>
          </label>
          <label class="project-field">
            <span>{{ t.projects.scoreDirection }}</span>
            <select v-model="form.scoreDirection" :required="form.contributionType === 'RecordImprovement' || form.baselineValue !== ''">
              <option value="">{{ t.common.none }}</option>
              <option value="higher">{{ t.projects.higher }}</option>
              <option value="lower">{{ t.projects.lower }}</option>
            </select>
          </label>
        </div>
        <label class="project-field">
          <span>{{ t.projects.verificationMethod }}</span>
          <textarea v-model.trim="form.verificationMethod" rows="3" required maxlength="4000" />
        </label>
        <details class="space-y-3">
          <summary class="cursor-pointer text-sm font-medium">{{ t.projects.baseline }} ({{ t.projects.optional }})</summary>
          <label class="project-field">
            <span>{{ t.projects.baselineDisplay }}</span>
            <input v-model.trim="form.baselineDisplay" maxlength="200" />
          </label>
          <label class="project-field">
            <span>{{ t.projects.baselineSource }}</span>
            <input v-model.trim="form.baselineSource" type="url" maxlength="1000" />
          </label>
          <label class="project-field">
            <span>{{ t.projects.baselineValue }}</span>
            <input :value="form.baselineValue" type="number" step="any" @input="form.baselineValue = ($event.target as HTMLInputElement).value" />
          </label>
        </details>
      </template>
      <label v-else class="project-field">
        <span>{{ t.projects.reason }}</span>
        <textarea v-model.trim="reason" required maxlength="2000" rows="3" />
      </label>
    </fieldset>
    <p v-if="error" role="alert" class="text-sm text-red-700 dark:text-red-300">{{ t.projects[error] }}</p>
    <button type="submit" class="project-button" :disabled="saving">
      {{ saving ? t.common.loading : action === 'approve' ? t.projects.approve : t.projects.reject }}
    </button>
  </form>
</template>
