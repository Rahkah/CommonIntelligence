// ============================================================================
// Independent Superpermutation Verifier (n = 1..7)
// Pure TypeScript, zero external dependencies, deterministic & side-effect free.
// Used both in the browser UI (Project 5904 interactive verifier) and as the
// reference specification for the GitHub Actions verification script.
// ============================================================================

export const VERIFIER_VERSION = 'superperm-verifier-v1.0.0';

export interface KnownSuperpermutationBound {
  n: number;
  factorial: number;
  bestKnownLength: number;
  provenLowerBound: number;
  isOptimalProven: boolean;
  attribution: string;
}

export const KNOWN_SUPERPERMUTATION_BOUNDS: Record<number, KnownSuperpermutationBound> = {
  1: {
    n: 1,
    factorial: 1,
    bestKnownLength: 1,
    provenLowerBound: 1,
    isOptimalProven: true,
    attribution: 'Exact (trivial)',
  },
  2: {
    n: 2,
    factorial: 2,
    bestKnownLength: 3,
    provenLowerBound: 3,
    isOptimalProven: true,
    attribution: 'Exact (trivial)',
  },
  3: {
    n: 3,
    factorial: 6,
    bestKnownLength: 9,
    provenLowerBound: 9,
    isOptimalProven: true,
    attribution: 'Exact (Ashlock & Tillotson, 1993)',
  },
  4: {
    n: 4,
    factorial: 24,
    bestKnownLength: 33,
    provenLowerBound: 33,
    isOptimalProven: true,
    attribution: 'Exact (Johnston, 2013)',
  },
  5: {
    n: 5,
    factorial: 120,
    bestKnownLength: 153,
    provenLowerBound: 153,
    isOptimalProven: true,
    attribution: 'Exact (Houston, 2014 / SAT verified)',
  },
  6: {
    n: 6,
    factorial: 720,
    bestKnownLength: 872,
    provenLowerBound: 872,
    isOptimalProven: false,
    attribution: 'Robin Houston (2014); conjectured optimal, lower bound under ongoing study',
  },
  7: {
    n: 7,
    factorial: 5040,
    bestKnownLength: 5905,
    provenLowerBound: 5884,
    isOptimalProven: false,
    attribution: 'Upper bound 5,905 (Andrei Teodorescu, Aug 17, 2026); Lower bound 5,884 (Anonymous / Houston, Pantone, Vatter 2018)',
  },
};

export interface SuperpermutationVerificationResult {
  valid: boolean;
  verifierVersion: string;
  n: number;
  allowedAlphabet: string;
  candidateLength: number;
  expectedPermutations: number;
  foundPermutations: number;
  missingPermutationsCount: number;
  sampleMissingPermutations: string[];
  invalidCharacters: string[];
  currentBestKnown: number | null;
  provenLowerBound: number | null;
  improvesBestKnown: boolean;
  deltaFromBestKnown: number | null;
  belowProvenLowerBoundWarning: boolean;
  elapsedMs: number;
  error?: string;
}

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040];

/**
 * Converts a permutation of 0..(n-1) into its unique Lehmer rank in [0, n! - 1].
 */
function lehmerRank(digits: Int8Array, n: number): number {
  let rank = 0;
  for (let i = 0; i < n; i++) {
    let smallerOnRight = 0;
    const current = digits[i]!;
    for (let j = i + 1; j < n; j++) {
      if (digits[j]! < current) {
        smallerOnRight++;
      }
    }
    rank += smallerOnRight * FACTORIALS[n - 1 - i]!;
  }
  return rank;
}

/**
 * Reconstructs a 1-indexed symbol permutation string from its Lehmer rank.
 */
function unrankLehmer(rank: number, n: number): string {
  const pool: number[] = [];
  for (let i = 1; i <= n; i++) pool.push(i);
  let rem = rank;
  let out = '';
  for (let i = n - 1; i >= 0; i--) {
    const f = FACTORIALS[i]!;
    const idx = Math.floor(rem / f);
    rem %= f;
    out += String(pool.splice(idx, 1)[0]);
  }
  return out;
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}

/**
 * Independently verifies whether `rawInput` (whitespace stripped) is a valid
 * superpermutation on `n` symbols ('1'..'n', for 1 <= n <= 7).
 */
