import { describe, expect, it } from 'vitest';
import {
  SHOWCASE_MANIFEST_PATH,
  createDefaultPendingShowcase,
  validateShowcaseManifest,
} from './showcase';

describe('Project showcase manifest validation', () => {
  it('accepts a valid chess-trainer manifest with version, commitSha, build, and metrics', () => {
    const res = validateShowcaseManifest({
      schemaVersion: 1,
      kind: 'chess-trainer',
      version: '0.1.0',
      commitSha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      title: 'Grandmaster-CI Phase 0 Arena',
      visualizationGoal: 'Visualize real engine matches, evaluations, and Elo history.',
      dataEndpoint: '/api/challenges/grandmaster/showcase',
      refreshMode: 'poll',
      build: {
        command: 'pnpm --filter @common-intelligence/grandmaster-engine test',
        workflow: '.github/workflows/showcase-publish.yml',
      },
      metrics: [{ label: 'Baseline Elo', value: '1,850', tone: 'accent' }],
    });
    expect('data' in res).toBe(true);
    if ('data' in res) {
      expect(res.data.kind).toBe('chess-trainer');
      expect(res.data.status).toBe('live');
      expect(res.data.version).toBe('0.1.0');
      expect(res.data.repoManifestPath).toBe(SHOWCASE_MANIFEST_PATH);
      expect(res.data.permissions).toEqual(['allow-scripts', 'allow-pointer-lock']);
    }
  });

  it('accepts a valid https interactive-app / game embed showcase', () => {
    const res = validateShowcaseManifest({
      schemaVersion: 1,
      kind: 'game',
      status: 'live',
      version: '0.2.0',
      title: { en: 'Playable Web Build', zh: '在线试玩窗口' },
      visualizationGoal: { en: 'Play directly in isolated iframe.', zh: '在隔离沙箱窗口直接试玩。' },
      embedUrl: 'https://common-intelligence.github.io/demo-app/',
      launchUrl: 'https://common-intelligence.github.io/demo-app/',
      embedHeight: 520,
      permissions: ['allow-scripts', 'allow-pointer-lock'],
    });
    expect('data' in res).toBe(true);
  });

  it('rejects allow-same-origin and unsafe javascript:, data:, and http: URLs', () => {
    const unsafeSandbox = validateShowcaseManifest({
      schemaVersion: 1,
      kind: 'embed',
      status: 'live',
      title: 'Unsafe',
      visualizationGoal: 'Unsafe',
      embedUrl: 'https://example.com/app',
      permissions: ['allow-scripts', 'allow-same-origin'],
    });
    expect('error' in unsafeSandbox).toBe(true);

    for (const badUrl of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://insecure.example.com/game',
    ]) {
      const res = validateShowcaseManifest({
        schemaVersion: 1,
        kind: 'embed',
        status: 'live',
        title: 'Bad',
        visualizationGoal: 'Bad',
        embedUrl: badUrl,
      });
      expect('error' in res).toBe(true);
    }
  });

  it('creates a clean default pending showcase waiting for first contributor', () => {
    const pending = createDefaultPendingShowcase('Open Game');
    expect(pending.kind).toBe('pending');
    expect(pending.status).toBe('pending');
    expect(pending.visualizationGoal.en).toContain('This project is waiting for its first contributor.');
    expect(pending.repoManifestPath).toBe(SHOWCASE_MANIFEST_PATH);
  });
});
