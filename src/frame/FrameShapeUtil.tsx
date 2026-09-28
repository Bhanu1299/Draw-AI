import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLShape } from 'tldraw';
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

  component(shape: FrameShape) {
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
          pointerEvents: 'none',
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
