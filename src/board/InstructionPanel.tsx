'use client';

import { useValue, type Editor } from 'tldraw';
import { timeline } from '@/marks/bindWords';
import { describeMark } from '@/marks/describeMark';
import type { PlannedMark } from '@/marks/planEdit';
import { editStatus, instructionDraft } from './editSession';
import { recordEvalCase } from './recordEvalCase';
import { sendEdit } from './sendEdit';
import { useEditPlan } from './useEditPlan';
import { VoiceButton } from './VoiceButton';
import { saveVoiceEvalCases, voiceState } from './voiceSession';

const STATUS_COLOR = { idle: '#71717a', working: '#2563eb', done: '#15803d', error: '#b91c1c' } as const;

export function InstructionPanel({ editor }: { editor: Editor }) {
  const result = useEditPlan(editor);
  const status = useValue(editStatus);
  const voice = useValue(voiceState);
  const text = useValue(instructionDraft);
  const saveVoice = useValue(saveVoiceEvalCases);
  const plan = result.ok ? result.plan : null;
  const busy = status.phase === 'working';
  const listening = voice.phase !== 'idle';
  const canSend = !!plan && !busy && !listening && (text.trim() !== '' || plan.marks.length > 0);
  const rows = plan ? timeline(plan.marks, voice.runs) : [];

  async function onSend() {
    if (!plan || !canSend) return;
    if (await sendEdit(editor, plan, text.trim())) instructionDraft.set('');
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 64,
        zIndex: 1000,
        width: 340,
        display: 'grid',
        gap: 8,
        padding: 12,
        background: '#fff',
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        font: '14px/1.4 system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, color: '#3f3f46' }}>Change the page</div>
        <VoiceButton editor={editor} busy={busy} />
      </div>
      {voice.phase === 'recording' && (
        <div style={{ color: '#71717a', fontStyle: 'italic' }}>{voice.partial ? `“${voice.partial}”` : 'Listening… talk and draw.'}</div>
      )}
      {rows.length > 0 ? (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
          {rows.map((row, i) =>
            row.kind === 'mark' ? (
              <MarkRow key={`m${row.mark.n}`} mark={row.mark} said={row.said} />
            ) : (
              <li key={`s${i}`} style={{ color: '#52525b', fontStyle: 'italic', paddingLeft: 20 }}>
                “{row.text}”
              </li>
            ),
          )}
        </ol>
      ) : (
        <div style={{ color: '#71717a' }}>{result.ok ? 'No marks: the change applies to the whole page.' : result.message}</div>
      )}
      <textarea
        value={text}
        onChange={(e) => instructionDraft.set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void onSend();
          }
        }}
        rows={3}
        disabled={busy}
        placeholder='Or type what should change. Refer to marks by number, e.g. "1 smaller".'
        style={{ resize: 'vertical', padding: '6px 10px', border: '1px solid #d4d4d8', borderRadius: 8, font: 'inherit' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => void onSend()}
          disabled={!canSend}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 0,
            font: 'inherit',
            fontWeight: 600,
            background: canSend ? '#18181b' : '#a1a1aa',
            color: '#fff',
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Working…' : 'Send ⌘↵'}
        </button>
        {process.env.NODE_ENV !== 'production' && plan && plan.marks.length > 0 && (
          <button
            onClick={() => recordEvalCase(editor, plan)}
            style={{ border: 0, background: 'none', color: '#71717a', textDecoration: 'underline', cursor: 'pointer', font: '12px system-ui' }}
          >
            Save as eval case
          </button>
        )}
        {process.env.NODE_ENV !== 'production' && (
          <label style={{ color: '#71717a', font: '12px system-ui', display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={saveVoice} onChange={(e) => saveVoiceEvalCases.set(e.target.checked)} />
            save voice as eval
          </label>
        )}
      </div>
      {status.phase !== 'idle' && (
        <div role="status" style={{ color: STATUS_COLOR[status.phase] }}>
          {status.text}
        </div>
      )}
    </div>
  );
}

function MarkRow({ mark, said }: { mark: PlannedMark; said: string }) {
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: mark.hit.unsure ? '#b45309' : '#2563eb', fontWeight: 600 }}>{mark.n}</span>
      <span style={{ color: '#3f3f46' }}>
        {describeMark(mark)}
        {said && <span style={{ display: 'block', color: '#52525b', fontStyle: 'italic' }}>“{said}”</span>}
      </span>
    </li>
  );
}
