import { describe, expect, it } from 'vitest';
import { FrameShapeUtil } from './FrameShapeUtil';

describe('FrameShapeUtil', () => {
  it('never lets arrows bind to a page, so arrow marks keep the points the user drew', () => {
    expect(FrameShapeUtil.prototype.canBind()).toBe(false);
  });
});
