import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES, VOICE_CASES } from './goldenCases';
import { caseProblems, scoreCase, scoreSpeech, type EvalCase, type Score } from './score';

const CASES_DIR = path.join(import.meta.dirname, 'cases');

function recordedCases(dir = CASES_DIR): Array<{ file: string; c: EvalCase }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, c: JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as EvalCase }));
}

/** Everything wrong with the cases: recorded ones (from a folder) must be reviewed by hand; synthetic ones are exempt. */
function problems(recorded: Array<{ file: string; c: EvalCase }>): string[] {
  return [...[...GOLDEN_CASES, ...VOICE_CASES].flatMap((c) => caseProblems(c)), ...recorded.flatMap(({ file, c }) => caseProblems(c, file))];
}

// Until real recordings are saved to ./cases, the 90% gates below measure the synthetic cases only.
const ALL = () => [...GOLDEN_CASES, ...VOICE_CASES, ...recordedCases().map((r) => r.c)];

function expectAtLeast90(scores: Score[]) {
  const correct = scores.reduce((n, s) => n + s.correct, 0);
  const total = scores.reduce((n, s) => n + s.total, 0);
  expect(correct / total, scores.flatMap((s) => s.failures).join('\n')).toBeGreaterThanOrEqual(0.9);
}

const voiceCase = VOICE_CASES[0];

describe('eval case checks', () => {
  it('fails a recording nobody reviewed, naming the file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'drawai-eval-'));
    try {
      writeFileSync(path.join(dir, 'fresh.json'), JSON.stringify({ ...voiceCase, reviewed: false }));
      writeFileSync(path.join(dir, 'unmarked.json'), JSON.stringify(voiceCase));
      writeFileSync(path.join(dir, 'checked.json'), JSON.stringify({ ...voiceCase, reviewed: true }));
      const found = problems(recordedCases(dir));
      expect(found).toHaveLength(2);
      expect(found[0]).toMatch(/fresh\.json.*not reviewed.*"reviewed": true/);
      expect(found[1]).toMatch(/unmarked\.json.*not reviewed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('fails a case with words but no expected speech, or expected speech but no words', () => {
    const { expectedSpeech: _speech, ...wordsOnly } = voiceCase;
    const { words: _words, ...speechOnly } = voiceCase;
    expect(caseProblems(wordsOnly)).toEqual([expect.stringMatching(/has words but no expectedSpeech/)]);
    expect(caseProblems(speechOnly, 'x.json')).toEqual([
      expect.stringMatching(/x\.json.*not reviewed/),
      expect.stringMatching(/x\.json.*has expectedSpeech but no words/),
    ]);
  });
  it('passes synthetic cases without a review flag', () => {
    expect(caseProblems(voiceCase)).toEqual([]);
    expect(caseProblems(GOLDEN_CASES[0])).toEqual([]);
  });
  it('every recorded case in ./cases is reviewed, and words come with expected speech', () => {
    expect(problems(recordedCases())).toEqual([]);
  });
});

describe('targeting eval (spec §9.2, measured without AI)', () => {
  it.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('golden: %s', (_, c) => {
    expect(scoreCase(c).failures).toEqual([]);
  });
  it('resolves at least 90% of all marks (synthetic only until reviewed recordings are in ./cases)', () => {
    expectAtLeast90(ALL().map(scoreCase));
  });
});

describe('word binding eval (spec §4.2, measured without AI)', () => {
  it.each(VOICE_CASES.map((c) => [c.name, c] as const))('golden: %s', (_, c) => {
    expect(scoreCase(c).failures).toEqual([]);
    expect(scoreSpeech(c).failures).toEqual([]);
  });
  it('binds at least 90% of speech runs (synthetic only until reviewed recordings are in ./cases)', () => {
    expectAtLeast90(ALL().map(scoreSpeech));
  });
});
