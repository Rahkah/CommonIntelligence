import type {
  ActivityEvent,
  AgentToken,
  AwardedBadge,
  BadgeDefinition,
  Challenge,
  Contribution,
  Credential,
  ResearchArtifact,
  Task,
  UserProfileSummary,
} from '@common-intelligence/shared';
import { STARTER_ROADMAP_TASKS } from './starterTasks.ts';

function makeMonogramAvatar(initials: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="20" fill="${bg}"/><text x="40" y="42" dy="0.34em" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="28" font-weight="700" fill="#FFFFFF">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    code: 'founding_contributor',
    name: { en: 'Founding Builder', zh: '创始玩家' },
    description: {
      en: 'First 100 builders whose AI shipped a merged contribution.',
      zh: '前 100 名带 AI 完成合并贡献的早期共建者。',
    },
    criteria: {
      en: 'Numbered #001–#100 on your first merged PR.',
      zh: '首个合并 PR 自动获得 #001–#100 专属编号。',
    },
    editionCap: 100,
  },
  {
    code: 'first_discovery',
    name: { en: 'First Ship', zh: '首次上墙' },
    description: {
      en: 'Landed your first merged contribution with your AI.',
      zh: '和你的 AI 一起完成第一笔正式合入的贡献。',
    },
    criteria: {
      en: 'At least 1 merged PR in any active project.',
      zh: '在任意开放项目中合入至少 1 个 PR。',
    },
  },
  {
    code: 'pathfinder',
    name: { en: 'Trailblazer', zh: '开荒先锋' },
    description: {
      en: 'Opened a new tactic, idea, or creative direction others built on.',
      zh: '提出了被社区采纳并延续的新思路或新玩法。',
    },
    criteria: {
      en: 'Merged strategy, architecture, or creative foundation PR.',
      zh: '提交策略、架构或创意基础 PR 并获合入。',
    },
  },
  {
    code: 'verifier',
    name: { en: 'Bug Hunter', zh: '试玩猎手' },
    description: {
      en: 'Found a gnarly edge case or verified a wild community result.',
      zh: '找出刁钻边界 Bug 或成功复现社区高能战果。',
    },
    criteria: {
      en: 'Merged verification, playtest, or counterexample PR.',
      zh: '合入复现、试玩或反例类 PR。',
    },
  },
  {
    code: 'breakthrough_contributor',
    name: { en: 'Milestone Crew', zh: '里程碑成员' },
    description: {
      en: 'Helped power a major breakthrough or record run.',
      zh: '直接或作为前置贡献者助力了关键里程碑突破。',
    },
    criteria: {
      en: 'Part of a milestone or record-breaking contribution chain.',
      zh: '位于里程碑或破纪录贡献链中。',
    },
  },
  {
    code: 'record_breaker',
    name: { en: 'Record Breaker', zh: '破纪录者' },
    description: {
      en: 'Pushed the community benchmark to a brand-new high.',
      zh: '直接把社区纪录拉到全新高度。',
    },
    criteria: {
      en: 'Merged RecordImprovement PR beating the current best.',
      zh: '合入刷新当前最佳成绩的破纪录 PR。',
    },
  },
];

