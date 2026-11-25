<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  KNOWN_SUPERPERMUTATION_BOUNDS,
  SAMPLE_SUPERPERMUTATIONS,
  verifySuperpermutation,
  type SuperpermutationVerificationResult,
} from '@common-intelligence/shared';
import { CheckCircle2, Play, XCircle } from 'lucide-vue-next';
import StatusPill from '@/components/StatusPill.vue';
import { useAppState } from '@/stores/appState';

const { t, state } = useAppState();

const n = ref<number>(4);
const candidate = ref<string>(SAMPLE_SUPERPERMUTATIONS[4]!);
const result = ref<SuperpermutationVerificationResult | null>(
  verifySuperpermutation(SAMPLE_SUPERPERMUTATIONS[4]!, 4)
);

const currentBound = computed(() => KNOWN_SUPERPERMUTATION_BOUNDS[n.value]);

function runVerification() {
  result.value = verifySuperpermutation(candidate.value, n.value);
}

function loadValidSample() {
  const sampleN = n.value <= 4 ? n.value : 4;
  n.value = sampleN;
  candidate.value = SAMPLE_SUPERPERMUTATIONS[sampleN]!;
  runVerification();
}

function loadBrokenSample() {
  n.value = 3;
  candidate.value = '12312132'; // Missing 321
  runVerification();
}
</script>

