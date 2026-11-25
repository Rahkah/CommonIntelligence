import { describe, expect, it, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from './App.vue';
import { routes } from './router';
import { useAppState } from './stores/appState';
import { apiClient } from './api/client';
import { DEMO_USERS } from './data/demoData';
import type { ProjectProposal } from '@common-intelligence/shared';

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

  it('submits a project for review and publishes it through the maintainer queue', async () => {
    const { state } = useAppState();
    const previousMode = state.dataMode;
    const proposal: ProjectProposal = {
      id: 'proposal_test', name: 'Open scheduling study', domain: 'Algorithms',
      summary: 'Compare scheduling strategies.', goal: 'Reproduce a baseline.',
      scoringMetric: 'Completed jobs', acceptanceCriteria: 'Publish reproducible results.',
      authorUsername: 'author', status: 'Pending', submittedAt: '2026-11-25T00:00:00.000Z',
      reviewedAt: null, rejectionReason: null, challengeSlug: null,
    };
    let result = proposal;
    state.dataMode = 'api';
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({
      mode: 'live', authenticated: true, user: DEMO_USERS[0]!, canReviewProjects: true,
    });
    const recordActivity = vi.spyOn(apiClient, 'recordSiteActivity').mockResolvedValue();
    const joinCode = 'ci_join_' + 'a'.repeat(64);
    const join = vi.spyOn(apiClient, 'createAgentJoinCode').mockResolvedValue({
      code: joinCode, expiresAt: '2026-11-25T00:05:00.000Z',
    });
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const submit = vi.spyOn(apiClient, 'createProjectProposal').mockResolvedValue(proposal);
    vi.spyOn(apiClient, 'listProjectProposals').mockImplementation(async (_offset, status) => {
      const items = !status || status === result.status ? [result] : [];
      return { items, total: items.length, offset: 0, limit: 50 };
    });
    const publish = vi.spyOn(apiClient, 'approveProjectProposal').mockImplementation(async () => {
      result = { ...proposal, status: 'Approved', challengeSlug: 'open-scheduling-study' };
      return result;
    });
    try {
      const router = createTestRouter('/');
      await router.isReady();
      const wrapper = mount(App, { global: { plugins: [router] } });
      try {
        await flushPromises();
        expect(recordActivity).toHaveBeenCalledWith('/');
        expect(wrapper.get('a[href="/projects/new"]').text()).toBe('New project');
        expect(wrapper.get('a[href="/admin/project-proposals"]').text()).toBe('Review projects');
        const copyJoin = wrapper.findAll('button').find((button) => button.text() === 'Copy prompt and authorize agent');
        expect(copyJoin).toBeDefined();
        await copyJoin!.trigger('click');
        await flushPromises();
        expect(join).toHaveBeenCalledWith('grandmaster');
        expect(copy).toHaveBeenCalledWith(expect.stringContaining(joinCode));
        await router.push('/projects/new');
        await flushPromises();
        const [ideaForm, importForm] = wrapper.findAll('form');
        const idea = 'Compare "earliest deadline first" with a pinned baseline.';
        await ideaForm!.get('textarea').setValue(idea);
        await ideaForm!.trigger('submit');
        expect(ideaForm!.get('pre').text()).toContain(JSON.stringify(idea));
        expect(ideaForm!.get('pre').text()).toContain('"schemaVersion": 1');
        await ideaForm!.findAll('button').at(-1)!.trigger('click');
        expect(copy).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(idea)));

        const { name, domain, summary, goal, scoringMetric, acceptanceCriteria } = proposal;
        const project = { name, domain, summary, goal, scoringMetric, acceptanceCriteria, githubRepo: null };
        await importForm!.get('textarea').setValue(JSON.stringify({ schemaVersion: 2, ...project }));
        await importForm!.trigger('submit');
        expect(importForm!.get('[role="alert"]').text()).toContain('schemaVersion 1');
        expect(submit).not.toHaveBeenCalled();
        await importForm!.get('textarea').setValue(JSON.stringify({ schemaVersion: 1, ...project, acceptanceCriteria: '' }));
        await importForm!.trigger('submit');
        expect(importForm!.get('[role="alert"]').text()).toContain('acceptanceCriteria');
        expect(submit).not.toHaveBeenCalled();
        const brief = '```json\n' + JSON.stringify({ schemaVersion: 1, ...project }) + '\n```';
        await importForm!.get('textarea').setValue(brief);
        await importForm!.trigger('submit');
        expect(wrapper.get('article').text()).toContain(acceptanceCriteria);
        expect(submit).not.toHaveBeenCalled();
        await wrapper.get('article button.project-button').trigger('click');
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/project-proposals'));
        await flushPromises();
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 1, name: proposal.name }), expect.any(String));
        expect(wrapper.text()).toContain('Pending review');

        await router.push('/admin/project-proposals');
        await flushPromises();
        await wrapper.get('article button').trigger('click');
        const review = wrapper.get('article form');
        await review.get('input[type="url"]').setValue('https://github.com/example/schedules');
        const reviewInputs = review.findAll('input:not([type])');
        await reviewInputs[1]!.setValue('verify-schedule');
        await reviewInputs[2]!.setValue('Reproduce baseline');
        await review.get('textarea').setValue('Compare results in CI.');
        await review.trigger('submit');
        await flushPromises();
        expect(publish).toHaveBeenCalledWith(proposal.id, expect.objectContaining({
          slug: 'open-scheduling-study', trustedCheckName: 'verify-schedule',
        }));
        await router.push('/settings/project-proposals');
        await flushPromises();
        expect(wrapper.get('a[href="/challenges/open-scheduling-study"]').text()).toBe('View published project');
        expect(recordActivity.mock.calls).toEqual([['/'], ['/projects/new']]);
      } finally {
        wrapper.unmount();
      }
    } finally {
      vi.restoreAllMocks();
      state.dataMode = previousMode;
      state.canReviewProjects = false;
    }
  });

  it('renders streamlined HomePage with collaborative project hook, Grandmaster vs Stockfish 19, Open Game (64KB), Open Language, join prompt, login, and contributors', async () => {
    const router = createTestRouter('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Build open projects together with your AI.');
    expect(text).toContain('Sign in with GitHub');
    expect(text).toContain('/challenges/grandmaster/join.txt');
    expect(text).toContain('Project Grandmaster');
    expect(text).toContain('Stockfish 19');
    expect(text).toContain('Open Game');
    expect(text).toContain('64 KB');
    expect(text).toContain('Open Language');
    expect(text).not.toContain('Project 5904');
    expect(text).not.toContain('TinyMind');
    expect(text).not.toContain('Infinite Tetris');
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

    expect(wrapper.text()).toContain('让你的 AI，与全球 Agent 协同完成项目。');
    expect(wrapper.text()).toContain('公共挑战');
    expect(wrapper.text()).toContain('最强象棋引擎计划');
    expect(wrapper.text()).toContain('64KB 开放游戏计划');
    expect(wrapper.text()).toContain('开放语言计划');
    expect(wrapper.text()).not.toContain('5904 计划');
    expect(wrapper.text()).toContain('进行中');
    expect(wrapper.text()).toContain('筹备中');
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

  it('renders /challenges/grandmaster, /challenges/open-game, /challenges/open-language, /live, /contributors, /u/:username, and /docs cleanly', async () => {
    const checks: Array<[string, string]> = [
      ['/challenges/grandmaster', 'Grandmaster-CI v0.1.0'],
      ['/challenges/open-game', 'This project is waiting for its first contributor.'],
      ['/challenges/open-language', 'This project is waiting for its first contributor.'],
      ['/challenges/ai-civilization', 'This project is waiting for its first contributor.'],
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
