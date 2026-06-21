import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

// Required Supabase table (run once in SQL editor):
// create table public.chatter (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users not null,
//   record_type text not null,
//   record_id text not null,
//   message text not null,
//   message_type text not null default 'note',
//   created_at timestamptz not null default now()
// );
// alter table chatter enable row level security;
// create policy "chatter_policy" on chatter for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

interface ChatterMsg {
  id: string;
  message: string;
  message_type: 'note' | 'log';
  created_at: string;
}

export async function logChatter(recordType: string, recordId: string, message: string) {
  if (!recordId) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('chatter').insert({
      user_id: user.id,
      record_type: recordType,
      record_id: recordId,
      message,
      message_type: 'log',
    });
  } catch {
    // fire-and-forget — silently ignore
  }
}

interface ChatterProps {
  recordType: string;
  recordId: string;
}

export function Chatter({ recordType, recordId }: ChatterProps) {
  const [messages, setMessages] = useState<ChatterMsg[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tableExists, setTableExists] = useState<boolean | null>(null); // null = loading
  const [errorMsg, setErrorMsg] = useState('');
  const [userInitial, setUserInitial] = useState('U');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserInitial(data.user.email[0].toUpperCase());
    });
  }, []);

  useEffect(() => {
    if (recordId) loadMessages();
  }, [recordId]);

  async function loadMessages() {
    const { data, error } = await supabase
      .from('chatter')
      .select('id, message, message_type, created_at')
      .eq('record_type', recordType)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });

    if (error) {
      const code = (error as any).code;
      if (code === '42P01' || code === 'PGRST205') {
        setTableExists(false);
      } else {
        setTableExists(true);
        console.error('[Chatter] loadMessages error:', error);
      }
      return;
    }
    setTableExists(true);
    setMessages((data as ChatterMsg[]) || []);
  }

  async function addNote() {
    const text = note.trim();
    if (!text || !recordId) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        setErrorMsg('Not logged in — please refresh and try again');
        return;
      }

      const { error: insertError } = await supabase.from('chatter').insert({
        user_id: authData.user.id,
        record_type: recordType,
        record_id: recordId,
        message: text,
        message_type: 'note',
      });

      if (insertError) {
        const code = (insertError as any).code;
        if (code === '42P01' || code === 'PGRST205') {
          setTableExists(false);
        } else {
          setErrorMsg(`Error: ${insertError.message} (${code})`);
          console.error('[Chatter] insert error:', insertError);
        }
        return;
      }

      setNote('');
      await loadMessages();
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  }

  // Still loading
  if (tableExists === null) return null;

  // Table doesn't exist — show setup prompt instead of disappearing silently
  if (tableExists === false) {
    return (
      <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
          <strong style={{ color: 'var(--text2)' }}>Chatter</strong> — table not set up yet. Run this SQL in Supabase → SQL Editor to enable it:
          <pre style={{ margin: '10px 0 0', fontSize: 11, background: '#f3f4f6', borderRadius: 6, padding: '10px 12px', overflowX: 'auto', color: '#374151', lineHeight: 1.6 }}>
{`create table public.chatter (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  record_type text not null,
  record_id text not null,
  message text not null,
  message_type text not null default 'note',
  created_at timestamptz not null default now()
);
alter table chatter enable row level security;
create policy "chatter_policy" on chatter
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`}
          </pre>
        </div>
      </div>
    );
  }

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB') + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 20, letterSpacing: '0.01em' }}>
        Chatter
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg,#6d28d9,#8b5cf6)',
          color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0,
        }}>
          {userInitial}
        </div>
        <div style={{ flex: 1 }}>
          <textarea
            ref={textareaRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') addNote(); }}
            placeholder="Log a note or internal message..."
            rows={2}
            style={{
              width: '100%', resize: 'vertical',
              border: `1.5px solid ${errorMsg ? '#dc2626' : 'var(--border)'}`, borderRadius: 8,
              padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
              color: 'var(--text1)', background: '#fff',
              boxSizing: 'border-box', outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = errorMsg ? '#dc2626' : '#8b5cf6'; }}
            onBlur={e => { e.currentTarget.style.borderColor = errorMsg ? '#dc2626' : 'var(--border)'; }}
          />
          {errorMsg && (
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errorMsg}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Ctrl+Enter to submit</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={addNote}
              disabled={submitting || !note.trim()}
              style={{ opacity: (submitting || !note.trim()) ? 0.5 : 1 }}
            >
              {submitting ? 'Saving...' : 'Add Note'}
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
            No activity yet
          </div>
        ) : messages.map(msg => {
          const isNote = msg.message_type === 'note';
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: isNote ? '#ede9fe' : '#f3f4f6',
                color: isNote ? '#7c3aed' : '#9ca3af',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>
                {isNote ? userInitial : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="4 8 12 4 20 8" /><polyline points="4 16 12 20 20 16" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: isNote ? '#f5f3ff' : '#f9fafb',
                  border: `1px solid ${isNote ? '#ede9fe' : '#f3f4f6'}`,
                  fontSize: 13,
                  color: isNote ? 'var(--text1)' : 'var(--text2)',
                  fontStyle: isNote ? 'normal' : 'italic',
                  lineHeight: 1.5,
                }}>
                  {msg.message}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {fmtTime(msg.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
