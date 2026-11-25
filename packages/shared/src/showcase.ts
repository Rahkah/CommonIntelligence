import type {
  LocalizedText,
  ProjectShowcase,
  ShowcaseBuildSpec,
  ShowcaseKind,
  ShowcaseMetric,
  ShowcaseReplayItem,
} from './types';

export const SHOWCASE_SCHEMA_VERSION = 1 as const;
export const SHOWCASE_MANIFEST_PATH = '.common-intelligence/showcase.json';
export const SHOWCASE_KINDS = [
  'chess-trainer',
  'interactive-app',
  'visualization',
  'game',
  'embed',
  'link',
  'replay',
  'metrics',
  'pending',
] as const;

/** Safe iframe sandbox flags; `allow-same-origin` is intentionally forbidden to prevent cookie/token access. */
export const ALLOWED_SANDBOX_PERMISSIONS = [
  'allow-scripts',
  'allow-pointer-lock',
  'allow-forms',
  'allow-downloads',
] as const;

export type ShowcaseValidationResult =
  | { data: ProjectShowcase }
  | { error: string };

export function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1000) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !!parsed.hostname;
  } catch {
    return false;
  }
}

export function isSafeDataEndpoint(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1000) return false;
  if (trimmed.startsWith('/api/')) return true;
  return isSafeHttpsUrl(trimmed);
}

function normalizeLocalized(value: unknown, maxLen: number): LocalizedText | null {
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t.length > maxLen) return null;
    return { en: t, zh: t };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const en = typeof rec.en === 'string' ? rec.en.trim() : '';
    const zh = typeof rec.zh === 'string' ? rec.zh.trim() : '';
    const finalEn = en || zh;
    const finalZh = zh || en;
    if (!finalEn || finalEn.length > maxLen || finalZh.length > maxLen) return null;
    return { en: finalEn, zh: finalZh };
  }
  return null;
}

const METRIC_TONES = new Set(['neutral', 'accent', 'success', 'warning']);
const REFRESH_MODES = new Set(['none', 'poll', 'sse']);
const EMBED_KINDS = new Set<ShowcaseKind>(['embed', 'interactive-app', 'visualization', 'game']);

