import type { Challenge, ChallengeStatus } from '@common-intelligence/shared';

export type StatusTone = 'accent' | 'neutral' | 'success' | 'warning' | 'info';

export interface ChallengeProgress {
  /** 0–100, or null when progress cannot be measured yet. */
  pct: number | null;
  /** 'record' = measured against the target metric, 'tasks' = roadmap task completion. */
  kind: 'record' | 'tasks' | 'none';
  done?: number;
  total?: number;
}

const clampPct = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export function challengeProgress(ch: Challenge): ChallengeProgress {
  if (ch.status === 'Completed') return { pct: 100, kind: 'record' };

  const rec = ch.record;
  if (rec.currentBestValue !== undefined && rec.targetValue !== undefined) {
    const start = rec.scaleStartValue ?? rec.lowerBoundValue;
    if (start !== undefined && start !== rec.targetValue) {
      // Works for both "higher is better" and "lower is better" since the signs flip together.
      return {
        pct: clampPct(((rec.currentBestValue - start) / (rec.targetValue - start)) * 100),
        kind: 'record',
      };
    }
  }

  const { completedTasksCount: done, openTasksCount, activeLeasesCount } = ch.stats;
  const total = done + openTasksCount + activeLeasesCount;
  if (total > 0) return { pct: clampPct((done / total) * 100), kind: 'tasks', done, total };

  return { pct: null, kind: 'none' };
}

export function statusTone(status: ChallengeStatus): StatusTone {
  switch (status) {
    case 'Active':
      return 'accent';
    case 'Proposed':
      return 'info';
    case 'Paused':
      return 'warning';
    case 'Completed':
      return 'success';
    default:
      return 'neutral';
  }
}
