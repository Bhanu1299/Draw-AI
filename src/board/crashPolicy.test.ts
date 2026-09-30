import { describe, expect, it } from 'vitest';
import { LIBS_FAILED_MESSAGE } from '@/preview/runtimeHtml';
import { decideOnCrash, VERIFY_WINDOW_MS } from './crashPolicy';

const fresh = { appliedAt: 1000, fixAttempted: false, fixing: false };

describe('decideOnCrash', () => {
  it('ignores crashes of pages no edit just produced', () => {
    expect(decideOnCrash(undefined, 5000, 'boom')).toBe('ignore');
    expect(decideOnCrash(fresh, 1000 + VERIFY_WINDOW_MS + 1, 'boom')).toBe('ignore');
  });
  it('fixes the first crash after an edit', () => {
    expect(decideOnCrash(fresh, 3000, 'boom')).toBe('fix');
  });
  it('ignores repeat reports while the fix is running', () => {
    expect(decideOnCrash({ ...fresh, fixAttempted: true, fixing: true }, 3000, 'boom')).toBe('ignore');
  });
  it('reverts when the fixed version crashes too', () => {
    expect(decideOnCrash({ ...fresh, fixAttempted: true }, 3000, 'boom')).toBe('revert');
  });
  it('leaves a network failure alone: the code is fine, and a fix or revert would only lose the edit', () => {
    expect(decideOnCrash(fresh, 3000, LIBS_FAILED_MESSAGE)).toBe('ignore');
  });
});
