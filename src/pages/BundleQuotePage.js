import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { calcQuote, lookupZip, fmt$, fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';
import { calcVoice, calcBundleDiscount, YEALINK_MODELS, FAX_PACKAGES, CX_TIERS, getRecommendedTier } from '../lib/voicePricing';
import { searchDeals, getDealFull, updateDealDescription } from '../lib/hubspot';
import QuoteNotes    from '../components/QuoteNotes';
import QuoteHistory  from '../components/QuoteHistory';
import { saveQuoteVersion } from '../lib/quoteVersions';
import { SendForReviewButton, ReviewBanner } from '../components/SendForReview';
import OnboardingIncentive from '../components/OnboardingIncentive';
import HubSpotConnect from '../components/HubSpotConnect';
import MarketRateCard from '../components/MarketRateCard';

const DEF_IT = {
  users:0, sharedMailboxes:0, workstations:0, endpoints:0, mobileDevices:0,
  servers:0, locations:0, cloudTenants:0, vendors:0,
  requestedCoverage:'business_hours', compliance:'none',
  industryRisk:'low', complexity:'low', contractTerm:24,
  execReporting:false, selectedProducts:[],
};

const DEF_V = {
  quoteType:'hosted', licenseType:'pro',
  seats:0, seatPrice:0, seatCost:0,
  commonAreaPhones:0, voicemailOnly:0, doorPhones:0, pagingDevices:0, specialRingers:0,
  cxTierId:'pro_8', clientPaysMonthly:true, largerInstance:false,
  sipChannels:0,
  localDIDs:0, smsDIDs:0, tollFreeNumbers:0, e911DIDs:0, tollFreePerMin:false,
  faxType:'none', faxQty:1,
  callRecording:false,
  smsEnabled:false, smsNewRegistration:true, smsCampaigns:1,
  hardwareType:'none', hardwareModel:'T33G', hardwareQty:0,
  programmingFee:0, portingNumbers:0,
  internationalDialing:'none',
};

export default function BundleQuotePage() {
  const { id } = useParams();
  const { packages, products, marketTiers, settings, productsByCategory, exclusiveGroups, loading: configLoading } = useConfig();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location  = useLocation();
  const [showUnbundle, setShowUnbundle] = useState(false);
  const [unbundling,   setUnbundling]   = useState(false);

  // Shared client fields
  const [proposalName,     setProposalName]     = useState('');
  const [repId,          setRepId]          = useState(null);
  const [obIncentive,    setObIncentive]    = useState(null);
  const [repProfile,     setRepProfile]     = useState(null);
  const [teamMembers,    setTeamMembers]    = useState([]);
  const [recipientBiz,     setRecipientBiz]     = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [recipientEmail,   setRecipientEmail]   = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [clientZip,        setClientZip]        = useState('');
  const [zipResult,        setZipResult]        = useState(null);
  const [zipApplied,       setZipApplied]       = useState(false);
  const [marketCity,       setMarketCity]       = useState('');
  const [marketState,      setMarketState]      = useState('');
  const [dealDescription,  setDealDescription]  = useState('');
  const [quoteStatus,      setQuoteStatus]      = useState('draft');
  const [saving,           setSaving]           = useState(false);
  const [saveMsg,          setSaveMsg]          = useState('');
  const [existingQuote,    setExistingQuote]    = useState(null);

  // Section collapse state
  const [itOpen,    setItOpen]    = useState(true);
  const [voiceOpen, setVoiceOpen] = useState(true);

  // IT state
  const [itInputs,    setItInputs]    = useState(DEF_IT);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [selectedMkt, setSelectedMkt] = useState(null);

  // Voice state
  const [v, setV] = useState({ ...DEF_V, isManagedIT: true });

  // HubSpot

  const [hubDealId,   setHubDealId]   = useState('');
  const [hubDealName, setHubDealName] = useState('');
  const [hubDealUrl,  setHubDealUrl]  = useState('');

  const setIt  = useCallback((k, val) => setItInputs(p => ({ ...p, [k]: val })), []);
  const setVoice = useCallback((k, val) => setV(p => ({ ...p, [k]: val })), []);

  // Defaults
  useEffect(() => {
    if (!selectedPkg && packages.length) setSelectedPkg(packages[1] || packages[0]);
    if (!selectedMkt && marketTiers.length) setSelectedMkt(marketTiers.find(t => t.tier_key === 'mid_market') || marketTiers[0]);
  }, [packages, marketTiers]);

  // ── Rep ──────────────────────────────────────────────────────────────────────
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

  // Load existing
  useEffect(() => {
    if (!id || id === 'new' || configLoading) return;
    supabase.from('quotes').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setExistingQuote(data);
      setProposalName(data.inputs?.proposalName || '');
      setRecipientBiz(data.client_name || '');
      setRecipientContact(data.inputs?.recipientContact || '');
      setRecipientEmail(data.inputs?.recipientEmail || '');
      setRecipientAddress(data.inputs?.recipientAddress || '');
      setClientZip(data.client_zip || '');
      setDealDescription(data.notes || '');
      setQuoteStatus(data.status || 'draft');
      setHubDealId(data.hubspot_deal_id || '');
      setHubDealUrl(data.hubspot_deal_url || '');
      setHubDealName(data.inputs?.hubspotDealName || '');
      if (data.rep_id) setRepId(data.rep_id);
      if (data.inputs?.it)    setItInputs({ ...DEF_IT, ...data.inputs.it });
      if (data.inputs?.voice) setV({ ...DEF_V, isManagedIT: true, ...data.inputs.voice });
      if (data.inputs?.package_name && packages.length) setSelectedPkg(packages.find(p => p.name === data.inputs.package_name));
      if (data.market_tier && marketTiers.length) setSelectedMkt(marketTiers.find(t => t.tier_key === data.market_tier));
    });
  }, [id, configLoading, packages, marketTiers]);

  // ── Handle conversion from IT or Voice quote ─────────────────────────────
  useEffect(() => {
    const from = location.state?.fromQuote;
    if (!from || id || configLoading || !packages.length || !marketTiers.length) return;

    // Populate shared client fields
    setProposalName(from.proposalName || '');
    setRecipientBiz(from.clientName   || '');
    setRecipientContact(from.recipientContact || '');
    setRecipientEmail(from.recipientEmail     || '');
    setRecipientAddress(from.recipientAddress || '');
    setClientZip(from.clientZip || '');
    setDealDescription(from.notes || '');
    setHubDealId(from.hubDealId   || '');
    setHubDealUrl(from.hubDealUrl  || '');
    setHubDealName(from.hubDealName || '');

    // Restore market tier and package
    if (from.marketTier && marketTiers.length) {
      const tier = marketTiers.find(t => t.tier_key === from.marketTier);
      if (tier) setSelectedMkt(tier);
    }
    if (from.packageName && packages.length) {
      const pkg = packages.find(p => p.name === from.packageName);
      if (pkg) setSelectedPkg(pkg);
    }

    // Pre-populate IT section from an IT quote conversion
    if (from.type === 'it' && from.inputs) {
      setItInputs(prev => ({ ...prev, ...from.inputs }));
    }

    // Pre-populate Voice section from a Voice quote conversion
    if (from.type === 'voice' && from.voiceInputs) {
      setV(prev => ({ ...prev, isManagedIT: true, ...from.voiceInputs }));
    }
  }, [location.state, id, configLoading, packages, marketTiers]);

  // ── Unbundle handler ──────────────────────────────────────────────────────
  async function handleUnbundle(keepType) {
    if (!existingQuote) return;
    setUnbundling(true);
    try {
      if (keepType === 'it') {
        // Navigate to new IT quote pre-populated with bundle's IT data
        navigate('/quotes/new', { state: { fromBundle: {
          type: 'it',
          clientName:       existingQuote.client_name,
          clientZip:        existingQuote.client_zip,
          marketTier:       existingQuote.market_tier,
          packageName:      existingQuote.inputs?.package_name,
          proposalName:     existingQuote.inputs?.proposalName,
          recipientContact: existingQuote.inputs?.recipientContact,
          recipientEmail:   existingQuote.inputs?.recipientEmail,
          recipientAddress: existingQuote.inputs?.recipientAddress,
          notes:            existingQuote.notes,
          hubDealId:        existingQuote.hubspot_deal_id,
          hubDealUrl:       existingQuote.hubspot_deal_url,
          hubDealName:      existingQuote.inputs?.hubspotDealName,
          inputs:           existingQuote.inputs?.it || {},
          sourceQuoteId:    existingQuote.id,
          sourceQuoteNum:   existingQuote.quote_number,
        }}});
      } else if (keepType === 'voice') {
        // Navigate to new Voice quote pre-populated with bundle's Voice data
        navigate('/voice/new', { state: { fromBundle: {
          type: 'voice',
          clientName:       existingQuote.client_name,
          clientZip:        existingQuote.client_zip,
          marketTier:       existingQuote.market_tier,
          proposalName:     existingQuote.inputs?.proposalName,
          recipientContact: existingQuote.inputs?.recipientContact,
          recipientEmail:   existingQuote.inputs?.recipientEmail,
          recipientAddress: existingQuote.inputs?.recipientAddress,
          notes:            existingQuote.notes,
          hubDealId:        existingQuote.hubspot_deal_id,
          hubDealUrl:       existingQuote.hubspot_deal_url,
          hubDealName:      existingQuote.inputs?.hubspotDealName,
          voiceInputs:      existingQuote.inputs?.voice || {},
          sourceQuoteId:    existingQuote.id,
          sourceQuoteNum:   existingQuote.quote_number,
        }}});
      }
    } catch (err) {
      alert('Unbundle failed: ' + err.message);
    }
    setUnbundling(false);
    setShowUnbundle(false);
  }

  function handleZipChange(val) {
    setClientZip(val); setZipApplied(false);
    const r = val.length >= 3 ? lookupZip(val) : null;
    setZipResult(r);
  }
  function applyZip(r) {
    const res = r || zipResult;
    if (!res) return;
    const tier = marketTiers.find(t => t.tier_key === res.tier);
    if (tier) { setSelectedMkt(tier); setZipApplied(true); }
  }

  function toggleProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setItInputs(prev => {
      let selected = [...(prev.selectedProducts || [])];
      if (selected.includes(productId)) {
        selected = selected.filter(id => id !== productId);
      } else {
        if (product.exclusive_group) {
          const groupIds = exclusiveGroups[product.exclusive_group] || [];
          selected = selected.filter(id => !groupIds.includes(id));
        }
        selected.push(productId);
      }
      return { ...prev, selectedProducts: selected };
    });
  }
  function isSelected(pid) { return (itInputs.selectedProducts || []).includes(pid); }

  // HubSpot
  // Calculations
  const itResult = configLoading || !selectedPkg || !selectedMkt ? null
    : calcQuote({ inputs: itInputs, pkg: selectedPkg, marketTier: selectedMkt, products, settings });

  // IT base MRR = only the 6 package rates, no add-ons, no uplifts
  const itBaseMRR = itResult
    ? (itResult.wB + itResult.uB + itResult.sB + itResult.lB + itResult.tB + itResult.vB)
    : 0;

  // Bundle discount based on IT contract term
  const contractTerm = itInputs.contractTerm;
  const voiceForCalc = { ...v, isManagedIT: false }; // calc voice without its own bundle discount
  const voiceResult = configLoading ? null : calcVoice(voiceForCalc, settings);
  const bundle = voiceResult ? calcBundleDiscount(contractTerm, itBaseMRR, voiceResult.finalMRR) : null;

  // Free phones — apply to voice hardware if qualified
  const freePhones = bundle?.freePhones && itBaseMRR >= 750;
  // If free phones, override hardware NRC to 0
  const voiceResultFinal = (() => {
    if (!voiceResult) return null;
    if (!freePhones) return { ...voiceResult, bundleVoiceDiscount: bundle?.voiceDiscount || 0 };
    // Rebuild lines with hardware NRC zeroed out
    const lines = voiceResult.lines.map(l =>
      l.section === 'hardware' && l.nrc > 0
        ? { ...l, nrc: 0, label: l.label.replace(/\$[\d,]+/, '$0') + ' (free — 36mo bundle)' }
        : l
    );
    const adjustedNRC = voiceResult.nrc - voiceResult.lines.filter(l => l.section === 'hardware').reduce((a, l) => a + (l.nrc || 0), 0);
    return { ...voiceResult, lines, nrc: adjustedNRC, bundleVoiceDiscount: bundle?.voiceDiscount || 0 };
  })();

  const voiceDiscountedMRR = voiceResultFinal ? voiceResultFinal.finalMRR - (bundle?.voiceDiscount || 0) : 0;
  const combinedMRR = (itResult?.finalMRR || 0) + voiceDiscountedMRR;
  const combinedNRC = (itResult?.onboarding || 0) + (voiceResultFinal?.nrc || 0);
  const combinedCost = (itResult?.totalCost || 0) + (voiceResultFinal?.totalCost || 0);
  const combinedGM   = combinedMRR > 0 ? 1 - combinedCost / combinedMRR : 0;
  const combinedTCV  = combinedMRR * contractTerm + combinedNRC;

  const gc = gmColor(combinedGM);
  const gb = gmBg(combinedGM);
  const mktColor = { major_metro:'#1e40af', mid_market:'#065f46', small_market:'#6d28d9' };
  const mktBg    = { major_metro:'#dbeafe', mid_market:'#d1fae5', small_market:'#ede9fe' };

  async function saveQuote() {
    if (!recipientBiz.trim()) { setSaveMsg('Enter a client name first.'); return; }
    setSaving(true); setSaveMsg('');
    const allInputs = {
      proposalName, recipientContact, recipientEmail, recipientAddress,
      hubspotDealName: hubDealName, package_name: selectedPkg?.name,
      it: itInputs, voice: v
    };
    const totals = {
      finalMRR: combinedMRR, onboarding: combinedNRC,
      impliedGM: combinedGM, totalCost: combinedCost,
      contractValue: combinedTCV,
      itMRR: itResult?.finalMRR || 0,
      voiceMRR: voiceDiscountedMRR,
      bundleDiscount: bundle?.voiceDiscount || 0,
      freePhones,
    };
    const payload = {
      client_name: recipientBiz, client_zip: clientZip,
      market_tier: selectedMkt?.tier_key,
      package_name: `Bundle — ${selectedPkg?.name || 'IT'} + Voice`,
      status: quoteStatus, notes: dealDescription, inputs: allInputs,
      line_items: [...(itResult?.lineItems || []), ...(voiceResultFinal?.lines || [])],
      totals,
      hubspot_deal_id: hubDealId || null, hubspot_deal_url: hubDealUrl || null,
      rep_id:     repId || profile?.id || null,
      updated_by: profile?.id,
    };
    if (!existingQuote) payload.created_by = profile?.id;

    const { data, error } = existingQuote
      ? await supabase.from('quotes').update(payload).eq('id', existingQuote.id).select().single()
      : await supabase.from('quotes').insert(payload).select().single();

    if (error) { setSaveMsg('Error: ' + error.message); setSaving(false); return; }

    if (hubDealId && dealDescription) {
      try { await updateDealDescription(hubDealId, dealDescription); } catch {}
    }

    await logActivity({ action: existingQuote ? 'UPDATE' : 'CREATE', entityType: 'quote', entityId: data.id, entityName: recipientBiz,
      changes: { type: 'bundle', mrr: combinedMRR, it_mrr: itResult?.finalMRR, voice_mrr: voiceDiscountedMRR } });

    await saveQuoteVersion({
      quoteId: data.id,
      quoteData: { client_name: recipientBiz, client_zip: clientZip, market_tier: selectedMkt?.tier_key, package_name: `Bundle — ${selectedPkg?.name || 'IT'} + Voice`, status: quoteStatus },
      inputs: { proposalName, recipientContact, recipientEmail, recipientAddress, package_name: selectedPkg?.name, it: itInputs, voice: v },
      totals: { finalMRR: combinedMRR, onboarding: combinedNRC, impliedGM: combinedGM, totalCost: combinedCost, contractValue: combinedTCV },
      lineItems: [...(itResult?.lineItems || []), ...(voiceResultFinal?.lines || [])],
      profile,
    });

    setSaveMsg(`Saved as ${data.quote_number}${hubDealId && dealDescription ? ' · HubSpot updated' : ''}`);
    setSaving(false);
    if (!existingQuote) navigate(`/bundle/${data.id}`, { replace: true });
  }

  return (
    <>
    {/* ── Unbundle Modal ──────────────────────────────────────────────── */}
    {showUnbundle && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
        <div style={{ background:'white', borderRadius:10, padding:28, width:440, boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:'0 0 6px' }}>Unbundle Quote</h3>
          <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 20px' }}>
            Choose which service to keep as a standalone quote. The bundle quote will remain in your history.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
            <button onClick={() => handleUnbundle('it')} disabled={unbundling}
              style={{ padding:'12px 16px', background:'#f0f4ff', border:'2px solid #2563eb', borderRadius:7, cursor:'pointer', textAlign:'left', opacity: unbundling ? 0.6 : 1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1e40af', marginBottom:3 }}>🖥 Keep Managed IT Only</div>
              <div style={{ fontSize:11, color:'#3b82f6' }}>Opens a new IT quote with all device, user, and product settings intact. Voice section removed.</div>
            </button>
            <button onClick={() => handleUnbundle('voice')} disabled={unbundling}
              style={{ padding:'12px 16px', background:'#faf5ff', border:'2px solid #7c3aed', borderRadius:7, cursor:'pointer', textAlign:'left', opacity: unbundling ? 0.6 : 1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#6d28d9', marginBottom:3 }}>📞 Keep Hosted Voice Only</div>
              <div style={{ fontSize:11, color:'#7c3aed' }}>Opens a new Voice quote with all seat, license, and hardware settings intact. IT section removed.</div>
            </button>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, alignItems:'center' }}>
            {unbundling && <span style={{ fontSize:11, color:'#6b7280' }}>Creating new quote...</span>}
            <button onClick={() => setShowUnbundle(false)} disabled={unbundling}
              style={{ padding:'7px 16px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:5, fontSize:12, color:'#374151', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── LEFT: IT + Voice inputs ── */}
      <div style={{ width:360, flexShrink:0, background:'white', borderRight:'1px solid #e5e7eb', overflowY:'auto', padding:'12px 14px' }}>

        {/* Bundle badge */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, padding:'6px 10px', background:'linear-gradient(135deg,#eff6ff,#faf5ff)', border:'1px solid #c4b5fd', borderRadius:6 }}>
          <span style={{ fontSize:14 }}>📦</span>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#4c1d95' }}>Bundle Quote</div>
            <div style={{ fontSize:9, color:'#7c3aed' }}>Managed IT + Voice · bundle discount auto-applied</div>
          </div>
          {existingQuote && <span style={{ marginLeft:'auto', fontSize:10, fontFamily:'DM Mono, monospace', fontWeight:700, color:'#1e40af' }}>{existingQuote.quote_number}</span>}
        </div>

        {/* HubSpot */}
        <HubSpotConnect
          dealId={hubDealId}
          dealUrl={hubDealUrl}
          dealName={hubDealName}
          description={dealDescription}
          onDescriptionChange={setDealDescription}
          quoteNumber={existingQuote?.quote_number}
          mrr={bundle?.finalMRR}
          contractValue={bundle?.contractValue}
          packageName={`Bundle — ${selectedPkg?.name}`}
          contractTerm={contractTerm}
          existingQuoteId={existingQuote?.id}
          clientName={recipientBiz}
          onConnect={full => {
            setHubDealId(full.dealId); setHubDealUrl(full.dealUrl); setHubDealName(full.deal.dealname);
            if (full.company) {
              if (full.company.name) setRecipientBiz(full.company.name);
              const addr = [full.company.address, full.company.city, full.company.state, full.company.zip].filter(Boolean).join(', ');
              if (addr) setRecipientAddress(addr);
              if (full.company.zip) { setClientZip(full.company.zip); const zr = lookupZip(full.company.zip); setZipResult(zr); if (zr) applyZip(zr); }
            } else { const x = full.deal.dealname?.split(/\s[-–—]\s/)?.[0]?.trim(); if (x) setRecipientBiz(x); }
            if (full.contact) { const n=[full.contact.firstname,full.contact.lastname].filter(Boolean).join(' '); if(n) setRecipientContact(n); if(full.contact.email) setRecipientEmail(full.contact.email); }
            if (!proposalName && full.deal.dealname) setProposalName(`FerrumIT Bundle — ${full.company?.name||full.deal.dealname}`);
          }}
          onDisconnect={() => { setHubDealId(''); setHubDealUrl(''); setHubDealName(''); }}
        />

        {/* Client fields */}
        <Sec t="Proposal Details" c="#0f1e3c">
          <Fld lbl="Assigned Sales Rep">
            <select value={repId || ''} onChange={e => setRepId(e.target.value)}
              style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none', color:'#374151' }}>
              <option value="">— select rep —</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email?.split('@')[0]}{m.commission_rate != null ? ` (${(m.commission_rate*100).toFixed(1)}% comm)` : ' (global rate)'}
                </option>
              ))}
            </select>
          </Fld>
          <Fld lbl="Proposal Name"><TI value={proposalName} onChange={setProposalName} placeholder="FerrumIT Bundle — Acme Corp"/></Fld>
          <Fld lbl="Client Business Name"><TI value={recipientBiz} onChange={setRecipientBiz} placeholder="Acme Corp"/></Fld>
          <Grid2>
            <Fld lbl="Contact Name"><TI value={recipientContact} onChange={setRecipientContact} placeholder="Jane Smith"/></Fld>
            <Fld lbl="Contact Email"><TI value={recipientEmail} onChange={setRecipientEmail} placeholder="jane@acme.com"/></Fld>
          </Grid2>
          <Fld lbl="Business Address"><TI value={recipientAddress} onChange={setRecipientAddress} placeholder="123 Main St, Chicago, IL 60601"/></Fld>
          <Fld lbl="Zip Code">
            <div style={{ display:'flex', gap:5, alignItems:'center' }}>
              <input value={clientZip} onChange={e=>handleZipChange(e.target.value)} placeholder="60601"
                style={{ flex:1, padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', outline:'none' }}/>
              {zipResult && !zipApplied && (
                <button onClick={()=>applyZip()} style={{ padding:'3px 7px', background:mktColor[zipResult.tier]||'#374151', color:'white', border:'none', borderRadius:3, fontSize:9, fontWeight:700, cursor:'pointer' }}>Apply →</button>
              )}
            </div>
            {zipResult && <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>{zipResult.name}{zipApplied ? ' ✓' : ''}</div>}
          </Fld>
        </Sec>

        {/* ── MANAGED IT SECTION ── */}
        <CollapsibleSec
          title="🖥 Managed IT"
          open={itOpen} onToggle={() => setItOpen(o=>!o)}
          badge={itResult ? fmt$0(itResult.finalMRR) + '/mo' : null}
          color="#2563eb">

          {/* Market tier */}
          <Sec t="Market Tier" c="#0f1e3c">
            {marketTiers.map(t => (
              <div key={t.id} onClick={() => setSelectedMkt(t)} style={{ padding:'4px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedMkt?.id===t.id?'2':'1'}px solid ${selectedMkt?.id===t.id?(mktColor[t.tier_key]||'#374151'):'#e5e7eb'}`, background:selectedMkt?.id===t.id?(mktBg[t.tier_key]||'#f3f4f6'):'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:9, fontWeight:700, color:mktColor[t.tier_key] }}>{t.name}</span>
                <span style={{ fontSize:8, color:'#6b7280', fontFamily:'DM Mono, monospace' }}>{t.labor_multiplier<1?`-${Math.round((1-t.labor_multiplier)*100)}% pricing`:'baseline'}</span>
              </div>
            ))}
          </Sec>

          {/* Package */}
          <Sec t="Package" c="#2563eb">
            {packages.map(p => (
              <div key={p.id} onClick={() => setSelectedPkg(p)} style={{ padding:'5px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedPkg?.id===p.id?'2':'1'}px solid ${selectedPkg?.id===p.id?'#2563eb':'#e5e7eb'}`, background:selectedPkg?.id===p.id?'#eff6ff':'white' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:9, fontWeight:700, color:selectedPkg?.id===p.id?'#1e40af':'#374151' }}>{p.name}</span>
                  <span style={{ fontSize:8, fontFamily:'DM Mono, monospace', color:'#6b7280' }}>${p.ws_rate}/WS · ${p.user_rate}/US</span>
                </div>
              </div>
            ))}
            <Fld lbl="Quote Status" s={{ marginTop:8 }}>
              <SI v={quoteStatus} s={setQuoteStatus} opts={[['draft','Draft'],['in_review','In Review'],['approved','Approved'],['sent','Sent'],['won','Won'],['lost','Lost'],['expired','Expired']]}/>
            </Fld>
          </Sec>

          {/* People & devices */}
          <Sec t="People & Devices" c="#7c3aed">
            <Grid2>
              <Fld lbl="Users"><NI v={itInputs.users} s={val=>setIt('users',val)}/></Fld>
              <Fld lbl="Shared Mailboxes"><NI v={itInputs.sharedMailboxes} s={val=>setIt('sharedMailboxes',val)}/></Fld>
              <Fld lbl="Workstations"><NI v={itInputs.workstations} s={val=>setIt('workstations',val)}/></Fld>
              <Fld lbl="Total Devices"><NI v={itInputs.endpoints} s={val=>setIt('endpoints',val)}/></Fld>
              <Fld lbl="Mobile Devices"><NI v={itInputs.mobileDevices||0} s={val=>setIt('mobileDevices',val)}/></Fld>
            </Grid2>
          </Sec>

          {/* Infrastructure */}
          <Sec t="Infrastructure" c="#0891b2">
            <Grid2>
              <Fld lbl="Servers"><NI v={itInputs.servers} s={val=>setIt('servers',val)}/></Fld>
              <Fld lbl="Locations"><NI v={itInputs.locations} s={val=>setIt('locations',val)}/></Fld>
              <Fld lbl="Cloud Tenants"><NI v={itInputs.cloudTenants} s={val=>setIt('cloudTenants',val)}/></Fld>
              <Fld lbl="Vendors"><NI v={itInputs.vendors} s={val=>setIt('vendors',val)}/></Fld>
            </Grid2>
          </Sec>

          {/* Risk */}
          <Sec t="Risk & Compliance" c="#dc2626">
            <Grid2>
              <Fld lbl="Industry Risk"><SI v={itInputs.industryRisk} s={val=>setIt('industryRisk',val)} opts={[['low','Low'],['medium','Medium'],['high','High']]}/></Fld>
              <Fld lbl="Compliance"><SI v={itInputs.compliance} s={val=>setIt('compliance',val)} opts={[['none','None'],['moderate','HIPAA/SOC2'],['high','PCI/CMMC']]}/></Fld>
              <Fld lbl="Complexity"><SI v={itInputs.complexity} s={val=>setIt('complexity',val)} opts={[['low','Low'],['medium','Medium'],['high','High']]}/></Fld>
              <Fld lbl="Coverage"><SI v={itInputs.requestedCoverage} s={val=>setIt('requestedCoverage',val)} opts={[['business_hours','8×5'],['24x5','24×5'],['24x7','24×7']]}/></Fld>
            </Grid2>
          </Sec>

          {/* Add-ons */}
          {Object.entries(productsByCategory).map(([cat, catProducts]) => (
            <Sec key={cat} t={cat} c="#374151">
              {catProducts.map(p => {
                const sel = isSelected(p.id);
                return (
                  <div key={p.id} onClick={() => toggleProduct(p.id)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 6px', borderRadius:3, cursor:'pointer', marginBottom:2, border:`1px solid ${sel?'#93c5fd':'#e5e7eb'}`, background:sel?'#eff6ff':'white' }}>
                    <div style={{ width:20, height:12, borderRadius:6, flexShrink:0, background:sel?'#2563eb':'#d1d5db', position:'relative' }}>
                      <div style={{ position:'absolute', top:2, left:sel?10:2, width:8, height:8, borderRadius:'50%', background:'white', transition:'left .1s' }}/>
                    </div>
                    <span style={{ fontSize:9, fontWeight:600, flex:1, color:sel?'#1e40af':'#374151' }}>{p.name}</span>
                    <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#6b7280' }}>${p.sell_price}/{p.qty_driver}</span>
                  </div>
                );
              })}
            </Sec>
          ))}

          {/* Contract term (shared — drives bundle discount) */}
          <Sec t="Contract Term" c="#374151">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
              {[[12,'12 mo','5% voice disc.'],[24,'24 mo','10% voice disc.'],[36,'36 mo','15% + free phones']].map(([term,lbl,sub])=>(
                <div key={term} onClick={()=>setIt('contractTerm',term)} style={{ padding:'6px 5px', borderRadius:4, cursor:'pointer', textAlign:'center', border:`${itInputs.contractTerm===term?'2':'1'}px solid ${itInputs.contractTerm===term?'#7c3aed':'#e5e7eb'}`, background:itInputs.contractTerm===term?'#faf5ff':'white' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:itInputs.contractTerm===term?'#6d28d9':'#374151' }}>{lbl}</div>
                  <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>{sub}</div>
                </div>
              ))}
            </div>
          </Sec>
        </CollapsibleSec>

        {/* ── VOICE SECTION ── */}
        <CollapsibleSec
          title="📞 Hosted Voice"
          open={voiceOpen} onToggle={() => setVoiceOpen(o=>!o)}
          badge={voiceDiscountedMRR > 0 ? fmt$0(voiceDiscountedMRR) + '/mo' : null}
          color="#7c3aed">

          {/* Quote type */}
          <Sec t="Voice Type" c="#7c3aed">
            <div style={{ display:'grid', gap:3 }}>
              {[['hosted','Hosted Voice — Per Seat'],['hybrid','Hybrid Hosting — BYOPBX'],['sip','SIP Trunking Only']].map(([key,lbl])=>(
                <div key={key} onClick={()=>setVoice('quoteType',key)} style={{ padding:'5px 7px', borderRadius:4, cursor:'pointer', border:`${v.quoteType===key?'2':'1'}px solid ${v.quoteType===key?'#7c3aed':'#e5e7eb'}`, background:v.quoteType===key?'#faf5ff':'white' }}>
                  <span style={{ fontSize:9, fontWeight:700, color:v.quoteType===key?'#6d28d9':'#374151' }}>{lbl}</span>
                </div>
              ))}
            </div>
          </Sec>

          {v.quoteType === 'hosted' && (
            <Sec t="Seats" c="#0891b2">
              <Grid2>
                <Fld lbl="Billable Seats"><NI v={v.seats} s={val=>setVoice('seats',val)}/></Fld>
                <Fld lbl="Sell Price/Seat ($)"><NI v={v.seatPrice} s={val=>setVoice('seatPrice',val)}/></Fld>
              </Grid2>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, marginTop:4 }}>
                {[['pro','3CX Pro'],['enterprise','3CX Enterprise']].map(([key,lbl])=>(
                  <div key={key} onClick={()=>setVoice('licenseType',key)} style={{ padding:'5px 6px', borderRadius:3, cursor:'pointer', textAlign:'center', border:`${v.licenseType===key?'2':'1'}px solid ${v.licenseType===key?'#2563eb':'#e5e7eb'}`, background:v.licenseType===key?'#eff6ff':'white', gridColumn: key==='pro'?'1/2':'2/4' }}>
                    <div style={{ fontSize:9, fontWeight:700, color:v.licenseType===key?'#1e40af':'#374151' }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <Sec t="Non-Billable Devices" c="#6b7280">
                <Grid2>
                  <Fld lbl="Common Area"><NI v={v.commonAreaPhones} s={val=>setVoice('commonAreaPhones',val)}/></Fld>
                  <Fld lbl="Voicemail Only"><NI v={v.voicemailOnly} s={val=>setVoice('voicemailOnly',val)}/></Fld>
                  <Fld lbl="Door Phones"><NI v={v.doorPhones} s={val=>setVoice('doorPhones',val)}/></Fld>
                  <Fld lbl="Paging"><NI v={v.pagingDevices} s={val=>setVoice('pagingDevices',val)}/></Fld>
                </Grid2>
              </Sec>
            </Sec>
          )}

          {(v.quoteType === 'hybrid' || v.quoteType === 'sip') && (
            <Sec t="SIP Channels" c="#0891b2">
              <Fld lbl="Concurrent Call Paths" sub="$19.95/path/mo"><NI v={v.sipChannels} s={val=>setVoice('sipChannels',val)}/></Fld>
              {v.quoteType === 'hybrid' && (
                <>
                  <Fld lbl="3CX License Tier" style={{ marginTop:4 }}>
                    <select value={v.cxTierId} onChange={e=>setVoice('cxTierId',e.target.value)}
                      style={{ width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
                      <optgroup label="Pro"><option value="pro_8">Pro 8 paths — $395/yr</option><option value="pro_16">Pro 16 paths — $795/yr</option><option value="pro_24">Pro 24 paths — $1,095/yr</option></optgroup>
                      <optgroup label="Enterprise"><option value="ent_8">Ent. 8 paths — $575/yr</option><option value="ent_16">Ent. 16 paths — $1,095/yr</option><option value="ent_24">Ent. 24 paths — $1,495/yr</option></optgroup>
                    </select>
                  </Fld>
                  <Tog on={v.clientPaysMonthly} set={val=>setVoice('clientPaysMonthly',val)} lbl="Amortize license monthly"/>
                  <Tog on={v.largerInstance} set={val=>setVoice('largerInstance',val)} lbl="Enhanced VM instance"/>
                </>
              )}
            </Sec>
          )}

          <Sec t="Numbers & DIDs" c="#0f766e">
            <Grid2>
              <Fld lbl="Local DIDs" sub="$1.50"><NI v={v.localDIDs} s={val=>setVoice('localDIDs',val)}/></Fld>
              <Fld lbl="SMS DIDs" sub="+$1.25"><NI v={v.smsDIDs} s={val=>setVoice('smsDIDs',val)}/></Fld>
              <Fld lbl="Toll-Free" sub="$5.00"><NI v={v.tollFreeNumbers} s={val=>setVoice('tollFreeNumbers',val)}/></Fld>
              <Fld lbl="E911 DIDs" sub="$2.50"><NI v={v.e911DIDs} s={val=>setVoice('e911DIDs',val)}/></Fld>
              <Fld lbl="Port Numbers" sub="$25 NRC"><NI v={v.portingNumbers} s={val=>setVoice('portingNumbers',val)}/></Fld>
            </Grid2>
          </Sec>

          <Sec t="Fax & Add-ons" c="#0891b2">
            <Fld lbl="Fax Package">
              <select value={v.faxType} onChange={e=>setVoice('faxType',e.target.value)}
                style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
                <option value="none">No Fax</option>
                <option value="email_only">Email-Only — $9.95/mo</option>
                <option value="solo">Solo — $12/mo</option>
                <option value="team">Team — $29/mo</option>
                <option value="business">Business — $59/mo</option>
                <option value="infinity">Infinity — $119/mo</option>
                <option value="ata">ATA Device — $15/mo + $150</option>
              </select>
            </Fld>
            <Tog on={v.callRecording} set={val=>setVoice('callRecording',val)} lbl="Call Recording" sub="$15/mo"/>
            <Tog on={v.smsEnabled} set={val=>setVoice('smsEnabled',val)} lbl="SMS/MMS" sub="10DLC + metered"/>
          </Sec>

          <Sec t="Hardware" c="#374151">
            <Fld lbl="Hardware Type">
              <select value={v.hardwareType} onChange={e=>setVoice('hardwareType',e.target.value)}
                style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
                <option value="none">No Hardware</option>
                <option value="lease">Evergreen Lease</option>
                <option value="purchase">Outright Purchase</option>
              </select>
            </Fld>
            {v.hardwareType !== 'none' && (
              <>
                <Fld lbl="Model">
                  <select value={v.hardwareModel} onChange={e=>setVoice('hardwareModel',e.target.value)}
                    style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
                    {YEALINK_MODELS.map(m=><option key={m.id} value={m.id}>{m.label} — ${m.monthly}/mo or ${m.nrc}</option>)}
                  </select>
                </Fld>
                <Fld lbl="Quantity"><NI v={v.hardwareQty} s={val=>setVoice('hardwareQty',val)}/></Fld>
                {freePhones && v.hardwareType === 'purchase' && (
                  <div style={{ padding:'4px 7px', background:'#dcfce7', border:'1px solid #86efac', borderRadius:4, fontSize:9, color:'#166534', fontWeight:600 }}>
                    ✓ Hardware included FREE — 36-month bundle with ${fmt$0(itBaseMRR)}/mo IT base
                  </div>
                )}
              </>
            )}
            <Fld lbl="Programming Fee" sub="$25/seat"><NI v={v.programmingFee} s={val=>setVoice('programmingFee',val)}/></Fld>
          </Sec>
        </CollapsibleSec>

        {/* Save */}
        <div style={{ padding:8, background:'#f8fafc', borderRadius:5, border:'1px solid #e5e7eb', marginTop:4 }}>
          <button onClick={saveQuote} disabled={saving}
            style={{ width:'100%', padding:'7px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1 }}>
            {saving ? 'Saving...' : existingQuote ? 'Update Bundle Quote' : 'Save Bundle Quote'}
          </button>
          {existingQuote && (
            <div style={{ marginTop:5 }}>
              <SendForReviewButton
                quote={{ ...existingQuote, status: quoteStatus }}
                quoteType="bundle"
                onStatusChange={s => setQuoteStatus(s)}
              />
            </div>
          )}
          {saveMsg && <div style={{ fontSize:11, color:'#166534', fontWeight:600, marginTop:4 }}>{saveMsg}</div>}
        </div>
      </div>

      {/* ── RIGHT: Combined summary ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc', minWidth:0 }}>
        <ReviewBanner
          quote={{ ...existingQuote, status: quoteStatus, hubspot_deal_id: hubDealId }}
          quoteType="bundle"
          onStatusChange={s => setQuoteStatus(s)}
        />
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        <div className="fade-in">
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                <div style={{ padding:'2px 8px', background:'linear-gradient(135deg,#2563eb,#7c3aed)', color:'white', borderRadius:3, fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>Bundle</div>
                <h2 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:0 }}>{proposalName || recipientBiz || 'Bundle Quote'}</h2>
              </div>
              <div style={{ fontSize:10, color:'#6b7280' }}>
                {selectedPkg?.name} + {v.quoteType === 'hosted' ? 'Hosted Voice' : v.quoteType === 'hybrid' ? 'Hybrid Voice' : 'SIP Trunking'} · {contractTerm}-month term
                {bundle && <span style={{ color:'#7c3aed', marginLeft:4, fontWeight:600 }}>· {Math.round(bundle.rate*100)}% voice bundle discount</span>}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Combined MRR</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(combinedMRR)}</div>
            </div>
          </div>

          {/* KPI cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6, marginBottom:10 }}>
            {[
              ['IT MRR',       fmt$0(itResult?.finalMRR||0),     '#2563eb','#eff6ff'],
              ['Voice MRR',    fmt$0(voiceDiscountedMRR),        '#7c3aed','#faf5ff'],
              ['Bundle Saving',fmt$0(bundle?.voiceDiscount||0),  '#166534','#dcfce7'],
              ['Combined MRR', fmt$0(combinedMRR),               '#0f1e3c','#f0f4ff'],
              ['Implied GM',   fmtPct(combinedGM),               gmColor(combinedGM),gmBg(combinedGM)],
            ].map(([l,val,co,bg])=>(
              <div key={l} style={{ background:bg, borderRadius:5, padding:'6px 5px', textAlign:'center' }}>
                <div style={{ fontSize:7, fontWeight:600, color:'#6b7280', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:12, fontWeight:700, fontFamily:'DM Mono, monospace', color:co }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Bundle discount banner */}
          {bundle?.qualifies && (
            <div style={{ marginBottom:10, padding:'10px 14px', background:'linear-gradient(135deg,#eff6ff,#faf5ff)', border:'1px solid #c4b5fd', borderRadius:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#4c1d95' }}>📦 Bundle Discount Applied</div>
                  <div style={{ fontSize:10, color:'#7c3aed', marginTop:2 }}>
                    {contractTerm}-month Managed IT commitment → <strong>{Math.round(bundle.rate*100)}% off voice MRR</strong>
                    {freePhones && itBaseMRR >= 750 && <span style={{ color:'#166534', marginLeft:6 }}>· <strong>Free phones</strong> (IT base ≥ $750/mo)</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:8, color:'#9ca3af' }}>Monthly savings</div>
                  <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#166534' }}>{fmt$0(bundle.voiceDiscount)}/mo</div>
                  <div style={{ fontSize:9, color:'#9ca3af' }}>{fmt$0(bundle.voiceDiscount * contractTerm)} over term</div>
                </div>
              </div>
              {bundle.freePhones && itBaseMRR < 750 && (
                <div style={{ marginTop:6, fontSize:9, color:'#92400e', background:'#fef3c7', padding:'3px 7px', borderRadius:3 }}>
                  ⚡ Free phones require IT base MRR ≥ $750/mo. Current: {fmt$0(itBaseMRR)}/mo. Add {fmt$0(750 - itBaseMRR)}/mo more to qualify.
                </div>
              )}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignItems:'start' }}>

            {/* ── LEFT COLUMN: IT → Voice → Cost Model ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* IT line items */}
              <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#2563eb', marginBottom:6 }}>🖥 Managed IT — {fmt$0(itResult?.finalMRR||0)}/mo</div>
                {itResult ? (
                  <>
                    <SH l="Base Package"/>
                    <LI lbl={`WS (${itInputs.workstations} × $${selectedPkg?.ws_rate})`} v={itResult.wB} ind/>
                    <LI lbl={`US (${itInputs.users} × $${selectedPkg?.user_rate})`} v={itResult.uB} ind/>
                    <LI lbl="Servers" v={itResult.sB} ind/>
                    <LI lbl="Locations" v={itResult.lB} ind/>
                    <LI lbl="Tenants / Vendors" v={itResult.tB + itResult.vB} ind/>
                    {itResult.eB > 0 && <LI lbl="Endpoint density uplift" v={itResult.eB} ind/>}
                    <LI lbl="IT Base Subtotal" v={itResult.itSubtotal} bold/>
                    {itResult.lineItems.length > 0 && (
                      <>
                        <SH l="Security & Add-ons"/>
                        {itResult.lineItems.map(li => <LI key={li.product_id} lbl={`${li.product_name} (${li.qty} × $${li.sell_price})`} v={li.revenue} ind/>)}
                      </>
                    )}
                    {itResult.discount < 0 && <LI lbl={`${Math.round(itResult.discRate*100)}% contract discount`} v={itResult.discount} ind/>}
                    <LI lbl="✦ IT Final MRR" v={itResult.finalMRR} hi/>
                  </>
                ) : <div style={{ fontSize:11, color:'#9ca3af', padding:'8px 0' }}>Fill in IT details to see pricing</div>}
              </div>

              {/* Voice line items */}
              <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#7c3aed', marginBottom:6 }}>📞 Voice — {fmt$0(voiceDiscountedMRR)}/mo</div>
                {voiceResultFinal ? (
                  <>
                    {[['seats','Billable Seats'],['devices','Non-Billable (Included)'],['hybrid','3CX & Hosting'],['sip','SIP Trunking'],['numbers','Numbers & DIDs'],['fax','Fax'],['addons','Add-ons'],['sms','SMS/MMS'],['hardware','Hardware'],['onetime','One-Time Fees']].map(([sec,secLabel])=>{
                      const secLines = voiceResultFinal.lines.filter(l=>l.section===sec);
                      if (!secLines.length) return null;
                      return (
                        <span key={sec}>
                          <SH l={secLabel}/>
                          {secLines.map((l,i)=>(
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'1px 2px', marginLeft:7 }}>
                              <span style={{ fontSize:8, color:l.mrr===0&&!l.nrc?'#9ca3af':'#6b7280' }}>{l.label}</span>
                              <div style={{ textAlign:'right', flexShrink:0, marginLeft:4 }}>
                                {l.mrr!==0&&<div style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#374151' }}>{l.mrr<0?`(${fmt$(-l.mrr)})`:fmt$(l.mrr)}<span style={{ fontSize:7, color:'#9ca3af' }}>/mo</span></div>}
                                {l.nrc>0&&<div style={{ fontSize:8, fontFamily:'DM Mono, monospace', color:'#0f766e' }}>{fmt$(l.nrc)}<span style={{ fontSize:7, color:'#9ca3af' }}> NRC</span></div>}
                                {l.mrr===0&&!l.nrc&&<div style={{ fontSize:7, color:'#9ca3af' }}>{l.note||'Incl.'}</div>}
                              </div>
                            </div>
                          ))}
                        </span>
                      );
                    })}
                    <LI lbl="Voice Subtotal" v={voiceResultFinal.finalMRR} bold/>
                    {bundle?.voiceDiscount > 0 && <LI lbl={`Bundle discount (${Math.round(bundle.rate*100)}%)`} v={-bundle.voiceDiscount} ind/>}
                    <LI lbl="✦ Voice Final MRR" v={voiceDiscountedMRR} hi/>
                  </>
                ) : <div style={{ fontSize:11, color:'#9ca3af', padding:'8px 0' }}>Fill in Voice details to see pricing</div>}
              </div>

              {/* Cost model */}
              <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Combined Cost Model</div>
                <LI lbl="IT tooling + labor" v={itResult?.totalCost||0} ind/>
                <LI lbl="Voice delivery cost" v={voiceResultFinal?.totalCost||0} ind/>
                <LI lbl="Total Estimated Cost" v={combinedCost} bold/>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 6px', background:gb, borderRadius:4, marginTop:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:gc }}>Combined Gross Margin</span>
                  <span style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:gc }}>{fmtPct(combinedGM)}</span>
                </div>
                {combinedGM < 0.40 && <div style={{ marginTop:4, fontSize:9, color:'#92400e', background:'#fef3c7', padding:'3px 5px', borderRadius:3 }}>⚠ Below 40% — review scope.</div>}
                <div style={{ marginTop:8, padding:'6px 8px', background:'#f9fafb', borderRadius:4 }}>
                  <div style={{ fontSize:9, color:'#6b7280', marginBottom:2 }}>Onboarding / One-Time</div>
                  <LI lbl="IT Onboarding" v={itResult?.onboarding||0} ind/>
                  {voiceResultFinal?.nrc > 0 && <LI lbl="Voice One-Time Fees" v={voiceResultFinal.nrc} ind/>}
                  <LI lbl="Total One-Time" v={combinedNRC} bold/>
                </div>
              </div>

              {/* Market Rate Analysis */}
              <MarketRateCard
                quoteId={existingQuote?.id}
                clientZip={clientZip}
                onRatesAccepted={(rates, suggestedTier) => {
                  if (suggestedTier && marketTiers.length) {
                    const tier = marketTiers.find(t => t.tier_key === suggestedTier);
                    if (tier) setSelectedMkt(tier);
                  }
                }}
              />
            </div>

            {/* ── RIGHT COLUMN: Deal Summary → QuoteNotes → QuoteHistory ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* Combined Deal Summary */}
              <div style={{ background:'#0f1e3c', borderRadius:6, padding:12 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>Combined Deal Summary</div>
                {[
                  ['Quote #',        existingQuote?.quote_number || 'Unsaved'],
                  ['Client',         recipientBiz],
                  recipientContact && ['Contact', recipientContact],
                  ['Package',        selectedPkg?.name],
                  ['Contract',       `${contractTerm} months`],
                  ['IT MRR',         fmt$0(itResult?.finalMRR||0)],
                  ['Voice MRR',      fmt$0(voiceDiscountedMRR)],
                  bundle?.voiceDiscount>0 && ['Bundle Savings', `${fmt$0(bundle.voiceDiscount)}/mo`],
                  ['Combined MRR',   fmt$0(combinedMRR)],
                  ['One-Time Fees',  fmt$0(combinedNRC)],
                  ['Total Contract Value', fmt$0(combinedTCV)],
                  hubDealId && ['HubSpot', hubDealName||`#${hubDealId}`],
                ].filter(Boolean).map(([k,val])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #1e3a5f' }}>
                    <span style={{ fontSize:9, color:'#64748b' }}>{k}</span>
                    <span style={{ fontSize:9, fontWeight:600, color:'white', fontFamily:(typeof val==='string'&&val.startsWith('$'))?'DM Mono, monospace':'inherit' }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Onboarding Incentive */}
              {combinedNRC > 0 && (
                <OnboardingIncentive
                  fee={combinedNRC}
                  marketTier={zipResult?.tier === 'major_metro' ? 'premium' : zipResult?.tier === 'mid_market' ? 'standard' : 'secondary'}
                  contractTerm={contractTerm}
                  onChange={inc => setObIncentive(inc)}
                />
              )}

              {/* Quote Notes */}
              <QuoteNotes
                quoteId={existingQuote?.id}
                quoteNumber={existingQuote?.quote_number}
                clientName={recipientBiz}
                hubDealId={hubDealId}
              />

              {/* Revision History */}
              <QuoteHistory quoteId={existingQuote?.id} />

            </div>
          </div>
        </div>
        </div>{/* end inner scroll */}
      </div>

    </div>
    </>
  );
}

// ─── Collapsible section wrapper ──────────────────────────────────────────────
function CollapsibleSec({ title, open, onToggle, badge, color, children }) {
  return (
    <div style={{ marginBottom:10, border:`1px solid ${open?color+'40':'#e5e7eb'}`, borderRadius:6, overflow:'hidden' }}>
      <div onClick={onToggle} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:open?color+'10':'#f9fafb', cursor:'pointer' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:2, height:14, background:color, borderRadius:2 }}/>
          <span style={{ fontSize:11, fontWeight:700, color:open?color:'#374151' }}>{title}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {badge && <span style={{ fontSize:10, fontFamily:'DM Mono, monospace', fontWeight:700, color:color }}>{badge}</span>}
          <span style={{ fontSize:11, color:'#9ca3af' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && <div style={{ padding:'10px 12px' }}>{children}</div>}
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function Sec({t,c,children}){return(<div style={{marginBottom:10}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:5,paddingBottom:3,borderBottom:'1px solid #f1f5f9'}}><div style={{width:2,height:11,background:c||'#2563eb',borderRadius:2}}/><span style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6b7280'}}>{t}</span></div>{children}</div>);}
function Grid2({children}){return<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>{children}</div>;}
function Fld({lbl,sub,children,s}){return(<div style={{marginBottom:4,...s}}><label style={{display:'block',fontSize:9,fontWeight:600,color:'#374151',marginBottom:1}}>{lbl}{sub&&<span style={{fontWeight:400,color:'#9ca3af',marginLeft:3,fontSize:9}}>{sub}</span>}</label>{children}</div>);}
function TI({value,onChange,placeholder}){return<input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder||''} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,outline:'none'}}/>;}
function NI({v,s}){return<input type="number" value={v} min={0} onChange={e=>s(+e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,fontFamily:'DM Mono, monospace',color:'#1e3a5f',background:'#eff6ff',fontWeight:600,outline:'none'}}/>;}
function SI({v,s,opts}){return<select value={v} onChange={e=>s(e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,background:'white',outline:'none',color:'#374151'}}>{opts.map(([a,b])=><option key={a} value={a}>{b}</option>)}</select>;}
function Tog({on,set,lbl,sub}){return(<div onClick={()=>set(!on)} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:4,cursor:'pointer',border:`1px solid ${on?'#93c5fd':'#e5e7eb'}`,background:on?'#eff6ff':'white',marginBottom:2}}><div style={{width:24,height:14,borderRadius:7,flexShrink:0,background:on?'#2563eb':'#d1d5db',position:'relative'}}><div style={{position:'absolute',top:2,left:on?12:2,width:10,height:10,borderRadius:'50%',background:'white',transition:'left .12s'}}/></div><div><span style={{fontSize:10,fontWeight:600,color:on?'#1e40af':'#374151'}}>{lbl}</span>{sub&&<span style={{fontSize:9,color:'#9ca3af',marginLeft:4}}>{sub}</span>}</div></div>);}
function LI({lbl,v,ind,bold,hi,muted}){if(v===0&&!bold&&!hi)return null;return(<div style={{display:'flex',justifyContent:'space-between',padding:hi?'5px 7px':'1px 2px',marginLeft:ind?7:0,borderRadius:hi?4:0,background:hi?'#dcfce7':'transparent',borderTop:bold&&!hi?'1px solid #f3f4f6':'none',marginTop:bold&&!hi?2:0}}><span style={{fontSize:hi?9:8,fontWeight:bold||hi?700:400,color:hi?'#166534':muted?'#9ca3af':bold?'#374151':'#6b7280'}}>{lbl}</span><span style={{fontSize:hi?11:9,fontWeight:bold||hi?700:500,fontFamily:'DM Mono, monospace',color:hi?'#166534':v<0?'#dc2626':bold?'#111827':'#374151'}}>{v<0?`(${fmt$(-v)})`:fmt$(v)}</span></div>);}
function SH({l}){return<div style={{fontSize:7,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'#9ca3af',padding:'3px 2px 1px',marginTop:2}}>{l}</div>;}
