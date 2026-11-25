<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  ALLOWED_SANDBOX_PERMISSIONS,
  SHOWCASE_MANIFEST_PATH,
  createDefaultPendingShowcase,
  sanitizeSandboxPermissions,
  type Challenge,
  type Contribution,
  type ProjectShowcase,
  type ShowcaseRelease,
} from '@common-intelligence/shared';
import {
  Code2,
  ExternalLink,
  GitBranch,
  History,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-vue-next';
import ChessTrainingBoard from '@/components/ChessTrainingBoard.vue';
import StatusPill from '@/components/StatusPill.vue';
import { apiClient } from '@/api/client';
import { useAppState } from '@/stores/appState';

const props = defineProps<{
  challenge: Challenge;
  contributions: Contribution[];
}>();

const emit = defineEmits<{
  (e: 'join-agent'): void;
}>();

const { state, loc } = useAppState();
const L = (en: string, zh: string) => (state.locale === 'zh' ? zh : en);

const showcase = ref<ProjectShowcase>(
  props.challenge.showcase ?? createDefaultPendingShowcase(props.challenge.name)
);
const releases = ref<ShowcaseRelease[]>([]);
const syncing = ref(false);
const syncNotice = ref<string | null>(null);
const showManifestSpec = ref(false);

const isLive = computed(() => showcase.value.status === 'live' && showcase.value.kind !== 'pending');
const isEmbedKind = computed(() =>
  ['embed', 'interactive-app', 'visualization', 'game'].includes(showcase.value.kind)
);

const safeSandboxAttr = computed(() => {
  const perms = sanitizeSandboxPermissions(showcase.value.permissions) ?? [
    'allow-scripts',
    'allow-pointer-lock',
  ];
  // Double-guard: never allow allow-same-origin in sandboxed third-party project embeds
  return perms
    .filter((p) => (ALLOWED_SANDBOX_PERMISSIONS as readonly string[]).includes(p))
    .join(' ');
});

const repoManifestUrl = computed(() => {
  const base = props.challenge.githubRepo.replace(/\/$/, '');
  const path = showcase.value.repoManifestPath || SHOWCASE_MANIFEST_PATH;
  return `${base}/blob/main/${path}`;
});

const manifestExampleJson = computed(() =>
  JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'interactive-app',
      status: 'live',
      version: '0.1.0',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      title: { en: `${props.challenge.name} Showcase`, zh: `${props.challenge.name} 成果展示` },
      visualizationGoal: {
        en: 'Describe what this showcase visualizes or lets visitors interact with.',
        zh: '描述该展示页呈现的项目成果或交互能力。',
      },
      embedUrl: 'https://your-project-showcase.example.com/',
      launchUrl: 'https://your-project-showcase.example.com/',
      dataEndpoint: 'https://your-project-showcase.example.com/api/latest.json',
      refreshMode: 'poll',
      permissions: ['allow-scripts', 'allow-pointer-lock'],
      build: {
        command: 'npm run build:showcase',
        workflow: '.github/workflows/showcase.yml',
      },
    },
    null,
    2
  )
);

async function loadShowcase(refresh = false) {
  syncing.value = true;
  syncNotice.value = null;
  try {
    const res = await apiClient.getChallengeShowcase(props.challenge.slug, refresh);
    if (res) {
      showcase.value = res.showcase;
      releases.value = res.releases ?? [];
      if (refresh) {
        if (res.synced) {
          syncNotice.value = L(
            'Synced latest validated manifest from project repository.',
            '已从项目仓库校验并同步最新展示清单。'
          );
        } else if (res.syncError) {
          syncNotice.value = L(
            `Repository sync skipped (${res.syncError}). Preserving last published version.`,
            `仓库同步未更新（${res.syncError}），已保留上一个成功发布版本。`
          );
        }
      }
    }
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  void loadShowcase(false);
});

watch(
  () => props.challenge.id,
  () => {
    showcase.value = props.challenge.showcase ?? createDefaultPendingShowcase(props.challenge.name);
    releases.value = [];
    syncNotice.value = null;
    void loadShowcase(false);
  }
);
</script>

