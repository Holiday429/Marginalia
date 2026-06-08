import {
  READING_IDENTITY_VARIANTS,
} from './reading-identity-mock.ts';
import type {
  ReadingIdentityAxis,
  ReadingIdentityResult,
} from './reading-identity-types.ts';

function formatIdentityDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export function resolveReadingIdentityResult(
  result: ReadingIdentityResult,
  now: Date = new Date(),
): ReadingIdentityResult {
  return {
    ...result,
    yearScope: String(now.getFullYear()),
    generatedAt: formatIdentityDate(now),
  };
}

export function cycleReadingIdentityVariant(
  result: ReadingIdentityResult,
  variantIndex: number,
): { result: ReadingIdentityResult; variantIndex: number } {
  const nextIndex = (variantIndex + 1) % READING_IDENTITY_VARIANTS.length;
  const nextVariant = READING_IDENTITY_VARIANTS[nextIndex];
  return {
    variantIndex: nextIndex,
    result: {
      ...result,
      archetype: nextVariant.archetype,
      poeticProjection: nextVariant.poeticProjection,
      axes: perturbAxes(result.axes),
    },
  };
}

function perturbAxes(axes: ReadingIdentityAxis[]): ReadingIdentityAxis[] {
  return axes.map((axis) => {
    const delta = Math.round((Math.random() - 0.5) * 16);
    return {
      ...axis,
      score: Math.max(35, Math.min(94, axis.score + delta)),
    };
  });
}
