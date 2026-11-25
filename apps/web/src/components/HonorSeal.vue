<script setup lang="ts">
import type { BadgeCode } from '@common-intelligence/shared';

defineProps<{
  code: BadgeCode;
  serialNumber?: number;
  size?: number;
}>();
</script>

<template>
  <div
    class="relative inline-flex items-center justify-center rounded-md border border-border-light bg-paper p-2 dark:border-border-dark dark:bg-obsidian"
    :style="{ width: `${(size ?? 44) + 16}px`, height: `${(size ?? 44) + 16}px` }"
  >
    <!-- Archival geometric medallion — academic seal aesthetic, never gamified coins -->
    <svg
      :width="size ?? 44"
      :height="size ?? 44"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <!-- Outer archival ring -->
      <circle
        cx="24"
        cy="24"
        r="21"
        stroke-width="1.25"
        class="stroke-ink/80 dark:stroke-chalk/80"
      />
      <circle
        cx="24"
        cy="24"
        r="17.5"
        stroke-width="0.75"
        stroke-dasharray="2 2"
        class="stroke-accent dark:stroke-accent-dark"
      />

      <!-- Founding Contributor: Equilateral triad lattice -->
      <g v-if="code === 'founding_contributor'">
        <polygon
          points="24,11 35,31 13,31"
          stroke-width="1.4"
          class="stroke-ink dark:stroke-chalk"
        />
        <circle cx="24" cy="24" r="3" class="fill-accent dark:fill-accent-dark" />
      </g>

      <!-- First Discovery: Diamond compass prism -->
      <g v-else-if="code === 'first_discovery'">
        <polygon
          points="24,10 34,24 24,38 14,24"
          stroke-width="1.4"
          class="stroke-ink dark:stroke-chalk"
        />
        <line x1="24" y1="10" x2="24" y2="38" stroke-width="0.9" class="stroke-accent dark:stroke-accent-dark" />
        <line x1="14" y1="24" x2="34" y2="24" stroke-width="0.9" class="stroke-accent dark:stroke-accent-dark" />
      </g>

      <!-- Pathfinder: Directed acyclic branch -->
      <g v-else-if="code === 'pathfinder'">
        <circle cx="15" cy="31" r="2.4" class="fill-ink dark:fill-chalk" />
        <circle cx="24" cy="21" r="2.4" class="fill-accent dark:fill-accent-dark" />
        <circle cx="33" cy="14" r="2.4" class="fill-ink dark:fill-chalk" />
        <circle cx="33" cy="31" r="2.4" class="fill-ink/60 dark:fill-chalk/60" />
        <path
          d="M16.8 29.2 L22.2 22.8 M25.8 19.6 L31.2 15.4 M25.8 22.8 L31.2 29.2"
          stroke-width="1.4"
          class="stroke-ink dark:stroke-chalk"
        />
      </g>

      <!-- Verifier: Precision twin-axis check -->
      <g v-else-if="code === 'verifier'">
        <rect
          x="14"
          y="14"
          width="20"
          height="20"
          rx="2"
          stroke-width="1.3"
          class="stroke-ink dark:stroke-chalk"
        />
        <path
          d="M18.5 24.5 L22.2 28.2 L30 19.8"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="stroke-accent dark:stroke-accent-dark"
        />
      </g>

      <!-- Breakthrough Contributor: Concentric hexagonal star -->
      <g v-else-if="code === 'breakthrough_contributor'">
        <polygon
          points="24,10 36,17 36,31 24,38 12,31 12,17"
          stroke-width="1.3"
          class="stroke-ink dark:stroke-chalk"
        />
        <polygon
          points="24,15 31,24 24,33 17,24"
          stroke-width="1.2"
          class="stroke-accent dark:stroke-accent-dark"
        />
      </g>

      <!-- Record Breaker: Precision summit apex -->
      <g v-else>
        <path
          d="M13 33 L24 12 L35 33 Z"
          stroke-width="1.4"
          class="stroke-ink dark:stroke-chalk"
        />
        <line x1="17" y1="26" x2="31" y2="26" stroke-width="1.2" class="stroke-accent dark:stroke-accent-dark" />
        <circle cx="24" cy="12" r="2.2" class="fill-accent dark:fill-accent-dark" />
      </g>
    </svg>

    <span
      v-if="serialNumber !== undefined"
      class="absolute -bottom-1.5 -right-1.5 rounded bg-ink px-1 py-0.5 font-mono text-[9px] font-semibold leading-none text-paper dark:bg-chalk dark:text-obsidian"
    >
      #{{ String(serialNumber).padStart(3, '0') }}
    </span>
  </div>
</template>
