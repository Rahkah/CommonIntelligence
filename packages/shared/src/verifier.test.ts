import { describe, expect, it } from 'vitest';
import {
  KNOWN_SUPERPERMUTATION_BOUNDS,
  SAMPLE_SUPERPERMUTATIONS,
  escapeXml,
  renderContributorReadmeBadgeSvg,
  renderCredentialCertificateSvg,
  verifySuperpermutation,
  type Credential,
} from './index';

describe('verifySuperpermutation', () => {
  it('verifies built-in optimal superpermutations for n=1..4', () => {
    for (const n of [1, 2, 3, 4] as const) {
      const result = verifySuperpermutation(SAMPLE_SUPERPERMUTATIONS[n]!, n);
      expect(result.valid).toBe(true);
      expect(result.missingPermutationsCount).toBe(0);
      expect(result.foundPermutations).toBe(KNOWN_SUPERPERMUTATION_BOUNDS[n]!.factorial);
      expect(result.candidateLength).toBe(KNOWN_SUPERPERMUTATION_BOUNDS[n]!.bestKnownLength);
      expect(result.improvesBestKnown).toBe(false);
    }
  });

  it('strips whitespace before verifying', () => {
    const result = verifySuperpermutation('123\n 121 \t321', 3);
    expect(result.valid).toBe(true);
    expect(result.candidateLength).toBe(9);
  });

  it('detects missing permutations accurately', () => {
    const result = verifySuperpermutation('12312132', 3);
    expect(result.valid).toBe(false);
    expect(result.foundPermutations).toBe(5);
    expect(result.missingPermutationsCount).toBe(1);
    expect(result.sampleMissingPermutations).toContain('321');
  });

  it('rejects symbols outside the allowed alphabet', () => {
    const result = verifySuperpermutation('1234121321', 3);
    expect(result.valid).toBe(false);
    expect(result.invalidCharacters).toEqual(['4']);
    expect(result.error).toMatch(/outside allowed alphabet/);
  });

  it('flags improvement over bestKnownOverride when strictly shorter', () => {
    const result = verifySuperpermutation(SAMPLE_SUPERPERMUTATIONS[3]!, 3, {
      bestKnownOverride: 10,
    });
    expect(result.valid).toBe(true);
    expect(result.improvesBestKnown).toBe(true);
    expect(result.deltaFromBestKnown).toBe(-1);
  });

  it('records verified n=7 bounds (5905 upper, 5884 lower)', () => {
    const n7 = KNOWN_SUPERPERMUTATION_BOUNDS[7]!;
    expect(n7.factorial).toBe(5040);
    expect(n7.bestKnownLength).toBe(5905);
    expect(n7.provenLowerBound).toBe(5884);
  });

  it('rejects out-of-range symbol count', () => {
    const result = verifySuperpermutation('123', 8);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/between 1 and 7/);
  });
});

describe('SVG escaping & builders', () => {
  it('escapes XML special characters and strips control chars to prevent XSS', () => {
    const payload = '<script>alert("xss")</script>&\'\x00';
    const escaped = escapeXml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#39;');
  });

  it('escapes untrusted contributor fields inside rendered certificate and badge SVG', () => {
    const mockCred: Credential = {
      id: 'ci-cred-xss-test',
      status: 'Verified',
      contributorGithubId: '99999',
      contributorUsername: 'alice"><script>alert(1)</script>',
      contributorAvatarUrl: 'https://example.com/a.png',
      contributorProfileUrl: 'https://github.com/alice',
      challengeId: 'project-5904',
      challengeSlug: 'project-5904',
      challengeName: 'Project 5904',
      contributionId: 'contrib-1',
      contributionTitle: { en: 'Test <img onerror=alert(1)>', zh: '测试' },
      contributionType: 'PruningStrategy',
      contributionSummary: { en: 'Summary & verification', zh: '摘要' },
      taskId: 'TASK-001',
      prUrl: 'https://github.com/common-intelligence/project-5904/pull/1',
      commitSha: 'abcdef1234567890',
      verificationRunId: 'run-1',
      verificationSummary: { en: 'Passed', zh: '通过' },
      verifierVersion: 'superperm-verifier-v1.0.0',
      issuedAt: '2026-11-20T00:00:00Z',
      parentContributionIds: [],
      badgesAwarded: ['first_discovery'],
      isDemo: true,
    };

    const certSvg = renderCredentialCertificateSvg(mockCred);
    expect(certSvg).not.toContain('<script>');
    expect(certSvg).not.toContain('<img');
    expect(certSvg).toContain('DEMO SPECIMEN');
    expect(certSvg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');

    const badgeSvg = renderContributorReadmeBadgeSvg({
      username: 'bob<script>',
      verifiedContributionsCount: 3,
      badgesCount: 2,
      isDemo: true,
    });
    expect(badgeSvg).not.toContain('<script>');
    expect(badgeSvg).toContain('COMMON INTELLIGENCE [DEMO]');
  });
});
