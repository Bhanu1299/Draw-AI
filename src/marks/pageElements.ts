import type { PreviewElement } from '@/preview/previewMessages';
import { boundsOf, type Point } from '@/shared/geometry';

/** Map frame-local element rects to page rects with the frame's current transform. */
export function toPageElements(elements: PreviewElement[], toPage: (p: Point) => Point): PreviewElement[] {
  return elements.map((el) => {
    const { x, y, w, h } = el.rect;
    const corners = [
      { x, y },
      { x: x + w, y },
      { x, y: y + h },
      { x: x + w, y: y + h },
    ].map(toPage);
    return { ...el, rect: boundsOf(corners) };
  });
}
