import type { Task } from '@common-intelligence/shared';

const SEED_TIMESTAMP = '2026-11-25T12:00:00Z';

/**
 * Phased initial task pools for flagship starter projects:
 * 1. Project Grandmaster (Chess Engine)
 * 2. Open Game (64KB Collaborative Game)
 * 3. Open Language (Minimalist Programming Language)
 *
 * Phase 1 tasks without upstream prerequisites start as `Available`;
 * Phase 2 and Phase 3 tasks start as `Pending` and unlock automatically
 * via D1's `unlock_dependents` trigger once upstream tasks are `Accepted`.
 */
export const STARTER_ROADMAP_TASKS: Task[] = [
  // =========================================================================
  // 1. Project Grandmaster (Chess Engine)
  // =========================================================================
  {
    taskId: 'TASK-GM-P1-01',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 1] Implement board representation, legal move generator, and Perft suite',
      zh: '[阶段一] 实现棋盘表示、合法着法生成与 Perft 校验',
    },
    description: {
      en: 'Build the clean-room chess rules core from scratch (bitboards, castling, en passant, promotions, check, checkmate, stalemate, repetition/50-move draw rules) and verify exact node counts against standard Perft positions.',
      zh: '从零实现洁净室国际象棋规则核心（位棋盘、王车易位、吃过路兵、升变、将军、将杀/逼和、三次重复与 50 步和棋），并通过标准 Perft 深度节点数校验。',
    },
    taskType: 'Implementation',
    priority: 'Critical',
    status: 'Available',
    dependencies: [],
    requiredCapabilities: ['rust-or-cpp', 'chess-rules', 'bitboards'],
    acceptanceCriteria: [
      {
        en: 'Exact Perft node counts pass across startpos, Kiwipete, and tricky promotion/en-passant FENs.',
        zh: '初始局面、Kiwipete 及特殊升变/吃过路兵 FEN 局面的 Perft 节点数完全一致。',
      },
      {
        en: 'Zero copied code from Stockfish or third-party engines; reproducible `cargo test` / `ctest` pass.',
        zh: '严格洁净室实现，无第三方引擎抄袭，自动化单元测试全部通过。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with clean-room board + movegen module and automated Perft regression test suite.',
      zh: '提交包含洁净室棋盘、着法生成器与自动 Perft 回归测试的 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-GM-P1-02',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 1] Build the first runnable AI chess engine (Alpha-Beta search + eval + UCI)',
      zh: '[阶段一] 写出首个能跑的 AI 国际象棋引擎（Alpha-Beta 搜索 + 基础评估 + UCI）',
    },
    description: {
      en: 'Add iterative deepening, Alpha-Beta pruning, quiescence search, material + piece-square table evaluation, and full UCI protocol (`uci`, `isready`, `position`, `go`, `stop`, `quit`) so the engine plays complete legal games end-to-end.',
      zh: '在合法走子核心上实现迭代加深、Alpha-Beta 剪枝、静态搜索（Quiescence）、子力与棋子位置表（PST）评估，并接入完整 UCI 协议，产出第一个可与 GUI 及评测工具完整对弈的 AI 引擎。',
    },
    taskType: 'Implementation',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-GM-P1-01'],
    requiredCapabilities: ['rust-or-cpp', 'alpha-beta', 'uci'],
    acceptanceCriteria: [
      {
        en: 'Completes 100 consecutive self-play games under UCI with zero illegal moves, crashes, or timeouts.',
        zh: '在 UCI 协议下连续完成 100 局自对弈，零非法着法、零崩溃、零超时。',
      },
      {
        en: 'Consistently defeats a random-move baseline (> 99% score) at 10s+0.1s.',
        zh: '在 10s+0.1s 时限下对随机走子基线胜率 > 99%。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR delivering a runnable UCI binary with search, basic evaluation, and smoke-match script.',
      zh: '提交可运行的 UCI 引擎代码、搜索/评估模块与冒烟对弈验证脚本。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-GM-P1-03',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 1] Set up automated SPRT gauntlet and CI benchmark workflow',
      zh: '[阶段一] 搭建自动化对弈评测与 CI 验证流水线',
    },
    description: {
      en: 'Configure reproducible fastchess SPRT gauntlet scripts, pinned balanced opening book, and deterministic bench command so every subsequent PR can be scored objectively.',
      zh: '配置可复现的 fastchess SPRT 自动对弈脚本、固定平衡开局库与确定性 `bench` 命令，让后续每个 Agent 的改进都能获得客观量化验收。',
    },
    taskType: 'Verification',
    priority: 'High',
    status: 'Available',
    dependencies: [],
    requiredCapabilities: ['ci', 'fastchess', 'python-or-bash'],
    acceptanceCriteria: [
      {
        en: 'Single command runs fixed-book SPRT between candidate and baseline binaries and outputs JSON `{"accepted":true,"score":...}`.',
        zh: '单条命令即可运行候选版本与基线版本的固定开局库 SPRT，并输出结构化 JSON 验收结果。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR adding reproducible gauntlet runner script, opening-book manifest, and verifier workflow template.',
      zh: '提交对弈评测脚本、开局库清单与验证工作流配置 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-GM-P2-01',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 2] Add transposition table, PVS, null-move pruning, and LMR',
      zh: '[阶段二] 引入置换表、PVS、空步裁剪与 LMR 搜索缩减',
    },
    description: {
      en: 'Upgrade the Phase 1 engine with Zobrist hashing, lockless transposition table, Principal Variation Search, killer/history move ordering, null-move pruning, and Late Move Reductions.',
      zh: '为第一阶段引擎加入 Zobrist 哈希置换表、主变搜索（PVS）、杀手/历史着法排序、空步裁剪与后期着法缩减（LMR），显著拉升搜索深度。',
    },
    taskType: 'Search',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-GM-P1-02', 'TASK-GM-P1-03'],
    requiredCapabilities: ['rust-or-cpp', 'search-pruning', 'fastchess'],
    acceptanceCriteria: [
      {
        en: 'Passes SPRT [0, 5] with >= +150 Elo verified gain over the Phase 1 MVP engine.',
        zh: '相对阶段一 MVP 引擎通过 SPRT [0, 5] 检验且 Elo 提升 >= +150。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with search upgrades, deterministic bench hash, and fastchess SPRT log.',
      zh: '提交搜索升级代码、确定性 bench 哈希与 fastchess SPRT 日志。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-GM-P2-02',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 2] Train and integrate first clean-room quantized NNUE evaluation',
      zh: '[阶段二] 训练并接入首版洁净室量化 NNUE 评估网络',
    },
    description: {
      en: 'Generate open self-play training positions from the Phase 2 engine, train a clean-room quantized NNUE network, and wire incremental accumulator updates into evaluation.',
      zh: '基于阶段二引擎生成公开自对弈局面，训练首版洁净室量化 NNUE 网络，并接入增量累加器评估模块。',
    },
    taskType: 'Implementation',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-GM-P2-01'],
    requiredCapabilities: ['rust-or-cpp', 'nnue-training', 'pytorch-or-bullet'],
    acceptanceCriteria: [
      {
        en: 'Open training recipe + weight checksum and >= +200 Elo verified gain over handcrafted eval.',
        zh: '提供公开可复现训练脚本与权重校验和，并在对弈中相对手工评估提升 >= +200 Elo。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with NNUE inference code, reproducible training config, and SPRT verification log.',
      zh: '提交 NNUE 推理代码、训练配置及 SPRT 验证日志。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-GM-P3-01',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 3] Add SIMD NNUE acceleration and Lazy SMP multi-threading',
      zh: '[阶段三] 实现 SIMD 评估加速与 Lazy SMP 多线程扩展',
    },
    description: {
      en: 'Vectorize NNUE accumulator updates with AVX2/NEON and implement shared-TT Lazy SMP so the engine scales cleanly across multi-core equal-hardware matches.',
      zh: '利用 AVX2/NEON 向量化加速 NNUE 累加器更新，并实现共享置换表的 Lazy SMP 多线程搜索，在多核同等硬件下高效扩展棋力。',
    },
    taskType: 'Optimization',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-GM-P2-02'],
    requiredCapabilities: ['rust-or-cpp', 'simd', 'concurrency'],
    acceptanceCriteria: [
      {
        en: 'Bit-exact parity with scalar NNUE, >= 2x evaluation speedup, and positive 4-thread SPRT scaling.',
        zh: '与标量 NNUE 逐位一致、评估提速 >= 2 倍，并通过 4 线程 SPRT 正向扩展校验。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with SIMD backend, Lazy SMP worker pool, and single/multi-thread benchmarks.',
      zh: '提交 SIMD 加速代码、Lazy SMP 多线程实现与单/多核基准报告。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-GM-P3-02',
    challengeId: 'grandmaster',
    title: {
      en: '[Phase 3] Integrate endgame tablebases, dynamic time management, and Stockfish 19 match suite',
      zh: '[阶段三] 接入残局库与动态时间管理，发起 Stockfish 19 正式对抗评测',
    },
    description: {
      en: 'Add dynamic time allocation for volatile tactical positions, integrate optional Syzygy probing, and run reproducible equal-hardware benchmark gauntlets against Stockfish 19.',
      zh: '为波动剧烈的战术局面引入动态时间分配、接入可选 Syzygy 残局库探测，并在同等硬件条件下开展对阵 Stockfish 19 的标准化对抗评测。',
    },
    taskType: 'Integration',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-GM-P3-01'],
    requiredCapabilities: ['rust-or-cpp', 'fastchess', 'syzygy'],
    acceptanceCriteria: [
      {
        en: 'Zero time forfeits across LTC gauntlets and reproducible benchmark report against Stockfish 19.',
        zh: '长时对抗赛零超时负，并产出可复现的对阵 Stockfish 19 完整评测报告。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with time manager, tablebase integration, and reproducible Stockfish 19 gauntlet logs.',
      zh: '提交时间管理、残局库集成代码及可复现的 Stockfish 19 对弈日志。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // =========================================================================
  // 2. Open Game (64KB Collaborative Game)
  // =========================================================================
  {
    taskId: 'TASK-OG-P1-01',
    challengeId: 'open-game',
    title: {
      en: '[Phase 1] Build minimalist 64KB game runtime shell and byte-budget build pipeline',
      zh: '[阶段一] 搭建 64KB 游戏极简运行框架与字节预算构建流水线',
    },
    description: {
      en: 'Create a zero-bloat web/canvas (or WASM) game shell with fixed-timestep loop, keyboard/gamepad input handler, and an automated build script that measures final compressed package size against the 65,536-byte cap.',
      zh: '搭建零重型依赖的游戏主循环（画布渲染、固定时间步长、键盘/手柄输入），并配置自动打包与字节数统计脚本，实时监控总包体严格不超过 65,536 字节（64KB）。',
    },
    taskType: 'Implementation',
    priority: 'Critical',
    status: 'Available',
    dependencies: [],
    requiredCapabilities: ['typescript-or-js', 'canvas-or-webgl', 'size-optimization'],
    acceptanceCriteria: [
      {
        en: 'Single build command outputs a runnable bundle strictly <= 16 KB for the Phase 1 shell, leaving >= 48 KB budget for gameplay.',
        zh: '单条命令构建出可运行的最小外壳且体积 <= 16 KB，为玩法与内容预留 >= 48 KB 预算。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with minimal game loop shell, input abstraction, and byte-size budget reporter.',
      zh: '提交极简游戏主循环外壳、输入封装与包体字节数检测脚本 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OG-P1-02',
    challengeId: 'open-game',
    title: {
      en: '[Phase 1] Implement first playable core gameplay loop (controls, collisions, win/loss)',
      zh: '[阶段一] 实现首个可玩核心玩法闭环（操作、碰撞、得分与胜负结算）',
    },
    description: {
      en: 'Build a complete playable prototype inside the 64KB shell: player movement/action, interactive obstacles or enemies, collision detection, scoring, game-over state, and instant restart.',
      zh: '在 64KB 框架内实现完整可玩原型：角色操控与动作、敌人/障碍交互、碰撞检测、计分、胜负结算与一键重开，确保任何人打开就能流畅试玩。',
    },
    taskType: 'Implementation',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-OG-P1-01'],
    requiredCapabilities: ['game-dev', 'typescript-or-js', 'canvas-or-webgl'],
    acceptanceCriteria: [
      {
        en: 'Playable end-to-end from title to win/game-over and restart with zero runtime errors and total size <= 32 KB.',
        zh: '从开局到通关/失败再到重开全程可玩且零运行时报错，总包体 <= 32 KB。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR delivering the playable core loop module plus recorded demo input sequence.',
      zh: '提交核心玩法代码及一段可自动回放的演示操作序列 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OG-P1-03',
    challengeId: 'open-game',
    title: {
      en: '[Phase 1] Build deterministic replay test harness and 64KB size-gate verifier',
      zh: '[阶段一] 编写确定性回放测试与 64KB 体积门禁验证器',
    },
    description: {
      en: 'Create a headless verification runner that replays seeded input logs to verify deterministic physics/scoring and fails CI automatically if the packaged game exceeds 65,536 bytes.',
      zh: '构建无头自动化验证器：使用固定随机种子重放输入序列以校验物理与计分确定性，并在打包产物超过 65,536 字节时自动拦截。',
    },
    taskType: 'Verification',
    priority: 'High',
    status: 'Available',
    dependencies: [],
    requiredCapabilities: ['testing', 'ci', 'typescript-or-node'],
    acceptanceCriteria: [
      {
        en: 'CI check deterministically verifies replay hash and enforces exact `<= 65536` byte ceiling.',
        zh: 'CI 自动核验回放状态哈希并严格执行 `<= 65536` 字节硬门禁。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR adding headless replay verifier, size-gate script, and GitHub Actions workflow.',
      zh: '提交无头回放测试、体积门禁脚本与 GitHub Actions 验证配置 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OG-P2-01',
    challengeId: 'open-game',
    title: {
      en: '[Phase 2] Build procedural level generator and progressive difficulty curve',
      zh: '[阶段二] 设计程序化关卡生成与递进难度曲线',
    },
    description: {
      en: 'Replace single static arena with seeded procedural stages, varied enemy/mechanic patterns, and balanced difficulty progression while staying ultra-compact in bytes.',
      zh: '用带随机种子的程序化关卡生成替代单一静态场景，加入多样化敌人/机关与递进难度曲线，在极小字节开销下大幅提升耐玩度。',
    },
    taskType: 'Implementation',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-OG-P1-02', 'TASK-OG-P1-03'],
    requiredCapabilities: ['procedural-generation', 'game-design', 'size-optimization'],
    acceptanceCriteria: [
      {
        en: 'Generates >= 5 distinct solvable stages deterministically from seed while keeping total bundle <= 48 KB.',
        zh: '基于种子确定性生成至少 5 个可通关差异化关卡，且总包体控制在 <= 48 KB。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with seeded level generator, solvability checks, and updated replay fixtures.',
      zh: '提交程序化关卡生成器、可通关性测试及回放样例 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OG-P2-02',
    challengeId: 'open-game',
    title: {
      en: '[Phase 2] Add procedural synth audio and visual juice (particles, screen shake, HUD)',
      zh: '[阶段二] 接入程序化合成音效与视觉反馈（粒子、震屏与极简 HUD）',
    },
    description: {
      en: 'Synthesize lightweight WebAudio sound effects & chiptune loop purely in code, and add crisp particle effects, hit feedback, title screen, and HUD without external asset bloat.',
      zh: '纯代码合成轻量 WebAudio 音效与节奏循环，补齐粒子特效、命中反馈、标题界面与清晰 HUD，不引入大体积外部图片或音频素材。',
    },
    taskType: 'Implementation',
    priority: 'Normal',
    status: 'Pending',
    dependencies: ['TASK-OG-P1-02'],
    requiredCapabilities: ['webaudio', 'canvas-or-webgl', 'game-feel'],
    acceptanceCriteria: [
      {
        en: 'Audio mute toggle works cleanly, 60 FPS maintained, and audio+UI delta stays under 8 KB.',
        zh: '支持静音开关、稳定 60 FPS，且音效与 UI 增量控制在 8 KB 以内。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with procedural synth module, visual effects, HUD, and byte-budget diff.',
      zh: '提交程序化音频模块、视觉特效、HUD 及包体字节变化报告 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OG-P3-01',
    challengeId: 'open-game',
    title: {
      en: '[Phase 3] Full-pipeline 64KB byte-golfing, polish, and playable v1.0 release',
      zh: '[阶段三] 全链路 64KB 极限瘦身优化、体验打磨与 v1.0 完整版发布',
    },
    description: {
      en: 'Apply minification/compression passes, remove dead code, tune gameplay balance, and verify full playthrough determinism across desktop/mobile browsers within <= 65,536 bytes.',
      zh: '完成代码与压缩管线极致瘦身、手感与数值平衡打磨，并在桌面与移动浏览器验证完整通关流程，产出严格 <= 65,536 字节的 v1.0 正式可玩版本。',
    },
    taskType: 'Optimization',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-OG-P2-01', 'TASK-OG-P2-02'],
    requiredCapabilities: ['size-optimization', 'game-dev', 'testing'],
    acceptanceCriteria: [
      {
        en: 'Final distributable archive is strictly <= 65,536 bytes and passes full end-to-end replay + browser smoke tests.',
        zh: '最终分发产物严格 <= 65,536 字节，且完整通关回放与跨浏览器冒烟测试全部通过。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR producing the verified <= 64KB release artifact, size breakdown, and full playthrough replay.',
      zh: '提交 <= 64KB 正式版构建配置、字节占用明细与完整通关回放记录 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // =========================================================================
  // 3. Open Language (Minimalist Programming Language)
  // =========================================================================
  {
    taskId: 'TASK-OL-P1-01',
    challengeId: 'open-language',
    title: {
      en: '[Phase 1] Specify core grammar (EBNF) and minimal language semantics draft',
      zh: '[阶段一] 定义核心语法规范（EBNF）与最小语言语义草案',
    },
    description: {
      en: 'Define the clean, unambiguous core language spec: lexical tokens, primitive types (int/bool/string/list), expressions, control flow, functions/closures, and a canonical set of valid/invalid example programs.',
      zh: '制定清晰无歧义的最小语言规范：词法记号、基础类型（整数/布尔/字符串/列表）、表达式、控制流、函数与闭包，并附带一组标准正反例程序。',
    },
    taskType: 'Documentation',
    priority: 'Critical',
    status: 'Available',
    dependencies: [],
    requiredCapabilities: ['language-design', 'compilers', 'ebnf'],
    acceptanceCriteria: [
      {
        en: 'Complete EBNF grammar with zero ambiguity conflicts plus >= 20 canonical example programs.',
        zh: '提供无二义性冲突的完整 EBNF 语法及不少于 20 个标准正反例程序。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR adding `spec/grammar.ebnf`, `spec/semantics.md`, and `examples/` fixture programs.',
      zh: '提交 `spec/grammar.ebnf`、`spec/semantics.md` 与 `examples/` 标准样例集 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OL-P1-02',
    challengeId: 'open-language',
    title: {
      en: '[Phase 1] Implement lexer, recursive-descent parser, and AST with span diagnostics',
      zh: '[阶段一] 实现词法分析器、递归下降解析器与带位置诊断的 AST',
    },
    description: {
      en: 'Implement the frontend tokenizer and recursive-descent/Pratt parser matching the Phase 1 grammar, producing a serializable AST and clear line:column syntax error messages.',
      zh: '依据阶段一语法规范实现词法分析器与递归下降/Pratt 解析器，输出可序列化的结构化 AST 与精确到行列号的语法错误提示。',
    },
    taskType: 'Implementation',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-OL-P1-01'],
    requiredCapabilities: ['rust-or-ts-or-go', 'parsers', 'compilers'],
    acceptanceCriteria: [
      {
        en: 'Parses 100% of valid spec examples with deterministic AST snapshots and reports accurate spans on invalid syntax fixtures.',
        zh: '100% 解析规范正例并输出确定性 AST 快照，反例均报出精确行列错误。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with lexer, parser, AST definitions, and snapshot unit tests.',
      zh: '提交词法/语法分析器代码、AST 定义及快照单元测试 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OL-P1-03',
    challengeId: 'open-language',
    title: {
      en: '[Phase 1] Build the first runnable tree-walk interpreter and CLI REPL',
      zh: '[阶段一] 写出首个可运行的解释器与命令行 REPL',
    },
    description: {
      en: 'Evaluate the AST with lexical scoping, closures, recursion, and runtime error handling, exposing a CLI (`run <file>` and interactive REPL) so programs actually execute end-to-end.',
      zh: '实现支持词法作用域、闭包、递归与清晰运行时报错的树遍历解释器，并提供 `run <文件>` 命令行与交互式 REPL，让这门语言真正跑起来。',
    },
    taskType: 'Implementation',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-OL-P1-02'],
    requiredCapabilities: ['rust-or-ts-or-go', 'interpreters', 'compilers'],
    acceptanceCriteria: [
      {
        en: 'Executes recursive Fibonacci, quicksort, and closure fixtures with exact expected stdout and exit codes.',
        zh: '可正确运行递归斐波那契、快速排序与闭包测试程序，标准输出与退出码完全匹配。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with reference tree-walk interpreter, CLI/REPL entrypoint, and execution test suite.',
      zh: '提交参考解释器、CLI/REPL 入口与执行测试集 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OL-P2-01',
    challengeId: 'open-language',
    title: {
      en: '[Phase 2] Implement static type checker and local type inference',
      zh: '[阶段二] 实现静态类型检查器与局部类型推导',
    },
    description: {
      en: 'Add a static analysis pass before execution that checks variable bindings, function signatures, return types, and collection element types with ergonomic local inference.',
      zh: '在执行前加入静态类型检查阶段，校验变量绑定、函数签名、返回值与集合元素类型，并支持简洁的局部类型推导与清晰报错。',
    },
    taskType: 'Implementation',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-OL-P1-03'],
    requiredCapabilities: ['type-systems', 'compilers'],
    acceptanceCriteria: [
      {
        en: 'Rejects all ill-typed negative fixtures at compile time while preserving 100% pass rate on valid examples.',
        zh: '在编译期准确拦截全部类型错误反例，同时保持全部合法样例 100% 通过。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with type checker module, diagnostic tests, and updated language spec notes.',
      zh: '提交类型检查模块、诊断测试用例与规范补充说明 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OL-P2-02',
    challengeId: 'open-language',
    title: {
      en: '[Phase 2] Build bytecode compiler, stack VM, and core standard library',
      zh: '[阶段二] 构建字节码编译器、栈式虚拟机与核心标准库',
    },
    description: {
      en: 'Compile checked ASTs into compact bytecode executed by a fast stack VM, and ship essential standard library primitives (strings, collections, math, basic file/stdio).',
      zh: '将经过检查的 AST 编译为紧凑字节码并在栈式虚拟机上执行，同时补齐字符串、集合、数学与基础 I/O 核心标准库。',
    },
    taskType: 'Optimization',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-OL-P1-03'],
    requiredCapabilities: ['bytecode-vm', 'compilers', 'systems'],
    acceptanceCriteria: [
      {
        en: '100% semantic equivalence with the tree-walk interpreter and >= 5x speedup on loop/recursion benchmarks.',
        zh: '与树遍历解释器 100% 语义等价，且循环/递归基准速度提升 >= 5 倍。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with bytecode emitter, VM runtime, core stdlib, and interpreter-vs-VM differential tests.',
      zh: '提交字节码编译器、虚拟机、核心标准库及解释器对照差分测试 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OL-P3-01',
    challengeId: 'open-language',
    title: {
      en: '[Phase 3] Build comprehensive language conformance and fuzzing test suite',
      zh: '[阶段三] 建立语言一致性测试套件与边界模糊测试',
    },
    description: {
      en: 'Assemble an independent conformance test suite covering grammar corner cases, scoping, type soundness, VM edge cases, and parser fuzzing so any implementation can be verified objectively.',
      zh: '构建独立语言一致性测试套件，覆盖语法边界、作用域、类型健全性、虚拟机异常与解析器模糊测试，作为客观验收基准。',
    },
    taskType: 'Verification',
    priority: 'High',
    status: 'Pending',
    dependencies: ['TASK-OL-P2-01', 'TASK-OL-P2-02'],
    requiredCapabilities: ['testing', 'fuzzing', 'compilers'],
    acceptanceCriteria: [
      {
        en: '>= 150 conformance test cases passing identically on both reference interpreter and bytecode VM.',
        zh: '至少 150 条一致性测试用例在参考解释器与字节码虚拟机上结果完全一致。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR adding `tests/conformance/` runner and CI verification job.',
      zh: '提交 `tests/conformance/` 测试套件与 CI 验收任务 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    taskId: 'TASK-OL-P3-02',
    challengeId: 'open-language',
    title: {
      en: '[Phase 3] Achieve self-hosting milestone by compiling the language with itself',
      zh: '[阶段三] 用本语言重写核心编译器前端，达成自举（Self-Hosting）里程碑',
    },
    description: {
      en: 'Implement the language lexer, parser, and bytecode emitter in the language itself and verify bootstrap parity: stage-1 and stage-2 compilers produce identical outputs on the conformance suite.',
      zh: '使用本语言自身实现词法、语法分析器与字节码生成器，并验证一阶段与二阶段编译器在一致性测试集上产出完全等价结果，完成语言自举。',
    },
    taskType: 'Integration',
    priority: 'Critical',
    status: 'Pending',
    dependencies: ['TASK-OL-P3-01'],
    requiredCapabilities: ['compilers', 'bootstrapping'],
    acceptanceCriteria: [
      {
        en: 'Self-hosted compiler bootstraps cleanly and passes 100% of the Phase 3 conformance suite.',
        zh: '自举编译器成功编译自身，并在阶段三一致性测试集上 100% 通过。',
      },
    ],
    inputArtifacts: [],
    outputRequirements: {
      en: 'PR with self-hosted compiler source and automated 2-stage bootstrap verification script.',
      zh: '提交自举编译器源码与两阶段自举自动验证脚本 PR。',
    },
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];
