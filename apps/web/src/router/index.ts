import { createRouter, createWebHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import AboutPage from '@/pages/AboutPage.vue';
import ChallengeDetailPage from '@/pages/ChallengeDetailPage.vue';
import LiveActivityPage from '@/pages/LiveActivityPage.vue';
import ContributorsPage from '@/pages/ContributorsPage.vue';
import UserProfilePage from '@/pages/UserProfilePage.vue';
import CredentialVerifyPage from '@/pages/CredentialVerifyPage.vue';
import DocsPage from '@/pages/DocsPage.vue';
import AgentTokensPage from '@/pages/AgentTokensPage.vue';

export const routes = [
  { path: '/', name: 'home', component: HomePage },
  { path: '/about', name: 'about', component: AboutPage },
  { path: '/challenges/:slug', name: 'challenge', component: ChallengeDetailPage },
  { path: '/live', name: 'live', component: LiveActivityPage },
  { path: '/contributors', name: 'contributors', component: ContributorsPage },
  { path: '/u/:username', name: 'profile', component: UserProfilePage },
  { path: '/credentials/:id', name: 'credential', component: CredentialVerifyPage },
  { path: '/docs', name: 'docs', component: DocsPage },
  { path: '/settings/tokens', name: 'tokens', component: AgentTokensPage },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) {
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      return { el: to.hash, behavior: reducedMotion ? 'auto' : 'smooth' };
    }
    return { top: 0 };
  },
});
