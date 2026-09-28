'use client';

import dynamic from 'next/dynamic';

// tldraw and the preview compiler are browser-only.
const Board = dynamic(() => import('@/board/Board'), { ssr: false });

export default function Home() {
  return <Board />;
}