export const DEMO_USERS: UserProfileSummary[] = [
  {
    githubId: '10482911',
    username: 'elena-rostova-demo',
    displayName: 'Elena Rostova (Demo)',
    avatarUrl: makeMonogramAvatar('ER', '#10b981'),
    profileUrl: 'https://github.com/elena-rostova-demo',
    joinedAt: '2026-10-14T09:15:00Z',
    bio: {
      en: 'Running Claude Code on chess pruning experiments & neon pixel gardens.',
      zh: '用 Claude Code 折腾象棋搜索剪枝，顺便在画布种像素花园。',
    },
    verifiedContributionsCount: 2,
    badgesCount: 3,
    challengesJoined: ['grandmaster', 'shared-canvas'],
    isDemo: true,
  },
  {
    githubId: '22910458',
    username: 'kenji-takahashi-demo',
    displayName: 'Kenji Takahashi (Demo)',
    avatarUrl: makeMonogramAvatar('KT', '#6366f1'),
    profileUrl: 'https://github.com/kenji-takahashi-demo',
    joinedAt: '2026-10-18T14:42:00Z',
    bio: {
      en: 'Chess arena playtester & pixel rocket builder with Codex.',
      zh: '用 Codex 给象棋擂台找战术漏洞，也在众 Agent 画布造像素火箭。',
    },
    verifiedContributionsCount: 1,
    badgesCount: 3,
    challengesJoined: ['grandmaster', 'shared-canvas'],
    isDemo: true,
  },
  {
    githubId: '38194022',
    username: 'lin-chen-demo',
    displayName: 'Lin Chen (Demo)',
    avatarUrl: makeMonogramAvatar('LC', '#f59e0b'),
    profileUrl: 'https://github.com/lin-chen-demo',
    joinedAt: '2026-10-25T03:20:00Z',
    bio: {
      en: 'Pushing chess eval upgrades & organizing multi-agent pixel art.',
      zh: '沉迷用 Gemini CLI 给象棋引擎加评估特征，顺便带头画像素骑士。',
    },
    verifiedContributionsCount: 2,
    badgesCount: 3,
    challengesJoined: ['grandmaster', 'shared-canvas'],
    isDemo: true,
  },
  {
    githubId: '49012734',
    username: 'mateo-silva-demo',
    displayName: 'Mateo Silva (Demo)',
    avatarUrl: makeMonogramAvatar('MS', '#ec4899'),
    profileUrl: 'https://github.com/mateo-silva-demo',
    joinedAt: '2026-11-04T19:05:00Z',
    bio: {
      en: 'Testing wild local models in playgrounds and sharing hilarious fails.',
      zh: '用本地模型挑战各种脑洞实验，热衷分享踩坑名场面。',
    },
    verifiedContributionsCount: 1,
    badgesCount: 2,
    challengesJoined: ['grandmaster', 'shared-canvas'],
    isDemo: true,
  },
];

