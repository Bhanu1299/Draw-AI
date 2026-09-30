import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LUCIDE_VERSION } from '@/preview/runtimeHtml';
import { checkIcons } from './checkIcons';

describe('checkIcons', () => {
  it('accepts icons lucide-react exports', () => {
    const source = 'import { ArrowRight, Search } from "lucide-react";\nexport default () => <p><ArrowRight /><Search /></p>;';
    expect(checkIcons('Hero.tsx', source)).toEqual([]);
  });
  it('reports icons lucide-react does not export, such as brand logos', () => {
    const source =
      'import { Search, Github, Twitter as X } from "lucide-react";\n' +
      'export default () => <p><Search /><Github /><X /></p>;';
    const errors = checkIcons('components/Header.tsx', source);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('components/Header.tsx');
    expect(errors[0]).toContain('"Github"');
    expect(errors[1]).toContain('"Twitter"');
    expect(errors[0]).toContain('<svg>');
  });
  it('ignores unused imports, which cannot crash the page', () => {
    expect(checkIcons('Hero.tsx', 'import { Github } from "lucide-react";')).toEqual([]);
  });
  it('ignores other imports', () => {
    expect(checkIcons('App.tsx', 'import Hero from "./Hero"; import { useState } from "react";')).toEqual([]);
  });
  it('checks against the same lucide-react version the preview loads', () => {
    const installed = JSON.parse(readFileSync('node_modules/lucide-react/package.json', 'utf8')) as { version: string };
    expect(installed.version).toBe(LUCIDE_VERSION);
  });
});
