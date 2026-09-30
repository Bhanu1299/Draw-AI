import * as Babel from '@babel/standalone';
import * as lucide from 'lucide-react';

const ICON_NAMES = new Set(Object.keys(lucide));

/**
 * Named imports from lucide-react that it doesn't export. They compile fine but render as undefined and
 * crash the page, and the model often reaches for brand logos (Github, Twitter) that lucide dropped.
 */
export function checkIcons(path: string, source: string): string[] {
  // The TS preset drops unused imports first, so only icons the page actually renders are checked.
  const ast = Babel.transform(source, {
    filename: path,
    ast: true,
    code: false,
    presets: [['typescript', { isTSX: true, allExtensions: true }]],
  }).ast;
  const errors: string[] = [];
  for (const node of ast?.program.body ?? []) {
    if (node.type !== 'ImportDeclaration' || node.source.value !== 'lucide-react') continue;
    for (const spec of node.specifiers) {
      if (spec.type !== 'ImportSpecifier') continue;
      const name = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
      if (!ICON_NAMES.has(name)) {
        errors.push(
          `${path}: lucide-react has no icon "${name}". It has no brand logos: draw logos as a small inline <svg>, or use a different icon.`,
        );
      }
    }
  }
  return errors;
}