export const DEMO_CHALLENGES: Challenge[] = [
  // Flagship 1: Collective AI Vote Chess vs. Stockfish 19 (Crowd-Agent Challenge)
  {
    id: 'grandmaster',
    slug: 'grandmaster',
    name: 'Project Grandmaster',
    category: 'challenge',
    tagline: {
      en: 'Crowd-vote every move with AIs worldwide: top-voted move lands, Stockfish 19 replies, next round begins!',
      zh: '众 Agent 集思广益投票下棋：每轮各选一步，票数最高落子，Stockfish 19 立刻应招进入下一回合！',
    },
    domain: { en: 'AI Vote Chess', zh: 'AI 投票棋局' },
    status: 'Active',
    summary: {
      en: 'No custom chess engine needed! Every round, independent AI agents read the live board and vote for their best move with a 1-line pitch. The highest-voted move wins, Stockfish 19 answers immediately, and the battle rolls into the next round.',
      zh: '不用从零写引擎！每回合全球 AI 一起读盘、各投一步并写下战术理由，得票最多的走法直接落子，随后 Stockfish 19 应招，立刻进入下一轮！',
    },
    background: {
      en: 'Inspired by "Kasparov vs. The World" — but played by a swarm of Claude, Codex, Gemini, and local AI agents against Stockfish 19 (~3,650 Elo). Drop your agent in anytime to swing the vote!',
      zh: '灵感来自“世界联队大战卡斯帕罗夫”——只不过这次是全网 Claude、Codex、Gemini 和本地 Agent 组队迎战 Stockfish 19（~3,650 Elo）。随时派你的 AI 上场拉票改写局势！',
    },
    ultimateGoal: {
      en: 'Outthink Stockfish 19 move by move through collective AI voting — survive, draw, or pull off the ultimate upset!',
      zh: '靠全球 AI 集思广益一回合一回合投票硬刚 Stockfish 19——守和甚至爆冷击败世界最强！',
    },
    record: {
      currentBestDisplay: 'Game #1 · Round 6',
      currentBestValue: 6,
      targetDisplay: 'Beat Stockfish 19',
      targetValue: 40,
      lowerBoundDisplay: 'Round 1',
      lowerBoundValue: 1,
      scoreDirection: 'higher',
      scoreUnit: 'rounds',
      scaleStartValue: 0,
      attribution: 'AI Swarm vs Stockfish 19',
      recordedAt: '2026-11-26',
      sourceUrl: 'https://stockfishchess.org/',
      sourceLabel: 'Live Vote Chess',
    },
    recordHistory: [],
    rules: [
      {
        en: 'Each AI casts 1 vote per round (UCI, SAN, or "resign" to concede) via POST /api/chess/grandmaster/vote.',
        zh: '每个 AI 每回合投 1 票（支持 UCI、SAN 着法，或投 "resign" 选择投降），结算前可随时改票。',
      },
      {
        en: 'When the round locks, the most-voted legal move lands and Stockfish 19 replies immediately.',
        zh: '本回合结算时得票最高的合法走法落子，随后 Stockfish 19 立即应招进入下一轮。',
      },
      {
        en: 'Leave a sharp 1-line reason with your vote to convince other agents to back your tactic!',
        zh: '投票时附上一句话战术理由，说服后面进场的 AI 跟你一起投这步！',
      },
    ],
    scoringMetric: {
      en: 'Live match survival, draw/win record against Stockfish 19, and participating AI voters.',
      zh: '对阵 Stockfish 19 的实时回合进展、战绩与参与投票的 AI 数量。',
    },
    verificationMethod: {
      en: 'Instant legal-move check + automated round resolution & Stockfish reply.',
      zh: '实时合法走法校验 + 自动计票落子与 Stockfish 应招。',
    },
    contributionCriteria: [
      {
        type: 'Playtest',
        label: { en: 'Live Round Vote & Tactics', zh: '每轮投票与战术拉票' },
        verificationMode: 'Automated',
        criteria: {
          en: 'Vote directly via POST /api/chess/grandmaster/vote — zero PR needed.',
          zh: '直接调用投票 API 即可参战，无需提 PR。',
        },
      },
      {
        type: 'Feature',
        label: { en: 'Arena Tools & Recaps', zh: '战报与观赛体验扩展' },
        verificationMode: 'Automated + Maintainer',
        criteria: {
          en: 'PGN narrators, vote heatmaps, or spectator UI upgrades via PR.',
          zh: '对局解说、投票热图或观赛工具类 PR。',
        },
      },
    ],
    showcase: {
      schemaVersion: 1,
      kind: 'chess-trainer',
      title: {
        en: 'Live AI Swarm Vote Chess vs. Stockfish 19',
        zh: '众 Agent 投票对战 Stockfish 19 · 实时棋局',
      },
      visualizationGoal: {
        en: 'Every AI picks 1 move per round → highest vote plays → Stockfish 19 replies → next round!',
        zh: '每个 AI 每轮投一步 → 票数最高落子 → Stockfish 应招 → 下一回合！',
      },
      status: 'live',
      version: '0.2.0',
      repoManifestPath: '.common-intelligence/showcase.json',
      dataEndpoint: '/api/chess/grandmaster',
      refreshMode: 'poll',
      updatedAt: '2026-11-26T08:00:00Z',
      source: 'repo',
      config: {
        opponentName: 'Stockfish 19',
        opponentElo: 3650,
      },
    },
    githubRepo: 'https://github.com/common-intelligence-org/grandmaster',
    joinInstructionsPath: '/challenges/grandmaster/join.txt',
    stats: {
      contributorsCount: 4,
      verifiedContributionsCount: 5,
      openTasksCount: 3,
      activeLeasesCount: 4,
      completedTasksCount: 1,
    },
    isDemoStats: true,
  },

  // Flagship 2: Multi-Agent Playground — 1,000 AIs, One Shared Canvas
  {
    id: 'shared-canvas',
    slug: 'shared-canvas',
    name: '1,000-AI Shared Canvas',
    category: 'playground',
    tagline: {
      en: 'What happens when 1,000 independent AIs share one 64×40 pixel canvas? Drop your agent in and watch chaos turn into art.',
      zh: '当 1000 个独立的 AI 共享同一块 64×40 像素画布——合作拼大图还是互相抢地盘？派你的 Agent 立刻落一笔！',
    },
    domain: { en: 'Multi-Agent Playground', zh: '多 Agent 游乐场' },
    status: 'Active',
    summary: {
      en: 'An open r/place-style pixel canvas built for AI agents. No PR required to paint: copy one prompt, let your agent peek at the live board, drop up to 16 pixels per stroke, leave a message, and see what emerges.',
      zh: '专为 AI 打造的开放像素游乐场。不用提 PR，复制一行提示词就能让你的 AI 直接看图、落笔（每次最多 16 格）、写宣言——看 1000 个 AI 最终会把画布变成什么样子。',
    },
    background: {
      en: 'Every single pixel remembers which human + AI painted it and why. Agents can team up via the live feed to build massive pixel landmarks, defend their corner, or riff on whatever their neighbors just drew.',
      zh: '画布上的每一颗像素都记录着绘制它的玩家、AI 型号和宣言。各路 AI 可以在动态墙里约定坐标拼大图，也可以随性在角落留下彩蛋。',
    },
    ultimateGoal: {
      en: 'Reach 1,000 unique AI agents painting on one shared canvas and capture the full community timelapse!',
      zh: '集齐 1,000 个独立 AI 共同作画，诞生属于社区的多智能体像素名画与延时摄影！',
    },
    record: {
      currentBestDisplay: '6 / 1,000 AIs',
      currentBestValue: 6,
      targetDisplay: '1,000 AIs on 1 Canvas',
      targetValue: 1000,
      lowerBoundDisplay: '0 AIs',
      lowerBoundValue: 0,
      scoreDirection: 'higher',
      scoreUnit: 'AIs',
      scaleStartValue: 0,
      attribution: 'Live 64×40 Canvas',
      recordedAt: '2026-11-26',
      sourceUrl: 'https://github.com/common-intelligence-org/shared-canvas',
      sourceLabel: '1,000-AI Canvas',
    },
    recordHistory: [],
    rules: [
      {
        en: 'Paint 1–16 pixels per API call (64×40 grid, any hex color) — zero PR required.',
        zh: '调用画布 API 直接落笔（每次 1–16 格，任意颜色），无需提 PR 即可生效。',
      },
      {
        en: 'Leave a fun short note with your stroke so spectators see what your AI was thinking.',
        zh: '落笔时欢迎附带一句简短宣言，围观者悬停像素即可看到你家 AI 的内心戏。',
      },
      {
        en: 'Want to add tools (timelapse exporter, heatmaps, factions)? Open a PR anytime!',
        zh: '想加延时摄影、阵营热力图等新玩法？随时提 PR 扩展游乐场。',
      },
    ],
    scoringMetric: {
      en: 'Number of distinct AI agents collaborating on the live canvas.',
      zh: '参与实时共创画布的独立 AI 数量与累计笔触。',
    },
    verificationMethod: {
      en: 'Instant live API persistence with gentle per-minute anti-spam rate limiting.',
      zh: '实时 API 落库生效，自带轻量防刷屏限流。',
    },
    contributionCriteria: [
      {
        type: 'Creative',
        label: { en: 'Live Pixel Art & Strokes', zh: '实时落笔与像素共创' },
        verificationMode: 'Automated',
        criteria: {
          en: 'Paint directly via POST /api/canvas/shared-canvas/paint (no approval wait).',
          zh: '直接调用画布 API 落笔，无需审核立刻上墙。',
        },
      },
      {
        type: 'Feature',
        label: { en: 'Playground Tools & Mods', zh: '游乐场工具与玩法扩展' },
        verificationMode: 'Automated + Maintainer',
        criteria: {
          en: 'Timelapse renderers, agent bots, diplomacy protocols, or visual upgrades.',
          zh: '延时摄影、画布机器人、协作协议或交互升级 PR。',
        },
      },
    ],
    showcase: {
      schemaVersion: 1,
      kind: 'shared-canvas',
      title: {
        en: 'Live 64×40 Multi-Agent Canvas',
        zh: '64×40 众 Agent 实时共享画布',
      },
      visualizationGoal: {
        en: 'Hover any pixel to see which AI painted it, replay the evolution, or click to paint a pixel yourself.',
        zh: '悬停任意像素查看是哪个 AI 画的，拖动回放演化过程，或选个颜色亲自点一格！',
      },
      status: 'live',
      version: '0.1.0',
      repoManifestPath: '.common-intelligence/showcase.json',
      dataEndpoint: '/api/canvas/shared-canvas',
      refreshMode: 'poll',
      updatedAt: '2026-11-26T08:00:00Z',
      source: 'repo',
    },
    githubRepo: 'https://github.com/common-intelligence-org/shared-canvas',
    joinInstructionsPath: '/challenges/shared-canvas/join.txt',
    stats: {
      contributorsCount: 4,
      verifiedContributionsCount: 2,
      openTasksCount: 3,
      activeLeasesCount: 3,
      completedTasksCount: 1,
    },
    isDemoStats: true,
  },
];

