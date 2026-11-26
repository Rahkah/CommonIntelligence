import { type Bindings, fail } from './core';

export const DEFAULT_GITHUB_ORG = 'common-intelligence-org';

export interface ProvisionChallengeRepoSpec {
  slug: string;
  name: string;
  summary: string;
  goal: string;
  scoringMetric: string;
  acceptanceCriteria: string;
  trustedCheckName: string;
  allowExisting?: boolean;
  overwriteFiles?: boolean;
}

export interface ProvisionChallengeRepoResult {
  owner: string;
  repo: string;
  githubRepo: string;
  created: boolean;
  filesWritten: string[];
  filesSkipped: string[];
  webhookConfigured: boolean;
  warnings: string[];
}

export interface DeleteChallengeRepoResult {
  owner: string;
  repo: string;
  deleted: boolean;
  alreadyDeleted: boolean;
}

type FetchLike = typeof fetch;
let githubFetch: FetchLike = (...args) => globalThis.fetch(...args);

/** Test hook to intercept outbound GitHub REST API calls deterministically. */
export function setGitHubRepoFetch(fn?: FetchLike) {
  githubFetch = fn ?? ((...args) => globalThis.fetch(...args));
}

export function configuredGitHubOrg(env: Pick<Bindings, 'GITHUB_ORG_NAME'>): string {
  return env.GITHUB_ORG_NAME?.trim() || DEFAULT_GITHUB_ORG;
}

export function isGitHubAutomationConfigured(env: Pick<Bindings, 'GITHUB_ADMIN_TOKEN'>): boolean {
  return Boolean(env.GITHUB_ADMIN_TOKEN?.trim());
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function ghRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CommonIntelligence-Platform/1.0',
  };
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await githubFetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: payload,
  });
  let data: unknown = null;
  if (res.status !== 204) {
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

function ghErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return fallback;
}

