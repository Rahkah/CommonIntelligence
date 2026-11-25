<script setup lang="ts">
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const { state, t } = useAppState();
</script>

<template>
  <div
    v-if="state.dataMode === 'demo'"
    class="border-b border-amber-700/15 bg-amber-50/60 dark:border-amber-400/15 dark:bg-amber-950/25"
  >
    <div
      class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-1.5 text-[11.5px] sm:px-6"
    >
      <div class="flex items-center gap-2 text-amber-950/90 dark:text-amber-200/90">
        <StatusPill :label="t.demo.badge" tone="demo" />
        <span>
          {{
            state.locale === 'zh'
              ? '前端预览模式：样本贡献与模拟登录标注为 DEMO；后端接口与 D1 架构见文档。'
              : 'Frontend preview: sample contributions & simulated sign-in are marked DEMO.'
          }}
        </span>
      </div>
      <RouterLink
        to="/docs#governance"
        class="shrink-0 font-mono text-[11px] text-amber-900 underline underline-offset-2 hover:opacity-80 dark:text-amber-300"
      >
        {{ t.demo.backendDocsLink }} →
      </RouterLink>
    </div>
  </div>
</template>
