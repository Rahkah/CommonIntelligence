<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  renderCredentialCertificateSvg,
  type Credential,
} from '@common-intelligence/shared';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-vue-next';
import CopyCommandBox from '@/components/CopyCommandBox.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient, PUBLIC_APP_URL } from '@/api/client';
import { DEMO_CREDENTIALS } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const route = useRoute();
const { t, loc, state, notify } = useAppState();

const credential = ref<Credential | null>(null);
const loading = ref(true);
const copiedUrl = ref(false);

const publicVerificationUrl = computed(() =>
  credential.value ? `${PUBLIC_APP_URL}/credentials/${credential.value.id}` : ''
);

const certificateSvgText = computed(() => {
  if (!credential.value) return '';
  return renderCredentialCertificateSvg(credential.value, { publicOrigin: PUBLIC_APP_URL });
});

// Render via <img> data URI rather than v-html so the SVG is strictly non-scriptable.
const certificateDataUri = computed(() =>
  certificateSvgText.value
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(certificateSvgText.value)}`
    : ''
);

const credentialBadgeMarkdown = computed(() => {
  if (!credential.value) return '';
  return `[![Common Intelligence Verified Contribution](${PUBLIC_APP_URL}/api/credentials/${credential.value.id}.svg)](${publicVerificationUrl.value})`;
});

async function loadCredential(id: string) {
  loading.value = true;
  try {
    credential.value = await apiClient.getCredential(id);
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadCredential(String(route.params.id ?? '')));
watch(
  () => route.params.id,
  (val) => {
    if (val) loadCredential(String(val));
  }
);

function downloadCertificateSvg() {
  if (!credential.value || !certificateSvgText.value) return;
  const blob = new Blob([certificateSvgText.value], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${credential.value.id}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify(state.locale === 'zh' ? '已下载 SVG 数字证书' : 'Downloaded SVG Certificate');
}

async function copyVerifyLink() {
  try {
    await navigator.clipboard.writeText(publicVerificationUrl.value);
  } catch {
    // ignore
  }
  copiedUrl.value = true;
  notify(t.value.common.copied);
  setTimeout(() => {
    copiedUrl.value = false;
  }, 2000);
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <div v-if="loading" class="text-sm text-ink-muted dark:text-chalk-muted">
      {{ t.common.loading }}
    </div>

    <div
      v-else-if="!credential"
      class="rounded-md border border-border-light bg-surface p-8 text-center dark:border-border-dark dark:bg-obsidian-surface"
    >
      <h1 class="text-lg font-semibold text-ink dark:text-chalk">{{ t.credential.notFoundTitle }}</h1>
      <p class="mt-1 text-sm text-ink-muted dark:text-chalk-muted">{{ t.credential.notFoundBody }}</p>
    </div>

    <template v-else>
      <header class="border-b border-border-light pb-6 dark:border-border-dark">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs uppercase tracking-wider text-ink-faint dark:text-chalk-faint">
            {{ t.credential.eyebrow }}
          </span>
          <StatusPill
            :label="credential.status"
            :tone="
              credential.status === 'Verified'
                ? 'success'
                : credential.status === 'Revoked'
                  ? 'danger'
                  : 'warning'
            "
          />
          <StatusPill v-if="credential.isDemo" label="DEMO SPECIMEN" tone="demo" />
        </div>

        <h1 class="mt-2 font-editorial text-3xl font-medium text-ink dark:text-chalk">
          {{ loc(credential.contributionTitle) }}
        </h1>

        <!-- Verification Status Callout -->
        <div
          class="mt-4 flex items-start gap-2.5 rounded-md border p-3.5 text-xs"
          :class="
            credential.status === 'Verified'
              ? 'border-teal-700/25 bg-teal-700/[0.05] text-teal-950 dark:border-teal-400/25 dark:bg-teal-400/[0.06] dark:text-teal-200'
              : credential.status === 'Revoked'
                ? 'border-red-700/30 bg-red-700/[0.05] text-red-950 dark:border-red-400/30 dark:bg-red-400/[0.08] dark:text-red-200'
                : 'border-amber-700/30 bg-amber-700/[0.05] text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/[0.08] dark:text-amber-200'
          "
        >
          <ShieldCheck v-if="credential.status === 'Verified'" class="mt-0.5 h-4 w-4 shrink-0" />
          <ShieldAlert v-else-if="credential.status === 'Revoked'" class="mt-0.5 h-4 w-4 shrink-0" />
          <AlertCircle v-else class="mt-0.5 h-4 w-4 shrink-0" />
          <div class="space-y-1">
            <p class="font-medium">
              {{
                credential.status === 'Verified'
                  ? t.credential.verifyBannerVerified
                  : credential.status === 'Revoked'
                    ? t.credential.verifyBannerRevoked
                    : t.credential.verifyBannerSuperseded
              }}
            </p>
            <p v-if="credential.statusNote" class="opacity-85">
              {{ loc(credential.statusNote) }}
            </p>
          </div>
        </div>

        <!-- Primary Actions -->
        <div class="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-3.5 py-2 text-xs font-medium text-paper transition hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
            @click="downloadCertificateSvg"
          >
            <Download class="h-3.5 w-3.5" />
            <span>{{ t.credential.downloadSvg }}</span>
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-3.5 py-2 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk cursor-pointer"
            @click="copyVerifyLink"
          >
            <Check v-if="copiedUrl" class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
            <Copy v-else class="h-3.5 w-3.5" />
            <span>{{ copiedUrl ? t.common.copied : t.credential.copyVerifyUrl }}</span>
          </button>
        </div>
      </header>

      <!-- Printable Archival SVG Certificate Preview -->
      <section class="mt-8 space-y-3">
        <h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
          {{ t.credential.certificatePreview }}
        </h2>
        <div
          class="overflow-hidden rounded-lg border border-border-light bg-paper p-3 shadow-xs dark:border-border-dark dark:bg-obsidian-surface"
        >
          <img
            :src="certificateDataUri"
            :alt="`Proof of Contribution Certificate ${credential.id}`"
            class="h-auto w-full rounded"
          />
        </div>
      </section>

      <!-- Structured Verification Ledger Metadata -->
      <section class="mt-10 space-y-3">
        <h2 class="text-base font-semibold text-ink dark:text-chalk">
          {{ t.credential.metadataTitle }}
        </h2>
        <div class="overflow-hidden rounded-md border border-border-light bg-surface dark:border-border-dark dark:bg-obsidian-surface">
          <dl class="divide-y divide-border-light text-xs dark:divide-border-dark">
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.credentialId }}
              </dt>
              <dd class="font-mono font-semibold text-ink dark:text-chalk">{{ credential.id }}</dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.contributor }}
              </dt>
              <dd class="flex flex-wrap items-center gap-2">
                <img
                  :src="credential.contributorAvatarUrl"
                  :alt="credential.contributorUsername"
                  class="h-4 w-4 rounded-sm"
                />
                <RouterLink
                  :to="`/u/${credential.contributorUsername}`"
                  class="font-mono font-medium text-ink hover:underline dark:text-chalk"
                >
                  @{{ credential.contributorUsername }}
                </RouterLink>
                <span class="font-mono text-ink-faint dark:text-chalk-faint">
                  (GitHub ID: {{ credential.contributorGithubId }})
                </span>
              </dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.challenge }}
              </dt>
              <dd>
                <RouterLink
                  :to="`/challenges/${credential.challengeSlug}`"
                  class="font-medium text-accent hover:underline dark:text-accent-dark"
                >
                  {{ credential.challengeName }}
                </RouterLink>
                <span class="ml-2 font-mono text-ink-faint dark:text-chalk-faint">
                  · {{ credential.contributionType }}
                </span>
              </dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.taskId }}
              </dt>
              <dd class="font-mono text-ink dark:text-chalk">{{ credential.taskId }}</dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.pullRequest }}
              </dt>
              <dd>
                <a
                  :href="credential.prUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 font-mono text-accent hover:underline dark:text-accent-dark break-all"
                >
                  <span>{{ credential.prUrl }}</span>
                  <ExternalLink class="h-3 w-3 shrink-0" />
                </a>
              </dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.commitSha }}
              </dt>
              <dd class="font-mono break-all text-ink dark:text-chalk">{{ credential.commitSha }}</dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.verifierVersion }}
              </dt>
              <dd class="font-mono text-ink dark:text-chalk">{{ credential.verifierVersion }}</dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.verificationRun }}
              </dt>
              <dd class="space-y-1">
                <div class="font-mono text-ink dark:text-chalk">{{ credential.verificationRunId }}</div>
                <div class="text-ink-muted dark:text-chalk-muted">
                  {{ loc(credential.verificationSummary) }}
                </div>
              </dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.issuedAt }}
              </dt>
              <dd class="font-mono text-ink dark:text-chalk">{{ credential.issuedAt }}</dd>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr]">
              <dt class="font-mono text-ink-faint dark:text-chalk-faint">
                {{ t.credential.fields.parentContributions }}
              </dt>
              <dd class="font-mono text-ink dark:text-chalk">
                {{
                  credential.parentContributionIds.length > 0
                    ? credential.parentContributionIds.join(', ')
                    : t.common.none
                }}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <!-- Share on GitHub Profile README -->
      <section class="mt-8 space-y-3">
        <CopyCommandBox :text="credentialBadgeMarkdown" :label="t.credential.copyBadgeMd" />
      </section>

      <!-- Demo Credential Specimen Switcher -->
      <section
        v-if="state.dataMode === 'demo'"
        class="mt-10 rounded-md border border-border-light bg-subtle/50 p-4 dark:border-border-dark dark:bg-obsidian-subtle/50"
      >
        <div class="font-mono text-[11px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint">
          {{ state.locale === 'zh' ? '浏览其他演示凭证（含历史替代状态）' : 'Inspect other Demo Credentials (including Superseded specimen)' }}
        </div>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <RouterLink
            v-for="item in DEMO_CREDENTIALS"
            :key="item.id"
            :to="`/credentials/${item.id}`"
            class="rounded border px-2.5 py-1 font-mono text-[11px] transition"
            :class="
              item.id === credential.id
                ? 'border-ink bg-ink text-paper dark:border-chalk dark:bg-chalk dark:text-obsidian'
                : 'border-border-light bg-surface text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk-muted'
            "
          >
            {{ item.id }} ({{ item.status }})
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
