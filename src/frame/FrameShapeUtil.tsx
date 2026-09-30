import { BaseBoxShapeUtil, HTMLContainer, T, useValue, type RecordProps, type TLShape } from 'tldraw';
import { interactMode } from '@/board/interactMode';
import { FramePreview } from './FramePreview';
import { FRAME_TYPE, type FrameProps } from './frameTypes';

export type FrameShape = TLShape<typeof FRAME_TYPE>;

export const FRAME_WIDTH = 1280;

export class FrameShapeUtil extends BaseBoxShapeUtil<FrameShape> {
  static override type = FRAME_TYPE;

  static override props: RecordProps<FrameShape> = {
    w: T.number,
    h: T.number,
    files: T.dict(T.string, T.string),
    status: T.literalEnum('building', 'ready', 'error'),
    error: T.string,
  };

  getDefaultProps(): FrameProps {
    return { w: FRAME_WIDTH, h: 800, files: {}, status: 'building', error: '' };
  }

  // Width is the desktop viewport; height follows the content.
  override canResize() {
    return false;
  }

  // An arrow bound to the page snaps its ends to the frame's outline or centre, losing where the user
  // actually pointed: arrow marks must keep their drawn points.
  override canBind() {
    return false;
  }

  component(shape: FrameShape) {
    const interactive = useValue(interactMode);
    return (
      <HTMLContainer
        id={shape.id}
        style={{
          background: '#fff',
          // A real border would make the iframe 2px shorter than the shape; with `min-h-screen` pages the
          // reported height would then shrink 2px per round trip. A box-shadow outline takes no layout space.
          boxShadow: '0 0 0 1px #d4d4d8',
          borderRadius: 8,
          overflow: 'hidden',
          pointerEvents: interactive ? 'all' : 'none',
        }}
      >
        <FramePreview shape={shape} />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: FrameShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
