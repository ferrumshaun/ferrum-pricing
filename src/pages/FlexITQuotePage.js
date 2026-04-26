import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { lookupZip, lookupZipFromUSPS } from '../lib/pricing';
import { buildRateSheet, fmtRate, isArea2 } from '../lib/rateSheet';
import { saveQuoteVersion } from '../lib/quoteVersions';
import QuoteNotes   from '../components/QuoteNotes';
import QuoteHistory from '../components/QuoteHistory';
import HubSpotConnect from '../components/HubSpotConnect';
import SPTConnect     from '../components/SPTConnect';
import { DocumentsPanel } from '../components/RateSheetModal';
import { SendForReviewButton, ReviewBanner } from '../components/SendForReview';

// ── FlexIT fixed assumptions (from PDF) ──────────────────────────────────────
const FLEXIT_ASSUMPTIONS = [
  'Client engages Ferrum Technology Services on an as-needed, break/fix basis with no ongoing managed services agreement in place.',
  'All services are rendered on a time and materials basis. Rates, billing increments, after-hours premiums, and holiday rates are defined in the Rate Card attached to this agreement.',
  'No service level commitments, guaranteed response times, or priority scheduling are implied or guaranteed under this plan.',
  'Client is responsible for providing timely access to systems, personnel, and facilities. Delays caused by lack of access may result in additional billable time.',
  'Onsite dispatch is subject to technician availability. Same-day or emergency dispatch is not guaranteed and may be subject to rates outlined in the Rate Card.',
  'Client acknowledges that time and materials engagements are not capped unless a not-to-exceed amount is explicitly agreed upon in writing prior to work commencing.',
  'Hardware, software, licensing, and third-party services procured on behalf of the client are billed separately. All such sales are final — no returns or refunds.',
];

// ── Helper components ─────────────────────────────────────────────────────────
function Sec({ t, c, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:5, paddingBottom:3, borderBottom:'1px solid #f1f5f9' }}>
        <div style={{ width:2, height:11, background:c||'#f97316', borderRadius:2 }}/>
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#6b7280' }}>{t}</span>
      </div>
      {children}
    </div>
  );
}
function Fld({ lbl, s, children }) {
  return (
    <div style={{ marginBottom:4, ...s }}>
      <label style={{ display:'block', fontSize:9, fontWeight:600, color:'#374151', marginBottom:1 }}>{lbl}</label>
      {children}
    </div>
  );
}
function TI({ value, onChange, placeholder }) {
  return <input value={value||''} onChange={e => onChange(e.target.value)} placeholder={placeholder||''} style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>;
}
function NI({ v, s }) {
  return <input type="number" value={v} min={0} step={0.5} onChange={e => s(parseFloat(e.target.value)||0)} style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', color:'#1e3a5f', background:'#eff6ff', fontWeight:600, outline:'none' }}/>;
}
function SI({ v, s, opts }) {
  return <select value={v} onChange={e => s(e.target.value)} style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none', color:'#374151' }}>{opts.map(([a,b]) => <option key={a} value={a}>{b}</option>)}</select>;
}
const fmt$0 = n => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const fmt$2 = n => n != null ? `$${Number(n).toFixed(2)}` : '—';

