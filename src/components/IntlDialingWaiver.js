import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { sendIntlDialingWaiver, getSignwellDocStatus, sendReminder } from '../lib/signwell';

const INTL_TIERS = {
  standard: { label:'Standard International',       desc:'Canada, Mexico, Western Europe, Australia',           risk:'Moderate', color:'#0f766e' },
  extended: { label:'Extended International',        desc:'Latin America, Asia Pacific, Eastern Europe',         risk:'Elevated', color:'#d97706' },
  open:     { label:'Full Open International Access',desc:'Unrestricted global dialing — all destinations',     risk:'High',     color:'#dc2626' },
};
const STATUS_BADGE = {
  pending:   { label:'Awaiting Signature', bg:'#fef3c7', color:'#92400e' },
  completed: { label:'✓ Signed',           bg:'#dcfce7', color:'#166534' },
  declined:  { label:'✗ Declined',         bg:'#fee2e2', color:'#991b1b' },
};

export default function IntlDialingWaiver({ onClose, quoteId, quoteNumber, clientName, recipientContact, recipientEmail: initialEmail, settings, selectedTier, existingDoc, onDocSaved }) {
  const [tier,         setTier]         = useState(selectedTier || existingDoc?.tier || 'standard');
  const [entityName,   setEntityName]   = useState(clientName || '');
  const [contactName,  setContactName]  = useState(recipientContact || existingDoc?.clientName || '');
  const [contactEmail, setContactEmail] = useState(initialEmail || existingDoc?.clientEmail || '');
  const [jobTitle,     setJobTitle]     = useState('');
  const [sending,      setSending]      = useState(false);
  const [checking,     setChecking]     = useState(false);
  const [reminding,    setReminding]    = useState(false);
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState('ok');
  const [docRecord,    setDocRecord]    = useState(existingDoc || null);
  const [showPreview,  setShowPreview]  = useState(false);
  const [testMode,     setTestMode]     = useState(false);

  const tierInfo = INTL_TIERS[tier];
  const today    = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const isLive   = docRecord != null;
  const isSigned = docRecord?.status === 'completed';
  const isPending= docRecord?.status === 'pending';

  function notify(text, type='ok') { setMsg(text); setMsgType(type); }

  async function saveDocToQuote(record) {
    if (!quoteId) return;
    const { data } = await supabase.from('quotes').select('inputs').eq('id', quoteId).single();
    const current = data?.inputs || {};
    const existing = current.signwellDocuments || [];
    const idx = existing.findIndex(d => d.id === record.id);
    const updated = idx >= 0 ? existing.map((d,i) => i===idx ? record : d) : [...existing, record];
    await supabase.from('quotes').update({ inputs: { ...current, signwellDocuments: updated } }).eq('id', quoteId);
    onDocSaved?.(record);
  }

  async function handleSend() {
    if (!contactEmail) { notify('Contact email is required.', 'err'); return; }
    if (!entityName)   { notify('Client name is required.', 'err');   return; }
    setSending(true); notify('Sending via SignWell...', 'info');
    try {
      const record = await sendIntlDialingWaiver({ clientName: entityName, clientEmail: contactEmail, contactName, entityName, title: jobTitle, tier, tierLabel: tierInfo.label, tierDesc: tierInfo.desc, quoteNumber, testMode });
      setDocRecord(record);
      await saveDocToQuote(record);
      notify(testMode ? '✓ Test document sent — check SignWell dashboard. No email in test mode.' : `✓ Signing request sent to ${contactEmail}. Client will receive a link by email.`);
    } catch(e) { notify('✗ ' + e.message, 'err'); }
    setSending(false);
  }

  async function handleCheckStatus() {
    if (!docRecord?.documentId) return;
    setChecking(true); notify('Checking status...', 'info');
    try {
      const status = await getSignwellDocStatus(docRecord.documentId);
      const updated = { ...docRecord, ...status };
      setDocRecord(updated);
      await saveDocToQuote(updated);
      if (status.status === 'completed') { notify('✓ Fully signed by all parties.'); }
      else {
        const signed = status.recipients?.filter(r => r.signed).length || 0;
        notify(`${status.status} — ${signed}/${status.recipients?.length || 2} signed`, 'info');
      }
    } catch(e) { notify('✗ ' + e.message, 'err'); }
    setChecking(false);
  }

  async function handleRemind() {
    if (!docRecord?.documentId) return;
    setReminding(true);
    try { await sendReminder(docRecord.documentId); notify('✓ Reminder sent to unsigned parties.'); }
    catch(e) { notify('✗ ' + e.message, 'err'); }
    setReminding(false);
  }

  const MS = { ok:{bg:'#f0fdf4',bo:'#bbf7d0',c:'#166534'}, err:{bg:'#fef2f2',bo:'#fecaca',c:'#991b1b'}, info:{bg:'#eff6ff',bo:'#bfdbfe',c:'#1e40af'} }[msgType] || {};

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:650 }}>
      <div style={{ flex:1 }} onClick={onClose} />
      <div style={{ width:680, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ background:'#7c1d1d', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>International Dialing Authorization</div>
            <div style={{ fontSize:10, color:'#fca5a5', marginTop:1 }}>
              {isSigned?'✓ Fully signed — audit trail complete':isPending?'Awaiting client signature':'Toll fraud liability waiver — client signature required'}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {docRecord?.status && (
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, background:STATUS_BADGE[docRecord.status]?.bg||'#f3f4f6', color:STATUS_BADGE[docRecord.status]?.color||'#374151' }}>
                {STATUS_BADGE[docRecord.status]?.label||docRecord.status}
              </span>
            )}
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#fca5a5', fontSize:22, cursor:'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>

          {/* Status panel — shown when doc already sent */}
          {isLive && (
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', background: isSigned?'#f0fdf4':'#fefce8' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:8 }}>Document Status</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                {[['Sent to', docRecord.clientName||docRecord.entityName], ['Email', docRecord.clientEmail], ['Tier', INTL_TIERS[docRecord.tier]?.label||docRecord.tier],
                  ['Sent', docRecord.createdAt?new Date(docRecord.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'],
                  ['Completed', docRecord.completedAt?new Date(docRecord.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'],
                  ['Doc ID', docRecord.documentId?.slice(0,12)+'...'||'—']
                ].map(([l,v]) => (
                  <div key={l} style={{ background:'white', borderRadius:4, padding:'5px 7px', border:'1px solid #e5e7eb' }}>
                    <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase' }}>{l}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:'#374151', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={handleCheckStatus} disabled={checking} style={{ padding:'5px 12px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer', opacity:checking?.6:1 }}>
                  {checking?'Checking...':'↻ Check Status'}
                </button>
                {isPending && (
                  <button onClick={handleRemind} disabled={reminding} style={{ padding:'5px 12px', background:'white', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, cursor:'pointer', color:'#374151', opacity:reminding?.6:1 }}>
                    {reminding?'Sending...':'📧 Send Reminder'}
                  </button>
                )}
                {isSigned && docRecord.completedPdfUrl && (
                  <a href={docRecord.completedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ padding:'5px 12px', background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:4, fontSize:11, fontWeight:600, color:'#166534', textDecoration:'none' }}>
                    ↓ Download Signed PDF
                  </a>
                )}
                <button onClick={()=>setDocRecord(null)} style={{ padding:'5px 12px', background:'white', border:'1px solid #fecaca', borderRadius:4, fontSize:11, color:'#dc2626', cursor:'pointer' }}>
                  Send New
                </button>
              </div>
            </div>
          )}

          {/* Configuration form — hidden once signed */}
          {!isSigned && (
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:10 }}>Configuration</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                {[['Client / Entity Name *', entityName, setEntityName, 'Acme Corp', 'text'],
                  ['Authorized Contact',     contactName, setContactName, 'Jane Smith', 'text'],
                  ['Contact Email *',         contactEmail, setContactEmail, 'jane@acme.com', 'email'],
                  ['Title / Role',            jobTitle, setJobTitle, 'President, CFO...', 'text'],
                ].map(([lbl,val,setter,ph,type]) => (
                  <div key={lbl}>
                    <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>{lbl}</label>
                    <input type={type} value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
                  </div>
                ))}
              </div>

              <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:6 }}>International Dialing Tier</label>
              <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:12 }}>
                {Object.entries(INTL_TIERS).map(([key,t]) => (
                  <label key={key} onClick={()=>setTier(key)} style={{ display:'flex', gap:10, padding:'8px 10px', borderRadius:5, cursor:'pointer', border:`2px solid ${tier===key?t.color:'#e5e7eb'}`, background:tier===key?(key==='open'?'#fef2f2':key==='extended'?'#fffbeb':'#f0fdf4'):'white' }}>
                    <input type="radio" checked={tier===key} onChange={()=>setTier(key)} style={{ marginTop:1, accentColor:t.color }}/>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:tier===key?t.color:'#374151' }}>{t.label}</div>
                      <div style={{ fontSize:9, color:'#6b7280', marginTop:1 }}>{t.desc}</div>
                      <div style={{ fontSize:9, fontWeight:600, color:t.color, marginTop:2 }}>Risk: {t.risk}</div>
                    </div>
                  </label>
                ))}
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                <input type="checkbox" checked={testMode} onChange={e=>setTestMode(e.target.checked)} style={{ accentColor:'#374151' }}/>
                <span style={{ fontSize:10, color:'#6b7280' }}>Test mode — sends a watermarked non-binding copy (verify setup first)</span>
              </label>
            </div>
          )}

          {/* Preview */}
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <button onClick={()=>setShowPreview(p=>!p)} style={{ fontSize:10, padding:'4px 10px', background:'white', border:'1px solid #d1d5db', borderRadius:4, cursor:'pointer', color:'#374151' }}>
              {showPreview?'▲ Hide Preview':'▼ Preview Document'}
            </button>
            {showPreview && (
              <div style={{ marginTop:10, background:'#fafafa', border:'1px solid #e5e7eb', borderRadius:5, padding:'14px 16px', fontSize:11, lineHeight:1.85, color:'#1f2937' }}>
                <div style={{ textAlign:'center', marginBottom:14 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>International Dialing Authorization & Liability Waiver</div>
                  <div style={{ fontSize:9, color:'#6b7280' }}>Ferrum Technology Services, LLC{quoteNumber?` · ${quoteNumber}`:''} · {today}</div>
                </div>
                <p>This Authorization is between <strong>Ferrum Technology Services, LLC</strong> and <strong>{entityName||'[Client]'}</strong>, effective the date of signing.</p>
                <p><strong>1. Request.</strong> Client requests that Provider enable <strong>{tierInfo.label}</strong> ({tierInfo.desc}) on Client's hosted SIP trunking. Client acknowledges this introduces risk of unauthorized use and toll fraud.</p>
                <p><strong>2. Full Financial Responsibility.</strong> Client assumes <em>full and sole</em> financial responsibility for all international calling charges — authorized or unauthorized — including toll fraud, PBX hacking, and compromised credentials. <strong>There is no cap on charges.</strong></p>
                <p><strong>3. Security Responsibility.</strong> Client is solely responsible for telephony security — extension passwords, SIP credentials, call routing, and network access controls.</p>
                <p><strong>4. Right to Suspend.</strong> Provider may disable international calling immediately without notice upon suspected fraud, unusual call patterns, or non-payment.</p>
                <p><strong>5. Indemnification.</strong> Client agrees to indemnify Ferrum Technology Services, LLC from all claims, liabilities, costs, and expenses arising from international calling on Client's account.</p>
                <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, fontSize:10 }}>
                  {[['Client', `${contactName||'________________________'}\n${jobTitle||'________________________'}\n${entityName||'________________________'}`],
                    ['Ferrum Technology Services, LLC', 'Shaun Lang\nChief Experience Officer\nFerrum Technology Services, LLC']
                  ].map(([title, details]) => (
                    <div key={title} style={{ borderTop:'1px solid #374151', paddingTop:8 }}>
                      <strong>{title}</strong>
                      <pre style={{ fontFamily:'inherit', margin:'4px 0', fontSize:10, whiteSpace:'pre-wrap' }}>{details}</pre>
                      Signature: ________________________<br/>Date: ________________________
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Send action */}
          <div style={{ padding:'16px 20px' }}>
            {msg && <div style={{ fontSize:11, fontWeight:600, marginBottom:12, padding:'7px 10px', borderRadius:4, background:MS.bg, border:`1px solid ${MS.bo}`, color:MS.c }}>{msg}</div>}
            {!isSigned && (
              <>
                <button onClick={handleSend} disabled={sending||!entityName||!contactEmail}
                  style={{ padding:'9px 18px', background:(sending||!entityName||!contactEmail)?'#9ca3af':'#7c1d1d', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:(sending||!entityName||!contactEmail)?'not-allowed':'pointer' }}>
                  {sending?'Sending...' : isLive?'↗ Send Updated Document':'↗ Send for Signature via SignWell'}
                </button>
                {(!entityName||!contactEmail) && <div style={{ fontSize:9, color:'#dc2626', marginTop:4 }}>Name and email required</div>}
              </>
            )}
            <div style={{ marginTop:10, fontSize:9, color:'#9ca3af', lineHeight:1.6 }}>
              Client receives an email with a signing link — no account required. Both parties sign: client first, then Ferrum.
              Full audit trail (IP, timestamp, auth method) stored in SignWell and linked to this quote.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
