import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES, VOICE_CASES } from './goldenCases';
import { scoreCase, scoreSpeech, type EvalCase, type Score } from './score';

const CASES_DIR = path.join(import.meta.dirname, 'cases');

function recordedCases(): EvalCase[] {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(CASES_DIR, f), 'utf8')) as EvalCase);
}

const ALL = () => [...GOLDEN_CASES, ...VOICE_CASES, ...recordedCases()];

function expectAtLeast90(scores: Score[]) {
  const correct = scores.reduce((n, s) => n + s.correct, 0);
  const total = scores.reduce((n, s) => n + s.total, 0);
  expect(correct / total, scores.flatMap((s) => s.failures).join('\n')).toBeGreaterThanOrEqual(0.9);
}

describe('targeting eval (spec §9.2, measured without AI)', () => {
  it.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('golden: %s', (_, c) => {
    expect(scoreCase(c).failures).toEqual([]);
  });
  it('resolves at least 90% of all marks, recorded ones included', () => {
    expectAtLeast90(ALL().map(scoreCase));
  });
});

describe('word binding eval (spec §4.2, measured without AI)', () => {
  it.each(VOICE_CASES.map((c) => [c.name, c] as const))('golden: %s', (_, c) => {
    expect(scoreCase(c).failures).toEqual([]);
    expect(scoreSpeech(c).failures).toEqual([]);
  });
  it('binds at least 90% of speech runs, recorded ones included', () => {
    expectAtLeast90(ALL().map(scoreSpeech));
  });
});
