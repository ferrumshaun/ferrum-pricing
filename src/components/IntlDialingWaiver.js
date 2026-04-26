import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const INTL_TIERS = {
  standard: {
    label: 'Standard International',
    desc: 'Selected countries — Canada, Mexico, Western Europe, Australia',
    risk: 'Moderate',
  },
  extended: {
    label: 'Extended International',
    desc: 'Broader global coverage — includes Latin America, Asia Pacific, Eastern Europe',
    risk: 'Elevated',
  },
  open: {
    label: 'Full Open International Access',
    desc: 'Unrestricted global dialing — all available destinations',
    risk: 'High — premium fraud risk markets included',
  },
};

export default function IntlDialingWaiver({ onClose, quoteId, quoteNumber, clientName, recipientContact, recipientAddress, settings, sptApiKey, selectedTier }) {
  const [tier,           setTier]           = useState(selectedTier || 'standard');
  const [contactName,    setContactName]    = useState(recipientContact || '');
  const [entityName,     setEntityName]     = useState(clientName || '');
  const [title,          setTitle]          = useState('');
  const [accepted,       setAccepted]       = useState(false);
  const [sending,        setSending]        = useState(false);
  const [msg,            setMsg]            = useState('');
  const [showPreview,    setShowPreview]    = useState(false);

  async function saveToQuote() {
    if (!quoteId) return;
    const { data } = await supabase.from('quotes').select('inputs').eq('id', quoteId).single();
    const current = data?.inputs || {};
    await supabase.from('quotes').update({
      inputs: { ...current, intlWaiver: { tier, contactName, entityName, title, accepted, signedAt: new Date().toISOString() } }
    }).eq('id', quoteId);
  }

  async function exportToSPT() {
    const key = sptApiKey || settings?.spt_api_key;
    if (!key) { setMsg('⚠ SPT API key not configured — add it in Admin → Integrations'); return; }
    setSending(true); setMsg('Creating waiver in Smart Pricing Table...');
    try {
      const res = await fetch('/.netlify/functions/sptProxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createProposal',
          payload: {
            name: `International Dialing Authorization — ${entityName || 'Client'}${quoteNumber ? ` (${quoteNumber})` : ''}`,
            settings: { recipient: { name: entityName } },
            tags: ['international-dialing', 'waiver', 'ferrum-iq'],
          },
          sptApiKey: key,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      await saveToQuote();
      setMsg(`✓ Created in Smart Pricing Table — open it to add signature fields`);
    } catch (e) { setMsg('✗ ' + e.message); }
    setSending(false);
  }

  const tierInfo = INTL_TIERS[tier] || INTL_TIERS.standard;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:650 }}>
      <div style={{ flex:1 }} onClick={onClose} />
      <div style={{ width:660, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ background:'#7c1d1d', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>International Dialing Authorization</div>
            <div style={{ fontSize:10, color:'#fca5a5', marginTop:1 }}>Toll fraud liability waiver — client signature required</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fca5a5', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>

          {/* ── CONFIGURATION ── */}
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:10 }}>Configuration</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'#374151', marginBottom:3 }}>Client / Entity Name</label>
                <input value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="Acme Corp"
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'#374151', marginBottom:3 }}>Authorized Contact</label>
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith"
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'#374151', marginBottom:3 }}>Title / Role</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Owner, CFO, IT Manager..."
                style={{ width:'50%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
            </div>

            {/* Tier selection */}
            <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'#374151', marginBottom:6 }}>International Dialing Tier</label>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {Object.entries(INTL_TIERS).map(([key, t]) => (
                <label key={key} onClick={() => setTier(key)}
                  style={{ display:'flex', gap:10, padding:'8px 10px', borderRadius:5, cursor:'pointer',
                    border:`2px solid ${tier===key?'#dc2626':'#e5e7eb'}`,
                    background: tier===key?'#fef2f2':'white' }}>
                  <input type="radio" checked={tier===key} onChange={() => setTier(key)} style={{ marginTop:1, accentColor:'#dc2626' }}/>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color: tier===key?'#991b1b':'#374151' }}>{t.label}</div>
                    <div style={{ fontSize:9, color:'#6b7280', marginTop:1 }}>{t.desc}</div>
                    <div style={{ fontSize:9, fontWeight:600, color: key==='open'?'#dc2626':key==='extended'?'#d97706':'#0f766e', marginTop:2 }}>
                      Risk level: {t.risk}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── WAIVER DOCUMENT PREVIEW ── */}
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151' }}>Waiver Document</div>
              <button onClick={() => setShowPreview(p => !p)}
                style={{ fontSize:10, padding:'3px 8px', background:'white', border:'1px solid #d1d5db', borderRadius:3, cursor:'pointer', color:'#374151' }}>
                {showPreview ? 'Hide Preview' : 'Preview Document'}
              </button>
            </div>

            {showPreview && (
              <div style={{ background:'#fafafa', border:'1px solid #e5e7eb', borderRadius:5, padding:'16px 18px', fontSize:11, lineHeight:1.8, color:'#1f2937' }}>
                <div style={{ textAlign:'center', marginBottom:16 }}>
                  <div style={{ fontSize:16, fontWeight:700 }}>International Dialing Authorization & Liability Waiver</div>
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>Ferrum Technology Services, LLC</div>
                </div>

                <p>This International Dialing Authorization ("Authorization") is entered into as of <strong>{today}</strong>, by and between <strong>Ferrum Technology Services, LLC</strong> ("Provider") and <strong>{entityName || '[Client Name]'}</strong> ("Client").</p>

                <p><strong>1. Request for International Calling.</strong> Client hereby requests that Provider enable <strong>{tierInfo.label}</strong> ({tierInfo.desc}) on Client's hosted SIP trunking service. Client acknowledges that enabling international calling inherently introduces risk of unauthorized use and toll fraud.</p>

                <p><strong>2. Client Assumes All Financial Responsibility.</strong> Client acknowledges and agrees that it assumes <em>full and sole financial responsibility</em> for all charges associated with international calling placed through Client's account, whether authorized or unauthorized. This includes, without limitation, charges resulting from toll fraud, unauthorized access, compromised credentials, PBX hacking, or any other security incident that results in international calls being placed through Client's SIP trunk or hosted telephony environment.</p>

                <p><strong>3. No Cap on Charges.</strong> Client acknowledges that international calling charges are metered and billed as incurred. There is no cap on charges under this Authorization. Provider shall not be liable for any charges, losses, or damages — including consequential, incidental, or punitive damages — arising from international calling activity on Client's account.</p>

                <p><strong>4. Security Responsibility.</strong> Client is solely responsible for the security of its telephony environment, including but not limited to extension passwords, SIP credentials, call routing rules, and network access controls. Provider recommends Client implement call limits, country restrictions, and off-hours lockouts where available.</p>

                <p><strong>5. Right to Suspend.</strong> Provider reserves the right to disable international calling immediately and without notice in the event of suspected fraud, unusual call patterns, or non-payment of charges.</p>

                <p><strong>6. Indemnification.</strong> Client agrees to indemnify, defend, and hold harmless Ferrum Technology Services, LLC and its officers, employees, and agents from and against any and all claims, liabilities, damages, costs, and expenses (including reasonable attorneys' fees) arising from or related to international calling activity on Client's account.</p>

                <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                  <div>
                    <div style={{ borderTop:'1px solid #374151', paddingTop:6, fontSize:10 }}>
                      <div><strong>Client Signature</strong></div>
                      <div style={{ marginTop:8 }}>Full Name: {contactName || '________________________'}</div>
                      <div style={{ marginTop:4 }}>Title: {title || '________________________'}</div>
                      <div style={{ marginTop:4 }}>Business: {entityName || '________________________'}</div>
                      <div style={{ marginTop:4 }}>Date: ________________________</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ borderTop:'1px solid #374151', paddingTop:6, fontSize:10 }}>
                      <div><strong>Ferrum Technology Services, LLC</strong></div>
                      <div style={{ marginTop:8 }}>Full Name: Shaun Lang</div>
                      <div style={{ marginTop:4 }}>Title: ________________________</div>
                      <div style={{ marginTop:4 }}>Date: ________________________</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── ACTIONS ── */}
          <div style={{ padding:'16px 20px' }}>
            {msg && (
              <div style={{ fontSize:11, fontWeight:600, color: msg.startsWith('✓') ? '#166534' : msg.startsWith('⚠') ? '#92400e' : '#dc2626', marginBottom:10, padding:'6px 10px', background: msg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', borderRadius:4, border: `1px solid ${msg.startsWith('✓') ? '#bbf7d0' : '#fecaca'}` }}>
                {msg}
              </div>
            )}

            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={exportToSPT} disabled={sending || !entityName}
                style={{ padding:'8px 16px', background: (sending||!entityName) ? '#9ca3af' : '#7c1d1d', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor: (sending||!entityName) ? 'not-allowed' : 'pointer' }}>
                {sending ? 'Creating...' : '↗ Export to Smart Pricing Table'}
              </button>
              <button onClick={async () => { await saveToQuote(); setMsg('✓ Saved to quote'); setTimeout(() => setMsg(''), 2500); }}
                disabled={!quoteId}
                style={{ padding:'8px 16px', background:'white', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, fontWeight:600, cursor: quoteId ? 'pointer' : 'not-allowed', color:'#374151', opacity: quoteId ? 1 : 0.5 }}>
                Save to Quote
              </button>
              <button onClick={() => { setShowPreview(true); }}
                style={{ padding:'8px 16px', background:'white', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, fontWeight:600, cursor:'pointer', color:'#374151' }}>
                Preview / Print
              </button>
            </div>
            {!entityName && <div style={{ fontSize:9, color:'#dc2626', marginTop:4 }}>Enter client name before exporting</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