export function sanitizeSandboxPermissions(input: unknown): string[] | null {
  if (input === undefined || input === null) return ['allow-scripts', 'allow-pointer-lock'];
  if (!Array.isArray(input) || input.length > 6) return null;
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') return null;
    const token = item.trim();
    if (!(ALLOWED_SANDBOX_PERMISSIONS as readonly string[]).includes(token)) {
      return null;
    }
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

export function validateShowcaseManifest(
  raw: unknown,
  fallbackManifestPath = SHOWCASE_MANIFEST_PATH
): ShowcaseValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Showcase manifest must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== SHOWCASE_SCHEMA_VERSION) {
    return { error: `Showcase manifest requires schemaVersion ${SHOWCASE_SCHEMA_VERSION}.` };
  }
  if (typeof obj.kind !== 'string' || !(SHOWCASE_KINDS as readonly string[]).includes(obj.kind)) {
    return { error: 'Invalid showcase kind.' };
  }
  const kind = obj.kind as ShowcaseKind;

  const title = normalizeLocalized(obj.title, 180);
  if (!title) return { error: 'Missing or invalid showcase title.' };

  const visualizationGoal = normalizeLocalized(obj.visualizationGoal, 1200);
  if (!visualizationGoal) return { error: 'Missing or invalid visualizationGoal.' };

  const status =
    obj.status === 'live' || obj.status === 'pending'
      ? obj.status
      : kind === 'pending'
        ? 'pending'
        : 'live';

  const rawEmbed = obj.embedUrl ?? obj.entry;
  let embedUrl: string | undefined;
  if (rawEmbed !== undefined && rawEmbed !== null && rawEmbed !== '') {
    if (!isSafeHttpsUrl(rawEmbed)) {
      return { error: 'embedUrl / entry must be a valid https:// URL.' };
    }
    embedUrl = rawEmbed.trim();
  }
  if (EMBED_KINDS.has(kind) && status === 'live' && !embedUrl && !obj.launchUrl) {
    return { error: `Live ${kind} showcase requires a valid https:// embedUrl or launchUrl.` };
  }

  let launchUrl: string | undefined;
  if (obj.launchUrl !== undefined && obj.launchUrl !== null && obj.launchUrl !== '') {
    if (!isSafeHttpsUrl(obj.launchUrl)) {
      return { error: 'launchUrl must be a valid https:// URL.' };
    }
    launchUrl = obj.launchUrl.trim();
  }
  if (kind === 'link' && status === 'live' && !launchUrl) {
    return { error: 'Live link showcase requires a valid https:// launchUrl.' };
  }

  let dataEndpoint: string | undefined;
  if (obj.dataEndpoint !== undefined && obj.dataEndpoint !== null && obj.dataEndpoint !== '') {
    if (!isSafeDataEndpoint(obj.dataEndpoint)) {
      return { error: 'dataEndpoint must be an https:// URL or relative /api/ path.' };
    }
    dataEndpoint = obj.dataEndpoint.trim();
  }

  let refreshMode: ProjectShowcase['refreshMode'];
  if (obj.refreshMode !== undefined && obj.refreshMode !== null) {
    if (typeof obj.refreshMode !== 'string' || !REFRESH_MODES.has(obj.refreshMode)) {
      return { error: 'refreshMode must be none, poll, or sse.' };
    }
    refreshMode = obj.refreshMode as ProjectShowcase['refreshMode'];
  }

  const permissions = sanitizeSandboxPermissions(obj.permissions);
  if (!permissions) {
    return {
      error: `permissions may only include ${ALLOWED_SANDBOX_PERMISSIONS.join(', ')} (allow-same-origin is forbidden).`,
    };
  }

  let launchLabel: LocalizedText | undefined;
  if (obj.launchLabel !== undefined && obj.launchLabel !== null) {
    const normalized = normalizeLocalized(obj.launchLabel, 120);
    if (!normalized) return { error: 'Invalid launchLabel.' };
    launchLabel = normalized;
  }

  let embedHeight: number | undefined;
  if (obj.embedHeight !== undefined && obj.embedHeight !== null) {
    if (typeof obj.embedHeight !== 'number' || !Number.isFinite(obj.embedHeight)) {
      return { error: 'embedHeight must be a number.' };
    }
    embedHeight = Math.max(280, Math.min(900, Math.round(obj.embedHeight)));
  }

  let version: string | undefined;
  if (obj.version !== undefined && obj.version !== null) {
    if (typeof obj.version !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(obj.version.trim())) {
      return { error: 'Invalid showcase version.' };
    }
    version = obj.version.trim();
  }

  let commitSha: string | undefined;
  if (obj.commitSha !== undefined && obj.commitSha !== null && obj.commitSha !== '') {
    if (typeof obj.commitSha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(obj.commitSha.trim())) {
      return { error: 'commitSha must be a 7-40 character hex SHA.' };
    }
    commitSha = obj.commitSha.trim().toLowerCase();
  }

  let prUrl: string | undefined;
  if (obj.prUrl !== undefined && obj.prUrl !== null && obj.prUrl !== '') {
    if (!isSafeHttpsUrl(obj.prUrl)) return { error: 'prUrl must be a valid https:// URL.' };
    prUrl = obj.prUrl.trim();
  }

  let build: ShowcaseBuildSpec | undefined;
  if (obj.build !== undefined && obj.build !== null) {
    if (typeof obj.build !== 'object' || Array.isArray(obj.build)) {
      return { error: 'build must be an object.' };
    }
    const b = obj.build as Record<string, unknown>;
    build = {
      ...(typeof b.command === 'string' && b.command.trim().length <= 200 ? { command: b.command.trim() } : {}),
      ...(typeof b.workflow === 'string' && b.workflow.trim().length <= 160 ? { workflow: b.workflow.trim() } : {}),
      ...(typeof b.publishTarget === 'string' && b.publishTarget.trim().length <= 200
        ? { publishTarget: b.publishTarget.trim() }
        : {}),
    };
  }

  let metrics: ShowcaseMetric[] | undefined;
  if (obj.metrics !== undefined && obj.metrics !== null) {
    if (!Array.isArray(obj.metrics) || obj.metrics.length > 8) {
      return { error: 'metrics must be an array of at most 8 items.' };
    }
    metrics = [];
    for (const item of obj.metrics) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { error: 'Invalid metric entry.' };
      }
      const m = item as Record<string, unknown>;
      const label = normalizeLocalized(m.label, 80);
      const val = typeof m.value === 'string' ? m.value.trim() : '';
      if (!label || !val || val.length > 80) {
        return { error: 'Each metric requires label and value (<= 80 chars).' };
      }
      const delta =
        typeof m.delta === 'string' && m.delta.trim().length <= 60 ? m.delta.trim() : undefined;
      const tone =
        typeof m.tone === 'string' && METRIC_TONES.has(m.tone)
          ? (m.tone as ShowcaseMetric['tone'])
          : 'neutral';
      metrics.push({ label, value: val, delta, tone });
    }
  }

  let replays: ShowcaseReplayItem[] | undefined;
  if (obj.replays !== undefined && obj.replays !== null) {
    if (!Array.isArray(obj.replays) || obj.replays.length > 20) {
      return { error: 'replays must be an array of at most 20 items.' };
    }
    replays = [];
    for (const item of obj.replays) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { error: 'Invalid replay entry.' };
      }
      const r = item as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id.trim() : '';
      const rTitle = normalizeLocalized(r.title, 140);
      if (!id || id.length > 80 || !rTitle) return { error: 'Each replay requires id and title.' };
      const summary = r.summary ? normalizeLocalized(r.summary, 300) ?? undefined : undefined;
      let url: string | undefined;
      if (r.url !== undefined && r.url !== null && r.url !== '') {
        if (!isSafeHttpsUrl(r.url)) return { error: 'Replay url must be https://.' };
        url = r.url.trim();
      }
      const recordedAt =
        typeof r.recordedAt === 'string' && r.recordedAt.trim().length <= 40
          ? r.recordedAt.trim()
          : undefined;
      replays.push({ id, title: rTitle, summary, url, recordedAt });
    }
  }

  const repoManifestPath =
    typeof obj.repoManifestPath === 'string' &&
    /^[a-zA-Z0-9._/-]{3,160}\.json$/.test(obj.repoManifestPath.trim())
      ? obj.repoManifestPath.trim()
      : fallbackManifestPath;

  const updatedAt =
    typeof obj.updatedAt === 'string' && obj.updatedAt.trim().length <= 40
      ? obj.updatedAt.trim()
      : undefined;

  const config =
    obj.config && typeof obj.config === 'object' && !Array.isArray(obj.config)
      ? (obj.config as Record<string, unknown>)
      : undefined;

  const data: ProjectShowcase = {
    schemaVersion: SHOWCASE_SCHEMA_VERSION,
    kind,
    title,
    visualizationGoal,
    status,
    repoManifestPath,
    ...(version ? { version } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(embedUrl ? { embedUrl } : {}),
    ...(launchUrl ? { launchUrl } : {}),
    ...(launchLabel ? { launchLabel } : {}),
    ...(embedHeight ? { embedHeight } : {}),
    ...(dataEndpoint ? { dataEndpoint } : {}),
    ...(refreshMode ? { refreshMode } : {}),
    permissions,
    ...(build ? { build } : {}),
    ...(metrics && metrics.length > 0 ? { metrics } : {}),
    ...(replays && replays.length > 0 ? { replays } : {}),
    ...(config ? { config } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };

  return { data };
}

export function createDefaultPendingShowcase(
  projectName: string,
  visualizationGoal?: LocalizedText
): ProjectShowcase {
  return {
    schemaVersion: SHOWCASE_SCHEMA_VERSION,
    kind: 'pending',
    status: 'pending',
    title: {
      en: `${projectName} Live Showcase`,
      zh: `${projectName} 实时成果展示区`,
    },
    visualizationGoal: visualizationGoal ?? {
      en: 'This project is waiting for its first contributor. The first agent claiming the Phase 0 Foundation task defines the initial architecture, runnable baseline, and repository-driven showcase (.common-intelligence/showcase.json).',
      zh: 'This project is waiting for its first contributor. 首位认领 Phase 0 初始化任务的社区 Agent 将自主确定技术方案、建立最小可运行基线，并在仓库中接入 .common-intelligence/showcase.json 成果展示页面。',
    },
    repoManifestPath: SHOWCASE_MANIFEST_PATH,
    permissions: ['allow-scripts', 'allow-pointer-lock'],
    source: 'default',
  };
}
