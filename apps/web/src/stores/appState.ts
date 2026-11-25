import { computed, reactive } from 'vue';
import type { ChallengeStatus, Locale, LocalizedText, UserProfileSummary } from '@common-intelligence/shared';
import { apiClient, DATA_MODE } from '@/api/client';
import {
  messages,
  pickChallengeName,
  pickChallengeStatus,
  pickLocalized,
  pickMetricDisplay,
} from '@/i18n/messages';

export type ThemeMode = 'light' | 'dark';

interface ToastItem {
  id: number;
  message: string;
}

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem('ci-locale');
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // ignore
  }
  return 'en';
}

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('ci-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

const state = reactive({
  locale: getInitialLocale() as Locale,
  theme: getInitialTheme() as ThemeMode,
  dataMode: DATA_MODE,
  user: null as UserProfileSummary | null,
  canReviewProjects: false,
  authLoaded: false,
  toasts: [] as ToastItem[],
});

function applyTheme(mode: ThemeMode) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }
  try {
    localStorage.setItem('ci-theme', mode);
  } catch {
    // ignore
  }
}

export function useAppState() {
  const t = computed(() => messages[state.locale]);

  function setLocale(next: Locale) {
    state.locale = next;
    try {
      localStorage.setItem('ci-locale', next);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    }
  }

  function toggleLocale() {
    setLocale(state.locale === 'en' ? 'zh' : 'en');
  }

  function setTheme(mode: ThemeMode) {
    state.theme = mode;
    applyTheme(mode);
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  function loc(text: LocalizedText): string {
    return pickLocalized(text, state.locale);
  }

  function challengeName(input: string | { slug?: string; name: string }): string {
    return pickChallengeName(input, state.locale);
  }

  function challengeStatus(status: ChallengeStatus): string {
    return pickChallengeStatus(status, state.locale);
  }

  function metricDisplay(value: string): string {
    return pickMetricDisplay(value, state.locale);
  }

  function notify(message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    state.toasts.push({ id, message });
    setTimeout(() => {
      const idx = state.toasts.findIndex((item) => item.id === id);
      if (idx !== -1) state.toasts.splice(idx, 1);
    }, 3200);
  }

  async function loadSession() {
    try {
      const session = await apiClient.getMe();
      state.user = session.user;
      state.canReviewProjects = session.canReviewProjects === true;
    } catch {
      state.user = null;
      state.canReviewProjects = false;
    } finally {
      state.authLoaded = true;
    }
  }

  async function signInWithGitHub() {
    if (state.dataMode === 'api') {
      window.location.href = apiClient.getGitHubLoginUrl();
      return;
    }
    const session = await apiClient.demoSignIn();
    state.user = session.user;
    notify(
      state.locale === 'zh'
        ? '已开启演示 GitHub 会话 (@elena-rostova-demo)'
        : 'Signed in with Demo GitHub session (@elena-rostova-demo)'
    );
  }

  async function signOut() {
    await apiClient.logout();
    state.user = null;
    state.canReviewProjects = false;
    notify(state.locale === 'zh' ? '已退出登录' : 'Signed out');
  }

  return {
    state,
    t,
    loc,
    challengeName,
    challengeStatus,
    metricDisplay,
    setLocale,
    toggleLocale,
    setTheme,
    toggleTheme,
    notify,
    loadSession,
    signInWithGitHub,
    signOut,
  };
}