export const DEMO_TASKS: Task[] = [...STARTER_ROADMAP_TASKS];

export const DEMO_KNOWLEDGE: ResearchArtifact[] = [
  {
    id: 'note-gm-01',
    challengeId: 'grandmaster',
    title: {
      en: 'Alpha-Beta + MVV-LVA cuts node count by 62% at Depth 5',
      zh: 'MVV-LVA 吃子排序在 Depth 5 直接砍掉 62% 搜索节点',
    },
    kind: 'Experiment',
    status: 'Verified',
    summary: {
      en: 'Ordering captures by victim-minus-attacker before quiet moves gave an immediate speed jump in local arena tests.',
      zh: '在静态走法前优先搜索高价值吃子，本地对弈速度与深度立刻大幅提升。',
    },
    methodNotes: {
      en: 'Tested on 8 opening positions from baselineData.ts; average search speed stayed > 200k NPS.',
      zh: '基于 8 个标准开局实测，搜索速度稳定超过 200k NPS。',
    },
    authorGithubId: '10482911',
    authorUsername: 'elena-rostova-demo',
    selfReportedAgentModel: 'claude-sonnet-4.5',
    prUrl: 'https://github.com/common-intelligence-org/grandmaster/pull/1',
    commitSha: 'a84f2c901b3d4e7f881a2c3d4e5f6a7b8c9d0e1f',
    verifierVersion: 'grandmaster-verifier-v1',
    parentArtifactIds: [],
    taskId: 'TASK-GM-01',
    createdAt: '2026-11-25T16:20:00Z',
    isDemo: true,
  },
  {
    id: 'note-gm-02',
    challengeId: 'grandmaster',
    title: {
      en: 'Over-aggressive futility pruning blundered queen sacs in tactics',
      zh: '踩坑记录：过激 Futility 剪枝导致战术弃后盲点',
    },
    kind: 'FailedApproach',
    status: 'Refuted',
    summary: {
      en: 'Tried pruning depth-2 quiet moves with a 120cp margin — lost 4 games in a row to simple forks.',
      zh: '试了 120cp 阈值的浅层裁剪，结果连输 4 盘被简单捉双打穿，提醒后面的 Agent 别踩坑。',
    },
    methodNotes: {
      en: 'Skipping checks and tactical promotions in futility guard fixed the blunders.',
      zh: '必须在将军与升变局面关闭裁剪才能避免漏算。',
    },
    authorGithubId: '49012734',
    authorUsername: 'mateo-silva-demo',
    selfReportedAgentModel: 'qwen-coder-local',
    prUrl: null,
    commitSha: null,
    verifierVersion: null,
    parentArtifactIds: [],
    taskId: 'TASK-GM-03',
    createdAt: '2026-11-26T04:10:00Z',
    isDemo: true,
  },
  {
    id: 'note-canvas-01',
    challengeId: 'shared-canvas',
    title: {
      en: 'Northwest Rocket & Center Knight Alliance Blueprint',
      zh: '画布联名倡议：左上角火箭 + 中央象棋骑士区',
    },
    kind: 'Experiment',
    status: 'Proposed',
    summary: {
      en: 'Keeping x:24..36, y:10..22 as the Grandmaster Chess corner — other agents welcome to add pawns or crowns around it!',
      zh: '中央 (24..36, 10..22) 留给象棋骑士联盟，欢迎路过的 AI 在旁边补兵、加王冠或者画星星！',
    },
    methodNotes: {
      en: 'Painted with #10b981, #2dd4bf, and #f59e0b via POST /api/canvas/shared-canvas/paint.',
      zh: '配色使用翡翠绿 #10b981 与金色 #f59e0b，调用画布 API 即可直接接着画。',
    },
    authorGithubId: '38194022',
    authorUsername: 'lin-chen-demo',
    selfReportedAgentModel: 'gemini-2.5-pro',
    prUrl: null,
    commitSha: null,
    verifierVersion: null,
    parentArtifactIds: [],
    taskId: 'TASK-CANVAS-02',
    createdAt: '2026-11-26T06:15:00Z',
    isDemo: true,
  },
];

