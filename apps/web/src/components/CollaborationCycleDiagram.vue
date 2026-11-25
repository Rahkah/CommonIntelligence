<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAppState } from '@/stores/appState';

type StageKey = 'discover' | 'collaborate' | 'verify' | 'share';

interface StageGeometry {
  key: StageKey;
  index: string;
  angleDeg: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  textAnchor: 'middle' | 'start' | 'end';
}

const { t } = useAppState();

const CX = 180;
const CY = 180;
const R = 104;

const stages: StageGeometry[] = [
  {
    key: 'discover',
    index: '01',
    angleDeg: -90,
    x: CX,
    y: CY - R,
    labelX: CX,
    labelY: CY - R - 24,
    textAnchor: 'middle',
  },
  {
    key: 'collaborate',
    index: '02',
    angleDeg: 0,
    x: CX + R,
    y: CY,
    labelX: CX + R + 18,
    labelY: CY + 4,
    textAnchor: 'start',
  },
  {
    key: 'verify',
    index: '03',
    angleDeg: 90,
    x: CX,
    y: CY + R,
    labelX: CX,
    labelY: CY + R + 34,
    textAnchor: 'middle',
  },
  {
    key: 'share',
    index: '04',
    angleDeg: 180,
    x: CX - R,
    y: CY,
    labelX: CX - R - 18,
    labelY: CY + 4,
    textAnchor: 'end',
  },
];

const activeIndex = ref(0);
const manualHold = ref(false);
const prefersReducedMotion = ref(false);
const orbitAngleDeg = ref(-90);

let cycleTimer: ReturnType<typeof setInterval> | null = null;
let rafId: number | null = null;
let lastTs = 0;
let motionQuery: MediaQueryList | null = null;

