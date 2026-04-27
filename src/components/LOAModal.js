import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendLOA, getSignwellDocStatus, sendReminder } from '../lib/signwell';

const STATUS_BADGE = {
  draft:     { label: 'Draft',             bg: '#eff6ff', color: '#1e40af' },
  pending:   { label: 'Awaiting Signature', bg: '#fef3c7', color: '#92400e' },
  completed: { label: '✓ Signed',           bg: '#dcfce7', color: '#166534' },
  declined:  { label: '✗ Declined',         bg: '#fee2e2', color: '#991b1b' },
};

export default function LOAModal({
  onClose,
  quoteId,
  quoteNumber,
  proposalName,
  clientName,
  recipientContact,
  recipientEmail: initialEmail,
  serviceAddress,
  portingDIDList,
  settings,
  existingDoc,
  onDocSaved,
}) {
  // ── Signer / recipient ────────────────────────────────────────────────────
  const [contactName,  setContactName]  = useState(recipientContact || existingDoc?.clientName || '');
  const [contactEmail, setContactEmail] = useState(initialEmail || existingDoc?.clientEmail || '');
  const [jobTitle,     setJobTitle]     = useState('');
  const [entityName,   setEntityName]   = useState(clientName || '');

  // ── Current carrier info — what rep fills in ──────────────────────────────
  const [carrierName,     setCarrierName]     = useState('');
  const [carrierAcctNum,  setCarrierAcctNum]  = useState('');
  const [carrierAcctName, setCarrierAcctName] = useState('');
  const [acctType,        setAcctType]        = useState('business'); // business | residential | wireless
  const [wirelessPin,     setWirelessPin]     = useState('');

  // ── Service address — pre-fill from quote ─────────────────────────────────
  const [svcStreet,  setSvcStreet]  = useState('');
  const [svcCity,    setSvcCity]    = useState('');
  const [svcState,   setSvcState]   = useState('');
  const [svcZip,     setSvcZip]     = useState('');

  // ── Numbers ────────────────────────────────────────────────────────────────
  const [didList, setDidList] = useState(portingDIDList || '');

  // ── State ─────────────────────────────────────────────────────────────────
  const [sending,    setSending]    = useState(false);
  const [checking,   setChecking]   = useState(false);
  const [reminding,  setReminding]  = useState(false);
  const [testMode,   setTestMode]   = useState(false);
  const [msg,        setMsg]        = useState('');
  const [msgType,    setMsgType]    = useState('ok');
  const [docRecord,  setDocRecord]  = useState(existingDoc || null);
  const [showPreview,setShowPreview]= useState(false);

  const today    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isSigned  = docRecord?.status === 'completed';
  const isPending = docRecord?.status === 'pending' || docRecord?.status === 'awaiting_signature';

  // Parse service address from quote
  useEffect(() => {
    if (!serviceAddress) return;
    // Try to parse "Street, City, State Zip" or "Street, City, State, Zip"
    const parts = serviceAddress.split(',').map(s => s.trim());
    if (parts.length >= 3) {
      setSvcStreet(parts[0] || '');
      setSvcCity(parts[1] || '');
      // Last part may be "State Zip" or separate
      const stateZip = parts[parts.length - 1].trim().split(' ').filter(Boolean);
      if (stateZip.length >= 2) {
        setSvcZip(stateZip.pop());
        setSvcState(stateZip.join(' '));
      } else {
        setSvcState(parts[parts.length - 1] || '');
        if (parts.length >= 4) setSvcZip(parts[parts.length - 1] || '');
      }
    }
  }, [serviceAddress]);

  function notify(text, type = 'ok') { setMsg(text); setMsgType(type); }

  const isValid = contactEmail && entityName && carrierName && svcStreet && svcCity && svcState && didList.trim();

  async function saveDocToQuote(record) {
    if (!quoteId) return;
    const { data } = await supabase.from('quotes').select('inputs').eq('id', quoteId).single();
    const current = data?.inputs || {};
    const existing = current.signwellDocuments || [];
    const idx = existing.findIndex(d => d.id === record.id && d.type === 'loa');
    const updated = idx >= 0 ? existing.map((d,i) => i===idx ? record : d) : [...existing, record];
    await supabase.from('quotes').update({ inputs: { ...current, signwellDocuments: updated } }).eq('id', quoteId);
    onDocSaved?.(record);
  }

  async function handleSend() {
    if (!isValid) { notify('Please complete all required fields.', 'err'); return; }
    const templateId = settings?.signwell_loa_template_id;
    if (!templateId) { notify('✗ LOA Template ID not configured — add it in Admin → Integrations → SignWell', 'err'); return; }

    setSending(true);
    notify('Sending via SignWell...', 'info');
    try {
      const record = await sendLOA({
        clientEmail:    contactEmail,
        contactName,
        entityName,
        title:          jobTitle,
        quoteNumber,
        proposalName,
        carrierName,
        carrierAcctNum,
        carrierAcctName,
        acctType,
        wirelessPin,
        svcStreet, svcCity, svcState, svcZip,
        didList,
        templateId,
        testMode,
      });
      setDocRecord(record);
      await saveDocToQuote({ ...record, type: 'loa' });
      notify(testMode
        ? '✓ Test LOA sent — check SignWell dashboard.'
        : `✓ LOA sent to ${contactEmail}. Client will receive a signing link by email.`);
    } catch(e) { notify('✗ ' + e.message, 'err'); }
    setSending(false);
  }

  async function handleCheckStatus() {
    if (!docRecord?.documentId) return;
    setChecking(true); notify('Checking...', 'info');
    try {
      const status = await getSignwellDocStatus(docRecord.documentId);
      const updated = { ...docRecord, ...status, type: 'loa' };
      setDocRecord(updated);
      await saveDocToQuote(updated);
      notify(status.status === 'completed' ? '✓ Fully signed.' : `${status.status} — awaiting signatures.`, status.status === 'completed' ? 'ok' : 'info');
    } catch(e) { notify('✗ ' + e.message, 'err'); }
    setChecking(false);
  }

  async function handleRemind() {
    if (!docRecord?.documentId) return;
    setReminding(true);
    try { await sendReminder(docRecord.documentId); notify('✓ Reminder sent.'); }
    catch(e) { notify('✗ ' + e.message, 'err'); }
    setReminding(false);
  }

  const MS = {
    ok:   { bg: '#f0fdf4', bo: '#bbf7d0', c: '#166534' },
    err:  { bg: '#fef2f2', bo: '#fecaca', c: '#991b1b' },
    info: { bg: '#eff6ff', bo: '#bfdbfe', c: '#1e40af' },
  }[msgType] || {};

  const dids = didList.split('\n').filter(l => l.trim());

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:650 }}>
      <div style={{ flex:1 }} onClick={onClose}/>
      <div style={{ width:720, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ background:'#0f1e3c', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>Letter of Authorization — Number Porting</div>
            <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>
              {isSigned ? '✓ Signed — porting can proceed' : isPending ? 'Awaiting client signature' : 'Required before submitting port request to carrier'}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {docRecord?.status && (
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4,
                background: STATUS_BADGE[docRecord.status]?.bg || '#f3f4f6',
                color: STATUS_BADGE[docRecord.status]?.color || '#374151' }}>
                {STATUS_BADGE[docRecord.status]?.label || docRecord.status}
              </span>
            )}
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#94a3b8', fontSize:22, cursor:'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

          {/* Status panel */}
          {docRecord && (
            <div style={{ marginBottom:14, padding:'12px 14px', background: isSigned?'#f0fdf4':'#fefce8', border:`1px solid ${isSigned?'#bbf7d0':'#fde68a'}`, borderRadius:6 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:8 }}>Document Status</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                {[['Sent to', docRecord.clientName||'—'],['Email', docRecord.clientEmail||'—'],
                  ['Sent', docRecord.createdAt ? new Date(docRecord.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'],
                  ['Signed', docRecord.completedAt ? new Date(docRecord.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'],
                  ['Numbers', `${dids.length} DIDs`],
                  ['Carrier', docRecord.carrierName||'—'],
                ].map(([l,v]) => (
                  <div key={l} style={{ background:'white', borderRadius:4, padding:'5px 7px', border:'1px solid #e5e7eb' }}>
                    <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase' }}>{l}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:'#374151', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={handleCheckStatus} disabled={checking}
                  style={{ padding:'5px 12px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer', opacity:checking?.6:1 }}>
                  {checking?'Checking...':'↻ Check Status'}
                </button>
                {isPending && (
                  <button onClick={handleRemind} disabled={reminding}
                    style={{ padding:'5px 12px', background:'white', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, cursor:'pointer', opacity:reminding?.6:1 }}>
                    {reminding?'Sending...':'📧 Send Reminder'}
                  </button>
                )}
                {isSigned && docRecord.completedPdfUrl && (
                  <a href={docRecord.completedPdfUrl} target="_blank" rel="noopener noreferrer"
                    style={{ padding:'5px 12px', background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:4, fontSize:11, fontWeight:600, color:'#166534', textDecoration:'none' }}>
                    ↓ Download Signed LOA
                  </a>
                )}
                <button onClick={()=>setDocRecord(null)}
                  style={{ padding:'5px 12px', background:'white', border:'1px solid #fecaca', borderRadius:4, fontSize:11, color:'#dc2626', cursor:'pointer' }}>
                  Send New
                </button>
              </div>
            </div>
          )}

          {!isSigned && (
            <>
              {/* Reference */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14, padding:'10px 12px', background:'#f8fafc', borderRadius:5, border:'1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#6b7280', marginBottom:2 }}>Proposal</div>
                  <div style={{ fontSize:11, color:'#0f1e3c', fontWeight:600 }}>{proposalName || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#6b7280', marginBottom:2 }}>Reference #</div>
                  <div style={{ fontSize:11, color:'#0f1e3c', fontFamily:'DM Mono, monospace' }}>{quoteNumber || '—'}</div>
                </div>
              </div>

              {/* Signer info */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0f1e3c', marginBottom:8, paddingBottom:3, borderBottom:'1px solid #f1f5f9' }}>👤 Client Signer</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[['Client / Entity Name *', entityName, setEntityName, 'Acme Corp'],
                    ['Authorized Contact *',   contactName, setContactName, 'Jane Smith'],
                    ['Contact Email *',         contactEmail, setContactEmail, 'jane@acme.com'],
                    ['Title / Role',             jobTitle, setJobTitle, 'President, Owner...'],
                  ].map(([lbl,val,setter,ph]) => (
                    <div key={lbl}>
                      <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>{lbl}</label>
                      <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                        style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current carrier info */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0f1e3c', marginBottom:8, paddingBottom:3, borderBottom:'1px solid #f1f5f9' }}>📞 Current Carrier Account</div>
                <div style={{ padding:'7px 10px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:4, fontSize:9, color:'#92400e', marginBottom:8, lineHeight:1.6 }}>
                  ⚠ This information must EXACTLY match what's on the client's current phone bill. Refer to the most recent bill or have the client check with their current provider.
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  {[['Current Carrier / Provider *', carrierName, setCarrierName, 'e.g. AT&T, Comcast, Lumen...'],
                    ['Account # with Current Carrier', carrierAcctNum, setCarrierAcctNum, 'Account number on bill'],
                    ['Account Billing Name', carrierAcctName, setCarrierAcctName, 'Name on the account'],
                  ].map(([lbl,val,setter,ph]) => (
                    <div key={lbl}>
                      <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>{lbl}</label>
                      <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                        style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
                    </div>
                  ))}
                  <div>
                    <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>Account Type</label>
                    <div style={{ display:'flex', gap:6 }}>
                      {[['business','Business'],['residential','Residential'],['wireless','Wireless']].map(([v,l])=>(
                        <label key={v} style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', padding:'4px 8px', borderRadius:4, border:`1px solid ${acctType===v?'#0f1e3c':'#e5e7eb'}`, background:acctType===v?'#f0f4ff':'white', fontSize:10 }}>
                          <input type="radio" checked={acctType===v} onChange={()=>setAcctType(v)} style={{ accentColor:'#0f1e3c' }}/>{l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {acctType === 'wireless' && (
                  <div>
                    <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>Wireless PIN / Tax ID / Last 4 of SSN</label>
                    <input value={wirelessPin} onChange={e=>setWirelessPin(e.target.value)} placeholder="Required for wireless accounts"
                      style={{ width:'50%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
                  </div>
                )}
              </div>

              {/* Service address */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0f1e3c', marginBottom:4, paddingBottom:3, borderBottom:'1px solid #f1f5f9' }}>📍 Service Address</div>
                <div style={{ fontSize:9, color:'#9ca3af', marginBottom:6 }}>Must match the SERVICE address on file with the current carrier — not the billing address. No PO Boxes.</div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:8 }}>
                  {[['Street *', svcStreet, setSvcStreet, '123 Main St', '2fr'],
                    ['City *',   svcCity,   setSvcCity,   'Chicago',     '1fr'],
                    ['State *',  svcState,  setSvcState,  'IL',          '1fr'],
                    ['Zip *',    svcZip,    setSvcZip,    '60601',       '1fr'],
                  ].map(([lbl,val,setter,ph]) => (
                    <div key={lbl}>
                      <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>{lbl}</label>
                      <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                        style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Numbers */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0f1e3c', marginBottom:4, paddingBottom:3, borderBottom:'1px solid #f1f5f9' }}>
                  📋 Numbers to Port ({dids.length})
                </div>
                <textarea value={didList} onChange={e=>setDidList(e.target.value)} rows={Math.max(4, dids.length + 1)}
                  placeholder={"5555550100\n5555550101\n5555550102"}
                  style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', resize:'vertical', outline:'none', lineHeight:1.8 }}/>
                <div style={{ fontSize:8, color:'#9ca3af', marginTop:2 }}>One number per line — 10 digits. Pre-populated from the quote porting list.</div>
              </div>

              {/* DSL/Alarm disclaimer acknowledgment */}
              <div style={{ marginBottom:12, padding:'8px 12px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:5, fontSize:9, color:'#9a3412', lineHeight:1.7 }}>
                <strong>Important — confirm with client before sending:</strong><br/>
                • Information must EXACTLY match the current phone bill (name, address, account number)<br/>
                • Client must NOT contact current provider to disconnect service until port is complete<br/>
                • NO number listed should have DSL or alarm systems associated with it<br/>
                • Client's account balance with current provider must be paid in full<br/>
                • A separate LOA is required for each account if porting from multiple carriers
              </div>

              {/* Test mode */}
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', marginBottom:12 }}>
                <input type="checkbox" checked={testMode} onChange={e=>setTestMode(e.target.checked)} style={{ accentColor:'#374151' }}/>
                <span style={{ fontSize:10, color:'#6b7280' }}>Test mode — non-binding watermarked copy</span>
              </label>
            </>
          )}

          {/* Preview */}
          <div style={{ marginBottom:12 }}>
            <button onClick={()=>setShowPreview(p=>!p)}
              style={{ fontSize:10, padding:'4px 10px', background:'white', border:'1px solid #d1d5db', borderRadius:4, cursor:'pointer', color:'#374151' }}>
              {showPreview?'▲ Hide Preview':'▼ Preview Document'}
            </button>
            {showPreview && (
              <div style={{ marginTop:10, background:'#fafafa', border:'1px solid #e5e7eb', borderRadius:5, padding:'16px 20px', fontSize:11, lineHeight:1.85, color:'#1f2937' }}>
                <div style={{ textAlign:'center', marginBottom:16 }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>Letter of Authorization</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'#374151' }}>Local Number Porting — Hosted PBX Services</div>
                  <div style={{ fontSize:9, color:'#6b7280' }}>Ferrum Technology Services, LLC{quoteNumber?` · ${quoteNumber}`:''} · {today}</div>
                </div>
                <p>By signing this letter, you authorize <strong>Ferrum Technology Services, LLC</strong> to communicate with your current telephone provider in an effort to port your number(s). There will be a one-time fee per number ported for this service.</p>
                <p style={{ fontSize:9, color:'#dc2626', fontWeight:600 }}>Please ensure all information below EXACTLY matches your current telephone bill.</p>
                <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12, fontSize:10 }}>
                  {[
                    ['Current Carrier', carrierName||'__________________'],
                    ['Account #', carrierAcctNum||'__________________'],
                    ['Account Billing Name', carrierAcctName||'__________________'],
                    ['Account Type', acctType ? acctType.charAt(0).toUpperCase()+acctType.slice(1) : '__________________'],
                    ...(acctType==='wireless' ? [['Wireless PIN / Tax ID / Last 4 SSN', wirelessPin||'__________________']] : []),
                    ['Service Street', svcStreet||'__________________'],
                    ['City', svcCity||'__________________'],
                    ['State', svcState||'__'],
                    ['Zip', svcZip||'__________'],
                  ].map(([k,v])=>(
                    <tr key={k} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'4px 8px', fontWeight:600, color:'#6b7280', width:'40%' }}>{k}</td>
                      <td style={{ padding:'4px 8px', color:'#0f1e3c' }}>{v}</td>
                    </tr>
                  ))}
                </table>
                <p style={{ fontWeight:600 }}>Numbers to be ported ({dids.length}):</p>
                <div style={{ fontFamily:'monospace', fontSize:11, lineHeight:2, background:'#f8fafc', padding:'8px 10px', borderRadius:4, marginBottom:12 }}>
                  {dids.length > 0 ? dids.map((n,i)=><div key={i}>{n}</div>) : <span style={{ color:'#9ca3af' }}>No numbers entered</span>}
                </div>
                <p>By signing below, I confirm that all information is accurate and that I have verified with my current provider that <strong>NO NUMBER LISTED ABOVE HAS DSL OR ALARM SYSTEMS ASSOCIATED WITH IT.</strong></p>
                <div style={{ marginTop:14, fontSize:9, color:'#6b7280', borderTop:'1px solid #e5e7eb', paddingTop:8 }}>
                  ✍ Signature captured electronically by SignWell · Ferrum Technology Services, LLC · ferrumit.com
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {msg && (
            <div style={{ fontSize:11, fontWeight:600, marginBottom:10, padding:'7px 10px', borderRadius:4, background:MS.bg, border:`1px solid ${MS.bo}`, color:MS.c }}>{msg}</div>
          )}
          {!isSigned && (
            <>
              <button onClick={handleSend} disabled={sending || !isValid}
                style={{ padding:'9px 18px', background:(sending||!isValid)?'#9ca3af':'#0f1e3c', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:(sending||!isValid)?'not-allowed':'pointer' }}>
                {sending ? 'Sending...' : '↗ Send LOA for Signature'}
              </button>
              {!isValid && <div style={{ fontSize:9, color:'#dc2626', marginTop:4 }}>Complete all required (*) fields to send</div>}
              <div style={{ marginTop:8, fontSize:9, color:'#9ca3af', lineHeight:1.7 }}>
                Client receives a signing link by email. Signed LOA + full audit trail stored in SignWell and linked to this quote.
                Submit the signed LOA along with the most recent phone bill to initiate the port request.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
