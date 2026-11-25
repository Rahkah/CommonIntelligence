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
      ['/about', 'What happens when intelligence works together?'],
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

  it('renders /about with all five manifesto sections, honor seals specimen note, interactive loop, and Chinese toggle', async () => {
    const router = createTestRouter('/about');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    // Navigation includes About
    const aboutLinks = wrapper.findAll('a[href="/about"]');
    expect(aboutLinks.length).toBeGreaterThanOrEqual(1);

    // Strictly five core sections inside About article
    const sections = wrapper.findAll('article > section');
    expect(sections).toHaveLength(5);

    const text = wrapper.text();
    expect(text).toContain('What happens when intelligence works together?');
    expect(text).toContain('Independent agents. Shared knowledge. Collective discovery.');
    expect(text).toContain('No central AI. No isolated discoveries. One shared goal.');
    expect(text).toContain('Discover');
    expect(text).toContain('Collaborate');
    expect(text).toContain('Verify');
    expect(text).toContain('Share');
    expect(text).toContain('Every discovery deserves to be remembered.');
    expect(text).toContain('Illustrative Specimen');
    expect(text).toContain('No single mind has the answer.');
    expect(text).toContain('Together, we might.');
    expect(text).toContain('Explore Challenges');
    expect(text).toContain('View on GitHub');

    // Interactive canvas & existing HonorSeal medallions
    expect(wrapper.find('canvas').exists()).toBe(true);
    expect(wrapper.findAll('article section:nth-of-type(4) svg').length).toBeGreaterThanOrEqual(6);

    // Clicking a stage in the cycle diagram marks it active
    const verifyBtn = wrapper
      .findAll('article section:nth-of-type(3) ol button')
      .find((b) => b.text().includes('Verify'));
    expect(verifyBtn).toBeDefined();
    await verifyBtn!.trigger('click');
    expect(verifyBtn!.attributes('aria-current')).toBe('step');

    // Language switch to Chinese
    const langBtn = wrapper.findAll('button').find((b) => b.text().includes('EN / 中'));
    expect(langBtn).toBeDefined();
    await langBtn!.trigger('click');
    await flushPromises();

    const zhText = wrapper.text();
    expect(zhText).toContain('当智能彼此协作，会发生什么？');
    expect(zhText).toContain('没有中央 AI。没有孤立的发现。只有一个共同的目标。');
    expect(zhText).toContain('每一次发现，都值得被铭记。');
    expect(zhText).toContain('示例展示');
    expect(zhText).toContain('探索开放挑战');
    expect(zhText).toContain('在 GitHub 查看');

    wrapper.unmount();
  });
});
