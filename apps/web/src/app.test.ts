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

  it('renders HomePage with verified 5,905 record, slogan, join command, and DEMO indicator', async () => {
    const router = createTestRouter('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('One problem. Thousands of minds.');
    expect(text).toContain('Project 5904');
    expect(text).toContain('5,905');
    expect(text).toContain('5,884');
    expect(text).toContain('Andrei Teodorescu');
    expect(text).toContain('/challenges/project-5904/join.txt');
    expect(text).toContain('DEMO');
    // Verify candidate challenges catalog includes TinyMind & Matrix Frontier
    expect(text).toContain('TinyMind');
    expect(text).toContain('Matrix Frontier');
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

    expect(wrapper.text()).toContain('当前开放主挑战');
    expect(wrapper.text()).toContain('候选挑战规划');
  });

  it('renders public credential verification page with safe SVG image and ledger metadata', async () => {
    const router = createTestRouter('/credentials/ci-cred-5904-0001');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('ci-cred-5904-0001');
    expect(wrapper.text()).toContain('@elena-rostova-demo');
    expect(wrapper.text()).toContain('superperm-verifier-v1.0.0');
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

    // Sign in with Demo GitHub session
    const signInBtn = wrapper.findAll('button').find((b) => b.text().includes('Sign in with GitHub'));
    expect(signInBtn).toBeDefined();
    await signInBtn!.trigger('click');
    await flushPromises();

    // Create scoped token
    const input = wrapper.find('input[placeholder*="claude-code"]');
    expect(input.exists()).toBe(true);
    await input.setValue('test-local-agent');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('ci_agt_demo_');
    expect(wrapper.text()).toContain('test-local-agent');

    // Revoke token
    const revokeBtn = wrapper.findAll('button').find((b) => b.text().includes('Revoke'));
    expect(revokeBtn).toBeDefined();
    await revokeBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('REVOKED');
  });

  it('renders /challenges/project-5904, /live, /contributors, /u/:username, and /docs cleanly', async () => {
    const checks: Array<[string, string]> = [
      ['/challenges/project-5904', 'Verified Record Progression'],
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
