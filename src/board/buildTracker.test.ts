import type { TLShapeId } from 'tldraw';
import { describe, expect, it } from 'vitest';
import { finishBuild, isBuildInFlight, startBuild } from './buildTracker';

const id = 'shape:frame-1' as TLShapeId;

describe('buildTracker', () => {
  it('tracks a build from start to finish', () => {
    expect(isBuildInFlight(id)).toBe(false);
    startBuild(id);
    expect(isBuildInFlight(id)).toBe(true);
    finishBuild(id);
    expect(isBuildInFlight(id)).toBe(false);
  });
});
