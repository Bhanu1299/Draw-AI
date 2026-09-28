import * as Babel from '@babel/standalone';
import { dataSrcPlugin } from './dataSrcPlugin';

/** Compile one TSX/TS file to CommonJS. Throws Babel's error (message starts with the file path) on bad syntax. */
export function transformFile(path: string, source: string, opts: { tagSources: boolean }): string {
  const result = Babel.transform(source, {
    filename: path,
    sourceType: 'module',
    presets: [
      ['typescript', { isTSX: true, allExtensions: true }],
      ['react', { runtime: 'automatic' }],
    ],
    plugins: [...(opts.tagSources ? [dataSrcPlugin] : []), 'transform-modules-commonjs'],
  });
  return result.code ?? '';
}
