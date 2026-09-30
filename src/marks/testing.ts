import type { PreviewElement } from '@/preview/previewMessages';
import { boundsOf, type Point, type Rect } from '@/shared/geometry';
import type { FrameInfo, Stroke, StrokeKind, Word } from './types';

export const PAGE_BOUNDS: Rect = { x: 0, y: 0, w: 1280, h: 1400 };

function el(src: string, tag: string, text: string, [x, y, w, h]: number[], parent: number): PreviewElement {
  return { src, tag, text, rect: { x, y, w, h }, parent };
}

/** A landing page at the origin: header with nav, hero, three feature cards, footer. */
export const PAGE_ELEMENTS: PreviewElement[] = [
  el('App.tsx:6:5', 'main', '', [0, 0, 1280, 1400], -1), // 0
  el('components/Header.tsx:3:5', 'header', 'Acme Product Pricing Blog', [0, 0, 1280, 72], 0), // 1
  el('components/Header.tsx:4:7', 'span', 'Acme', [32, 20, 80, 32], 1), // 2
  el('components/Header.tsx:5:7', 'nav', 'Product Pricing Blog', [900, 24, 300, 24], 1), // 3
  el('components/Header.tsx:6:9', 'a', 'Product', [900, 24, 70, 24], 3), // 4
  el('components/Header.tsx:7:9', 'a', 'Pricing', [990, 24, 70, 24], 3), // 5
  el('components/Header.tsx:8:9', 'a', 'Blog', [1080, 24, 60, 24], 3), // 6
  el('components/Hero.tsx:5:5', 'section', 'Sketch it. Ship it.', [0, 72, 1280, 528], 0), // 7
  el('components/Hero.tsx:6:7', 'h1', 'Sketch it. Ship it.', [340, 200, 600, 72], 7), // 8
  el('components/Hero.tsx:7:7', 'p', 'Draw your idea and get a real page.', [390, 290, 500, 28], 7), // 9
  el('components/Hero.tsx:8:7', 'button', 'Get started', [560, 350, 160, 48], 7), // 10
  el('components/Features.tsx:4:5', 'section', 'Fast Simple Yours', [0, 600, 1280, 500], 0), // 11
  el('components/Features.tsx:6:9', 'div', 'Fast', [80, 700, 340, 300], 11), // 12
  el('components/Features.tsx:7:9', 'div', 'Simple', [470, 700, 340, 300], 11), // 13
  el('components/Features.tsx:8:9', 'div', 'Yours', [860, 700, 340, 300], 11), // 14
  el('components/Footer.tsx:3:5', 'footer', '© Acme', [0, 1100, 1280, 300], 0), // 15
];

export const PAGE: FrameInfo = { id: 'shape:page', bounds: PAGE_BOUNDS, elements: PAGE_ELEMENTS };
export const src = (i: number): string => PAGE_ELEMENTS[i].src;
export const rectOf = (i: number): Rect => PAGE_ELEMENTS[i].rect;

let nextId = 0;
export function stroke(kind: StrokeKind, points: Point[], t0 = 0, text?: string): Stroke {
  return { shapeId: `shape:t${nextId++}`, kind, points, bounds: boundsOf(points), t0, t1: t0 + 400, ...(text ? { text } : {}) };
}

/** A closed loop loose enough to enclose the rect's corners. */
export function loopAround(r: Rect, n = 32): Point[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = (r.w / 2) * 1.5;
  const ry = (r.h / 2) * 1.5;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

export function line(a: Point, b: Point, n = 12): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/** Left-right scribble moving down the rect. */
export function zigzag(r: Rect, teeth = 5): Point[] {
  return Array.from({ length: teeth + 1 }, (_, i) => ({ x: i % 2 === 0 ? r.x : r.x + r.w, y: r.y + (r.h * i) / teeth }));
}

/** The two wings of an arrowhead at `head`, pointing away from `tail`. */
function wings(tail: Point, head: Point): [Point, Point] {
  const len = Math.hypot(head.x - tail.x, head.y - tail.y);
  const ux = (head.x - tail.x) / len;
  const uy = (head.y - tail.y) / len;
  const wing = len * 0.25;
  const at = (a: number) => ({
    x: head.x - wing * (ux * Math.cos(a) - uy * Math.sin(a)),
    y: head.y - wing * (uy * Math.cos(a) + ux * Math.sin(a)),
  });
  return [at(Math.PI / 6), at(-Math.PI / 6)];
}

/** One pen stroke: shaft, then the head drawn without lifting the pen. */
export function arrowStroke(tail: Point, head: Point): Point[] {
  const [a, b] = wings(tail, head);
  return [...line(tail, head), a, head, b];
}

/** A separate V-shaped head stroke. */
export function arrowHead(tail: Point, head: Point): Point[] {
  const [a, b] = wings(tail, head);
  return [a, head, b];
}

export function rectOutline(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
    { x: r.x, y: r.y },
  ];
}

/** Words spoken back to back from t0, perWordMs each. */
export function said(text: string, t0: number, perWordMs = 300): Word[] {
  return text.split(' ').map((w, i) => ({ text: w, t0: t0 + i * perWordMs, t1: t0 + (i + 1) * perWordMs }));
}
