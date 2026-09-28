import { describe, expect, it } from 'vitest';
import { MAX_FRAME_HEIGHT, MIN_FRAME_HEIGHT, nextFrameHeight } from './frameHeight';

describe('nextFrameHeight', () => {
  it('follows the reported content height', () => {
    expect(nextFrameHeight(800, 1450.4)).toBe(1451);
  });
  it('ignores changes under 2px', () => {
    expect(nextFrameHeight(800, 801)).toBeNull();
  });
  it('never goes below the minimum', () => {
    expect(nextFrameHeight(800, 50)).toBe(MIN_FRAME_HEIGHT);
  });
  it('caps runaway growth at the maximum', () => {
    expect(nextFrameHeight(1000, 999999)).toBe(MAX_FRAME_HEIGHT);
    expect(nextFrameHeight(MAX_FRAME_HEIGHT, MAX_FRAME_HEIGHT + 800)).toBeNull();
  });
});
