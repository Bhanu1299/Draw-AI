import { atom, type TLShapeId } from 'tldraw';
import type { PreviewElement } from '@/preview/previewMessages';

// Latest element map each frame's preview reported, in frame-local coordinates. Kept out of the
// shape props: it is derived from the files, changes on every layout, and must not enter undo history.
const frameElements = atom<ReadonlyMap<TLShapeId, PreviewElement[]>>('frame elements', new Map());

export function setFrameElements(id: TLShapeId, elements: PreviewElement[]): void {
  const next = new Map(frameElements.get());
  next.set(id, elements);
  frameElements.set(next);
}

/** Reactive: reading this inside useValue/computed re-runs when the map changes. */
export function getFrameElements(id: TLShapeId): PreviewElement[] | undefined {
  return frameElements.get().get(id);
}