// ── Main component ────────────────────────────────────────────────────────────
export default function FlexITQuotePage() {
  const { id }        = useParams();
  const navigate      = useNavigate();
  const location      = useLocation();
  const { profile, isAdmin } = useAuth();
  const { settings, loading: configLoading } = useConfig();

  // Quote meta
  const [existingQuote,  setExistingQuote]  = useState(null);
  const [quoteStatus,    setQuoteStatus]    = useState('draft');
  const [proposalName,   setProposalName]   = useState('');
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState('');

  // Rep
  const [repId,        setRepId]        = useState(null);
  const [repProfile,   setRepProfile]   = useState(null);
  const [teamMembers,  setTeamMembers]  = useState([]);

  // Client
  const [recipientBiz,     setRecipientBiz]     = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [recipientEmail,   setRecipientEmail]   = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [clientZip,        setClientZip]        = useState('');
  const [zipResult,        setZipResult]        = useState(null);
  const [marketCity,       setMarketCity]       = useState('');
  const [marketState,      setMarketState]      = useState('');

  // Market analysis
  const [marketAnalysis, setMarketAnalysis] = useState(null);

  // FlexIT-specific
  const [prepayHours,    setPrepayHours]    = useState(2);
  const [overridePrepay, setOverridePrepay] = useState(false);
  const [prepayOverride, setPrepayOverride] = useState('');
  const [notes,          setNotes]          = useState('');

  // Integrations
  const [hubDealId,      setHubDealId]      = useState('');
  const [hubDealUrl,     setHubDealUrl]     = useState('');
  const [hubDealName,    setHubDealName]    = useState('');
  const [hubDescription, setHubDescription]= useState('');
  const [sptProposalId,  setSptProposalId]  = useState(null);

  // Computed rates
  const rateSheet    = marketAnalysis ? buildRateSheet({ analysis: marketAnalysis, settings, clientName: recipientBiz, recipientContact }) : null;
  const remoteRate   = marketAnalysis?.rates?.remote_support || parseFloat(settings?.oos_remote_rate || 165);
  const prepayAmount = overridePrepay && prepayOverride
    ? parseFloat(prepayOverride) || 0
    : Math.round(prepayHours * remoteRate * 100) / 100;
  const area2Applied = marketAnalysis ? isArea2(marketCity, marketState) : false;

  // ── Rep effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email, commission_rate').order('full_name')
      .then(({ data }) => setTeamMembers(data || []));
  }, []);
  useEffect(() => {
    if (!repId && profile?.id && !id) setRepId(profile.id);
  }, [profile, id]);
  useEffect(() => {
    if (!repId || !teamMembers.length) return;
    const rep = teamMembers.find(m => m.id === repId);
    if (rep) setRepProfile(rep);
  }, [repId, teamMembers]);

  // ── Load market analysis for ZIP ────────────────────────────────────────────
  async function handleZipChange(zip) {
    setClientZip(zip);
    if (zip?.length === 5) {
      const zr = lookupZip(zip);
      setZipResult(zr);
      // Try to fetch a stored market analysis for this zip/city
      try {
        const { data } = await supabase
          .from('market_rate_analyses')
          .select('*')
          .or(`zip.eq.${zip},zip_codes.cs.{${zip}}`)
          .maybeSingle();
        if (data) {
          setMarketAnalysis(data);
          setMarketCity(data.city);
          setMarketState(data.state);
        } else if (zr) {
          setMarketCity(zr.name?.split(',')[0] || '');
          setMarketState(zr.state || '');
        }
      } catch {}
    }
  }

  // ── Load existing quote ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || id === 'new' || configLoading) return;
    supabase.from('quotes').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setExistingQuote(data);
      setQuoteStatus(data.status || 'draft');
      setProposalName(data.inputs?.proposalName || '');
      setRecipientBiz(data.inputs?.recipientBiz || data.client_name || '');
      setRecipientContact(data.inputs?.recipientContact || '');
      setRecipientEmail(data.inputs?.recipientEmail || '');
      setRecipientAddress(data.inputs?.recipientAddress || '');
      setClientZip(data.client_zip || '');
      setMarketCity(data.inputs?.marketCity || '');
      setMarketState(data.inputs?.marketState || '');
      setPrepayHours(data.inputs?.prepayHours ?? 2);
      setOverridePrepay(data.inputs?.overridePrepay || false);
      setPrepayOverride(data.inputs?.prepayOverride || '');
      setNotes(data.inputs?.notes || '');
      setHubDealId(data.hubspot_deal_id || '');
      setHubDealUrl(data.hubspot_deal_url || '');
      setHubDealName(data.inputs?.hubspotDealName || '');
      setHubDescription(data.inputs?.hubDescription || '');
      if (data.rep_id) setRepId(data.rep_id);
      if (data.spt_proposal_id) setSptProposalId(data.spt_proposal_id);
      // Load market analysis
      if (data.client_zip) handleZipChange(data.client_zip);
    });
  }, [id, configLoading]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true); setSaveMsg('');
    const allInputs = {
      proposalName, recipientBiz, recipientContact, recipientEmail, recipientAddress,
      marketCity, marketState, prepayHours, overridePrepay, prepayOverride, notes,
      hubspotDealName: hubDealName, hubDescription,
    };
    const payload = {
      client_name:     recipientBiz,
      client_zip:      clientZip || null,
      status:          quoteStatus,
      package_name:    'FlexIT On-Demand',
      inputs:          allInputs,
      totals:          { prepayAmount, remoteRate, marketTier: marketAnalysis?.market_tier || null },
      line_items:      [],
      hubspot_deal_id: hubDealId || null,
      hubspot_deal_url:hubDealUrl || null,
      rep_id:          repId || profile?.id || null,
      spt_proposal_id: sptProposalId || null,
      updated_by:      profile?.id,
    };

    try {
      let qId = existingQuote?.id;
      if (!qId) {
        payload.created_by = profile?.id;
        const { data, error } = await supabase.from('quotes').insert(payload).select().single();
        if (error) throw error;
        setExistingQuote(data);
        qId = data.id;
        navigate(`/flexIT/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from('quotes').update(payload).eq('id', qId);
        if (error) throw error;
      }
      await saveQuoteVersion({
        quoteId: qId,
        quoteData: { client_name: recipientBiz, status: quoteStatus },
        inputs: allInputs,
        totals: { finalMRR: 0, onboarding: prepayAmount },
        lineItems: [],
        profile,
      });
      setSaveMsg('✓ Saved');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e) {
      setSaveMsg('✗ ' + e.message);
    }
    setSaving(false);
  }

  if (configLoading) return <div style={{ padding:24, color:'#6b7280', fontSize:12 }}>Loading...</div>;

  const SECTION_COLOR = '#f97316'; // FlexIT orange

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── LEFT COLUMN ── */}
      <div style={{ width:345, flexShrink:0, background:'white', borderRight:'1px solid #e5e7eb', overflowY:'auto', padding:'12px 14px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'8px 10px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6 }}>
          <div style={{ width:28, height:28, background:'#f97316', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ color:'white', fontSize:14, fontWeight:700 }}>⚡</span>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#c2410c' }}>FlexIT On-Demand</div>
            <div style={{ fontSize:9, color:'#9ca3af' }}>Time & Materials — Break/Fix</div>
          </div>
        </div>

        {/* HubSpot */}
        <HubSpotConnect
          dealId={hubDealId} dealUrl={hubDealUrl} dealName={hubDealName}
          description={hubDescription} onDescriptionChange={setHubDescription}
          quoteNumber={existingQuote?.quote_number}
          mrr={0} contractValue={prepayAmount}
          packageName="FlexIT On-Demand" contractTerm={null}
          existingQuoteId={existingQuote?.id} clientName={recipientBiz}
          onConnect={full => {
            setHubDealId(full.dealId); setHubDealUrl(full.deal.dealurl || '');
            setHubDealName(full.deal.dealname || '');
            if (!recipientBiz && full.company?.name) setRecipientBiz(full.company.name);
          }}
          onDisconnect={() => { setHubDealId(''); setHubDealUrl(''); setHubDealName(''); }}
        />
        <SPTConnect
          proposalId={sptProposalId}
          quoteId={existingQuote?.id}
          clientName={recipientBiz}
          quoteNumber={existingQuote?.quote_number}
          settings={settings}
          onConnect={(pid) => setSptProposalId(pid)}
          onDisconnect={() => setSptProposalId(null)}
        />

        {/* Proposal Details */}
        <Sec t="Proposal Details" c="#0f1e3c">
          <Fld lbl="Assigned Sales Rep">
            <select value={repId||''} onChange={e => setRepId(e.target.value)}
              style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none', color:'#374151' }}>
              <option value="">— select rep —</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email?.split('@')[0]}{m.commission_rate != null ? ` (${(m.commission_rate*100).toFixed(1)}%)` : ''}
                </option>
              ))}
            </select>
          </Fld>
          <Fld lbl="Proposal Name"><TI value={proposalName} onChange={setProposalName} placeholder="FlexIT — Acme Corp"/></Fld>
          <Fld lbl="Client Business Name"><TI value={recipientBiz} onChange={setRecipientBiz} placeholder="Acme Corp"/></Fld>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <Fld lbl="Contact Name"><TI value={recipientContact} onChange={setRecipientContact} placeholder="Jane Smith"/></Fld>
            <Fld lbl="Contact Email"><TI value={recipientEmail} onChange={setRecipientEmail} placeholder="jane@acme.com"/></Fld>
          </div>
          <Fld lbl="Business Address"><TI value={recipientAddress} onChange={setRecipientAddress} placeholder="123 Main St"/></Fld>
          <Fld lbl="Zip Code">
            <input value={clientZip} onChange={e => handleZipChange(e.target.value)} placeholder="60601"
              style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', outline:'none' }}/>
            {marketCity && <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>{marketCity}, {marketState}{area2Applied ? ' · ⚠ Area 2 +30%' : ''}</div>}
          </Fld>
          <Fld lbl="Quote Status" s={{ marginTop:8 }}>
            <SI v={quoteStatus} s={setQuoteStatus} opts={[['draft','Draft'],['in_review','In Review'],['approved','Approved'],['sent','Sent'],['won','Won'],['lost','Lost'],['expired','Expired']]}/>
          </Fld>
        </Sec>

        {/* FlexIT Service Setup */}
        <Sec t="Service Setup" c={SECTION_COLOR}>
          <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:5, padding:'8px 10px', marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', marginBottom:4 }}>New Account Prepayment</div>
            <div style={{ fontSize:9, color:'#92400e', lineHeight:1.5 }}>
              A prepayment is required prior to any services being rendered. Applied toward the first engagement.
            </div>
          </div>
          <Fld lbl="Prepayment Hours">
            <NI v={prepayHours} s={v => { setPrepayHours(v); setOverridePrepay(false); }}/>
          </Fld>
          <Fld lbl="Prepayment Amount">
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              {overridePrepay
                ? <input value={prepayOverride} onChange={e => setPrepayOverride(e.target.value)}
                    style={{ flex:1, padding:'4px 6px', border:'1px solid #f97316', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#c2410c', outline:'none' }}/>
                : <div style={{ flex:1, padding:'4px 6px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:4, fontSize:12, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#c2410c' }}>
                    {fmt$2(prepayAmount)}
                  </div>
              }
              <button onClick={() => setOverridePrepay(v => !v)}
                style={{ padding:'3px 7px', fontSize:9, background:'white', border:'1px solid #d1d5db', borderRadius:3, cursor:'pointer', color:'#6b7280' }}>
                {overridePrepay ? 'Auto' : 'Edit'}
              </button>
            </div>
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>
              Auto: {prepayHours}hr × {fmt$2(remoteRate)}/hr{area2Applied ? ' (Area 2 +30%)' : ''}
              {marketAnalysis ? ' · market-adjusted' : ' · base rate (enter zip for market rate)'}
            </div>
          </Fld>
          <Fld lbl="Internal Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Notes about this client or engagement..."
              style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', outline:'none' }}/>
          </Fld>
        </Sec>

        {/* Save */}
        <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:8 }}>
          <button onClick={save} disabled={saving}
            style={{ flex:1, padding:'8px', background:'#f97316', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : existingQuote ? 'Save Changes' : 'Save Quote'}
          </button>
          {saveMsg && <span style={{ fontSize:11, fontWeight:600, color: saveMsg.startsWith('✓') ? '#166534' : '#dc2626' }}>{saveMsg}</span>}
        </div>

        {existingQuote && (
          <div style={{ marginTop:8 }}>
            <SendForReviewButton
              quote={{ ...existingQuote, status: quoteStatus }}
              quoteType="flexIT"
              onStatusChange={s => setQuoteStatus(s)}
            />
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc', minWidth:0 }}>
        <ReviewBanner quote={{ ...existingQuote, status: quoteStatus }} quoteType="flexIT" onStatusChange={s => setQuoteStatus(s)} />

        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>

          {/* Quote number + status badge */}
          {existingQuote && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:12, fontFamily:'DM Mono, monospace', color:'#6b7280', fontWeight:600 }}>{existingQuote.quote_number}</span>
              <span style={{ fontSize:10, padding:'2px 7px', borderRadius:3, fontWeight:600,
                background: quoteStatus==='won'?'#dcfce7':quoteStatus==='sent'?'#dbeafe':quoteStatus==='approved'?'#f0fdf4':'#f3f4f6',
                color: quoteStatus==='won'?'#166534':quoteStatus==='sent'?'#1e40af':quoteStatus==='approved'?'#166534':'#6b7280'
              }}>{quoteStatus}</span>
            </div>
          )}

          {/* KPI Strip */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              ['Prepayment', fmt$2(prepayAmount), '#c2410c', '#fff7ed'],
              ['Remote Rate', `${fmt$2(remoteRate)}/hr`, '#0f766e', '#f0fdf4'],
              ['Market', marketAnalysis ? `${marketCity || '—'} · ${marketAnalysis.market_tier}` : 'Enter ZIP', '#6d28d9', '#faf5ff'],
            ].map(([l,v,co,bg]) => (
              <div key={l} style={{ background:bg, borderRadius:6, padding:'9px 11px' }}>
                <div style={{ fontSize:9, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:co, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Rate Card Preview */}
          <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c', marginBottom:10 }}>Rate Card Preview</div>
            {!marketAnalysis ? (
              <div style={{ fontSize:11, color:'#9ca3af', padding:'12px 0', textAlign:'center' }}>
                Enter a ZIP code to see market-adjusted rates
              </div>
            ) : (
              rateSheet?.sections.map(section => (
                <div key={section.id} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#f97316', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
                    {section.title}
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                    <tbody>
                      {section.items.map((item, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #f9fafb' }}>
                          <td style={{ padding:'3px 0', color:'#374151' }}>{item.service}</td>
                          <td style={{ padding:'3px 0', textAlign:'right', fontFamily:'DM Mono, monospace', color:'#0f1e3c', fontWeight:500 }}>
                            {fmtRate(item)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
            {area2Applied && (
              <div style={{ marginTop:6, padding:'5px 8px', background:'#fef3c7', borderRadius:4, fontSize:9, color:'#92400e', fontWeight:600 }}>
                ⚠ Area 2 surcharge (+30%) applied — {marketCity}, {marketState}
              </div>
            )}
          </div>

          {/* Assumptions preview */}
          <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c', marginBottom:8 }}>Assumptions</div>
            {FLEXIT_ASSUMPTIONS.map((a, i) => (
              <div key={i} style={{ display:'flex', gap:6, marginBottom:4 }}>
                <span style={{ color:'#f97316', fontSize:10, flexShrink:0, marginTop:1 }}>•</span>
                <span style={{ fontSize:10, color:'#374151', lineHeight:1.6 }}>{a}</span>
              </div>
            ))}
          </div>

          {/* Documents */}
          <DocumentsPanel
            analysis={marketAnalysis}
            settings={settings}
            clientName={recipientBiz}
            recipientContact={recipientContact}
            quoteId={existingQuote?.id}
            quoteNumber={existingQuote?.quote_number}
            sptProposalId={sptProposalId}
            onSPTLinked={(pid) => setSptProposalId(pid)}
            inputs={{ users: 0, workstations: 0, compliance: 'none', selectedProducts: [] }}
            pkg={null}
            products={[]}
            complianceKey={[]}
            result={prepayAmount > 0 ? { finalMRR: 0, onboarding: prepayAmount } : null}
            obIncentive={null}
          />

          {/* Quote Notes */}
          <QuoteNotes
            quoteId={existingQuote?.id}
            quoteNumber={existingQuote?.quote_number}
            clientName={recipientBiz}
            hubDealId={hubDealId}
          />
          <QuoteHistory quoteId={existingQuote?.id} />

        </div>
      </div>
    </div>
  );
}
