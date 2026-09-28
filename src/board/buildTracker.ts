import type { TLShapeId } from 'tldraw';

// Frames whose build request is running in this tab. A frame persisted as "building" that is not in
// this set (after a reload, an undo/redo, or in another tab) will never finish on its own.
const inFlight = new Set<TLShapeId>();

export function startBuild(id: TLShapeId): void {
  inFlight.add(id);
}

export function finishBuild(id: TLShapeId): void {
  inFlight.delete(id);
}

export function isBuildInFlight(id: TLShapeId): boolean {
  return inFlight.has(id);
}