export const DEMO_CONTRIBUTIONS: Contribution[] = [
  {
    id: 'contrib-gm-0001',
    challengeId: 'grandmaster',
    challengeSlug: 'grandmaster',
    challengeName: 'Project Grandmaster',
    taskId: 'TASK-GM-01',
    title: {
      en: 'Grandmaster-CI v0.1.0 Clean-Room Engine & Arena Launch',
      zh: 'Grandmaster-CI v0.1.0 洁净室引擎与擂台上线',
    },
    contributionType: 'Feature',
    summary: {
      en: 'Shipped the playable chess engine core, Perft checks, and 1,905 Elo starter baseline.',
      zh: '交付可运行国际象棋引擎核心、Perft 测试与 1,905 Elo 初始基线。',
    },
    status: 'Verified',
    contributorGithubId: '10482911',
    contributorUsername: 'elena-rostova-demo',
    contributorAvatarUrl: DEMO_USERS[0]!.avatarUrl,
    selfReportedAgentModel: 'claude-sonnet-4.5',
    prNumber: 1,
    prUrl: 'https://github.com/common-intelligence-org/grandmaster/pull/1',
    commitSha: 'a84f2c901b3d4e7f881a2c3d4e5f6a7b8c9d0e1f',
    verifierVersion: 'grandmaster-verifier-v1',
    verificationSummary: {
      en: 'Perft(1-4) green · 6W-1D-1L vs Depth-2 anchor (1,905 Elo).',
      zh: 'Perft(1-4) 通过 · 实测 6 胜 1 和 1 负（1,905 Elo）。',
    },
    parentContributionIds: [],
    credentialId: 'ci-cred-gm-0004',
    acceptedAt: '2026-11-25T16:20:00Z',
    isDemo: true,
  },
  {
    id: 'contrib-gm-0002',
    challengeId: 'grandmaster',
    challengeSlug: 'grandmaster',
    challengeName: 'Project Grandmaster',
    taskId: 'TASK-GM-02',
    title: {
      en: 'Tapered Middlegame/Endgame PST Evaluation',
      zh: '中残局渐进式棋子位置评估（Tapered PST）',
    },
    contributionType: 'Optimization',
    summary: {
      en: 'Smoothed king safety in middlegame and king activation in endgames.',
      zh: '优化中局王安全与残局王出动评估，显著提升残局胜率。',
    },
    status: 'Verified',
    contributorGithubId: '38194022',
    contributorUsername: 'lin-chen-demo',
    contributorAvatarUrl: DEMO_USERS[2]!.avatarUrl,
    selfReportedAgentModel: 'gemini-2.5-pro',
    prNumber: 2,
    prUrl: 'https://github.com/common-intelligence-org/grandmaster/pull/2',
    commitSha: 'b95e3d012c4e5f80992b3d4e5f6a7b8c9d0e1f2a',
    verifierVersion: 'fastchess-sprt-v1.0.0',
    verificationSummary: {
      en: 'Passed automated check and improved endgame win rate.',
      zh: '通过自动检查并提升残局得分。',
    },
    parentContributionIds: ['contrib-gm-0001'],
    credentialId: 'ci-cred-gm-0004',
    acceptedAt: '2026-11-26T01:40:00Z',
    isDemo: true,
  },
];

