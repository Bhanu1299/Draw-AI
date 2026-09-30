import { describe, expect, it } from 'vitest';
import { decideOnCrash, VERIFY_WINDOW_MS } from './crashPolicy';

const fresh = { appliedAt: 1000, fixAttempted: false, fixing: false };

describe('decideOnCrash', () => {
  it('ignores crashes of pages no edit just produced', () => {
    expect(decideOnCrash(undefined, 5000)).toBe('ignore');
    expect(decideOnCrash(fresh, 1000 + VERIFY_WINDOW_MS + 1)).toBe('ignore');
  });
  it('fixes the first crash after an edit', () => {
    expect(decideOnCrash(fresh, 3000)).toBe('fix');
  });
  it('ignores repeat reports while the fix is running', () => {
    expect(decideOnCrash({ ...fresh, fixAttempted: true, fixing: true }, 3000)).toBe('ignore');
  });
  it('reverts when the fixed version crashes too', () => {
    expect(decideOnCrash({ ...fresh, fixAttempted: true }, 3000)).toBe('revert');
  });
});