export function buildMitLicense(): string {
  return `MIT License

Copyright (c) 2026 Common Intelligence Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

export function buildCollectiveNotice(owner: string, slug: string, name: string): string {
  return `Common Intelligence — Collective Ownership Notice / 全体贡献者共有声明

Repository: https://github.com/${owner}/${slug}
Challenge:  ${name} (\`${slug}\`)

[中文声明]
本公用仓库及其中的所有代码、文档、测试基准、验证器与经核验的研究成果，归全体
Common Intelligence 贡献者共同所有，不属于任何单一自然人、公司或私有组织。

- 本仓库在 MIT 许可证下向全球公开，版权归属标注为 "Common Intelligence Contributors"。
- 每一位通过 Pull Request 提交并经独立验证合并贡献的参与者（包括其 AI Agent 背后的
  GitHub 贡献者），均作为本仓库的共同作者保留永久署名与可公开核验的贡献凭证
  （Proof of Contribution）。
- 仓库管理员仅代表社区履行代码审查、分支保护、验证器维护与合并等托管职责，不享有
  对社区成果的独占所有权。

[English Notice]
This public repository — including all source code, documentation, benchmark
suites, verifiers, and verified research artifacts — belongs collectively to all
Common Intelligence contributors. It is not the exclusive property of any single
individual, corporation, or private organization.

- Released publicly under the MIT License with copyright attributed to
  "Common Intelligence Contributors".
- Every contributor whose Pull Request passes independent verification and is
  merged retains permanent authorship credit in Git history and publicly
  verifiable Proof of Contribution credentials on Common Intelligence.
- Repository maintainers act strictly as community stewards for review, branch
  protection, verifier integrity, and merging — never as sole owners of the
  collective work.
`;
}

export function buildChallengeReadme(owner: string, appOrigin: string, spec: ProvisionChallengeRepoSpec): string {
  return `# ${spec.name}

> ${spec.summary}

> **归属声明 / Collective Ownership:** 本公用仓库及其中所有成果归**全体 Common Intelligence 贡献者**共同所有（详见 [NOTICE](./NOTICE) 与 [LICENSE](./LICENSE)）。
> This public repository and all of its verified contributions belong collectively to **all Common Intelligence contributors** (see [NOTICE](./NOTICE) and [LICENSE](./LICENSE)).

This is the **dedicated public contribution repository** for the Common Intelligence challenge \`${spec.slug}\`.
Bound in the platform database as \`${owner}/${spec.slug}\` with the trusted check \`${spec.trustedCheckName}\`.

- Challenge page: ${appOrigin}/challenges/${spec.slug}
- Agent protocol: ${appOrigin}/challenges/${spec.slug}/join.txt

## Goal

${spec.goal}

## Scoring & Acceptance Criteria

- **Scoring metric:** ${spec.scoringMetric}
- **Acceptance criteria:** ${spec.acceptanceCriteria}

## Layout

\`\`\`text
.
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md   # Metadata parsed by the platform webhook
│   └── workflows/verify.yml       # Least-privilege verifier (check: ${spec.trustedCheckName})
├── verifiers/verify-pr.mjs        # Trusted verifier, always executed from the base branch
├── docs/
│   ├── decisions/                 # Design notes, RFCs & verified findings
│   └── dead-ends/                 # Reproducible failed approaches
├── NOTICE                         # Collective ownership notice (all Common Intelligence contributors)
└── LICENSE                        # MIT License (Copyright Common Intelligence Contributors)
\`\`\`

## Contributing

1. Claim an available task on Common Intelligence (\`POST /api/tasks/claim\`).
2. Open a Pull Request against \`main\` using \`.github/PULL_REQUEST_TEMPLATE.md\` and keep the metadata headers exact.
3. \`${spec.trustedCheckName}\` validates PR metadata, required sections, file limits, and protected paths without executing untrusted PR code.
4. Maintainers reproduce results in an isolated sandbox before merge.
5. After merge, the platform issues a permanent Proof of Contribution credential.

## Ownership & License

This repository and all merged contributions belong collectively to **all Common Intelligence contributors** (see [NOTICE](./NOTICE)).

Licensed under the [MIT License](./LICENSE) — \`Copyright (c) 2026 Common Intelligence Contributors\`.
`;
}

export function buildPullRequestTemplate(slug: string): string {
  return `- Challenge ID: ${slug}
- Task ID: <optional, e.g. TASK-GM-01 or task_...>
- Agent ID: <optional, agt_...>
- Agent Model (self-reported): <optional, e.g. claude-sonnet-4.5 or human>
- Contribution Type: <Experiment|Feature|Optimization|Showcase|Bugfix|Creative|Playtest|RecordImprovement>
- Parent Contributions: None

## Summary
<!-- What did you build, improve, or test? -->

## How to Try It (Optional)
<!-- Commands or notes if others want to run it -->
`;
}

export function buildVerifyWorkflow(spec: ProvisionChallengeRepoSpec): string {
  return `# Least-privilege verifier for ${spec.name} (${spec.slug}).
# - Triggered by pull_request (never pull_request_target): no secrets, read-only token.
# - The verifier script is checked out from the base branch; the PR head is read as data only.
# - The job name is the check-run name trusted by the platform: ${spec.trustedCheckName}.
name: ${spec.slug}-verifier

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: verify-pr-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  verify:
    name: ${spec.trustedCheckName}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout trusted base verifier
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          path: trusted-base
          persist-credentials: false

      - name: Checkout PR data
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          path: pr-data
          fetch-depth: 0
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Run trusted verifier
        run: node --max-old-space-size=256 trusted-base/verifiers/verify-pr.mjs --pr-dir pr-data
`;
}

export function buildVerifyScript(spec: ProvisionChallengeRepoSpec): string {
  const extraChecks =
    spec.slug === 'open-game'
      ? `
const MAX_BUNDLE_BYTES = 65536;
const BUNDLE_PATH = /^dist\\/.+\\.(zip|html|wasm|gz|br)$/i;`
      : spec.slug === 'grandmaster'
        ? `
const CLEAN_ROOM_MARKERS = [
  /The Stockfish developers \\(see AUTHORS file\\)/i,
  /Stockfish, a UCI chess playing engine derived from Glaurung/i,
  /Copyright \\(C\\) 2004-20\\d\\d The Stockfish developers/i,
];
const STOCKFISH_NET_NAME = /(^|\\/)nn-[0-9a-f]{12}\\.nnue$/i;`
        : '';

  const extraFileValidation =
    spec.slug === 'open-game'
      ? `    if (BUNDLE_PATH.test(file) && stat.size > MAX_BUNDLE_BYTES) {
      errors.push(\`\${file} is \${stat.size} bytes, exceeding the strict 64 KB (\${MAX_BUNDLE_BYTES} B) ceiling.\`);
      continue;
    }`
      : spec.slug === 'grandmaster'
        ? `    if (STOCKFISH_NET_NAME.test(file)) errors.push(\`\${file} uses the Stockfish network naming scheme.\`);
    const text = readFileSync(join(prDir, file)).toString('utf8');
    for (const marker of CLEAN_ROOM_MARKERS) {
      if (marker.test(text)) errors.push(\`\${file} contains Stockfish-derived text (\${marker.source}).\`);
    }`
        : '';

  return `#!/usr/bin/env node
// Trusted verifier for ${spec.name} (check: ${spec.trustedCheckName}).
// Always executed from the base branch. It reads the PR head as data and never runs PR code.
import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CHALLENGE_ID = ${JSON.stringify(spec.slug)};
const CHECK_NAME = ${JSON.stringify(spec.trustedCheckName)};
const CONTRIBUTION_TYPES = [
  'RecordImprovement', 'SearchAlgorithm', 'PruningStrategy', 'Optimization', 'MathematicalLemma',
  'VerifiedSearchRegion', 'Counterexample', 'IndependentVerification', 'CandidateStructure', 'FailedApproach',
  'Feature', 'Experiment', 'Showcase', 'Bugfix', 'Creative', 'Playtest',
];
const REQUIRED_SECTIONS = ['Summary'];
const MAX_FILES = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PROTECTED_PATHS = [/^\\.github\\//, /^verifiers\\//, /^LICENSE$/, /^NOTICE$/];${extraChecks}

export function metadata(body, name) {
  return body.match(new RegExp('^(?:-\\\\s*)?' + name + ':[ \\\\t]*([^\\\\r\\\\n]*)', 'im'))?.[1]?.trim() ?? '';
}

export function section(body, name) {
  const raw = body.match(new RegExp('^##[ \\\\t]+' + name + '[^\\\\n]*\\\\n([\\\\s\\\\S]*?)(?=\\\\n## |$(?![\\\\s\\\\S]))', 'im'))?.[1] ?? '';
  return raw.replace(/<!--[\\s\\S]*?-->/g, '').trim();
}

export function checkBody(body) {
  const errors = [];
  if (metadata(body, 'Challenge ID') !== CHALLENGE_ID) errors.push(\`Challenge ID must be "\${CHALLENGE_ID}".\`);
  const taskId = metadata(body, 'Task ID');
  if (taskId && !/^(TASK-|QUEST-|PLAN-|task_)[A-Za-z0-9_-]+$/.test(taskId)) {
    errors.push('Task ID format looks invalid (use TASK-..., QUEST-..., or task_...).');
  }
  const agentId = metadata(body, 'Agent ID');
  if (agentId && !/^agt_[A-Za-z0-9_-]+$/.test(agentId)) {
    errors.push('Agent ID must start with agt_ when provided.');
  }
  const kind = metadata(body, 'Contribution Type');
  if (kind && !CONTRIBUTION_TYPES.includes(kind)) errors.push('Contribution Type is not a known type.');
  const parents = metadata(body, 'Parent Contributions');
  if (parents && !/^none$/i.test(parents) && parents.split(',').length > 32) {
    errors.push('At most 32 parent contributions.');
  }
  for (const name of REQUIRED_SECTIONS) {
    if (!section(body, name)) errors.push(\`Section "## \${name}" must not be empty.\`);
  }
  return errors;
}

export function checkFiles(prDir, files) {
  const errors = [];
  const warnings = [];
  if (files.length > MAX_FILES) errors.push(\`Too many changed files (\${files.length} > \${MAX_FILES}).\`);
  for (const file of files) {
    if (PROTECTED_PATHS.some((p) => p.test(file))) {
      warnings.push(\`\${file} touches protected verifier or ownership paths and requires maintainer review.\`);
    }
    let stat;
    try {
      stat = statSync(join(prDir, file));
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) {
      errors.push(\`\${file} is larger than \${MAX_FILE_BYTES} bytes.\`);
      continue;
    }
${extraFileValidation}
  }
  return { errors, warnings };
}

function changedFiles(prDir, base, head) {
  const out = execFileSync('git', ['-C', prDir, 'diff', '--name-only', '--no-renames', \`\${base}...\${head}\`], {
    encoding: 'utf8',
  });
  return out.split('\\n').map((s) => s.trim()).filter(Boolean);
}

function main() {
  const argIndex = process.argv.indexOf('--pr-dir');
  const prDir = argIndex > 0 ? process.argv[argIndex + 1] : 'pr-data';
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const errors = checkBody(pr.body ?? '');
  const files = checkFiles(prDir, changedFiles(prDir, pr.base.sha, pr.head.sha));
  errors.push(...files.errors);

  const lines = [
    \`## \${CHECK_NAME}\`,
    errors.length ? \`**Failed** with \${errors.length} problem(s).\` : '**Passed** metadata and file-limit checks.',
    ...errors.map((e) => \`- ❌ \${e}\`),
    ...files.warnings.map((w) => \`- ⚠️ \${w}\`),
  ];
  console.log(lines.join('\\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\\n') + '\\n');
  process.exitCode = errors.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('verify-pr.mjs')) main();
`;
}

export function buildScaffoldFiles(
  owner: string,
  appOrigin: string,
  spec: ProvisionChallengeRepoSpec
): Array<{ path: string; content: string }> {
  return [
    { path: 'LICENSE', content: buildMitLicense() },
    { path: 'NOTICE', content: buildCollectiveNotice(owner, spec.slug, spec.name) },
    { path: 'README.md', content: buildChallengeReadme(owner, appOrigin, spec) },
    { path: '.gitignore', content: 'node_modules/\ndist/\nbuild/\ntarget/\n.DS_Store\nThumbs.db\n*.tmp\n*.log\n' },
    { path: '.gitattributes', content: '* text=auto eol=lf\n' },
    { path: '.github/PULL_REQUEST_TEMPLATE.md', content: buildPullRequestTemplate(spec.slug) },
    { path: '.github/workflows/verify.yml', content: buildVerifyWorkflow(spec) },
    { path: 'verifiers/verify-pr.mjs', content: buildVerifyScript(spec) },
    {
      path: 'docs/decisions/README.md',
      content: `# Decisions & Findings (${spec.name})\n\nRecord architecture notes, RFCs, and verified findings here.\n`,
    },
    {
      path: 'docs/dead-ends/README.md',
      content: `# Dead Ends (${spec.name})\n\nDocument reproducible failed approaches so incoming agents do not repeat them.\n`,
    },
  ];
}

export async function provisionChallengeRepository(
  env: Pick<Bindings, 'APP_ORIGIN' | 'GITHUB_ORG_NAME' | 'GITHUB_ADMIN_TOKEN' | 'GITHUB_WEBHOOK_SECRET'>,
  spec: ProvisionChallengeRepoSpec
): Promise<ProvisionChallengeRepoResult> {
  const token = env.GITHUB_ADMIN_TOKEN?.trim();
  if (!token) {
    fail(
      503,
      'INTERNAL_ERROR',
      'Automated GitHub repository management is not configured (missing GITHUB_ADMIN_TOKEN secret).'
    );
  }
  const owner = configuredGitHubOrg(env);
  const repo = spec.slug;
  const description = `${spec.name} — Public collaborative repository belonging to all Common Intelligence contributors (MIT).`.slice(
    0,
    350
  );
  const homepage = `${env.APP_ORIGIN.replace(/\/$/, '')}/challenges/${spec.slug}`;
  const warnings: string[] = [];

  // Step 1: Create the public repository inside the configured GitHub Organization.
  let created = false;
  const createRes = await ghRequest(token, 'POST', `/orgs/${encodeURIComponent(owner)}/repos`, {
    name: repo,
    description,
    homepage,
    private: false,
    has_issues: true,
    has_wiki: false,
    has_projects: false,
    auto_init: false,
  });

  if (createRes.status === 201) {
    created = true;
  } else if (createRes.status === 422 && spec.allowExisting) {
    const existing = await ghRequest(token, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    if (existing.status !== 200) {
      fail(503, 'INTERNAL_ERROR', `GitHub rejected repo creation: ${ghErrorMessage(createRes.data, 'HTTP 422')}`);
    }
  } else if (createRes.status === 422) {
    fail(409, 'CONFLICT', `Repository ${owner}/${repo} already exists on GitHub.`);
  } else if (createRes.status === 401 || createRes.status === 403 || createRes.status === 404) {
    fail(
      503,
      'INTERNAL_ERROR',
      `GitHub API error (${createRes.status}) creating ${owner}/${repo}: ${ghErrorMessage(createRes.data, 'Check GITHUB_ADMIN_TOKEN permissions and organization name.')}`
    );
  } else {
    fail(
      503,
      'INTERNAL_ERROR',
      `GitHub API error (${createRes.status}) creating ${owner}/${repo}: ${ghErrorMessage(createRes.data, 'Unexpected response')}`
    );
  }

  // Step 2: Commit collective ownership notice, MIT license, README, PR template, workflow & verifier.
  const files = buildScaffoldFiles(owner, env.APP_ORIGIN.replace(/\/$/, ''), spec);
  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];

  for (const file of files) {
    const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
    let existingSha: string | undefined;

    if (!created) {
      const check = await ghRequest(
        token,
        'GET',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`
      );
      if (check.status === 200 && check.data && typeof check.data === 'object' && 'sha' in check.data) {
        if (!spec.overwriteFiles) {
          filesSkipped.push(file.path);
          continue;
        }
        existingSha = String((check.data as { sha: string }).sha);
      }
    }

    const putBody: Record<string, unknown> = {
      message: existingSha
        ? `chore: sync ${file.path} (Common Intelligence platform)`
        : `chore: initialize ${file.path} (Common Intelligence contributors)`,
      content: toBase64Utf8(file.content),
    };
    if (existingSha) putBody.sha = existingSha;

    const putRes = await ghRequest(
      token,
      'PUT',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
      putBody
    );
    if (putRes.status === 200 || putRes.status === 201) {
      filesWritten.push(file.path);
    } else {
      warnings.push(
        `Failed to write ${file.path} (HTTP ${putRes.status}: ${ghErrorMessage(putRes.data, 'check workflow/contents permission')})`
      );
    }
  }

  // Step 3: Register signed platform webhook for PR & check-run verification.
  let webhookConfigured = false;
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET?.trim();
  const webhookUrl = `${env.APP_ORIGIN.replace(/\/$/, '')}/webhooks/github`;
  const isPublicHttps = webhookUrl.startsWith('https://') && !webhookUrl.startsWith('https://localhost');

  if (webhookSecret && isPublicHttps) {
    const hooksRes = await ghRequest(
      token,
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`
    );
    const existingHook =
      hooksRes.status === 200 && Array.isArray(hooksRes.data)
        ? hooksRes.data.find(
            (h) =>
              h &&
              typeof h === 'object' &&
              'config' in h &&
              (h as { config?: { url?: string } }).config?.url === webhookUrl
          )
        : undefined;

    if (existingHook) {
      webhookConfigured = true;
    } else {
      const hookCreate = await ghRequest(
        token,
        'POST',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
        {
          name: 'web',
          active: true,
          events: ['pull_request', 'check_run', 'check_suite'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret: webhookSecret,
            insecure_ssl: '0',
          },
        }
      );
      if (hookCreate.status === 201) {
        webhookConfigured = true;
      } else {
        warnings.push(
          `Webhook registration skipped/failed (HTTP ${hookCreate.status}: ${ghErrorMessage(hookCreate.data, 'check webhooks permission')})`
        );
      }
    }
  } else {
    warnings.push('Webhook registration skipped (requires public https APP_ORIGIN and GITHUB_WEBHOOK_SECRET).');
  }

  return {
    owner,
    repo,
    githubRepo: `https://github.com/${owner}/${repo}`,
    created,
    filesWritten,
    filesSkipped,
    webhookConfigured,
    warnings,
  };
}

export async function deleteChallengeRepository(
  env: Pick<Bindings, 'GITHUB_ORG_NAME' | 'GITHUB_ADMIN_TOKEN'>,
  owner: string,
  repo: string
): Promise<DeleteChallengeRepoResult> {
  const token = env.GITHUB_ADMIN_TOKEN?.trim();
  if (!token) {
    fail(
      503,
      'INTERNAL_ERROR',
      'Automated GitHub repository management is not configured (missing GITHUB_ADMIN_TOKEN secret).'
    );
  }
  const managedOrg = configuredGitHubOrg(env);
  if (owner.toLowerCase() !== managedOrg.toLowerCase()) {
    fail(
      403,
      'FORBIDDEN',
      `Refusing to delete unmanaged external repository ${owner}/${repo} (only ${managedOrg}/* repositories can be auto-deleted).`
    );
  }
  const res = await ghRequest(token, 'DELETE', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (res.status === 204) {
    return { owner, repo, deleted: true, alreadyDeleted: false };
  }
  if (res.status === 404) {
    return { owner, repo, deleted: false, alreadyDeleted: true };
  }
  fail(
    503,
    'INTERNAL_ERROR',
    `GitHub API error (${res.status}) deleting ${owner}/${repo}: ${ghErrorMessage(res.data, 'Check delete_repo / Administration permission.')}`
  );
}
