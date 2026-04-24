import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createHubspotNote } from '../lib/hubspot';

// Sends email via Netlify function
async function sendEmail(action, payload) {
  const res = await fetch('/.netlify/functions/sendEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Email send failed');
  return data;
}

// ─── Send for Review Button + Modal ──────────────────────────────────────────
export function SendForReviewButton({ quote, quoteType, onStatusChange }) {
  const [open,       setOpen]       = useState(false);
  const [teamMembers,setTeamMembers]= useState([]);
  const [reviewerId, setReviewerId] = useState('');
  const [repNote,    setRepNote]    = useState('');
  const [sending,    setSending]    = useState(false);
  const [msg,        setMsg]        = useState('');
  const { profile } = useAuth();

  useEffect(() => {
    if (!open) return;
    supabase.from('profiles').select('id, full_name, email').neq('id', profile?.id)
      .then(({ data }) => setTeamMembers(data || []));
  }, [open, profile?.id]);

  async function send() {
    if (!reviewerId) { setMsg('Please select a reviewer.'); return; }
    if (!quote?.id)  { setMsg('Save the quote first.'); return; }

    setSending(true); setMsg('');
    const reviewer = teamMembers.find(m => m.id === reviewerId);

    try {
      // 1. Update quote status to in_review
      await supabase.from('quotes').update({ status: 'in_review', updated_by: profile?.id }).eq('id', quote.id);

      // 2. Add a quote note
      const noteBody = `Review requested → ${reviewer?.full_name || reviewer?.email}${repNote ? `\n\n"${repNote}"` : ''}`;
      await supabase.from('quote_notes').insert({
        quote_id:   quote.id,
        user_id:    profile?.id,
        user_name:  profile?.full_name || profile?.email?.split('@')[0],
        user_email: profile?.email,
        body:       noteBody,
      });

      // 3. Post to HubSpot if deal linked
      if (quote.hubspot_deal_id) {
        try {
          await createHubspotNote(quote.hubspot_deal_id,
            `${quote.quote_number} — ${quote.client_name}\nReview requested to ${reviewer?.full_name || reviewer?.email} by ${profile?.full_name || profile?.email?.split('@')[0]}${repNote ? `\n\n"${repNote}"` : ''}`
          );
        } catch (e) { console.warn('HubSpot note failed:', e.message); }
      }

      // 4. Send email
      await sendEmail('request_review', {
        reviewerEmail: reviewer?.email,
        reviewerName:  reviewer?.full_name || reviewer?.email?.split('@')[0],
        repName:       profile?.full_name || profile?.email?.split('@')[0],
        quoteNumber:   quote.quote_number,
        clientName:    quote.client_name,
        quoteId:       quote.id,
        quoteType,
        repNote,
      });

      setMsg('✓ Sent for review');
      onStatusChange?.('in_review');
      setTimeout(() => { setOpen(false); setMsg(''); setRepNote(''); setReviewerId(''); }, 1500);
    } catch (err) {
      setMsg('✗ ' + err.message);
    }
    setSending(false);
  }

  const statusOk = ['draft', 'in_review'].includes(quote?.status);

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!quote?.id || !statusOk}
        style={{ padding: '6px 10px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, color: '#92400e', fontWeight: 600, cursor: 'pointer', opacity: (!quote?.id || !statusOk) ? 0.5 : 1 }}>
        👁 Send for Review
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f1e3c', margin: 0 }}>Send for Review</h3>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '3px 0 0' }}>{quote?.quote_number} — {quote?.client_name}</p>
              </div>
              <button onClick={() => { setOpen(false); setMsg(''); }} style={{ background: 'none', border: 'none', fontSize: 20, color: '#6b7280', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Send to</label>
              <select value={reviewerId} onChange={e => setReviewerId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, background: 'white', outline: 'none' }}>
                <option value="">— select team member —</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name || m.email?.split('@')[0]} ({m.email})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Note to reviewer <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
              <textarea value={repNote} onChange={e => setRepNote(e.target.value)} rows={3}
                placeholder="e.g. Discounted 15% due to competitive situation — client has been with us 3 years..."
                style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, resize: 'vertical', outline: 'none', lineHeight: 1.5 }} />
            </div>

            {msg && (
              <div style={{ padding: '7px 10px', borderRadius: 5, fontSize: 12, marginBottom: 12, fontWeight: 500, background: msg.startsWith('✓') ? '#dcfce7' : '#fef2f2', color: msg.startsWith('✓') ? '#166534' : '#dc2626' }}>
                {msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setOpen(false); setMsg(''); }} style={{ padding: '7px 16px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={send} disabled={sending || !reviewerId}
                style={{ padding: '7px 18px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (sending || !reviewerId) ? 0.6 : 1 }}>
                {sending ? 'Sending...' : 'Send for Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Review Banner (shown to reviewer) ───────────────────────────────────────
export function ReviewBanner({ quote, quoteType, onStatusChange }) {
  const [feedback,  setFeedback]  = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [msg,       setMsg]       = useState('');
  const { profile, isAdmin } = useAuth();

  if (quote?.status !== 'in_review') return null;

  // Find who sent it — look at the latest "Review requested" note
  const [requestNote, setRequestNote] = useState(null);
  useEffect(() => {
    if (!quote?.id) return;
    supabase.from('quote_notes').select('*').eq('quote_id', quote.id)
      .ilike('body', 'Review requested%')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setRequestNote(data?.[0] || null));
  }, [quote?.id]);

  async function submitReview(approved) {
    if (!feedback.trim() && !approved) { setMsg('Please add feedback before returning.'); return; }
    setSubmitting(true); setMsg('');

    const newStatus = approved ? 'approved' : 'draft';
    const decision  = approved ? '✓ Approved' : '↩ Returned for revision';

    try {
      // 1. Update status
      await supabase.from('quotes').update({ status: newStatus, updated_by: profile?.id }).eq('id', quote.id);

      // 2. Get rep profile to email them back
      const { data: repData } = await supabase.from('profiles').select('email, full_name')
        .eq('id', quote.inputs?.created_by || quote.created_by || '').single();

      const noteBody = `${decision} by ${profile?.full_name || profile?.email?.split('@')[0]}${feedback ? `\n\n"${feedback}"` : ''}`;

      // 3. Add quote note
      await supabase.from('quote_notes').insert({
        quote_id:   quote.id,
        user_id:    profile?.id,
        user_name:  profile?.full_name || profile?.email?.split('@')[0],
        user_email: profile?.email,
        body:       noteBody,
      });

      // 4. Post to HubSpot
      if (quote.hubspot_deal_id) {
        try {
          await createHubspotNote(quote.hubspot_deal_id,
            `${quote.quote_number} — ${quote.client_name}\n${noteBody}`
          );
        } catch (e) { console.warn('HubSpot note failed:', e.message); }
      }

      // 5. Email the rep back
      const repProfile = repData || { email: quote.inputs?.repEmail, full_name: 'Team' };
      if (repProfile?.email) {
        try {
          await sendEmail('review_response', {
            repEmail:     repProfile.email,
            repName:      repProfile.full_name || repProfile.email?.split('@')[0],
            reviewerName: profile?.full_name || profile?.email?.split('@')[0],
            quoteNumber:  quote.quote_number,
            clientName:   quote.client_name,
            quoteId:      quote.id,
            quoteType,
            approved,
            feedback,
          });
        } catch (e) { console.warn('Email failed:', e.message); }
      }

      setMsg(approved ? '✓ Quote approved' : '✓ Returned to rep');
      onStatusChange?.(newStatus);
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('✗ ' + err.message);
    }
    setSubmitting(false);
  }

  return (
    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 0, padding: '10px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>👁</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>
            Review Requested
            {requestNote && <span style={{ fontWeight: 400, marginLeft: 6 }}>from {requestNote.user_name}</span>}
          </div>
          {requestNote?.body?.includes('"') && (
            <div style={{ fontSize: 11, color: '#78350f', fontStyle: 'italic', marginBottom: 6 }}>
              {requestNote.body.match(/"([^"]+)"/)?.[0]}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
              placeholder="Add your feedback — looks good, change this, etc..."
              style={{ flex: 1, padding: '5px 8px', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, resize: 'none', outline: 'none', background: 'white', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <button onClick={() => submitReview(true)} disabled={submitting}
                style={{ padding: '5px 12px', background: '#166534', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                ✓ Approve
              </button>
              <button onClick={() => submitReview(false)} disabled={submitting}
                style={{ padding: '5px 12px', background: '#92400e', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                ↩ Return
              </button>
            </div>
          </div>
          {msg && <div style={{ fontSize: 11, marginTop: 5, fontWeight: 600, color: msg.startsWith('✓') ? '#166534' : '#dc2626' }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}
