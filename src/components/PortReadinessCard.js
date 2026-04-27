import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { uploadSignedDocToHubSpot } from '../lib/signwell';

const DOC_TYPES = [
  { key: 'loa',     label: 'Letter of Authorization', icon: '✍', required: true,
    desc: 'Client-signed LOA authorizing Ferrum to submit the port request' },
  { key: 'invoice', label: 'Phone Bill / Invoice',    icon: '📄', required: true,
    desc: 'Most recent bill from current carrier — must be dated within 60 days' },
  { key: 'csr',     label: 'Customer Service Record', icon: '📋', required: true,
    desc: 'CSR from losing carrier listing all services and numbers' },
];

const STATUS_COLORS = {
  ready:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', dot: '#22c55e' },
  missing: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', dot: '#ef4444' },
  pending: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', dot: '#f59e0b' },
};

export default function PortReadinessCard({
  quoteId, quoteNumber, clientName, clientEmail,
  recipientContact, hubDealId, loaDocRecord, settings,
}) {
  const [portDocs,    setPortDocs]    = useState([]);
  const [tokens,      setTokens]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [sending,     setSending]     = useState(false);
  const [sendMsg,     setSendMsg]     = useState('');
  const [syncing,     setSyncing]     = useState({});
  const [customMsg,   setCustomMsg]   = useState('');
  const [showLinkForm,setShowLinkForm]= useState(false);
  const [linkEmail,   setLinkEmail]   = useState(clientEmail || '');

  useEffect(() => {
    if (!quoteId) { setLoading(false); return; }
    load();
  }, [quoteId]);

  async function load() {
    setLoading(true);
    const [docsRes, tokensRes] = await Promise.all([
      supabase.from('port_documents').select('*').eq('quote_id', quoteId).eq('active', true).order('uploaded_at', { ascending: false }),
      supabase.from('portal_upload_tokens').select('*').eq('quote_id', quoteId).order('created_at', { ascending: false }),
    ]);
    setPortDocs(docsRes.data || []);
    setTokens(tokensRes.data || []);
    setLoading(false);
  }

  async function sendUploadLink() {
    if (!linkEmail) { setSendMsg('✗ Email address required'); return; }
    setSending(true); setSendMsg('');
    try {
      // Create upload token
      const { data: tok, error } = await supabase.from('portal_upload_tokens').insert({
        quote_id:     quoteId,
        quote_number: quoteNumber,
        client_name:  clientName,
        client_email: linkEmail,
        doc_types:    ['invoice', 'csr'],
        message:      customMsg || null,
      }).select().single();

      if (error) throw new Error(error.message);

      // Send email via sendEmail function
      const portalUrl = `${window.location.origin}/portal/upload/${tok.token}`;
      const emailRes = await fetch('/.netlify/functions/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      linkEmail,
          subject: `Action Required — Upload Documents for Number Porting · ${quoteNumber || clientName}`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <div style="background:#0f1e3c;padding:16px 20px;border-radius:6px 6px 0 0;">
                <span style="color:white;font-weight:700;font-size:16px;">Ferrum Technology Services</span>
              </div>
              <div style="background:#f8fafc;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;">
                <p style="color:#374151;font-size:14px;">Hello${recipientContact ? ` ${recipientContact}` : ''},</p>
                <p style="color:#374151;font-size:14px;line-height:1.7;">
                  To proceed with porting your phone numbers to Ferrum Technology Services, we need the following documents:
                </p>
                <ul style="color:#374151;font-size:13px;line-height:2;">
                  <li><strong>Phone Bill / Invoice</strong> — most recent bill from your current carrier (dated within 60 days)</li>
                  <li><strong>Customer Service Record (CSR)</strong> — request this from your current carrier; it lists all services on your account</li>
                </ul>
                ${customMsg ? `<p style="color:#374151;font-size:13px;background:#fff3cd;padding:10px 14px;border-radius:4px;border-left:3px solid #ffc107;">${customMsg}</p>` : ''}
                <div style="text-align:center;margin:24px 0;">
                  <a href="${portalUrl}" style="background:#0f1e3c;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
                    Upload Documents →
                  </a>
                </div>
                <p style="color:#9ca3af;font-size:11px;text-align:center;">
                  This link expires in 7 days. No account or login required — just click and upload.<br/>
                  Questions? Reply to this email or contact your Ferrum representative.
                </p>
              </div>
            </div>
          `,
        }),
      });

      if (emailRes.ok) {
        setSendMsg(`✓ Upload link sent to ${linkEmail}`);
        setShowLinkForm(false);
        await load();
      } else {
        setSendMsg('✗ Email failed — copy link manually: ' + portalUrl);
      }
    } catch(e) { setSendMsg('✗ ' + e.message); }
    setSending(false);
  }

  async function syncToHubSpot(doc) {
    if (!hubDealId) return;
    setSyncing(s => ({ ...s, [doc.id]: true }));
    try {
      // Get a signed URL for the file
      const { data: { signedUrl }, error } = await supabase.storage
        .from('port-documents')
        .createSignedUrl(doc.storage_path, 3600); // 1-hour URL
      if (error) throw new Error(error.message);

      const res = await fetch('/.netlify/functions/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_signed_document',
          payload: {
            pdfUrl:      signedUrl,
            dealId:      hubDealId,
            docLabel:    DOC_TYPES.find(t => t.key === doc.doc_type)?.label || doc.doc_type,
            quoteNumber,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        await supabase.from('port_documents')
          .update({ hubspot_file_id: data.fileId, hubspot_synced_at: new Date().toISOString() })
          .eq('id', doc.id);
        await load();
      } else throw new Error(data.error || 'Upload failed');
    } catch(e) {
      alert('HubSpot sync failed: ' + e.message);
    }
    setSyncing(s => ({ ...s, [doc.id]: false }));
  }

  async function deleteDoc(doc) {
    if (!window.confirm(`Remove ${doc.file_name}?`)) return;
    await supabase.storage.from('port-documents').remove([doc.storage_path]);
    await supabase.from('port_documents').update({ active: false }).eq('id', doc.id);
    await load();
  }

  async function downloadDoc(doc) {
    const { data } = await supabase.storage.from('port-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  // ── Compute readiness ─────────────────────────────────────────────────────
  const loaReady     = loaDocRecord?.status === 'completed';
  const invoiceReady = portDocs.some(d => d.doc_type === 'invoice');
  const csrReady     = portDocs.some(d => d.doc_type === 'csr');
  const allReady     = loaReady && invoiceReady && csrReady;
  const activeToken  = tokens.find(t => new Date(t.expires_at) > new Date() && !t.completed_at);

  const CHECKLIST = [
    { key: 'loa',     ready: loaReady,     label: 'Letter of Authorization', source: loaReady ? 'Signed via SignWell' : 'Not signed yet' },
    { key: 'invoice', ready: invoiceReady, label: 'Phone Bill / Invoice',    source: invoiceReady ? portDocs.find(d=>d.doc_type==='invoice')?.file_name : 'Not received' },
    { key: 'csr',     ready: csrReady,     label: 'Customer Service Record', source: csrReady ? portDocs.find(d=>d.doc_type==='csr')?.file_name : 'Not received' },
  ];

  if (loading) return (
    <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
      <div style={{ fontSize:9, color:'#9ca3af' }}>Loading port readiness…</div>
    </div>
  );

  return (
    <div style={{ background: allReady ? '#f0fdf4' : 'white', borderRadius:6, border:`1px solid ${allReady ? '#bbf7d0' : '#e5e7eb'}`, padding:11, marginBottom:8 }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#0f1e3c' }}>
            {allReady ? '✅ Port Readiness — Ready to Submit' : '📋 Port Readiness'}
          </div>
          <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>
            {allReady ? 'All 3 required documents received — LOA + Invoice + CSR' : `${CHECKLIST.filter(c=>c.ready).length} of 3 documents ready`}
          </div>
        </div>
        {!allReady && (
          <button onClick={() => setShowLinkForm(f => !f)}
            style={{ padding:'3px 9px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:9, fontWeight:700, cursor:'pointer' }}>
            Send Upload Link
          </button>
        )}
      </div>

      {/* Checklist */}
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
        {CHECKLIST.map(item => {
          const sc = item.ready ? STATUS_COLORS.ready : STATUS_COLORS.missing;
          return (
            <div key={item.key} style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 7px', borderRadius:4, background:sc.bg, border:`1px solid ${sc.border}` }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, fontWeight:600, color:sc.text }}>{item.label}</div>
                <div style={{ fontSize:8, color:'#6b7280' }}>{item.source}</div>
              </div>
              {item.ready && <span style={{ fontSize:9, color:sc.text }}>✓</span>}
            </div>
          );
        })}
      </div>

      {/* Send upload link form */}
      {showLinkForm && (
        <div style={{ padding:'10px', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:5, marginBottom:8 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#374151', marginBottom:6 }}>Send Upload Link to Client</div>
          <input value={linkEmail} onChange={e => setLinkEmail(e.target.value)} placeholder="client@company.com" type="email"
            style={{ width:'100%', padding:'5px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none', marginBottom:5 }}/>
          <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={2}
            placeholder="Optional message to include in the email…"
            style={{ width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, resize:'vertical', outline:'none', marginBottom:6 }}/>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={sendUploadLink} disabled={sending}
              style={{ flex:1, padding:'6px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:700, cursor:'pointer', opacity:sending?.6:1 }}>
              {sending ? 'Sending…' : '↗ Send Upload Link'}
            </button>
            <button onClick={() => setShowLinkForm(false)}
              style={{ padding:'6px 10px', background:'white', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
          {sendMsg && <div style={{ fontSize:10, fontWeight:600, marginTop:5, color: sendMsg.startsWith('✓') ? '#166534' : '#dc2626' }}>{sendMsg}</div>}
          {activeToken && (
            <div style={{ fontSize:9, color:'#6b7280', marginTop:4 }}>
              Active upload link expires {new Date(activeToken.expires_at).toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      {/* Uploaded documents */}
      {portDocs.length > 0 && (
        <div>
          <div style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', color:'#9ca3af', marginBottom:5 }}>Uploaded Documents</div>
          {portDocs.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 7px', background:'#f8fafc', borderRadius:4, border:'1px solid #e5e7eb', marginBottom:3 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, fontWeight:600, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {DOC_TYPES.find(t=>t.key===doc.doc_type)?.icon} {doc.file_name}
                </div>
                <div style={{ fontSize:8, color:'#9ca3af' }}>
                  {DOC_TYPES.find(t=>t.key===doc.doc_type)?.label} · {new Date(doc.uploaded_at).toLocaleDateString()}
                  {doc.hubspot_file_id && ' · ✓ HubSpot'}
                </div>
              </div>
              <div style={{ display:'flex', gap:3, flexShrink:0 }}>
                <button onClick={() => downloadDoc(doc)}
                  style={{ padding:'2px 6px', background:'white', border:'1px solid #d1d5db', borderRadius:3, fontSize:9, cursor:'pointer' }}>↓</button>
                {hubDealId && !doc.hubspot_file_id && (
                  <button onClick={() => syncToHubSpot(doc)} disabled={syncing[doc.id]}
                    style={{ padding:'2px 6px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:3, fontSize:9, cursor:'pointer', color:'#9a3412', opacity:syncing[doc.id]?.6:1 }}>
                    {syncing[doc.id] ? '…' : 'HubSpot'}
                  </button>
                )}
                <button onClick={() => deleteDoc(doc)}
                  style={{ padding:'2px 6px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:3, fontSize:9, cursor:'pointer', color:'#dc2626' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Port readiness note */}
      {!allReady && (
        <div style={{ marginTop:6, fontSize:8, color:'#9ca3af', lineHeight:1.6 }}>
          All three documents must be on file before a port request can be submitted.
          Send the upload link to the client for the Invoice and CSR.
        </div>
      )}
    </div>
  );
}
