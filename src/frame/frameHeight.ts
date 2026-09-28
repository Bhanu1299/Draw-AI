export const MIN_FRAME_HEIGHT = 200;
/** Safety net: even with vh units pinned, a page must never grow the frame without limit. */
export const MAX_FRAME_HEIGHT = 20000;

/** The frame height to apply for a reported content height, or null when no update is needed. */
export function nextFrameHeight(current: number, reported: number): number | null {
  const next = Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(reported)));
  return Math.abs(next - current) < 2 ? null : next;
}
