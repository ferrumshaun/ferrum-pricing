import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { writeQuoteUrlToDeal } from '../lib/hubspot';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { lookupZip, lookupZipFromUSPS } from '../lib/pricing';
import { buildRateSheet, fmtRate } from '../lib/rateSheet';
import { getOrAnalyzeMarket } from '../lib/marketRates';
import { saveQuoteVersion } from '../lib/quoteVersions';
import QuoteNotes   from '../components/QuoteNotes';
import QuoteHistory from '../components/QuoteHistory';
import HubSpotConnect from '../components/HubSpotConnect';
import SPTConnect     from '../components/SPTConnect';
import RateSheetModalComp from '../components/RateSheetModal';
import MarketRateCard from '../components/MarketRateCard';
import FlexTimeSelector from '../components/FlexTimeSelector';
import { calcFlexBlock } from '../lib/flexTime';
import { createFlexITSPTProposal, buildFlexITQuoteShape } from '../lib/smartPricingTable';
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
  const [marketLoading,  setMarketLoading]  = useState(false);
  const [marketError,    setMarketError]    = useState('');
  // Locked-in market rates from MarketRateCard accept (or saved rate sheet load).
  // Held independently of marketAnalysis so it survives the race condition where
  // handleZipChange completes AFTER MarketRateCard fires onRatesAccepted — without
  // this, accepting a rate override and then having handleZipChange finish second
  // would silently overwrite the override with the original analysis.
  const [acceptedRates,  setAcceptedRates]  = useState(null);

  // FlexIT-specific
  const [prepayHours,    setPrepayHours]    = useState(2);
  const [overridePrepay, setOverridePrepay] = useState(false);
  const [prepayOverride, setPrepayOverride] = useState('');
  const [notes,          setNotes]          = useState('');
  const [flexHours,      setFlexHours]      = useState(null);

  // Integrations
  const [hubDealId,      setHubDealId]      = useState('');
  const [hubDealUrl,     setHubDealUrl]     = useState('');
  const [hubDealName,    setHubDealName]    = useState('');
  const [hubDescription, setHubDescription]= useState('');
  const [sptProposalId,  setSptProposalId]  = useState(null);

  // Computed rates — accepted rates always win, then live analysis, then admin default.
  // This makes the flex block, the prepay calc, the FlexTimeSelector, and the rate
  // sheet preview all use the same locked-in labor rate.
  const effectiveRates = acceptedRates
    ? { ...(marketAnalysis?.rates || {}), ...acceptedRates }
    : (marketAnalysis?.rates || null);
  const rateSheetAnalysis = marketAnalysis
    ? { ...marketAnalysis, rates: effectiveRates || marketAnalysis.rates }
    : null;
  const rateSheet    = rateSheetAnalysis ? buildRateSheet({ analysis: rateSheetAnalysis, settings, clientName: recipientBiz, recipientContact }) : null;
  const remoteRate   = effectiveRates?.remote_support ?? parseFloat(settings?.oos_remote_rate || 165);
  // When a flex block is selected the flex block IS the upfront fee — no separate prepay.
  const flexBlock    = (flexHours && remoteRate) ? calcFlexBlock(flexHours, remoteRate, settings) : null;
  const hasFlexBlock = !!flexBlock;
  const prepayAmount = hasFlexBlock
    ? 0
    : (overridePrepay && prepayOverride
        ? parseFloat(prepayOverride) || 0
        : Math.round(prepayHours * remoteRate * 100) / 100);

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
  async function handleZipChange(zip, opts = {}) {
    const { readOnly = false } = opts;
    setClientZip(zip);
    if (zip?.length !== 5) return;
    const zr = lookupZip(zip);
    setZipResult(zr);
    setMarketLoading(true);
    setMarketError('');
    try {
      // getOrAnalyzeMarket fetches existing analysis OR runs AI to create one when none exists.
      // Pass city/state hints so AI can resolve unfamiliar ZIPs faster.
      const cityHint  = zr?.name?.split(',')[0] || undefined;
      const stateHint = zr?.state || undefined;
      const res = await getOrAnalyzeMarket(zip, false, cityHint, stateHint, readOnly);
      if (res?.analysis) {
        setMarketAnalysis(res.analysis);
        setMarketCity(res.analysis.city || cityHint || '');
        setMarketState(res.analysis.state || stateHint || '');
      } else if (zr) {
        // No analysis available (readOnly mode + no existing record). Fall back to ZIP table.
        setMarketCity(cityHint || '');
        setMarketState(stateHint || '');
      }
    } catch (e) {
      setMarketError('Market analysis unavailable: ' + e.message);
      // Still populate city/state from ZIP table so the page isn't completely blank
      if (zr) { setMarketCity(zr.name?.split(',')[0] || ''); setMarketState(zr.state || ''); }
    }
    setMarketLoading(false);
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
      if (data.inputs?.flexHours) setFlexHours(data.inputs.flexHours);
      // Load market analysis
      if (data.client_zip) handleZipChange(data.client_zip, { readOnly: true });
    });
  }, [id, configLoading]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true); setSaveMsg('');
    const allInputs = {
      proposalName, recipientBiz, recipientContact, recipientEmail, recipientAddress, flexHours: flexHours || null,
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
        // Write quote URL back to HubSpot
        if (hubDealId) {
          try {
            const { data: fd } = await supabase.from('pricing_settings').select('value').eq('key','hubspot_quote_url_field').single();
            if (fd?.value) await writeQuoteUrlToDeal(hubDealId, `${window.location.origin}/flexIT/${data.id}`, fd.value);
          } catch(e) { console.warn('HubSpot URL write failed:', e.message); }
        }
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
            setHubDealId(full.dealId);
            setHubDealUrl(full.deal.dealurl || '');
            setHubDealName(full.deal.dealname || '');
            // Company → recipient business name + address + ZIP-driven market analysis
            if (full.company) {
              if (full.company.name) setRecipientBiz(full.company.name);
              const addr = [full.company.address, full.company.address2, full.company.city, full.company.state, full.company.zip].filter(Boolean).join(', ');
              if (addr) setRecipientAddress(addr);
              if (full.company.zip) handleZipChange(full.company.zip);
            } else {
              // Fallback when deal has no associated company — extract a name from the deal title
              const extracted = full.deal.dealname?.split(/\s[-–—]\s/)?.[0]?.trim();
              if (extracted) setRecipientBiz(extracted);
            }
            // Contact → name + email
            if (full.contact) {
              const name = [full.contact.firstname, full.contact.lastname].filter(Boolean).join(' ');
              if (name) setRecipientContact(name);
              if (full.contact.email) setRecipientEmail(full.contact.email);
            }
            // Auto-suggest a proposal name when one isn't already set
            if (!proposalName && full.deal.dealname) {
              setProposalName(`FerrumIT On-Demand IT Support — ${full.company?.name || full.deal.dealname}`);
            }
          }}
          onDisconnect={() => { setHubDealId(''); setHubDealUrl(''); setHubDealName(''); }}
        />
        <SPTConnect
          proposalId={sptProposalId}
          quoteId={existingQuote?.id}
          clientName={recipientBiz}
          quoteNumber={existingQuote?.quote_number}
          settings={settings}
          quoteTypeLabel="On-Demand IT Support"
          onConnect={(pid) => setSptProposalId(pid)}
          onDisconnect={() => setSptProposalId(null)}
          customCreate={async ({ sptApiKey, name }) => {
            if (!rateSheet) {
              throw new Error('Enter a ZIP code first to compute market-adjusted rates');
            }
            const quote = buildFlexITQuoteShape({
              proposalName:     name,
              recipientBiz,
              recipientContact,
              recipientEmail,
              recipientAddress,
              marketCity,
              marketState,
              prepayHours,
              prepayAmount,
              remoteRate,
              flexHours,
              flexBlock,
              quoteNumber: existingQuote?.quote_number,
            });
            return createFlexITSPTProposal({ quote, rateSheet, settings, sptApiKey });
          }}
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
            {marketCity && <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>{marketCity}, {marketState}</div>}
          </Fld>
          <Fld lbl="Quote Status" s={{ marginTop:8 }}>
            <SI v={quoteStatus} s={setQuoteStatus} opts={[['draft','Draft'],['in_review','In Review'],['approved','Approved'],['sent','Sent'],['won','Won'],['lost','Lost'],['expired','Expired']]}/>
          </Fld>
        </Sec>

        {/* FlexIT Service Setup */}
        <Sec t="Service Setup" c={SECTION_COLOR}>
          {hasFlexBlock ? (
            <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:5, padding:'8px 10px', marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', marginBottom:4 }}>Flex Block — Pre-Purchased</div>
              <div style={{ fontSize:9, color:'#92400e', lineHeight:1.5 }}>
                The {flexHours}hr flex block is the upfront fee for this engagement — paid in full upon agreement signing.
                No separate initial prepayment is required when a flex block is selected.
              </div>
            </div>
          ) : (
            <>
              <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:5, padding:'8px 10px', marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', marginBottom:4 }}>New Account Prepayment</div>
                <div style={{ fontSize:9, color:'#92400e', lineHeight:1.5 }}>
                  A prepayment is required prior to any services being rendered. Applied toward the first engagement.
                  Selecting a flex block below replaces this with the block fee.
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
                  Auto: {prepayHours}hr × {fmt$2(remoteRate)}/hr
                  {marketAnalysis ? ' · market-adjusted' : ' · base rate (enter zip for market rate)'}
                </div>
              </Fld>
            </>
          )}
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
              hasFlexBlock
                ? [`Flex Block (${flexHours}hr)`, fmt$2(flexBlock?.blockPrice), '#c2410c', '#fff7ed']
                : ['Initial Prepayment', fmt$2(prepayAmount), '#c2410c', '#fff7ed'],
              ['Remote Rate', `${fmt$2(remoteRate)}/hr`, '#0f766e', '#f0fdf4'],
              ['Market', marketAnalysis ? `${marketCity || '—'} · ${marketAnalysis.market_tier}` : 'Enter ZIP', '#6d28d9', '#faf5ff'],
            ].map(([l,v,co,bg]) => (
              <div key={l} style={{ background:bg, borderRadius:6, padding:'9px 11px' }}>
                <div style={{ fontSize:9, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:co, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Flex Time Block — optional pre-purchase */}
          <div style={{ marginBottom:12 }}>
            <FlexTimeSelector
              remoteRate={remoteRate}
              settings={settings}
              selectedHours={flexHours}
              onChange={hrs => setFlexHours(hrs)}
              mode="ondemand"
              packageModel="none"
            />
          </div>

          {/* FlexIT Billing Summary */}
          <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c', marginBottom:8 }}>Billing Summary</div>
            <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #e5e7eb', borderRadius:4, overflow:'hidden' }}>
              <thead>
                <tr style={{ background:'#0f1e3c' }}>
                  <th style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'white', textAlign:'left', textTransform:'uppercase', letterSpacing:'.04em' }}>Payment</th>
                  <th style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'white', textAlign:'left', textTransform:'uppercase', letterSpacing:'.04em' }}>Amount</th>
                  <th style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'white', textAlign:'left', textTransform:'uppercase', letterSpacing:'.04em' }}>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {hasFlexBlock ? (
                  /* Flex block IS the upfront — no separate prepay row. */
                  <tr style={{ borderBottom:'1px solid #fde68a', background:'#fffbeb' }}>
                    <td style={{ padding:'10px 12px', fontSize:11, fontWeight:700, color:'#c2410c' }}>#1 — Flex Block — {flexHours}hrs pre-purchased</td>
                    <td style={{ padding:'10px 12px', fontSize:12, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#c2410c' }}>{fmt$2(flexBlock?.blockPrice)}</td>
                    <td style={{ padding:'10px 12px', fontSize:11, color:'#6b7280' }}>Due in full upon agreement signing — non-refundable · Valid 12 months · refillable at this rate</td>
                  </tr>
                ) : (
                  /* No flex block — standard 2hr prepay for new-account engagement. */
                  <tr style={{ borderBottom:'1px solid #fde68a', background:'#fffbeb' }}>
                    <td style={{ padding:'10px 12px', fontSize:11, fontWeight:700, color:'#374151' }}>#1 — Initial Prepayment</td>
                    <td style={{ padding:'10px 12px', fontSize:12, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#c2410c' }}>{fmt$2(prepayAmount)}</td>
                    <td style={{ padding:'10px 12px', fontSize:11, color:'#6b7280' }}>Upon agreement signing — non-refundable · Applied toward first engagement</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding:'10px 12px', fontSize:11, fontWeight:700, color:'#374151' }}>Ongoing Labor</td>
                  <td style={{ padding:'10px 12px', fontSize:11, color:'#6b7280' }}>At published rates</td>
                  <td style={{ padding:'10px 12px', fontSize:11, color:'#6b7280' }}>{hasFlexBlock ? 'After flex block depleted — billed as consumed' : 'Billed as consumed — invoiced upon completion or end of billing period'}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:8, lineHeight:1.5 }}>
              Term: Month to Month · Invoicing: Due Upon Receipt · No monthly recurring fee
            </div>
          </div>

          {/* Market Rate Analysis — full card with accept / refresh / overrides */}
          <MarketRateCard
            quoteId={existingQuote?.id}
            clientZip={clientZip}
            onRatesAccepted={(rates, suggestedTier, analysis) => {
              // Race-proof: always capture the accepted rates into acceptedRates.
              // remoteRate / flexBlock / rateSheet all derive from that, so the
              // accepted overrides survive even if handleZipChange completes
              // afterward and replaces marketAnalysis with the original.
              if (rates) setAcceptedRates(rates);
              // When MarketRateCard generated a fresh analysis (vs. loading a
              // saved rate sheet), keep the city/state/full analysis in sync too.
              if (analysis) {
                setMarketAnalysis({ ...analysis, rates: { ...analysis.rates, ...rates } });
                if (analysis.city)  setMarketCity(analysis.city);
                if (analysis.state) setMarketState(analysis.state);
              } else if (rates) {
                setMarketAnalysis(prev => prev ? { ...prev, rates: { ...prev.rates, ...rates } } : prev);
              }
            }}
          />

          {/* Rate Card Preview */}
          <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c', marginBottom:10 }}>Rate Card Preview</div>
            {!marketAnalysis ? (
              <div style={{ fontSize:11, padding:'12px 0', textAlign:'center', color: marketError ? '#dc2626' : '#9ca3af' }}>
                {marketLoading
                  ? '⏳ Analyzing market rates for ' + (clientZip || 'this ZIP') + '...'
                  : marketError
                    ? '✗ ' + marketError
                    : clientZip && clientZip.length === 5
                      ? 'No market analysis available yet for ZIP ' + clientZip + '.'
                      : 'Enter a ZIP code to see market-adjusted rates'}
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

          {/* Documents — FlexIT: Rate Sheet only (assumptions are fixed, payment schedule is inline) */}
          <FlexITDocumentsPanel
            analysis={marketAnalysis}
            settings={settings}
            clientName={recipientBiz}
            recipientContact={recipientContact}
            quoteId={existingQuote?.id}
            quoteNumber={existingQuote?.quote_number}
            sptProposalId={sptProposalId}
            onSPTLinked={(pid) => setSptProposalId(pid)}
            prepayAmount={prepayAmount}
            remoteRate={remoteRate}
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


// ── FlexIT Documents Panel — Rate Sheet only ──────────────────────────────────
// FlexIT has fixed standard assumptions (shown inline) and no monthly payment schedule.
// Only the Rate Sheet needs to be managed here for SPT export.
function FlexITDocumentsPanel({ analysis, settings, clientName, recipientContact, quoteId, quoteNumber, sptProposalId, onSPTLinked, prepayAmount, remoteRate }) {
  const [showRateSheet, setShowRateSheet] = React.useState(false);
  const [showPayment,   setShowPayment]   = React.useState(false);
  return (
    <>
      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:'10px 12px', marginBottom:10 }}>
        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#6b7280', marginBottom:8 }}>
          📄 Documents
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#f8fafc', borderRadius:4, border:`1px solid ${sptProposalId ? '#bbf7d0' : '#e5e7eb'}` }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11 }}>💲</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#0f1e3c' }}>Rate Card / Rate Schedule</span>
              {sptProposalId && <span style={{ fontSize:8, fontWeight:700, color:'#166534', background:'#dcfce7', padding:'1px 5px', borderRadius:3 }}>SPT ✓</span>}
            </div>
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:1, paddingLeft:16 }}>
              {sptProposalId ? 'Linked to Smart Pricing Table' : 'Market-adjusted T&M rates · link or create in SPT'}
            </div>
          </div>
          <button onClick={() => setShowRateSheet(true)}
            style={{ padding:'4px 10px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer', flexShrink:0 }}>
            {sptProposalId ? 'View / Update' : 'View / Export'}
          </button>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#f8fafc', borderRadius:4, border:'1px solid #e5e7eb', marginTop:5 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11 }}>💳</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#0f1e3c' }}>Payment Schedule & Terms</span>
            </div>
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:1, paddingLeft:16 }}>Month to Month · Due Upon Receipt · prepayment at signing</div>
          </div>
          <button onClick={() => setShowPayment(true)}
            style={{ padding:'4px 10px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer', flexShrink:0 }}>
            View
          </button>
        </div>
      </div>

      {showPayment && React.createElement(
        FlexITPaymentModal,
        { onClose: () => setShowPayment(false), prepayAmount, remoteRate, clientName, settings }
      )}

      {showRateSheet && React.createElement(
        RateSheetModalComp,
        {
          onClose: () => setShowRateSheet(false),
          analysis, settings, clientName, recipientContact,
          quoteId, quoteNumber, sptProposalId,
          onSPTLinked: (pid, url) => {
            onSPTLinked?.(pid, url);
            if (!pid && quoteId) supabase.from('quotes').update({ spt_proposal_id: null }).eq('id', quoteId);
          },
        }
      )}
    </>
  );
}


