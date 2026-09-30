'use client';

import { useEffect, useState } from 'react';
import { useValue, type Editor } from 'tldraw';
import { formatElapsed } from './voiceAction';
import { startVoice, stopVoice } from './voiceControl';
import { voiceState } from './voiceSession';

/** ● Start → ■ Stop 0:07. Everything said and drawn in between is one instruction (spec §2.2). */
export function VoiceButton({ editor, busy }: { editor: Editor; busy: boolean }) {
  const voice = useValue(voiceState);
  const recording = voice.phase === 'recording';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [recording]);

  const label = recording
    ? `■ Stop ${formatElapsed(now - voice.startedAt)}`
    : voice.phase === 'starting'
      ? 'Starting…'
      : voice.phase === 'stopping'
        ? 'Understanding…'
        : '● Start';
  const disabled = voice.phase === 'starting' || voice.phase === 'stopping' || (busy && !recording);

  return (
    <button
      onClick={() => void (recording ? stopVoice(editor) : startVoice(editor))}
      disabled={disabled}
      aria-pressed={recording}
      title={recording ? 'Stop and apply' : 'Talk while you draw. Stop sends it.'}
      style={{
        padding: '4px 12px',
        borderRadius: 999,
        border: 0,
        font: 'inherit',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        background: recording ? '#dc2626' : disabled ? '#a1a1aa' : '#18181b',
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}
