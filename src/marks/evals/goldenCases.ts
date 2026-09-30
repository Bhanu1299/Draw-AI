import { arrowHead, arrowStroke, line, loopAround, PAGE, rectOf, rectOutline, said, src, stroke, zigzag } from '../testing';
import type { EvalCase } from './score';

const one = (name: string, strokes: EvalCase['strokes'], expected: EvalCase['expected']): EvalCase => ({
  name,
  frames: [PAGE],
  strokes,
  selectedFrameId: null,
  expected,
});

/** Synthetic starter golden set; real recordings go in ./cases (Task 12). */
export const GOLDEN_CASES: EvalCase[] = [
  one('pen circle around the nav', [stroke('draw', loopAround(rectOf(3)))], [{ n: 1, gesture: 'circle', targets: [src(3)] }]),
  one('tool ellipse around two links', [stroke('ellipse', loopAround({ x: 900, y: 24, w: 160, h: 24 }))], [
    { n: 1, gesture: 'circle', targets: [src(4), src(5)] },
  ]),
  one('one-stroke arrow at the button', [stroke('draw', arrowStroke({ x: 200, y: 480 }, { x: 600, y: 374 }))], [
    { n: 1, gesture: 'arrow', targets: [src(10)] },
  ]),
  one(
    'shaft plus head at the button',
    [
      stroke('draw', line({ x: 200, y: 480 }, { x: 600, y: 374 }), 0),
      stroke('draw', arrowHead({ x: 200, y: 480 }, { x: 600, y: 374 }), 500),
    ],
    [{ n: 1, gesture: 'arrow', targets: [src(10)] }],
  ),
  one('tool arrow moving Blog to the footer', [stroke('arrow', [{ x: 1110, y: 36 }, { x: 640, y: 1200 }])], [
    { n: 1, gesture: 'arrow', targets: [src(6)], pointsTo: [src(15)] },
  ]),
  one('zigzag over the middle card', [stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }))], [
    { n: 1, gesture: 'cross-out', targets: [src(13)] },
  ]),
  one(
    'X over the right card',
    [
      stroke('draw', line({ x: 880, y: 720 }, { x: 1180, y: 980 }), 0),
      stroke('draw', line({ x: 1180, y: 720 }, { x: 880, y: 980 }), 300),
    ],
    [{ n: 1, gesture: 'cross-out', targets: [src(14)] }],
  ),
  one('underline the headline', [stroke('draw', line({ x: 360, y: 278 }, { x: 920, y: 278 }))], [
    { n: 1, gesture: 'underline', targets: [src(8)] },
  ]),
  one(
    'boxed sketch between hero and features',
    [
      stroke('rectangle', rectOutline({ x: 40, y: 560, w: 1200, h: 100 }), 0),
      stroke('text', rectOutline({ x: 500, y: 590, w: 120, h: 30 }), 200, 'Testimonials'),
    ],
    [{ n: 1, gesture: 'sketch', targets: ['region'] }],
  ),
  one(
    'two marks in one instruction',
    [stroke('draw', loopAround(rectOf(3)), 0), stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 3000)],
    [
      { n: 1, gesture: 'circle', targets: [src(3)] },
      { n: 2, gesture: 'cross-out', targets: [src(13)] },
    ],
  ),
];

const voice = (
  name: string,
  strokes: EvalCase['strokes'],
  words: NonNullable<EvalCase['words']>,
  expected: EvalCase['expected'],
  expectedSpeech: NonNullable<EvalCase['expectedSpeech']>,
): EvalCase => ({ ...one(name, strokes, expected), words, expectedSpeech });

/** Synthetic voice instructions: strokes plus a word log. Real recordings go in ./cases (Task 11). */
export const VOICE_CASES: EvalCase[] = [
  voice(
    'circle the nav while saying "make these smaller"',
    [stroke('draw', loopAround(rectOf(3)), 1000)],
    said('make these smaller', 900),
    [{ n: 1, gesture: 'circle', targets: [src(3)] }],
    [{ mark: 1, text: 'make these smaller' }],
  ),
  voice(
    'two marks with their own words, then a whole-page ask',
    [stroke('draw', loopAround(rectOf(3)), 1000), stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 4000)],
    [...said('make these smaller', 900), ...said('remove this card', 3900), ...said('and make it all more premium', 7000)],
    [
      { n: 1, gesture: 'circle', targets: [src(3)] },
      { n: 2, gesture: 'cross-out', targets: [src(13)] },
    ],
    [
      { mark: 1, text: 'make these smaller' },
      { mark: 2, text: 'remove this card' },
      { mark: null, text: 'and make it all more premium' },
    ],
  ),
  voice(
    '"these ones… move them right": the model resolves the reference',
    [stroke('ellipse', loopAround({ x: 900, y: 24, w: 160, h: 24 }), 1000)],
    [...said('these ones', 1000), ...said('move them right', 4000)],
    [{ n: 1, gesture: 'circle', targets: [src(4), src(5)] }],
    [
      { mark: 1, text: 'these ones' },
      { mark: null, text: 'move them right' },
    ],
  ),
  voice(
    'tool arrow dragged out while talking',
    [{ ...stroke('arrow', [{ x: 1110, y: 36 }, { x: 640, y: 1200 }], 1000), t1: 2600 }],
    said('move blog to the footer', 1200),
    [{ n: 1, gesture: 'arrow', targets: [src(6)], pointsTo: [src(15)] }],
    [{ mark: 1, text: 'move blog to the footer' }],
  ),
  voice(
    'a silent mark splits the speech around it',
    [stroke('draw', line({ x: 360, y: 278 }, { x: 920, y: 278 }), 3000)],
    [...said('make it dark', 0), ...said('and bigger', 5000)],
    [{ n: 1, gesture: 'underline', targets: [src(8)] }],
    [
      { mark: null, text: 'make it dark' },
      { mark: null, text: 'and bigger' },
    ],
  ),
];
