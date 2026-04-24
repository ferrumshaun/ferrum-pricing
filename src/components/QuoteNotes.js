import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createHubspotNote } from '../lib/hubspot';

export default function QuoteNotes({ quoteId, quoteNumber, clientName, hubDealId }) {
  const [notes,    setNotes]    = useState([]);
  const [body,     setBody]     = useState('');
  const [loading,  setLoading]  = useState(true);
  const [posting,  setPosting]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const { profile } = useAuth();
  const bottomRef = useRef(null);

  async function load() {
    if (!quoteId) return;
    const { data } = await supabase
      .from('quote_notes')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });
    setNotes(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [quoteId]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [notes]);

  async function addNote() {
    if (!body.trim() || !quoteId) return;
    setPosting(true); setMsg('');

    const notePayload = {
      quote_id:   quoteId,
      user_id:    profile?.id,
      user_name:  profile?.full_name || profile?.email?.split('@')[0] || 'Team',
      user_email: profile?.email,
      body:       body.trim(),
    };

    // Post to HubSpot if deal is linked
    let hsNoteId = null;
    if (hubDealId) {
      try {
        const hsBody = `${quoteNumber || 'Quote'} — ${clientName || 'Client'}\n\nAdded by ${notePayload.user_name}:\n${body.trim()}`;
        const res = await createHubspotNote(hubDealId, hsBody);
        hsNoteId = res?.noteId || null;
      } catch (err) {
        // Don't block note saving if HubSpot fails
        console.warn('HubSpot note failed:', err.message);
        setMsg('Note saved. HubSpot sync failed — check integration.');
      }
    }

    if (hsNoteId) notePayload.hubspot_note_id = hsNoteId;

    const { error } = await supabase.from('quote_notes').insert(notePayload);
    if (!error) {
      setBody('');
      if (hsNoteId) setMsg('✓ Note saved and posted to HubSpot');
      else if (hubDealId && !hsNoteId) {} // msg already set above
      else setMsg('✓ Note saved');
      await load();
      setTimeout(() => setMsg(''), 3000);
    } else {
      setMsg('✗ Failed to save note: ' + error.message);
    }
    setPosting(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote();
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)   return 'just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHrs  < 24)  return `${diffHrs}h ago`;
    if (diffDays < 7)   return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }

  return (
    <div style={{ background: 'white', borderRadius: 6, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 2, height: 11, background: '#6b7280', borderRadius: 2 }}/>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#374151' }}>
            Quote Notes
          </span>
          {notes.length > 0 && <span style={{ fontSize: 10, color: '#9ca3af' }}>({notes.length})</span>}
        </div>
        {hubDealId && (
          <span style={{ fontSize: 9, color: '#ff7a59', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 6, height: 6, background: '#ff7a59', borderRadius: '50%' }}/>
            Posts to HubSpot
          </span>
        )}
      </div>

      {/* Notes list */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280, padding: '8px 14px' }}>
        {loading && <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>Loading...</div>}
        {!loading && notes.length === 0 && (
          <div style={{ fontSize: 11, color: '#9ca3af', padding: '12px 0', textAlign: 'center' }}>
            No notes yet — add the first one below
          </div>
        )}
        {notes.map((note, i) => (
          <div key={note.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < notes.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>
                  {note.user_name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{note.user_name || 'Team'}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>{formatTime(note.created_at)}</span>
              {note.hubspot_note_id && (
                <span style={{ fontSize: 9, color: '#ff7a59', marginLeft: 'auto', fontWeight: 600 }}>↗ HubSpot</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginLeft: 26, whiteSpace: 'pre-wrap' }}>
              {note.body}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* Add note input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
        {msg && (
          <div style={{ fontSize: 10, marginBottom: 6, fontWeight: 500, color: msg.startsWith('✓') ? '#166534' : '#dc2626' }}>
            {msg}
          </div>
        )}
        {!quoteId && (
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>Save the quote first to add notes.</div>
        )}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!quoteId || posting}
          placeholder={quoteId ? "Add a note... (Ctrl+Enter to submit)" : "Save quote first"}
          rows={2}
          style={{ width: '100%', padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, resize: 'none', outline: 'none', lineHeight: 1.5, background: quoteId ? 'white' : '#f9fafb', color: '#374151', fontFamily: 'DM Sans, system-ui, sans-serif' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
          <span style={{ fontSize: 9, color: '#9ca3af' }}>
            {hubDealId ? 'Note will also post to HubSpot deal activity' : 'Connect a HubSpot deal to also post notes there'}
          </span>
          <button onClick={addNote} disabled={!body.trim() || !quoteId || posting}
            style={{ padding: '4px 12px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: (!body.trim() || !quoteId || posting) ? 0.5 : 1 }}>
            {posting ? 'Posting...' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