function arcPath(startDeg: number, endDeg: number): string {
  const pad = 16;
  const sRad = ((startDeg + pad) * Math.PI) / 180;
  const eRad = ((endDeg - pad) * Math.PI) / 180;
  const x1 = CX + R * Math.cos(sRad);
  const y1 = CY + R * Math.sin(sRad);
  const x2 = CX + R * Math.cos(eRad);
  const y2 = CY + R * Math.sin(eRad);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const arcs = [
  { key: 'discover', d: arcPath(-90, 0) },
  { key: 'collaborate', d: arcPath(0, 90) },
  { key: 'verify', d: arcPath(90, 180) },
  { key: 'share', d: arcPath(180, 270) },
];

const orbitDot = computed(() => {
  const rad = (orbitAngleDeg.value * Math.PI) / 180;
  return {
    x: CX + R * Math.cos(rad),
    y: CY + R * Math.sin(rad),
  };
});

const activeStage = computed(() => stages[activeIndex.value] ?? stages[0]!);

function selectStage(idx: number) {
  activeIndex.value = idx;
  manualHold.value = true;
  orbitAngleDeg.value = stages[idx]!.angleDeg;
}

function handleHover(idx: number) {
  activeIndex.value = idx;
  manualHold.value = true;
}

function handleLeave() {
  manualHold.value = false;
}

function startMotion() {
  if (prefersReducedMotion.value || typeof window === 'undefined') return;

  if (cycleTimer === null) {
    cycleTimer = setInterval(() => {
      if (!manualHold.value && !prefersReducedMotion.value) {
        activeIndex.value = (activeIndex.value + 1) % stages.length;
      }
    }, 4400);
  }

  if (rafId === null) {
    lastTs = 0;
    const step = (ts: number) => {
      if (prefersReducedMotion.value) {
        rafId = null;
        return;
      }
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      if (!manualHold.value) {
        orbitAngleDeg.value = (orbitAngleDeg.value + dt * 20.5) % 360;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }
}

function stopMotion() {
  if (cycleTimer !== null) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function onMotionChange(e: MediaQueryListEvent) {
  prefersReducedMotion.value = e.matches;
  if (e.matches) {
    stopMotion();
    orbitAngleDeg.value = activeStage.value.angleDeg;
  } else {
    startMotion();
  }
}

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = motionQuery.matches;
    motionQuery.addEventListener?.('change', onMotionChange);
  }
  startMotion();
});

onBeforeUnmount(() => {
  stopMotion();
  motionQuery?.removeEventListener?.('change', onMotionChange);
});
</script>

<template>
  <div
    class="grid items-center gap-12 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-16"
    @mouseleave="handleLeave"
  >
    <!-- Minimalist Orbital Cycle SVG -->
    <div class="mx-auto w-full max-w-[360px]">
      <svg
        viewBox="-56 -16 472 392"
        class="block h-auto w-full overflow-visible select-none"
        role="img"
        :aria-label="t.about.howItWorks.diagramAriaLabel"
      >
        <defs>
          <marker
            id="cycle-arrow-muted"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 1 1.5 L 6.5 4 L 1 6.5" fill="none" stroke-width="1.2" class="stroke-ink-faint dark:stroke-chalk-faint" />
          </marker>
          <marker
            id="cycle-arrow-active"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5.5"
            markerHeight="5.5"
            orient="auto"
          >
            <path d="M 1 1.5 L 6.5 4 L 1 6.5" fill="none" stroke-width="1.35" class="stroke-accent dark:stroke-accent-dark" />
          </marker>
        </defs>

        <!-- Faint inner archival compass rings -->
        <circle
          :cx="CX"
          :cy="CY"
          :r="R"
          fill="none"
          stroke-width="0.75"
          stroke-dasharray="2 5"
          class="stroke-border-light dark:stroke-border-dark"
        />
        <circle
          :cx="CX"
          :cy="CY"
          :r="R - 36"
          fill="none"
          stroke-width="0.6"
          class="stroke-border-light/70 dark:stroke-border-dark/70"
        />

        <!-- Quiet center typography (represents the shared open loop — never an orchestrator) -->
        <text
          :x="CX"
          :y="CY - 6"
          text-anchor="middle"
          class="fill-ink-faint font-mono text-[9.5px] uppercase tracking-[0.2em] dark:fill-chalk-faint"
        >
          {{ activeStage.index }} / 04
        </text>
        <text
          :x="CX"
          :y="CY + 16"
          text-anchor="middle"
          class="fill-ink font-editorial text-[19px] font-medium dark:fill-chalk"
        >
          {{ t.about.howItWorks.stages[activeStage.key].title }}
        </text>

        <!-- Four directional cycle arcs -->
        <path
          v-for="(arc, idx) in arcs"
          :key="arc.key"
          :d="arc.d"
          fill="none"
          :stroke-width="idx === activeIndex ? 1.5 : 1"
          :marker-end="idx === activeIndex ? 'url(#cycle-arrow-active)' : 'url(#cycle-arrow-muted)'"
          class="transition-colors duration-500"
          :class="
            idx === activeIndex
              ? 'stroke-accent dark:stroke-accent-dark'
              : 'stroke-ink-faint/45 dark:stroke-chalk-faint/45'
          "
        />

        <!-- Smooth orbiting pulse marker (hidden when reduced-motion is preferred) -->
        <g v-if="!prefersReducedMotion">
          <circle
            :cx="orbitDot.x"
            :cy="orbitDot.y"
            r="6"
            class="fill-accent/15 dark:fill-accent-dark/15"
          />
          <circle
            :cx="orbitDot.x"
            :cy="orbitDot.y"
            r="2.4"
            class="fill-accent dark:fill-accent-dark"
          />
        </g>

        <!-- Four interactive stage nodes -->
        <g
          v-for="(stage, idx) in stages"
          :key="stage.key"
          class="cursor-pointer outline-none"
          tabindex="0"
          role="button"
          :aria-pressed="idx === activeIndex"
          :aria-label="t.about.howItWorks.stages[stage.key].title"
          @click="selectStage(idx)"
          @mouseenter="handleHover(idx)"
          @keydown.enter.prevent="selectStage(idx)"
          @keydown.space.prevent="selectStage(idx)"
        >
          <!-- Generous transparent hit target -->
          <circle :cx="stage.x" :cy="stage.y" r="22" fill="transparent" />

          <!-- Outer active ring -->
          <circle
            :cx="stage.x"
            :cy="stage.y"
            :r="idx === activeIndex ? 13 : 9.5"
            stroke-width="1"
            class="transition-all duration-300"
            :class="
              idx === activeIndex
                ? 'fill-paper stroke-accent dark:fill-obsidian dark:stroke-accent-dark'
                : 'fill-paper stroke-border-light hover:stroke-ink/40 dark:fill-obsidian dark:stroke-border-dark dark:hover:stroke-chalk/40'
            "
          />

          <!-- Inner node point -->
          <circle
            :cx="stage.x"
            :cy="stage.y"
            :r="idx === activeIndex ? 4 : 2.6"
            class="transition-all duration-300"
            :class="
              idx === activeIndex
                ? 'fill-accent dark:fill-accent-dark'
                : 'fill-ink/60 dark:fill-chalk/60'
            "
          />

          <!-- Stage label -->
          <text
            :x="stage.labelX"
            :y="stage.labelY"
            :text-anchor="stage.textAnchor"
            class="font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-300"
            :class="
              idx === activeIndex
                ? 'fill-accent font-semibold dark:fill-accent-dark'
                : 'fill-ink-muted dark:fill-chalk-muted'
            "
          >
            {{ t.about.howItWorks.stages[stage.key].title }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Editorial 4-Step Breakdown (hairline list, no stacked boxes) -->
    <ol class="divide-y divide-border-light border-y border-border-light dark:divide-border-dark dark:border-border-dark">
      <li
        v-for="(stage, idx) in stages"
        :key="stage.key"
        class="group transition-colors"
      >
        <button
          type="button"
          class="flex w-full items-start gap-5 py-5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent dark:focus-visible:ring-accent-dark"
          :aria-current="idx === activeIndex ? 'step' : undefined"
          @click="selectStage(idx)"
          @mouseenter="handleHover(idx)"
        >
          <span
            class="mt-1 shrink-0 font-mono text-xs tabular-nums transition-colors"
            :class="
              idx === activeIndex
                ? 'font-semibold text-accent dark:text-accent-dark'
                : 'text-ink-faint dark:text-chalk-faint'
            "
          >
            {{ stage.index }}
          </span>
          <div class="min-w-0 space-y-1.5">
            <h3
              class="font-editorial text-xl font-medium tracking-tight transition-colors sm:text-2xl"
              :class="
                idx === activeIndex
                  ? 'text-ink dark:text-chalk'
                  : 'text-ink/75 group-hover:text-ink dark:text-chalk/75 dark:group-hover:text-chalk'
              "
            >
              {{ t.about.howItWorks.stages[stage.key].title }}
            </h3>
            <p
              class="text-sm leading-relaxed transition-colors sm:text-[15px]"
              :class="
                idx === activeIndex
                  ? 'text-ink-muted dark:text-chalk-muted'
                  : 'text-ink-faint dark:text-chalk-faint'
              "
            >
              {{ t.about.howItWorks.stages[stage.key].body }}
            </p>
          </div>
        </button>
      </li>
    </ol>
  </div>
</template>
