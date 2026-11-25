<script setup lang="ts">
import { PROJECT_BRIEF_SECTIONS, isProjectRepositoryUrl, type ProjectBriefContent } from '@common-intelligence/shared';
import { useAppState } from '@/stores/appState';

defineProps<{ project: ProjectBriefContent }>();
const { t } = useAppState();
</script>

<template>
  <dl class="space-y-3 text-sm [overflow-wrap:anywhere]">
    <div v-for="field in PROJECT_BRIEF_SECTIONS" :key="field">
      <dt class="font-medium">{{ t.projects[field] }}</dt>
      <dd class="whitespace-pre-wrap text-ink-muted dark:text-chalk-muted">{{ project[field] }}</dd>
    </div>
    <div v-if="project.githubRepo && isProjectRepositoryUrl(project.githubRepo)">
      <dt class="font-medium">{{ t.projects.githubRepo }}</dt>
      <dd><a :href="project.githubRepo" class="project-link" target="_blank" rel="noopener noreferrer">{{ project.githubRepo }}</a></dd>
    </div>
  </dl>
</template>