<template>
  <div
    class="rounded-md border border-border-light bg-surface p-5 dark:border-border-dark dark:bg-obsidian-surface"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-base font-semibold text-ink dark:text-chalk">
          {{ t.challenge.verifierTitle }}
        </h3>
        <p class="mt-1 text-xs leading-relaxed text-ink-muted dark:text-chalk-muted">
          {{ t.challenge.verifierSubtitle }}
        </p>
      </div>
      <StatusPill label="REAL CLIENT-SIDE VERIFIER" tone="accent" />
    </div>

    <div class="mt-4 grid gap-4 md:grid-cols-[200px_1fr]">
      <div class="space-y-3">
        <label class="block">
          <span class="block text-xs font-medium text-ink dark:text-chalk">
            {{ t.challenge.verifierN }}
          </span>
          <select
            v-model.number="n"
            class="mt-1.5 w-full rounded border border-border-light bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none dark:border-border-dark dark:bg-obsidian dark:text-chalk"
          >
            <option v-for="k in [1, 2, 3, 4, 5, 6, 7]" :key="k" :value="k">
              n = {{ k }} ({{ KNOWN_SUPERPERMUTATION_BOUNDS[k]?.factorial.toLocaleString() }} perms)
            </option>
          </select>
        </label>

        <div
          v-if="currentBound"
          class="rounded border border-border-light bg-subtle/60 p-3 text-xs dark:border-border-dark dark:bg-obsidian-subtle/60"
        >
          <div class="font-mono text-[10.5px] uppercase text-ink-faint dark:text-chalk-faint">
            {{ state.locale === 'zh' ? '参考边界' : 'Reference Bounds' }}
          </div>
          <dl class="mt-2 space-y-1 font-mono text-[11.5px]">
            <div class="flex justify-between">
              <dt class="text-ink-muted dark:text-chalk-muted">n!</dt>
              <dd class="text-ink dark:text-chalk">{{ currentBound.factorial.toLocaleString() }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted dark:text-chalk-muted">
                {{ state.locale === 'zh' ? '当前最优' : 'Best known' }}
              </dt>
              <dd class="font-semibold text-accent dark:text-accent-dark">
                {{ currentBound.bestKnownLength.toLocaleString() }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted dark:text-chalk-muted">
                {{ state.locale === 'zh' ? '理论下界' : 'Lower bound' }}
              </dt>
              <dd class="text-ink dark:text-chalk">
                {{ currentBound.provenLowerBound.toLocaleString() }}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div class="space-y-3">
        <label class="block">
          <span class="block text-xs font-medium text-ink dark:text-chalk">
            {{ t.challenge.verifierInput }}
          </span>
          <textarea
            v-model="candidate"
            rows="4"
            spellcheck="false"
            class="mt-1.5 w-full rounded border border-border-light bg-paper p-3 font-mono text-xs leading-relaxed text-ink focus:border-accent focus:outline-none dark:border-border-dark dark:bg-obsidian dark:text-chalk"
            placeholder="123412314231243121342132413214321"
          />
        </label>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition hover:opacity-90 dark:bg-chalk dark:text-obsidian cursor-pointer"
            @click="runVerification"
          >
            <Play class="h-3.5 w-3.5" />
            <span>{{ t.challenge.verifierRun }}</span>
          </button>
          <button
            type="button"
            class="rounded border border-border-light px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
            @click="loadValidSample"
          >
            {{ t.challenge.verifierLoadSample }} (n={{ n <= 4 ? n : 4 }})
          </button>
          <button
            type="button"
            class="rounded border border-border-light px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:text-chalk cursor-pointer"
            @click="loadBrokenSample"
          >
            {{ t.challenge.verifierLoadBroken }}
          </button>
        </div>
      </div>
    </div>

    <!-- Verification Output Panel -->
    <div
      v-if="result"
      class="mt-4 rounded border p-4"
      :class="
        result.valid
          ? 'border-teal-700/30 bg-teal-700/[0.04] dark:border-teal-400/30 dark:bg-teal-400/[0.06]'
          : 'border-red-700/30 bg-red-700/[0.04] dark:border-red-400/30 dark:bg-red-400/[0.06]'
      "
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <CheckCircle2
            v-if="result.valid"
            class="h-4 w-4 text-accent dark:text-accent-dark"
          />
          <XCircle v-else class="h-4 w-4 text-red-700 dark:text-red-400" />
          <span class="font-mono text-xs font-semibold uppercase tracking-wide text-ink dark:text-chalk">
            {{
              result.valid
                ? state.locale === 'zh'
                  ? '合法超级排列'
                  : 'VALID SUPERPERMUTATION'
                : state.locale === 'zh'
                  ? '验证未通过'
                  : 'INVALID CANDIDATE'
            }}
          </span>
          <StatusPill
            v-if="result.improvesBestKnown"
            :label="state.locale === 'zh' ? '突破当前纪录!' : 'BEATS BEST KNOWN'"
            tone="accent"
          />
        </div>
        <span class="font-mono text-[11px] text-ink-faint dark:text-chalk-faint">
          {{ result.verifierVersion }} · {{ result.elapsedMs }} ms
        </span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
        <div>
          <div class="text-[10px] uppercase text-ink-faint dark:text-chalk-faint">
            {{ state.locale === 'zh' ? '候选长度' : 'Length' }}
          </div>
          <div class="mt-0.5 text-sm font-semibold tabular-nums text-ink dark:text-chalk">
            {{ result.candidateLength.toLocaleString() }}
          </div>
        </div>
        <div>
          <div class="text-[10px] uppercase text-ink-faint dark:text-chalk-faint">
            {{ state.locale === 'zh' ? '已覆盖排列' : 'Permutations' }}
          </div>
          <div class="mt-0.5 text-sm font-semibold tabular-nums text-ink dark:text-chalk">
            {{ result.foundPermutations.toLocaleString() }} / {{ result.expectedPermutations.toLocaleString() }}
          </div>
        </div>
        <div>
          <div class="text-[10px] uppercase text-ink-faint dark:text-chalk-faint">
            {{ state.locale === 'zh' ? '与纪录差值' : 'Delta vs Best' }}
          </div>
          <div class="mt-0.5 text-sm font-semibold tabular-nums text-ink dark:text-chalk">
            {{
              result.deltaFromBestKnown === null
                ? '—'
                : result.deltaFromBestKnown > 0
                  ? `+${result.deltaFromBestKnown}`
                  : result.deltaFromBestKnown
            }}
          </div>
        </div>
        <div>
          <div class="text-[10px] uppercase text-ink-faint dark:text-chalk-faint">
            {{ state.locale === 'zh' ? '允许字符集' : 'Alphabet' }}
          </div>
          <div class="mt-0.5 text-sm font-semibold text-ink dark:text-chalk">
            {{ '{' + result.allowedAlphabet.split('').join(',') + '}' }}
          </div>
        </div>
      </div>

      <p v-if="result.error" class="mt-3 font-mono text-xs text-red-700 dark:text-red-300">
        {{ result.error }}
      </p>

      <div v-if="result.sampleMissingPermutations.length > 0" class="mt-3 text-xs">
        <span class="font-medium text-ink-muted dark:text-chalk-muted">
          {{ state.locale === 'zh' ? '缺失排列样例：' : 'Sample missing permutations: ' }}
        </span>
        <span class="font-mono text-red-700 dark:text-red-300">
          {{ result.sampleMissingPermutations.join(', ') }}
          <span v-if="result.missingPermutationsCount > result.sampleMissingPermutations.length">
            (+{{ result.missingPermutationsCount - result.sampleMissingPermutations.length }} more)
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
