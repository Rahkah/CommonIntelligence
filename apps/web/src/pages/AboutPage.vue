<script setup lang="ts">
import { ArrowRight, ArrowUpRight, Github } from 'lucide-vue-next';
import CollaborationCycleDiagram from '@/components/CollaborationCycleDiagram.vue';
import CollectiveNetworkCanvas from '@/components/CollectiveNetworkCanvas.vue';
import HonorSeal from '@/components/HonorSeal.vue';
import StatusPill from '@/components/StatusPill.vue';
import { BADGE_DEFINITIONS } from '@/data/demoData';
import { useAppState } from '@/stores/appState';

const { t, loc } = useAppState();
</script>

<template>
  <article class="mx-auto max-w-5xl px-4 sm:px-6">
    <!-- 01. Hero -->
    <section aria-labelledby="about-hero-heading" class="pt-14 pb-20 sm:pt-24 sm:pb-28">
      <div class="max-w-4xl">
        <p class="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-accent dark:text-accent-dark">
          {{ t.about.hero.index }}
        </p>

        <h1
          id="about-hero-heading"
          class="mt-5 font-editorial text-4xl font-normal leading-[1.06] tracking-[-0.025em] text-ink sm:text-6xl lg:text-[4.25rem] dark:text-chalk"
        >
          {{ t.about.hero.headline }}
        </h1>

        <p
          class="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted sm:text-xl dark:text-chalk-muted"
        >
          {{ t.about.hero.subtitle }}
        </p>
      </div>

      <div class="mt-12 sm:mt-16">
        <CollectiveNetworkCanvas />
      </div>
    </section>

    <!-- 02. The Experiment -->
    <section
      aria-labelledby="about-experiment-heading"
      class="border-t border-border-light py-20 sm:py-28 dark:border-border-dark"
    >
      <div class="grid gap-8 lg:grid-cols-[190px_1fr] lg:gap-14">
        <header class="space-y-1.5">
          <div class="font-mono text-xs text-accent dark:text-accent-dark">
            {{ t.about.experiment.index }}
          </div>
          <h2
            id="about-experiment-heading"
            class="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint dark:text-chalk-faint"
          >
            {{ t.about.experiment.label }}
          </h2>
        </header>

        <div class="max-w-2xl space-y-7">
          <p
            class="font-editorial text-2xl font-normal leading-[1.3] tracking-tight text-ink sm:text-3xl dark:text-chalk"
          >
            {{ t.about.experiment.opening }}
          </p>

          <p class="text-base leading-[1.85] text-ink-muted sm:text-lg dark:text-chalk-muted">
            {{ t.about.experiment.bodyOne }}
          </p>

          <p
            class="pt-2 font-editorial text-2xl italic leading-[1.35] text-ink sm:text-3xl dark:text-chalk"
          >
            {{ t.about.experiment.question }}
          </p>

          <p class="text-base leading-[1.85] text-ink-muted sm:text-lg dark:text-chalk-muted">
            {{ t.about.experiment.bodyTwo }}
          </p>

          <blockquote
            class="mt-10 border-l-2 border-accent pl-5 sm:pl-6 dark:border-accent-dark"
          >
            <p
              class="font-editorial text-2xl font-medium leading-[1.3] tracking-tight text-ink sm:text-[1.85rem] dark:text-chalk"
            >
              {{ t.about.experiment.thesis }}
            </p>
          </blockquote>
        </div>
      </div>
    </section>

    <!-- 03. How It Works -->
    <section
      aria-labelledby="about-how-heading"
      class="border-t border-border-light py-20 sm:py-28 dark:border-border-dark"
    >
      <div class="grid gap-8 lg:grid-cols-[190px_1fr] lg:gap-14">
        <header class="space-y-1.5">
          <div class="font-mono text-xs text-accent dark:text-accent-dark">
            {{ t.about.howItWorks.index }}
          </div>
          <h2
            id="about-how-heading"
            class="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint dark:text-chalk-faint"
          >
            {{ t.about.howItWorks.label }}
          </h2>
        </header>

        <div class="space-y-12">
          <p
            class="max-w-2xl font-editorial text-2xl leading-[1.35] tracking-tight text-ink sm:text-3xl dark:text-chalk"
          >
            {{ t.about.howItWorks.lead }}
          </p>

          <CollaborationCycleDiagram />
        </div>
      </div>
    </section>

    <!-- 04. Every Contribution Matters -->
    <section
      aria-labelledby="about-honors-heading"
      class="border-t border-border-light py-20 sm:py-28 dark:border-border-dark"
    >
      <div class="grid gap-8 lg:grid-cols-[190px_1fr] lg:gap-14">
        <header class="space-y-1.5">
          <div class="font-mono text-xs text-accent dark:text-accent-dark">
            {{ t.about.honors.index }}
          </div>
          <h2
            id="about-honors-heading"
            class="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint dark:text-chalk-faint"
          >
            {{ t.about.honors.label }}
          </h2>
        </header>

        <div class="space-y-12">
          <div class="max-w-2xl space-y-5">
            <h3
              class="font-editorial text-3xl font-normal leading-[1.15] tracking-tight text-ink sm:text-4xl dark:text-chalk"
            >
              {{ t.about.honors.headline }}
            </h3>
            <p class="text-base leading-[1.85] text-ink-muted sm:text-lg dark:text-chalk-muted">
              {{ t.about.honors.body }}
            </p>
          </div>

          <!-- Archival Specimen Plate (reusing HonorSeal, explicitly marked illustrative) -->
          <div class="space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-3 dark:border-border-dark">
              <div class="flex flex-wrap items-center gap-2.5">
                <StatusPill :label="t.about.honors.specimenBadge" tone="demo" />
                <span class="text-xs text-ink-faint dark:text-chalk-faint">
                  {{ t.about.honors.specimenNote }}
                </span>
              </div>
              <RouterLink
                to="/contributors"
                class="shrink-0 font-mono text-[11.5px] text-accent transition hover:underline dark:text-accent-dark"
              >
                {{ t.about.honors.inspectHonorsLink }} →
              </RouterLink>
            </div>

            <div class="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="badge in BADGE_DEFINITIONS"
                :key="badge.code"
                class="flex flex-col items-start gap-4"
              >
                <div class="flex items-end gap-3">
                  <HonorSeal
                    :code="badge.code"
                    :serial-number="badge.code === 'founding_contributor' ? 1 : undefined"
                    :size="52"
                  />
                  <span
                    v-if="badge.code === 'founding_contributor'"
                    class="pb-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint dark:text-chalk-faint"
                  >
                    {{ t.about.honors.sampleSerialTag }}
                  </span>
                </div>

                <div class="space-y-1">
                  <h4 class="font-editorial text-lg font-medium text-ink dark:text-chalk">
                    {{ loc(badge.name) }}
                  </h4>
                  <p class="text-[13px] leading-relaxed text-ink-muted dark:text-chalk-muted">
                    {{ loc(badge.description) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Quiet 4-Column Provenance Ledger Row -->
          <dl
            class="grid gap-6 border-t border-border-light pt-7 sm:grid-cols-2 lg:grid-cols-4 dark:border-border-dark"
          >
            <div v-for="anchor in t.about.honors.anchors" :key="anchor.label" class="space-y-1">
              <dt
                class="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint dark:text-chalk-faint"
              >
                {{ anchor.label }}
              </dt>
              <dd class="text-sm font-medium text-ink dark:text-chalk">
                {{ anchor.value }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <!-- 05. Join the Experiment -->
    <section
      aria-labelledby="about-join-heading"
      class="border-t border-border-light py-24 sm:py-32 dark:border-border-dark"
    >
      <div class="grid gap-8 lg:grid-cols-[190px_1fr] lg:gap-14">
        <header class="space-y-1.5">
          <div class="font-mono text-xs text-accent dark:text-accent-dark">
            {{ t.about.join.index }}
          </div>
          <h2
            id="about-join-heading"
            class="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint dark:text-chalk-faint"
          >
            {{ t.about.join.label }}
          </h2>
        </header>

        <div class="max-w-3xl">
          <h3
            class="font-editorial text-4xl font-normal leading-[1.12] tracking-[-0.025em] text-ink sm:text-5xl lg:text-[3.5rem] dark:text-chalk"
          >
            <span class="block">{{ t.about.join.headlineLine1 }}</span>
            <span class="mt-1 block italic text-accent dark:text-accent-dark">
              {{ t.about.join.headlineLine2 }}
            </span>
          </h3>

          <p class="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted dark:text-chalk-muted">
            {{ t.about.join.subtitle }}
          </p>

          <div class="mt-10 flex flex-wrap items-center gap-4">
            <RouterLink
              to="/#challenges"
              class="inline-flex items-center gap-2 rounded bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:opacity-90 dark:bg-chalk dark:text-obsidian"
            >
              <span>{{ t.about.join.primaryCta }}</span>
              <ArrowRight class="h-4 w-4" />
            </RouterLink>

            <a
              href="https://github.com/common-intelligence"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded border border-border-light px-5 py-3 text-sm font-medium text-ink transition hover:border-ink/50 dark:border-border-dark dark:text-chalk dark:hover:border-chalk/50"
            >
              <Github class="h-4 w-4" />
              <span>{{ t.about.join.secondaryCta }}</span>
              <ArrowUpRight class="h-3.5 w-3.5 text-ink-faint dark:text-chalk-faint" />
            </a>
          </div>

          <p
            class="mt-12 max-w-2xl border-t border-border-light pt-6 text-[13px] leading-relaxed text-ink-faint dark:border-border-dark dark:text-chalk-faint"
          >
            {{ t.about.join.autonomyNote }}
          </p>
        </div>
      </div>
    </section>
  </article>
</template>
