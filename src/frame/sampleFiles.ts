import type { ProjectFiles } from '@/shared/types';

/** A small known-good project: used by the dev-only "Insert sample page" button and by tests. */
export const SAMPLE_FILES: ProjectFiles = {
  'App.tsx': `import Header from "./components/Header";
import Hero from "./components/Hero";

export default function App() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <Header />
      <Hero />
    </main>
  );
}
`,
  'components/Header.tsx': `export default function Header() {
  return (
    <header className="flex items-center justify-between px-10 py-6 border-b border-slate-200">
      <span className="text-xl font-bold">Acme</span>
      <nav className="flex gap-8 text-sm text-slate-600">
        <a href="#">Product</a>
        <a href="#">Pricing</a>
        <a href="#">Blog</a>
      </nav>
    </header>
  );
}
`,
  'components/Hero.tsx': `import { ArrowRight } from "lucide-react";

export default function Hero() {
  return (
    <section className="px-10 py-24 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight">Sketch it. Ship it.</h1>
      <p className="mt-4 text-lg text-slate-600">Draw your idea and get a real page.</p>
      <button className="mt-8 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-white">
        Get started <ArrowRight size={18} />
      </button>
    </section>
  );
}
`,
};