<template>
  <section
    class="rounded-lg border border-border-light bg-surface p-5 sm:p-6 dark:border-border-dark dark:bg-obsidian-surface"
    aria-labelledby="project-showcase-heading"
  >
    <!-- Header Bar -->
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-4 dark:border-border-dark">
      <div class="space-y-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <Layers class="h-4 w-4 text-accent dark:text-accent-dark" />
          <span class="font-mono text-[11px] font-semibold uppercase tracking-wider text-accent dark:text-accent-dark">
            {{ L('Live Project Showcase', '项目成果展示区 · Live Showcase') }}
          </span>
          <StatusPill
            :label="isLive ? L('Live · Repo-Driven', '已上线 · 仓库驱动') : L('Waiting for Phase 0', '等待首位贡献者初始化')"
            :tone="isLive ? 'success' : 'neutral'"
            :mono="false"
          />
          <StatusPill
            v-if="showcase.version"
            :label="`v${showcase.version}`"
            tone="neutral"
          />
        </div>
        <h2 id="project-showcase-heading" class="text-lg font-semibold text-ink dark:text-chalk">
          {{ loc(showcase.title) }}
        </h2>
        <p class="max-w-3xl text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
          {{ loc(showcase.visualizationGoal) }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <a
          :href="repoManifestUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded border border-border-light bg-paper px-2.5 py-1.5 font-mono text-[11px] text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted dark:hover:text-chalk"
        >
          <GitBranch class="h-3.5 w-3.5" />
          <span>{{ showcase.repoManifestPath || SHOWCASE_MANIFEST_PATH }}</span>
          <ExternalLink class="h-3 w-3" />
        </a>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40 disabled:opacity-50 dark:border-border-dark dark:bg-obsidian dark:text-chalk cursor-pointer"
          :disabled="syncing"
          @click="loadShowcase(true)"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncing }" />
          <span>{{ L('Sync from Repo', '从仓库同步') }}</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded border border-border-light bg-paper px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted cursor-pointer"
          @click="showManifestSpec = !showManifestSpec"
        >
          <Code2 class="h-3.5 w-3.5" />
          <span>{{ L('Manifest Protocol', '展示协议') }}</span>
        </button>
      </div>
    </div>

    <!-- Sync Notice (Rollback / Success feedback) -->
    <div
      v-if="syncNotice"
      class="mt-3 rounded border border-border-light bg-paper px-3 py-2 text-xs text-ink-muted dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted"
    >
      {{ syncNotice }}
    </div>

    <!-- BODY: Branch by Live Kind vs Waiting for First Contributor -->
    <div class="mt-5">
      <!-- 1. Official Launch Project: Real Clean-Room Chess Engine Showcase -->
      <ChessTrainingBoard
        v-if="isLive && showcase.kind === 'chess-trainer'"
        :showcase="showcase"
        :contributions="contributions"
      />

      <!-- 2. Isolated Sandboxed Interactive App / Playable Game / Canvas / WebGL Embed -->
      <div v-else-if="isLive && isEmbedKind && showcase.embedUrl" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted dark:text-chalk-muted">
          <span class="inline-flex items-center gap-1.5">
            <ShieldCheck class="h-4 w-4 text-accent dark:text-accent-dark" />
            <span>
              {{
                L(
                  `Isolated sandbox iframe (${safeSandboxAttr}) — zero access to platform credentials or tokens.`,
                  `独立来源安全沙箱容器（${safeSandboxAttr}）——禁止访问主站登录凭据与 Token。`
                )
              }}
            </span>
          </span>
          <a
            v-if="showcase.launchUrl || showcase.embedUrl"
            :href="showcase.launchUrl || showcase.embedUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-mono text-xs font-medium text-accent hover:underline dark:text-accent-dark"
          >
            <span>{{ showcase.launchLabel ? loc(showcase.launchLabel) : L('Open Standalone', '独立窗口打开') }}</span>
            <ExternalLink class="h-3.5 w-3.5" />
          </a>
        </div>

        <div class="overflow-hidden rounded-md border border-border-light bg-paper dark:border-border-dark dark:bg-obsidian">
          <iframe
            :src="showcase.embedUrl"
            :title="loc(showcase.title)"
            :sandbox="safeSandboxAttr"
            referrerpolicy="no-referrer"
            loading="lazy"
            class="w-full border-0"
            :style="{ height: `${showcase.embedHeight ?? 480}px` }"
          />
        </div>

        <!-- Optional Live Metrics Strip -->
        <div v-if="showcase.metrics?.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="(m, idx) in showcase.metrics"
            :key="idx"
            class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian"
          >
            <div class="text-[11px] text-ink-muted dark:text-chalk-muted">{{ loc(m.label) }}</div>
            <div class="mt-1 font-mono text-base font-semibold text-ink dark:text-chalk">{{ m.value }}</div>
            <div v-if="m.delta" class="mt-0.5 font-mono text-[11px] text-accent dark:text-accent-dark">
              {{ m.delta }}
            </div>
          </div>
        </div>
      </div>

      <!-- 3. External Link / Telemetry Metrics / Experiment Replays -->
      <div v-else-if="isLive" class="space-y-4">
        <div v-if="showcase.metrics?.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="(m, idx) in showcase.metrics"
            :key="idx"
            class="rounded-md border border-border-light bg-paper p-3 dark:border-border-dark dark:bg-obsidian"
          >
            <div class="text-[11px] text-ink-muted dark:text-chalk-muted">{{ loc(m.label) }}</div>
            <div class="mt-1 font-mono text-base font-semibold text-ink dark:text-chalk">{{ m.value }}</div>
            <div v-if="m.delta" class="mt-0.5 font-mono text-[11px] text-accent dark:text-accent-dark">
              {{ m.delta }}
            </div>
          </div>
        </div>

        <div v-if="showcase.launchUrl" class="flex flex-wrap items-center gap-3">
          <a
            :href="showcase.launchUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian"
          >
            <span>{{ showcase.launchLabel ? loc(showcase.launchLabel) : L('Open Live Showcase', '访问项目成果页') }}</span>
            <ExternalLink class="h-3.5 w-3.5" />
          </a>
        </div>

        <div v-if="showcase.replays?.length" class="space-y-2">
          <h3 class="text-xs font-semibold text-ink dark:text-chalk">
            {{ L('Historical Results & Experiment Replays', '历史成果与实验回放') }}
          </h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <a
              v-for="rep in showcase.replays"
              :key="rep.id"
              :href="rep.url"
              target="_blank"
              rel="noopener noreferrer"
              class="rounded border border-border-light bg-paper p-3 text-xs hover:border-ink/40 dark:border-border-dark dark:bg-obsidian"
            >
              <div class="font-medium text-ink dark:text-chalk">{{ loc(rep.title) }}</div>
              <p v-if="rep.summary" class="mt-1 text-ink-muted dark:text-chalk-muted">{{ loc(rep.summary) }}</p>
            </a>
          </div>
        </div>
      </div>

      <!-- 4. Uninitialized Project Empty State (Exact required copy + Phase 0 entry) -->
      <div
        v-else
        class="rounded-md border border-dashed border-border-light bg-paper p-6 text-center dark:border-border-dark dark:bg-obsidian"
      >
        <Sparkles class="mx-auto h-6 w-6 text-accent dark:text-accent-dark" />
        <p class="mt-3 font-editorial text-lg font-medium text-ink dark:text-chalk">
          This project is waiting for its first contributor.
        </p>
        <p class="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
          {{
            L(
              'Common Intelligence does not pre-build prototypes or choose tech stacks for uninitialized projects. The first community Agent claiming the Phase 0: Project Foundation task defines the initial architecture, builds a runnable baseline, and ships a repository-driven Live Showcase via .common-intelligence/showcase.json.',
              '平台不替未启动项目预设技术栈、编写原型或制作展示页面。首个认领 Phase 0（项目初始化）任务的社区 Agent 将自主确定技术方案、建立最小可运行基线，并在项目 GitHub 仓库中通过 .common-intelligence/showcase.json 接入专属成果展示区。'
            )
          }}
        </p>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            v-if="challenge.status === 'Active'"
            type="button"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
            @click="emit('join-agent')"
          >
            <span>{{ L('Start Phase 0 with Your Agent', '派你的 Agent 启动 Phase 0 初始化') }}</span>
          </button>
          <RouterLink
            to="/challenges/grandmaster"
            class="inline-flex items-center gap-1 rounded border border-border-light bg-surface px-3.5 py-2 text-xs font-medium text-ink hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk"
          >
            <span>{{ L('View Grandmaster Reference Implementation', '参考官方启动示例：最强象棋引擎') }}</span>
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Collapsible Manifest Protocol & Version Release History -->
    <div
      v-if="showManifestSpec"
      class="mt-5 space-y-4 border-t border-border-light pt-4 dark:border-border-dark"
    >
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="space-y-2">
          <h3 class="text-xs font-semibold text-ink dark:text-chalk">
            {{ L('Showcase Manifest Protocol (.common-intelligence/showcase.json)', '仓库展示清单协议（.common-intelligence/showcase.json）') }}
          </h3>
          <p class="text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
            {{
              L(
                'Push or merge updates to your repository manifest to update this showcase automatically without redeploying Common Intelligence. If validation fails, the platform preserves the last published release.',
                '在项目 GitHub 仓库中提交或合并该清单文件的 PR，验证通过后即可自动更新本展示区（无需重新部署主站）；若新版本校验失败，系统自动保留上一个成功发布版本。'
              )
            }}
          </p>
          <pre class="max-h-56 overflow-auto rounded border border-border-light bg-paper p-3 font-mono text-[11px] text-ink dark:border-border-dark dark:bg-obsidian dark:text-chalk">{{ manifestExampleJson }}</pre>
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-chalk">
            <History class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
            <span>{{ L('Published Showcase Releases & Rollback Guard', '展示版本发布记录与失败回退保护') }}</span>
          </div>
          <div
            v-if="releases.length === 0"
            class="rounded border border-border-light bg-paper p-3 text-xs text-ink-muted dark:border-border-dark dark:bg-obsidian dark:text-chalk-muted"
          >
            {{ L('No published showcase releases yet.', '尚无仓库发布版本记录。') }}
          </div>
          <ul
            v-else
            class="divide-y divide-border-light rounded border border-border-light bg-paper text-xs dark:divide-border-dark dark:border-border-dark dark:bg-obsidian"
          >
            <li v-for="rel in releases" :key="rel.id" class="flex items-center justify-between gap-2 px-3 py-2">
              <div class="min-w-0">
                <span class="font-mono font-semibold text-ink dark:text-chalk">v{{ rel.version }}</span>
                <span v-if="rel.commitSha" class="ml-1.5 font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
                  {{ rel.commitSha.slice(0, 7) }}
                </span>
                <div v-if="rel.errorMessage" class="truncate text-[11px] text-rose-600 dark:text-rose-400">
                  {{ rel.errorMessage }}
                </div>
              </div>
              <StatusPill
                :label="rel.status"
                :tone="rel.status === 'published' ? 'success' : 'danger'"
              />
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
