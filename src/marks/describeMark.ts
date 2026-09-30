import { parseSrc } from '@/shared/targets';
import type { Gesture, MarkTarget, RegionDescription, TargetElement } from '@/shared/types';
import type { PlannedMark } from './planEdit';

const VERB: Record<Gesture, string> = {
  circle: 'Circled',
  arrow: 'Pointed at',
  'cross-out': 'Crossed out',
  underline: 'Underlined',
  sketch: 'Sketched new UI',
};

/** One line for the panel: what the mark hit, so a misread is visible before it costs anything. */
export function describeMark(mark: PlannedMark): string {
  const main = describeTarget(mark.gesture, mark.hit.target);
  const to = mark.hit.pointsTo ? ` → ${shortTarget(mark.hit.pointsTo)}` : '';
  const wrote = mark.wrote.length > 0 ? ` “${mark.wrote.join(' ')}”` : '';
  return `${main}${to}${wrote}${mark.hit.unsure ? ' (unsure)' : ''}`;
}

function describeTarget(gesture: Gesture, target: MarkTarget): string {
  if (target.kind === 'elements') {
    const [first, ...rest] = target.elements;
    const more = rest.length > 0 ? ` +${rest.length} more` : '';
    return `${VERB[gesture]} ${first ? elementLabel(first) : 'nothing'}${more}`;
  }
  return `${gesture === 'sketch' ? VERB.sketch : `${VERB[gesture]} an area`}${regionLabel(target.region)}`;
}

function shortTarget(target: MarkTarget): string {
  if (target.kind === 'elements') return target.elements[0] ? elementLabel(target.elements[0]) : 'nothing';
  return `an area${regionLabel(target.region)}`;
}

function elementLabel(e: TargetElement): string {
  const where = parseSrc(e.src);
  const text = e.text ? ` “${e.text.length > 24 ? `${e.text.slice(0, 23)}…` : e.text}”` : '';
  return `<${e.tag}>${text}${where ? ` · ${where.path.split('/').pop()}:${where.line}` : ''}`;
}

function regionLabel(r: RegionDescription): string {
  if (r.outside === 'above' || r.outside === 'below') return ` ${r.outside} the page`;
  if (r.outside) return ` ${r.outside} of the page`;
  const parts: string[] = [];
  if (r.inside) parts.push(`inside <${r.inside.tag}>`);
  if (r.elementAbove) parts.push(`below <${r.elementAbove.tag}>`);
  else if (r.elementBelow) parts.push(`above <${r.elementBelow.tag}>`);
  return parts.length > 0 ? ` ${parts.join(', ')}` : '';
}
