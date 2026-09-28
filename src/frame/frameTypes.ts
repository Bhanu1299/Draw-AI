export const FRAME_TYPE = 'drawai-frame' as const;

export type FrameStatus = 'building' | 'ready' | 'error';

export interface FrameProps {
  w: number;
  h: number;
  /** The page source. Lives in the shape so tldraw undo + persistence cover it in M1. */
  files: Record<string, string>;
  status: FrameStatus;
  error: string;
}

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [FRAME_TYPE]: FrameProps;
  }
}
