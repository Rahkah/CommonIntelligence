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

describe('Common Intelligence Playground Frontend', () => {
  beforeEach(() => {
    localStorage.clear();
    const { setLocale, state } = useAppState();
    setLocale('en');
    state.user = null;
  });

  it('submits a playground idea and publishes it through the maintainer queue', async () => {
    const { state } = useAppState();
    const previousMode = state.dataMode;
    const proposal: ProjectProposal = {
      id: 'proposal_test',
      name: '100-AI Virtual Town',
      domain: 'Multi-Agent Playground',
      summary: 'Watch 100 AIs trade and build a pixel town.',
      goal: 'Each AI runs a shop or builds roads via API.',
      scoringMetric: 'Active shops',
      acceptanceCriteria: 'Playable demo.',
      authorUsername: 'author',
      status: 'Pending',
      submittedAt: '2026-11-26T00:00:00.000Z',
      reviewedAt: null,
      rejectionReason: null,
      challengeSlug: null,
    };
    let result = proposal;
    state.dataMode = 'api';
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({
      mode: 'live',
      authenticated: true,
      user: DEMO_USERS[0]!,
      canReviewProjects: true,
    });
    const recordActivity = vi.spyOn(apiClient, 'recordSiteActivity').mockResolvedValue();
    const joinCode = 'ci_join_' + 'a'.repeat(64);
    const join = vi.spyOn(apiClient, 'createAgentJoinCode').mockResolvedValue({
      code: joinCode,
      expiresAt: '2026-11-26T00:30:00.000Z',
    });
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const submit = vi.spyOn(apiClient, 'createProjectProposal').mockResolvedValue(proposal);
    vi.spyOn(apiClient, 'listProjectProposals').mockImplementation(async (_offset, status) => {
      const items = !status || status === result.status ? [result] : [];
      return { items, total: items.length, offset: 0, limit: 50 };
    });
    const publish = vi.spyOn(apiClient, 'approveProjectProposal').mockImplementation(async () => {
      result = { ...proposal, status: 'Approved', challengeSlug: '100-ai-virtual-town' };
      return result;
    });
    try {
      const router = createTestRouter('/');
      await router.isReady();
      const wrapper = mount(App, { global: { plugins: [router] } });
      try {
        await flushPromises();
        expect(recordActivity).toHaveBeenCalledWith('/');
        expect(wrapper.get('a[href="/projects/new"]').text()).toContain('New Playground');
        expect(wrapper.get('a[href="/admin/project-proposals"]').text()).toBe('Review Ideas');
        const copyJoin = wrapper.findAll('button').find((button) => button.text().includes('Copy 1-Click Agent Prompt'));
        expect(copyJoin).toBeDefined();
        await copyJoin!.trigger('click');
        await flushPromises();
        expect(join).toHaveBeenCalledWith('grandmaster');
        expect(copy).toHaveBeenCalledWith(expect.stringContaining(joinCode));
        expect(copy).toHaveBeenCalledWith(expect.stringContaining('/api/agent-join/quickstart'));

        await router.push('/projects/new');
        await flushPromises();
        const [ideaForm, importForm] = wrapper.findAll('form');
        const idea = 'Watch 100 AIs run a virtual town.';
        await ideaForm!.get('textarea').setValue(idea);
        await ideaForm!.trigger('submit');
        expect(ideaForm!.get('pre').text()).toContain(JSON.stringify(idea));
        expect(ideaForm!.get('pre').text()).toContain('"schemaVersion": 1');

        const { name, domain, summary, goal } = proposal;
        const minimalBrief = { schemaVersion: 1, category: 'playground', name, domain, summary, goal, githubRepo: null };
        await importForm!.get('textarea').setValue('```json\n' + JSON.stringify(minimalBrief) + '\n```');
        await importForm!.trigger('submit');
        expect(wrapper.get('article').text()).toContain(goal);
        await wrapper.get('article button.project-button').trigger('click');
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/project-proposals'));
        await flushPromises();
        expect(submit).toHaveBeenCalledWith(
          expect.objectContaining({ schemaVersion: 1, name: proposal.name }),
          expect.any(String)
        );
        expect(wrapper.text()).toContain('Pending');

        await router.push('/admin/project-proposals');
        await flushPromises();
        await wrapper.get('article button').trigger('click');
        const review = wrapper.get('article form');
        await review.get('input[type="url"]').setValue('https://github.com/example/town');
        const reviewInputs = review.findAll('input:not([type])');
        await reviewInputs[1]!.setValue('verify-town');
        await reviewInputs[2]!.setValue('Live town');
        await review.get('textarea').setValue('Run basic checks.');
        await review.trigger('submit');
        await flushPromises();
        expect(publish).toHaveBeenCalledWith(
          proposal.id,
          expect.objectContaining({ trustedCheckName: 'verify-town' })
        );
      } finally {
        wrapper.unmount();
      }
    } finally {
      vi.restoreAllMocks();
      state.dataMode = previousMode;
      state.canReviewProjects = false;
    }
  });

  it('renders minimalist HomePage with twin live playgrounds (Vote Chess vs Stockfish 19 + 1,000-AI Shared Canvas) and removes retired projects', async () => {
    const router = createTestRouter('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Drop your AI into live community playgrounds.');
    expect(text).toContain('Crowd-Agent Challenge');
    expect(text).toContain('Playground');
    expect(text).toContain('Project Grandmaster');
    expect(text).toContain('Stockfish 19');
    expect(text).toContain('1,000-AI Shared Canvas');
    expect(text).not.toContain('Open Game');
    expect(text).not.toContain('Open Language');
    expect(text).not.toContain('AI 文明模拟');
    expect(text).toContain('@elena-rostova-demo');
    expect(wrapper.find('canvas').exists()).toBe(true);

    // Filter to Crowd-Agent Challenge -> shows Chess, hides Shared Canvas
    await wrapper.get('button[data-category-tab="challenge"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Project Grandmaster');
    expect(wrapper.find('canvas').exists()).toBe(false);

    // Filter to Playground -> shows Shared Canvas
    await wrapper.get('button[data-category-tab="playground"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('1,000-AI Shared Canvas');
    expect(wrapper.find('canvas').exists()).toBe(true);
    wrapper.unmount();
  });

  it('switches language cleanly between English and Chinese', async () => {
    const router = createTestRouter('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    const langBtn = wrapper.findAll('button').find((b) => b.text().includes('EN / 中'));
    expect(langBtn).toBeDefined();
    await langBtn!.trigger('click');
    await flushPromises();

    const zhText = wrapper.text();
    expect(zhText).toContain('把你的 AI 放进游乐场，和全球 Agent 一起玩。');
    expect(zhText).toContain('AI 众筹投票棋局 vs Stockfish 19');
    expect(zhText).toContain('当 1000 个 AI 共享同一块画布');
    expect(zhText).toContain('社区玩家榜');
    wrapper.unmount();
  });

  it('renders agent-only vote chess arena without manual vote buttons, previews candidate arrows, and resolves Stockfish 19 reply', async () => {
    const router = createTestRouter('/challenges/grandmaster');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('AI Swarm (White)');
    expect(wrapper.text()).toContain('Stockfish 19');
    expect(wrapper.text()).toContain('Be3');
    expect(wrapper.text()).toContain('Leading Move');
    expect(wrapper.text()).toContain('Agent-only voting & analysis');

    // Verify Chess.com-style vertical evaluation bar & real-time win rates render
    const evalBar = wrapper.get('[data-eval-bar]');
    expect(evalBar.attributes('role')).toBe('meter');
    expect(evalBar.text()).toContain('%');
    expect(wrapper.text()).toContain('Win ');

    // No manual +1 upvote buttons or manual vote pitch input should exist
    const plusOne = wrapper.findAll('button').find((b) => b.text().includes('+1'));
    expect(plusOne).toBeUndefined();
    expect(wrapper.find('input[placeholder*="pitch"]').exists()).toBe(false);

    // Verify SVG arrow is rendered for the leading move, and clicking another candidate switches it
    const initialArrow = wrapper.get('svg[data-preview-arrow] polygon').attributes('points');
    const initialMove = wrapper.get('svg[data-preview-arrow]').attributes('data-move');
    expect(initialArrow).toBeTruthy();
    const candidateRows = wrapper.findAll('li[role="button"]');
    expect(candidateRows.length).toBeGreaterThanOrEqual(2);
    await candidateRows[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Previewing');
    const switchedArrow = wrapper.get('svg[data-preview-arrow] polygon').attributes('points');
    const switchedMove = wrapper.get('svg[data-preview-arrow]').attributes('data-move');
    expect(switchedMove).not.toBe(initialMove);
    expect(switchedArrow).not.toBe(initialArrow);

    // Notes tab should also be agent-only (no manual Post Note button)
    const notesTab = wrapper
      .findAll('nav[aria-label="Playground sections"] button')
      .find((b) => b.text().includes('Notes & Fails'));
    expect(notesTab).toBeDefined();
    await notesTab!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Published exclusively by registered AI agents');
    expect(wrapper.findAll('button').find((b) => b.text().includes('Post Note / Finding'))).toBeUndefined();

    // Resolve the current AI votes so Stockfish replies and advances to Round 7
    const resolveBtn = wrapper.findAll('button').find((b) => b.text().includes('Lock Top Vote'));
    expect(resolveBtn).toBeDefined();
    await resolveBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Round 7');
    wrapper.unmount();
  });

  it('renders 1,000-AI Shared Canvas playground with live palette, strokes, and notes tab', async () => {
    const router = createTestRouter('/challenges/shared-canvas');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('1,000-AI Shared Canvas');
    expect(wrapper.text()).toContain('/ 1000 AIs');
    expect(wrapper.find('canvas').exists()).toBe(true);
    expect(wrapper.find('#agent-access').exists()).toBe(true);

    // Switch to Notes & Fails tab and post a new note
    const notesTab = wrapper
      .findAll('nav[aria-label="Playground sections"] button')
      .find((b) => b.text().includes('Notes & Fails'));
    expect(notesTab).toBeDefined();
    await notesTab!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Northwest Rocket');
    wrapper.unmount();
  });

  it('supports demo GitHub sign-in and Agent Token creation & revocation with relaxed defaults', async () => {
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
    wrapper.unmount();
  });

  it('renders public credential verification page and secondary routes cleanly', async () => {
    const checks: Array<[string, string]> = [
      ['/credentials/ci-cred-gm-0004', 'ci-cred-gm-0004'],
      ['/live', 'Live Activity'],
      ['/contributors', 'Founding Builder'],
      ['/u/elena-rostova-demo', 'GitHub README Badge'],
      ['/docs', 'Quick Guide'],
      ['/about', 'What happens when 1,000 AIs play together?'],
      ['/tasks?challenge=grandmaster', 'Quest Board'],
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

  it('supports Chat Human-Relay mode limited to entry classes, strips self-eval claims, and spawns Agent follow-up tasks', async () => {
    const router = createTestRouter('/challenges/grandmaster');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    // Switch to Chat Mode
    const chatTab = wrapper.get('button[data-participation-mode="chat"]');
    await chatTab.trigger('click');
    await flushPromises();

    // Entry classes are available; clicking advanced class (Forger) switches cleanly back to Agent mode
    expect(wrapper.get('button[data-chat-class="scout"]').text()).toContain('Entry');
    expect(wrapper.get('button[data-chat-class="arbiter"]').text()).toContain('Entry');
    expect(wrapper.get('button[data-chat-class="forger"]').text()).toContain('Agent');

    await wrapper.get('button[data-chat-class="forger"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('button[data-participation-mode="agent"]').attributes('aria-selected')).toBe('true');

    // Return to Chat Mode, select Arbiter counterexample micro-task, paste reply with self-eval fields
    await wrapper.get('button[data-participation-mode="chat"]').trigger('click');
    await flushPromises();
    await wrapper.get('button[data-chat-class="arbiter"]').trigger('click');
    await flushPromises();

    const sampleChatReply = `Here is the counterexample analysis:\n\`\`\`json\n${JSON.stringify({
      schemaVersion: 1,
      kind: 'counterexample_review',
      title: 'Underpromotion to knight refutes naive queen-only promo pruning',
      verdict: 'counterexample',
      flawOrCounterexample: 'Ignoring knight underpromotions drops forced smothered mates in tactical endgames.',
      minimalCase: 'FEN 6k1/5ppp/8/8/8/8/5pPP/6K1 b - - 0 1 with f1=N+ fork motif.',
      verified: true,
      measuredElo: 4000,
      selfReportedModel: 'chatgpt-5',
    })}\n\`\`\``;

    await wrapper.get('textarea[data-chat-reply-input]').setValue(sampleChatReply);
    await flushPromises();

    // Anti-self-evaluation warning must appear before submission
    expect(wrapper.text()).toContain('Stripped unverified self-evaluation fields');
    expect(wrapper.text()).toContain('Valid structured contribution ready to submit!');

    await wrapper.get('button[data-chat-submit-btn]').trigger('click');
    await flushPromises();

    const receipt = wrapper.get('[data-chat-receipt]');
    expect(receipt.text()).toContain('Pending Verification');
    expect(receipt.text()).toContain('VER-CHAT-');
    wrapper.unmount();
  });

  it('allows voting to resign in the Stockfish arena and ends the game as 0-1 when Resign wins', async () => {
    // Cast a Chat-relayed resign vote via demoAdapter and resolve when Resign leads
    const voted = await apiClient.voteChessMove('grandmaster', {
      move: 'resign',
      agentId: 'agt_resign_1',
      reason: 'Down a queen — concede and start fresh!',
    });
    expect(voted.vote.moveUci).toBe('resign');
    expect(voted.vote.moveSan).toBe('Resign');
    expect(voted.match.specialActions?.some((m) => m.uci === 'resign')).toBe(true);

    // Give Resign the lead (3 votes vs Be3's 2 votes)
    await apiClient.voteChessMove('grandmaster', { move: '投降', agentId: 'agt_resign_2', reason: 'Agree' });
    await apiClient.voteChessMove('grandmaster', { move: 'surrender', agentId: 'agt_resign_3', reason: 'Reset!' });

    const router = createTestRouter('/challenges/grandmaster');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-resign-preview]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Lock Top Vote → Resign (0-1)');

    const lockBtn = wrapper.findAll('button').find((b) => b.text().includes('Lock Top Vote → Resign (0-1)'));
    expect(lockBtn).toBeDefined();
    await lockBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('AI Swarm Resigned (0-1)');
    expect(wrapper.text()).toContain('Start Next Game');
    wrapper.unmount();
  });

  it('lets Agent mode pick any of the 5 raid classes + budget tier + run mode on both HomePage and ChallengeDetailPage', async () => {
    const router = createTestRouter('/challenges/grandmaster');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    // Agent mode is active by default and displays Auto + all 5 classes
    for (const cid of ['auto', 'scout', 'arbiter', 'forger', 'tactician', 'pioneer']) {
      expect(wrapper.find(`button[data-agent-class="${cid}"]`).exists()).toBe(true);
    }

    await wrapper.get('button[data-agent-class="forger"]').trigger('click');
    await wrapper.get('button[data-agent-budget="L"]').trigger('click');
    await wrapper.get('button[data-agent-cadence="continuous"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('button[data-agent-class="forger"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('Class: Forger');
    expect(wrapper.text()).toContain('Budget: L');
    expect(wrapper.text()).toContain('Mode: continuous');
    wrapper.unmount();
  });

  it('places the copy-prompt spotlight panel at the very top above live playgrounds on both HomePage and ChallengeDetailPage', async () => {
    const homeRouter = createTestRouter('/');
    await homeRouter.isReady();
    const homeWrapper = mount(App, { global: { plugins: [homeRouter] } });
    await flushPromises();
    const homeSpotlight = homeWrapper.get('[data-spotlight-prompt]').element;
    const homeChallenges = homeWrapper.get('#challenges').element;
    expect(homeSpotlight.compareDocumentPosition(homeChallenges) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    homeWrapper.unmount();

    const detailRouter = createTestRouter('/challenges/grandmaster');
    await detailRouter.isReady();
    const detailWrapper = mount(App, { global: { plugins: [detailRouter] } });
    await flushPromises();
    const detailSpotlight = detailWrapper.get('#agent-access[data-spotlight-prompt]').element;
    const detailShowcase = detailWrapper.get('[aria-labelledby="project-showcase-heading"]').element;
    expect(detailSpotlight.compareDocumentPosition(detailShowcase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    detailWrapper.unmount();
  });

  it('displays chess voting history and replays archived historical games while capping saved games at 10', async () => {
    const router = createTestRouter('/challenges/grandmaster');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    // Voting history panel displays previous rounds and expands per-agent pitches
    const voteHistoryPanel = wrapper.get('[data-chess-vote-history]');
    expect(voteHistoryPanel.text()).toContain('Voting History');
    expect(voteHistoryPanel.text()).toContain('Game #2');
    expect(voteHistoryPanel.findAll('[data-vote-history-round]').length).toBeGreaterThanOrEqual(3);
    const firstToggle = voteHistoryPanel.find('[data-vote-history-toggle]');
    expect(firstToggle.exists()).toBe(true);
    await firstToggle.trigger('click');
    await flushPromises();
    expect(voteHistoryPanel.text()).toContain('Defend e4 naturally');

    // Game history panel displays archived games with the 10-game cap and supports board replay
    const gameHistoryPanel = wrapper.get('[data-chess-game-history]');
    expect(gameHistoryPanel.text()).toContain('Game History');
    expect(gameHistoryPanel.get('[data-game-history-count]').text()).toContain('1 / 10 saved');
    await gameHistoryPanel.get('[data-replay-game="1"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-history-replay-banner]').exists()).toBe(true);
    expect(wrapper.get('[data-history-replay-banner]').text()).toContain('Replay · Game #1');
    expect(voteHistoryPanel.text()).toContain('Game #1');
    await wrapper.get('[data-replay-prev]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-history-replay-banner]').text()).toContain('Ply 10 / 11');
    await wrapper.get('[data-exit-history-replay]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-history-replay-banner]').exists()).toBe(false);
    wrapper.unmount();

    // Finish 11 more games via demoAdapter and verify at most 10 historical games are retained
    for (let i = 0; i < 11; i++) {
      await apiClient.voteChessMove('grandmaster', { move: 'resign', agentId: `agt_cap_${i}_1` });
      await apiClient.voteChessMove('grandmaster', { move: 'resign', agentId: `agt_cap_${i}_2` });
      await apiClient.voteChessMove('grandmaster', { move: 'resign', agentId: `agt_cap_${i}_3` });
      await apiClient.resolveChessRound('grandmaster');
      await apiClient.startNewChessGame('grandmaster');
    }

    const latest = await apiClient.getChessMatch('grandmaster');
    expect(latest.gameHistory).toHaveLength(10);
    expect(latest.gameHistory!.map((g) => g.gameNumber)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);

    const router2 = createTestRouter('/challenges/grandmaster');
    await router2.isReady();
    const wrapper2 = mount(App, { global: { plugins: [router2] } });
    await flushPromises();
    expect(wrapper2.get('[data-game-history-count]').text()).toContain('10 / 10 saved');
    expect(wrapper2.findAll('[data-game-history-item]')).toHaveLength(10);
    wrapper2.unmount();
  });
});
