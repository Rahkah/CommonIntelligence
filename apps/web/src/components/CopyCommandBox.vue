<script setup lang="ts">
import { ref } from 'vue';
import { Check, Copy } from 'lucide-vue-next';
import { useAppState } from '@/stores/appState';

const props = withDefaults(
  defineProps<{
    text: string;
    label?: string;
    multiline?: boolean;
  }>(),
  {
    multiline: false,
  }
);

const { t, notify } = useAppState();
const copied = ref(false);

async function copyText() {
  try {
    await navigator.clipboard.writeText(props.text);
  } catch {
    const el = document.createElement('textarea');
    el.value = props.text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
  copied.value = true;
  notify(t.value.common.copied);
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div
    class="rounded-md border border-border-light bg-subtle/70 dark:border-border-dark dark:bg-obsidian-subtle/80"
  >
    <div
      v-if="label"
      class="flex items-center justify-between border-b border-border-light px-3 py-1.5 dark:border-border-dark"
    >
      <span class="font-mono text-[11px] uppercase tracking-wider text-ink-muted dark:text-chalk-muted">
        {{ label }}
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-ink-muted transition hover:bg-surface hover:text-ink dark:text-chalk-muted dark:hover:bg-obsidian-surface dark:hover:text-chalk cursor-pointer"
        @click="copyText"
      >
        <Check v-if="copied" class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
        <Copy v-else class="h-3.5 w-3.5" />
        <span>{{ copied ? t.common.copied : t.common.copy }}</span>
      </button>
    </div>

    <div class="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <pre
        class="min-w-0 flex-1 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-ink dark:text-chalk"
        :class="multiline ? 'whitespace-pre-wrap break-words' : 'whitespace-pre-wrap break-all'"
      >{{ text }}</pre>
      <button
        v-if="!label"
        type="button"
        class="shrink-0 inline-flex items-center gap-1.5 rounded border border-border-light bg-surface px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/40 dark:border-border-dark dark:bg-obsidian-surface dark:text-chalk dark:hover:border-chalk/40 cursor-pointer"
        @click="copyText"
      >
        <Check v-if="copied" class="h-3.5 w-3.5 text-accent dark:text-accent-dark" />
        <Copy v-else class="h-3.5 w-3.5" />
        <span>{{ copied ? t.common.copied : t.common.copy }}</span>
      </button>
    </div>
  </div>
</template>