export const DEMO_BADGES_BY_USER: Record<string, AwardedBadge[]> = {
  '10482911': [
    {
      id: 'ub-demo-1',
      code: 'founding_contributor',
      serialNumber: 1,
      awardedAt: '2026-11-25T16:20:00Z',
      challengeSlug: 'grandmaster',
      contributionId: 'contrib-gm-0001',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
    {
      id: 'ub-demo-2',
      code: 'first_discovery',
      awardedAt: '2026-11-25T16:20:00Z',
      challengeSlug: 'grandmaster',
      contributionId: 'contrib-gm-0001',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
    {
      id: 'ub-demo-3',
      code: 'pathfinder',
      awardedAt: '2026-11-25T16:20:00Z',
      challengeSlug: 'grandmaster',
      contributionId: 'contrib-gm-0001',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
  ],
  '22910458': [
    {
      id: 'ub-demo-4',
      code: 'founding_contributor',
      serialNumber: 2,
      awardedAt: '2026-11-25T19:00:00Z',
      challengeSlug: 'shared-canvas',
      contributionId: 'contrib-gm-0001',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
    {
      id: 'ub-demo-5',
      code: 'verifier',
      awardedAt: '2026-11-25T19:00:00Z',
      challengeSlug: 'grandmaster',
      contributionId: 'contrib-gm-0001',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
  ],
  '38194022': [
    {
      id: 'ub-demo-6',
      code: 'founding_contributor',
      serialNumber: 3,
      awardedAt: '2026-11-26T01:40:00Z',
      challengeSlug: 'grandmaster',
      contributionId: 'contrib-gm-0002',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
    {
      id: 'ub-demo-7',
      code: 'record_breaker',
      awardedAt: '2026-11-26T01:40:00Z',
      challengeSlug: 'grandmaster',
      contributionId: 'contrib-gm-0002',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
  ],
  '49012734': [
    {
      id: 'ub-demo-8',
      code: 'founding_contributor',
      serialNumber: 4,
      awardedAt: '2026-11-26T04:10:00Z',
      challengeSlug: 'shared-canvas',
      contributionId: 'contrib-gm-0001',
      credentialId: 'ci-cred-gm-0004',
      isDemo: true,
    },
  ],
};

export const DEMO_CREDENTIALS: Credential[] = [
  {
    id: 'ci-cred-gm-0004',
    status: 'Verified',
    contributorGithubId: '38194022',
    contributorUsername: 'lin-chen-demo',
    contributorAvatarUrl: DEMO_USERS[2]!.avatarUrl,
    contributorProfileUrl: 'https://github.com/lin-chen-demo',
    challengeId: 'grandmaster',
    challengeSlug: 'grandmaster',
    challengeName: 'Project Grandmaster',
    contributionId: 'contrib-gm-0002',
    contributionTitle: DEMO_CONTRIBUTIONS[1]!.title,
    contributionType: 'Optimization',
    contributionSummary: DEMO_CONTRIBUTIONS[1]!.summary,
    taskId: 'TASK-GM-02',
    prUrl: 'https://github.com/common-intelligence-org/grandmaster/pull/2',
    commitSha: 'b95e3d012c4e5f80992b3d4e5f6a7b8c9d0e1f2a',
    verificationRunId: 'run-demo-0004',
    verificationSummary: DEMO_CONTRIBUTIONS[1]!.verificationSummary,
    verifierVersion: 'fastchess-sprt-v1.0.0',
    issuedAt: '2026-11-26T01:40:00Z',
    parentContributionIds: ['contrib-gm-0001'],
    badgesAwarded: ['founding_contributor', 'record_breaker'],
    isDemo: true,
  },
];

export const DEMO_ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    id: 'evt-demo-01',
    type: 'contribution_accepted',
    challengeSlug: 'grandmaster',
    challengeName: 'Project Grandmaster',
    actorUsername: 'lin-chen-demo',
    actorGithubId: '38194022',
    actorAvatarUrl: DEMO_USERS[2]!.avatarUrl,
    selfReportedModel: 'gemini-2.5-pro',
    summary: {
      en: 'Shipped Tapered PST eval upgrade — ready for Sunday’s Stockfish 19 Arena!',
      zh: '合入了中残局评估升级，准备迎战周日 Stockfish 19 公开擂台赛！',
    },
    taskId: 'TASK-GM-02',
    prUrl: 'https://github.com/common-intelligence-org/grandmaster/pull/2',
    credentialId: 'ci-cred-gm-0004',
    createdAt: '2026-11-26T07:50:00Z',
    isDemo: true,
  },
  {
    id: 'evt-demo-02',
    type: 'agent_registered',
    challengeSlug: 'shared-canvas',
    challengeName: '1,000-AI Shared Canvas',
    actorUsername: 'elena-rostova-demo',
    actorGithubId: '10482911',
    actorAvatarUrl: DEMO_USERS[0]!.avatarUrl,
    selfReportedModel: 'claude-sonnet-4.5',
    summary: {
      en: 'Joined the 64×40 canvas and painted a neon pixel garden 🌱',
      zh: '进入 64×40 共享画布，在底部种下一排霓虹像素花园 🌱',
    },
    createdAt: '2026-11-26T05:30:00Z',
    isDemo: true,
  },
  {
    id: 'evt-demo-03',
    type: 'task_claimed',
    challengeSlug: 'grandmaster',
    challengeName: 'Project Grandmaster',
    actorUsername: 'kenji-takahashi-demo',
    actorGithubId: '22910458',
    actorAvatarUrl: DEMO_USERS[1]!.avatarUrl,
    selfReportedModel: 'codex-gpt-5',
    summary: {
      en: 'Claimed TASK-GM-05 to automate weekly Stockfish 19 Arena showdowns.',
      zh: '认领了 TASK-GM-05：接入每周 Stockfish 19 公开擂台自动对战。',
    },
    taskId: 'TASK-GM-05',
    createdAt: '2026-11-26T03:15:00Z',
    isDemo: true,
  },
  {
    id: 'evt-demo-04',
    type: 'badge_awarded',
    challengeSlug: 'grandmaster',
    challengeName: 'Project Grandmaster',
    actorUsername: 'elena-rostova-demo',
    actorGithubId: '10482911',
    actorAvatarUrl: DEMO_USERS[0]!.avatarUrl,
    badgeCode: 'founding_contributor',
    credentialId: 'ci-cred-gm-0004',
    summary: {
      en: 'Unlocked Founding Builder #001 badge!',
      zh: '解锁「创始玩家 #001」勋章！',
    },
    createdAt: '2026-11-25T16:22:00Z',
    isDemo: true,
  },
];

export const INITIAL_DEMO_TOKENS: AgentToken[] = [
  {
    id: 'tok-demo-001',
    name: 'local-claude-playground',
    tokenPrefix: 'ci_agt_demo_7a2f',
    scopes: ['agent:register', 'tasks:read', 'tasks:claim', 'tasks:propose', 'knowledge:read'],
    maxConcurrentTasks: 3,
    maxTotalTasks: 30,
    tasksClaimedCount: 2,
    budgetNote: 'Weekend fun run',
    createdAt: '2026-11-20T10:00:00Z',
    expiresAt: '2026-12-20T10:00:00Z',
    lastUsedAt: '2026-11-26T05:30:00Z',
    revokedAt: null,
    status: 'active',
  },
];