// ── FlexIT Payment Schedule Modal ─────────────────────────────────────────────
function FlexITPaymentModal({ onClose, prepayAmount, remoteRate, clientName, settings }) {
  const fmt2 = n => n != null ? `$${Number(n).toFixed(2)}` : '—';
  const checkFee   = parseFloat(settings?.payment_check_fee    || 10);
  const ccSurcharge= parseFloat(settings?.payment_cc_surcharge || 0.02);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:600 }}>
      <div style={{ flex:1 }} onClick={onClose} />
      <div style={{ width:620, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ background:'#0f1e3c', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>Payment Schedule & Terms</div>
            <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>{clientName || 'Client'} · FlexIT On-Demand · Month to Month</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:20 }}>

          {/* Term header */}
          <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'10px 14px', marginBottom:16, textAlign:'center' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#c2410c' }}>Term of this agreement is MONTH TO MONTH</span>
          </div>

          {/* Payment table */}
          <div style={{ marginBottom:16 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #e5e7eb', borderRadius:6, overflow:'hidden' }}>
              <thead>
                <tr style={{ background:'#0f1e3c' }}>
                  {['Payment', 'Amount', 'Due Date'].map(h => (
                    <th key={h} style={{ padding:'9px 12px', fontSize:10, fontWeight:700, color:'white', textAlign:'left', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: prepayAmount > 0 ? '#fffbeb' : 'white', borderBottom:'1px solid #e5e7eb' }}>
                  <td style={{ padding:'10px 12px', fontSize:11, fontWeight:700, color:'#374151' }}>#1 — Initial Prepayment</td>
                  <td style={{ padding:'10px 12px', fontSize:12, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#c2410c' }}>
                    {prepayAmount > 0 ? fmt2(prepayAmount) : '$0.00'}
                  </td>
                  <td style={{ padding:'10px 12px', fontSize:11, color:'#6b7280' }}>Upon Agreement Signing</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize:9, color:'#dc2626', fontWeight:600, marginTop:5 }}>* Payment #1 is non-refundable.</div>
          </div>

          {/* Out of scope */}
          <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:5, padding:'8px 12px', marginBottom:16, fontSize:11, color:'#92400e', lineHeight:1.6 }}>
            Any items not explicitly included in this quote are considered out of scope. Out-of-scope services will be quoted separately as a project or billed at the then-current hourly rates, subject to customer approval prior to commencement of work.
          </div>

          {/* Billing & Payment Terms sections — match the PDF exactly */}
          <SectionHeader title="Billing & Payment Terms" />

          <SubSec title="Automatic Payments (Required)">
            For recurring billing purposes, the Client is required to maintain a valid <strong>ACH/EFT or credit card</strong> on file for automatic payment processing. In lieu of automatic debit, the Client may elect to remit payment via <strong>direct EFT, bank wire, or ACH transfer</strong> using our online billing portal at{' '}
            <a href="https://ferrumit.com/billing" target="_blank" rel="noopener noreferrer" style={{ color:'#2563eb' }}>ferrumit.com/billing</a>.
            {' '}Account and remittance information may be obtained by contacting Ferrum Technology Services, LLC's finance team at{' '}
            <a href="mailto:billing@ferrumit.com" style={{ color:'#2563eb' }}>billing@ferrumit.com</a>.
            <div style={{ background:'#fef9c3', border:'1px solid #fde047', borderRadius:4, padding:'6px 8px', marginTop:6, fontSize:10, color:'#713f12', lineHeight:1.5 }}>
              Payment information must be submitted or confirmed prior to the commencement of services. Recurring invoices will be processed automatically using the agreed payment method in accordance with the billing schedule.
            </div>
          </SubSec>

          <SubSec title="Invoicing Terms">
            Services are invoiced with <strong>Due Upon Receipt</strong> payment terms. Invoices will be automatically paid on the due date using the payment method on file.
          </SubSec>

          <SubSec title="Paper Check Payments">
            While electronic payment is required for recurring billing, any paper checks received will incur a <strong>${checkFee.toFixed(0)} administrative processing and handling fee</strong>.
          </SubSec>

          {ccSurcharge > 0 && (
            <SubSec title="Credit Card Payments">
              A <strong>{(ccSurcharge * 100).toFixed(0)}% surcharge</strong> applies to all credit card transactions. ACH/EFT is the recommended payment method.
            </SubSec>
          )}

          <SubSec title="Purchase Orders">
            If a purchase order is required, please submit it to{' '}
            <a href="mailto:billing@ferrumit.com" style={{ color:'#2563eb' }}>billing@ferrumit.com</a> prior to invoicing.
          </SubSec>

          <SectionHeader title="Setup Services Fee" />
          <div style={{ fontSize:11, color:'#374151', lineHeight:1.7, marginBottom:14 }}>
            A one-time setup, configuration, and installation fee{prepayAmount > 0 ? ` of ${fmt2(prepayAmount)}` : ''} is due at the start of the agreement and will be billed as specified in this Quote.
          </div>

          <SectionHeader title="Declined or Returned Payments" />
          <div style={{ fontSize:11, color:'#374151', lineHeight:1.7, marginBottom:14 }}>
            Any declined or returned payments may incur a <strong>$50 administrative fee</strong>.
          </div>

          <SectionHeader title="Hardware, Software, Licensing & Third-Party Services" />
          <div style={{ fontSize:11, color:'#374151', lineHeight:1.7, marginBottom:14 }}>
            All sales of hardware, software, licensing, and third-party services are final. Please review and verify all orders prior to submission, as returns or refunds are not available.
          </div>

        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{ background:'#0f1e3c', borderRadius:5, padding:'7px 14px', textAlign:'center', marginBottom:10 }}>
      <span style={{ fontSize:13, fontWeight:700, color:'white' }}>{title}</span>
    </div>
  );
}

function SubSec({ title, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:3 }}>{title}</div>
      <div style={{ fontSize:11, color:'#6b7280', lineHeight:1.7 }}>{children}</div>
    </div>
  );
}
