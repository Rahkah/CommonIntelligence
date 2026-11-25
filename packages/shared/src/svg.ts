// ============================================================================
// XML-Safe SVG Builders for Digital Certificates & GitHub Profile README Badges
// Strictly escapes all dynamic strings to prevent SVG/XSS script injection.
// ============================================================================

import type { Credential, UserProfileSummary } from './types';

/**
 * Escapes arbitrary untrusted strings for safe inclusion in XML/SVG text nodes
 * and attribute values, and removes ASCII control characters.
 */
export function escapeXml(raw: string): string {
  return String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/**
 * Generates an archival, publication-grade SVG Proof-of-Contribution Certificate.
 * Safe to serve from `/api/credentials/:id.svg` or download directly from the frontend.
 */
export function renderCredentialCertificateSvg(
  credential: Credential,
  options?: { publicOrigin?: string }
): string {
  const origin = options?.publicOrigin ?? 'https://commonintelligence.org';
  const verifyUrl = `${origin.replace(/\/$/, '')}/credentials/${credential.id}`;

  const statusColor =
    credential.status === 'Verified'
      ? '#0F766E'
      : credential.status === 'Revoked'
        ? '#B91C1C'
        : '#B45309';

  const title = escapeXml(truncateText(credential.contributionTitle.en, 68));
  const summaryLine1 = escapeXml(truncateText(credential.contributionSummary.en, 88));
  const summaryLine2 =
    credential.contributionSummary.en.length > 88
      ? escapeXml(truncateText(credential.contributionSummary.en.slice(88).trim(), 88))
      : '';
  const username = escapeXml(`@${credential.contributorUsername}`);
  const githubId = escapeXml(credential.contributorGithubId);
  const challengeName = escapeXml(credential.challengeName);
  const credId = escapeXml(credential.id);
  const taskId = escapeXml(credential.taskId);
  const commitSha = escapeXml(credential.commitSha.slice(0, 12));
  const verifierVersion = escapeXml(credential.verifierVersion);
  const issuedDate = escapeXml(credential.issuedAt.slice(0, 10));
  const statusText = escapeXml(credential.status.toUpperCase());
  const contributionType = escapeXml(credential.contributionType);
  const verifyUrlEscaped = escapeXml(verifyUrl);

  const demoWatermark = credential.isDemo
    ? `<g opacity="0.11" transform="translate(440 285) rotate(-18)">
        <text x="0" y="0" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="64" font-weight="700" fill="#B45309" letter-spacing="8">DEMO SPECIMEN</text>
      </g>`
    : '';

  const demoBanner = credential.isDemo
    ? `<rect x="652" y="42" width="176" height="24" rx="4" fill="#FEF3C7" stroke="#D97706" stroke-width="1"/>
       <text x="740" y="58" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11" font-weight="600" fill="#92400E">DEMO SAMPLE DATA</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 560" width="880" height="560" role="img" aria-label="Common Intelligence Proof of Contribution Certificate ${credId}">
  <defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#E7E5E4" stroke-width="0.6"/>
    </pattern>
  </defs>

  <!-- Archival paper base -->
  <rect width="880" height="560" fill="#FAFAF8"/>
  <rect x="20" y="20" width="840" height="520" fill="url(#grid)" opacity="0.42"/>
  <rect x="20" y="20" width="840" height="520" fill="none" stroke="#1C1917" stroke-width="1.5"/>
  <rect x="28" y="28" width="824" height="504" fill="none" stroke="#D6D3D1" stroke-width="1"/>

  ${demoWatermark}

  <!-- Top Header -->
  <g transform="translate(52, 46)">
    <!-- Minimalist Geometric Emblem -->
    <rect x="0" y="0" width="32" height="32" rx="4" fill="#111110"/>
    <circle cx="11" cy="11" r="2.2" fill="#FAFAF8"/>
    <circle cx="21" cy="11" r="2.2" fill="#FAFAF8"/>
    <circle cx="16" cy="21" r="2.6" fill="#2DD4BF"/>
    <line x1="11" y1="11" x2="21" y2="11" stroke="#FAFAF8" stroke-width="1.1"/>
    <line x1="11" y1="11" x2="16" y2="21" stroke="#2DD4BF" stroke-width="1.1"/>
    <line x1="21" y1="11" x2="16" y2="21" stroke="#2DD4BF" stroke-width="1.1"/>

    <text x="44" y="14" font-family="'Inter', system-ui, sans-serif" font-size="13" font-weight="600" fill="#111110" letter-spacing="1.2">COMMON INTELLIGENCE</text>
    <text x="44" y="30" font-family="'IBM Plex Mono', monospace" font-size="10.5" fill="#57534E">PROOF OF RESEARCH CONTRIBUTION</text>
  </g>

  ${demoBanner}

  <!-- Status Seal -->
  <g transform="translate(52, 102)">
    <rect x="0" y="0" width="112" height="24" rx="3" fill="${statusColor}"/>
    <text x="56" y="15.5" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="10.5" font-weight="600" fill="#FFFFFF" letter-spacing="1">${statusText}</text>
    <text x="126" y="16" font-family="'IBM Plex Mono', monospace" font-size="11" fill="#57534E">${challengeName} · ${contributionType}</text>
  </g>

  <!-- Main Contribution Title -->
  <text x="52" y="170" font-family="'Newsreader', Georgia, serif" font-size="28" font-weight="600" fill="#111110">${title}</text>
  <text x="52" y="202" font-family="'Inter', system-ui, sans-serif" font-size="13.5" fill="#44403C">${summaryLine1}</text>
  ${summaryLine2 ? `<text x="52" y="222" font-family="'Inter', system-ui, sans-serif" font-size="13.5" fill="#44403C">${summaryLine2}</text>` : ''}

  <!-- Divider -->
  <line x1="52" y1="250" x2="828" y2="250" stroke="#D6D3D1" stroke-width="1"/>

  <!-- Recipient Block -->
  <text x="52" y="280" font-family="'IBM Plex Mono', monospace" font-size="10" fill="#78716C" letter-spacing="1">AWARDED TO CONTRIBUTOR</text>
  <text x="52" y="308" font-family="'Inter', system-ui, sans-serif" font-size="22" font-weight="600" fill="#111110">${username}</text>
  <text x="52" y="328" font-family="'IBM Plex Mono', monospace" font-size="11.5" fill="#57534E">GitHub User ID: ${githubId}</text>

  <!-- Archival Verification Seal on Right -->
  <g transform="translate(756, 304)">
    <circle cx="0" cy="0" r="44" fill="none" stroke="${statusColor}" stroke-width="1.5"/>
    <circle cx="0" cy="0" r="38" fill="none" stroke="${statusColor}" stroke-width="0.7" stroke-dasharray="3 2"/>
    <text x="0" y="-6" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="9" font-weight="600" fill="${statusColor}" letter-spacing="1.2">VERIFIED</text>
    <text x="0" y="9" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="10" fill="#111110">${issuedDate}</text>
    <text x="0" y="23" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="8" fill="#57534E">OPEN LEDGER</text>
  </g>

  <!-- Structured Verification Ledger Grid -->
  <rect x="52" y="356" width="776" height="114" rx="4" fill="#F5F5F2" stroke="#E5E5E0" stroke-width="1"/>

  <text x="72" y="382" font-family="'IBM Plex Mono', monospace" font-size="9.5" fill="#78716C">CREDENTIAL ID</text>
  <text x="72" y="400" font-family="'IBM Plex Mono', monospace" font-size="12" font-weight="600" fill="#111110">${credId}</text>

  <text x="330" y="382" font-family="'IBM Plex Mono', monospace" font-size="9.5" fill="#78716C">TASK ID</text>
  <text x="330" y="400" font-family="'IBM Plex Mono', monospace" font-size="12" font-weight="600" fill="#111110">${taskId}</text>

  <text x="570" y="382" font-family="'IBM Plex Mono', monospace" font-size="9.5" fill="#78716C">MERGE COMMIT SHA</text>
  <text x="570" y="400" font-family="'IBM Plex Mono', monospace" font-size="12" font-weight="600" fill="#111110">${commitSha}</text>

  <text x="72" y="434" font-family="'IBM Plex Mono', monospace" font-size="9.5" fill="#78716C">VERIFIER VERSION</text>
  <text x="72" y="452" font-family="'IBM Plex Mono', monospace" font-size="11.5" fill="#292524">${verifierVersion}</text>

  <text x="330" y="434" font-family="'IBM Plex Mono', monospace" font-size="9.5" fill="#78716C">ISSUED DATE (UTC)</text>
  <text x="330" y="452" font-family="'IBM Plex Mono', monospace" font-size="11.5" fill="#292524">${issuedDate}</text>

  <text x="570" y="434" font-family="'IBM Plex Mono', monospace" font-size="9.5" fill="#78716C">PLATFORM HONORS</text>
  <text x="570" y="452" font-family="'IBM Plex Mono', monospace" font-size="11.5" fill="#292524">Common Intelligence</text>

  <!-- Footer -->
  <text x="52" y="502" font-family="'IBM Plex Mono', monospace" font-size="10" fill="#57534E">Public Verification: ${verifyUrlEscaped}</text>
  <text x="828" y="502" text-anchor="end" font-family="'Newsreader', Georgia, serif" font-style="italic" font-size="12.5" fill="#44403C">One problem. Thousands of minds.</text>
</svg>`;
}

/**
 * Generates an XML-escaped SVG badge for embedding in GitHub Profile READMEs:
 * /api/badges/:githubId.svg
 * Explicitly branded as Common Intelligence (never imitating GitHub official achievements).
 */
export function renderContributorReadmeBadgeSvg(
  user: Pick<UserProfileSummary, 'username' | 'verifiedContributionsCount' | 'badgesCount' | 'isDemo'>,
  topHonorLabel?: string
): string {
  const handle = escapeXml(`@${truncateText(user.username, 22)}`);
  const honor = escapeXml(
    truncateText(
      topHonorLabel ??
        `${user.verifiedContributionsCount} verified ${user.verifiedContributionsCount === 1 ? 'contribution' : 'contributions'}`,
      36
    )
  );
  const demoTag = user.isDemo ? ' [DEMO]' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="56" viewBox="0 0 420 56" role="img" aria-label="Common Intelligence Contributor ${handle}">
  <rect x="0.5" y="0.5" width="419" height="55" rx="6" fill="#111110" stroke="#292524"/>
  <rect x="12" y="12" width="32" height="32" rx="4" fill="#0F766E"/>
  <circle cx="23" cy="23" r="2" fill="#FAFAF8"/>
  <circle cx="33" cy="23" r="2" fill="#FAFAF8"/>
  <circle cx="28" cy="33" r="2.4" fill="#99F6E4"/>
  <line x1="23" y1="23" x2="33" y2="23" stroke="#FAFAF8" stroke-width="1"/>
  <line x1="23" y1="23" x2="28" y2="33" stroke="#99F6E4" stroke-width="1"/>
  <line x1="33" y1="23" x2="28" y2="33" stroke="#99F6E4" stroke-width="1"/>

  <text x="56" y="24" font-family="'Inter', system-ui, sans-serif" font-size="11" font-weight="600" fill="#A8A29E" letter-spacing="0.6">COMMON INTELLIGENCE${demoTag}</text>
  <text x="56" y="42" font-family="'IBM Plex Mono', monospace" font-size="12.5" font-weight="600" fill="#FAFAF8">${handle} · ${honor}</text>
</svg>`;
}
