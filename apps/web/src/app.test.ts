import { describe, expect, it, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from './App.vue';
import { routes } from './router';
import SuperpermutationVerifier from './components/SuperpermutationVerifier.vue';
import { useAppState } from './stores/appState';

function createTestRouter(initialPath = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });
  router.push(initialPath);
  return router;
}

describe('Common Intelligence Frontend MVP', () => {
  beforeEach(() => {
    localStorage.clear();
    const { setLocale, state } = useAppState();
    setLocale('en');
    state.user = null;
  });

  it('renders streamlined HomePage with science-history hook, Grandmaster vs Stockfish 19, join prompt, login, and contributors', async () => {
    const router = createTestRouter('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Leave your name in science with your AI.');
    expect(text).toContain('Sign in with GitHub');
    expect(text).toContain('/challenges/grandmaster/join.txt');
    expect(text).toContain('Project Grandmaster');
    expect(text).toContain('Stockfish 19');
    expect(text).toContain('Project 5904');
    expect(text).toContain('@elena-rostova-demo');
    expect(text).toContain('DEMO');
  });

  it('switches language between English and Chinese', async () => {
    const router = createTestRouter('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const langBtn = wrapper.findAll('button').find((b) => b.text().includes('EN / 中'));
    expect(langBtn).toBeDefined();
    await langBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('让你的 AI，在科学史上留下你的名字。');
    expect(wrapper.text()).toContain('公共挑战');
    expect(wrapper.text()).toContain('有效贡献者');
  });

  it('renders public credential verification page with safe SVG image and ledger metadata', async () => {
    const router = createTestRouter('/credentials/ci-cred-gm-0004');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('ci-cred-gm-0004');
    expect(wrapper.text()).toContain('@lin-chen-demo');
    expect(wrapper.text()).toContain('fastchess-sprt-v1.0.0');
    const img = wrapper.find('img[alt*="Proof of Contribution Certificate"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain('data:image/svg+xml');
  });

  it('runs real client-side SuperpermutationVerifier for valid and broken candidates', async () => {
    const wrapper = mount(SuperpermutationVerifier);
    expect(wrapper.text()).toContain('VALID SUPERPERMUTATION');
    expect(wrapper.text()).toContain('24 / 24');

    const brokenBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('missing'));
    expect(brokenBtn).toBeDefined();
    await brokenBtn!.trigger('click');

    expect(wrapper.text()).toContain('INVALID CANDIDATE');
    expect(wrapper.text()).toContain('321');
  });

  it('supports demo GitHub sign-in and scoped Agent Token creation & revocation', async () => {
    const router = createTestRouter('/settings/tokens');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const signInBtn = wrapper.findAll('button').find((b) => b.text().includes('Sign in with GitHub'));
    expect(signInBtn).toBeDefined();
    await signInBtn!.trigger('click');
    await flushPromises();

    const input = wrapper.find('input[placeholder*="claude-code"]');
    expect(input.exists()).toBe(true);
    await input.setValue('test-local-agent');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('ci_agt_demo_');
    expect(wrapper.text()).toContain('test-local-agent');

    const revokeBtn = wrapper.findAll('button').find((b) => b.text().includes('Revoke'));
    expect(revokeBtn).toBeDefined();
    await revokeBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('REVOKED');
  });

  it('renders /challenges/grandmaster, /challenges/project-5904, /live, /contributors, /u/:username, and /docs cleanly', async () => {
    const checks: Array<[string, string]> = [
      ['/challenges/grandmaster', 'Stockfish 19'],
      ['/challenges/project-5904', 'Andrei Teodorescu'],
      ['/live', 'Live Activity'],
      ['/contributors', 'Founding Contributor'],
      ['/u/elena-rostova-demo', 'GitHub Profile README Badge'],
      ['/docs', 'Documentation & Governance'],
    ];
    for (const [path, expected] of checks) {
      const router = createTestRouter(path);
      await router.isReady();
      const wrapper = mount(App, { global: { plugins: [router] } });
      await flushPromises();
      expect(wrapper.text()).toContain(expected);
      wrapper.unmount();
    }
  });
});
