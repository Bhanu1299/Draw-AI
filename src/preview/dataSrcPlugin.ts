import type { PluginObj, PluginPass, types as BabelTypes } from '@babel/core';

export const DATA_SRC_ATTR = 'data-src';

/**
 * Adds data-src="path:line:column" to every HTML-level JSX element (lowercase tag),
 * so the canvas can map a pen mark back to the exact source line.
 */
export function dataSrcPlugin({ types: t }: { types: typeof BabelTypes }): PluginObj<PluginPass> {
  return {
    name: 'drawai-data-src',
    visitor: {
      JSXOpeningElement(path, state) {
        const name = path.node.name;
        if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) return;
        const alreadyTagged = path.node.attributes.some(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === DATA_SRC_ATTR,
        );
        if (alreadyTagged || !path.node.loc) return;
        // Babel prefixes a bare filename with "/"; strip it so tags match project paths.
        const file = (state.filename ?? 'unknown').replace(/^\//, '');
        const { line, column } = path.node.loc.start;
        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(DATA_SRC_ATTR), t.stringLiteral(`${file}:${line}:${column + 1}`)),
        );
      },
    },
  };
}