export function verifySuperpermutation(
  rawInput: string,
  n: number,
  options?: { maxMissingSamples?: number; bestKnownOverride?: number }
): SuperpermutationVerificationResult {
  const start = nowMs();
  const maxMissingSamples = options?.maxMissingSamples ?? 8;

  if (!Number.isInteger(n) || n < 1 || n > 7) {
    return {
      valid: false,
      verifierVersion: VERIFIER_VERSION,
      n,
      allowedAlphabet: '',
      candidateLength: 0,
      expectedPermutations: 0,
      foundPermutations: 0,
      missingPermutationsCount: 0,
      sampleMissingPermutations: [],
      invalidCharacters: [],
      currentBestKnown: null,
      provenLowerBound: null,
      improvesBestKnown: false,
      deltaFromBestKnown: null,
      belowProvenLowerBoundWarning: false,
      elapsedMs: 0,
      error: 'Symbol count n must be an integer between 1 and 7.',
    };
  }

  const cleaned = rawInput.replace(/\s+/g, '');
  const allowedAlphabet = '1234567'.slice(0, n);
  const expectedPermutations = FACTORIALS[n]!;
  const bound = KNOWN_SUPERPERMUTATION_BOUNDS[n];
  const bestKnown = options?.bestKnownOverride ?? bound?.bestKnownLength ?? null;
  const provenLowerBound = bound?.provenLowerBound ?? null;

  // Hard cap to prevent browser / CI DoS on absurdly large strings
  const maxAllowedInputLength = 100_000;
  if (cleaned.length > maxAllowedInputLength) {
    return {
      valid: false,
      verifierVersion: VERIFIER_VERSION,
      n,
      allowedAlphabet,
      candidateLength: cleaned.length,
      expectedPermutations,
      foundPermutations: 0,
      missingPermutationsCount: expectedPermutations,
      sampleMissingPermutations: [],
      invalidCharacters: [],
      currentBestKnown: bestKnown,
      provenLowerBound,
      improvesBestKnown: false,
      deltaFromBestKnown: bestKnown !== null ? cleaned.length - bestKnown : null,
      belowProvenLowerBoundWarning: false,
      elapsedMs: 0,
      error: `Input exceeds maximum verifier length of ${maxAllowedInputLength} symbols.`,
    };
  }

  // 1. Validate symbol alphabet strictly
  const invalidSet = new Set<string>();
  const codes = new Int8Array(cleaned.length);
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    const digit = ch.charCodeAt(0) - 49; // '1' -> 0
    if (digit < 0 || digit >= n) {
      invalidSet.add(ch);
    } else {
      codes[i] = digit;
    }
  }

  if (invalidSet.size > 0) {
    const elapsed = nowMs() - start;
    return {
      valid: false,
      verifierVersion: VERIFIER_VERSION,
      n,
      allowedAlphabet,
      candidateLength: cleaned.length,
      expectedPermutations,
      foundPermutations: 0,
      missingPermutationsCount: expectedPermutations,
      sampleMissingPermutations: [],
      invalidCharacters: Array.from(invalidSet).slice(0, 12),
      currentBestKnown: bestKnown,
      provenLowerBound,
      improvesBestKnown: false,
      deltaFromBestKnown: bestKnown !== null ? cleaned.length - bestKnown : null,
      belowProvenLowerBoundWarning: false,
      elapsedMs: Number(elapsed.toFixed(2)),
      error: `Candidate contains symbols outside allowed alphabet {${allowedAlphabet.split('').join(', ')}}.`,
    };
  }

  // 2. Scan all contiguous windows of length n
  const seen = new Uint8Array(expectedPermutations);
  let foundPermutations = 0;
  const fullMask = (1 << n) - 1;
  const windowDigits = new Int8Array(n);

  if (cleaned.length >= n) {
    for (let i = 0; i <= cleaned.length - n; i++) {
      let mask = 0;
      for (let k = 0; k < n; k++) {
        const d = codes[i + k]!;
        mask |= 1 << d;
        windowDigits[k] = d;
      }
      if (mask === fullMask) {
        const rank = lehmerRank(windowDigits, n);
        if (seen[rank] === 0) {
          seen[rank] = 1;
          foundPermutations++;
        }
      }
    }
  }

  const missingPermutationsCount = expectedPermutations - foundPermutations;
  const sampleMissingPermutations: string[] = [];
  if (missingPermutationsCount > 0) {
    for (let r = 0; r < expectedPermutations && sampleMissingPermutations.length < maxMissingSamples; r++) {
      if (seen[r] === 0) {
        sampleMissingPermutations.push(unrankLehmer(r, n));
      }
    }
  }

  const valid = cleaned.length > 0 && missingPermutationsCount === 0;
  const improvesBestKnown = valid && bestKnown !== null && cleaned.length < bestKnown;
  const deltaFromBestKnown = bestKnown !== null ? cleaned.length - bestKnown : null;
  const belowProvenLowerBoundWarning =
    valid && provenLowerBound !== null && cleaned.length < provenLowerBound;

  const elapsed = nowMs() - start;

  return {
    valid,
    verifierVersion: VERIFIER_VERSION,
    n,
    allowedAlphabet,
    candidateLength: cleaned.length,
    expectedPermutations,
    foundPermutations,
    missingPermutationsCount,
    sampleMissingPermutations,
    invalidCharacters: [],
    currentBestKnown: bestKnown,
    provenLowerBound,
    improvesBestKnown,
    deltaFromBestKnown,
    belowProvenLowerBoundWarning,
    elapsedMs: Number(elapsed.toFixed(2)),
  };
}

/**
 * Built-in minimal valid superpermutations for quick browser testing (n=1..4).
 */
export const SAMPLE_SUPERPERMUTATIONS: Record<number, string> = {
  1: '1',
  2: '121',
  3: '123121321',
  4: '123412314231243121342132413214321',
};
