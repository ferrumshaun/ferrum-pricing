import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { lookupZip, fmt$, fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';
import { calcVoice, calcHybridMRR, getRecommendedTier, CX_TIERS, FAX_PACKAGES, YEALINK_MODELS } from '../lib/voicePricing';
import { searchDeals, getDealFull, updateDealDescription } from '../lib/hubspot';
import QuoteNotes    from '../components/QuoteNotes';
import QuoteHistory  from '../components/QuoteHistory';
import { saveQuoteVersion } from '../lib/quoteVersions';
import { SendForReviewButton, ReviewBanner } from '../components/SendForReview';
import IntlDialingWaiver from '../components/IntlDialingWaiver';
import HubSpotConnect from '../components/HubSpotConnect';
import SPTConnect    from '../components/SPTConnect';
import MarketRateCard from '../components/MarketRateCard';

const DEF = {
  quoteType: 'hosted', licenseType: 'pro',
  seats: 0, seatPrice: 0, seatCost: 0,
  commonAreaPhones: 0, voicemailOnly: 0, doorPhones: 0, pagingDevices: 0, specialRingers: 0,
  cxTierId: 'pro_8', clientPaysMonthly: true, isManagedIT: false, largerInstance: false,
  sipChannels: 0,
  localDIDs: 0, smsDIDs: 0, tollFreeNumbers: 0, e911DIDs: 0, tollFreePerMin: false, tollFreePerMinRate: 0.05,
  faxType: 'none', faxQty: 1,
  callRecording: false,
  smsEnabled: false, smsNewRegistration: true, smsCampaigns: 1,
  hardwareType: 'none', hardwareItems: [], hardwareDiscount50: false, byohItems: [],
  programmingFee: 0, portingNumbers: 0,
  contractTerm: 24,
  internationalDialing: 'none',
};

export default function VoiceQuotePage() {
  const { id } = useParams();
  const { settings, marketTiers, loading: configLoading } = useConfig();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Handle conversion from Bundle (unbundle → Voice) ─────────────────────
  useEffect(() => {
    const from = location.state?.fromBundle;
    if (!from || from.type !== 'voice' || configLoading) return;
    setRecipientBiz(from.clientName       || '');
    setProposalName(from.proposalName     || '');
    setRecipientContact(from.recipientContact || '');
    setRecipientEmail(from.recipientEmail     || '');
    setRecipientAddress(from.recipientAddress || '');
    setClientZip(from.clientZip || '');
    setDealDescription(from.notes || '');
    setHubDealId(from.hubDealId   || '');
    setHubDealUrl(from.hubDealUrl  || '');
    setHubDealName(from.hubDealName || '');
    if (from.voiceInputs) setV(prev => ({ ...prev, ...from.voiceInputs }));
  }, [location.state, configLoading]);

  const [v, setV]               = useState(DEF);
  const [proposalName, setProposalName] = useState('');
  const [sptProposalId,    setSptProposalId]    = useState(null);
  const [showIntlWaiver,   setShowIntlWaiver]   = useState(false);
  const [pricingSnapshot, setPricingSnapshot] = useState(null);
  const [priceLockDate,   setPriceLockDate]   = useState(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [repId,        setRepId]        = useState(null);
  const [repProfile,   setRepProfile]   = useState(null);
  const [teamMembers,  setTeamMembers]  = useState([]);
  const [recipientBiz, setRecipientBiz] = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [clientZip, setClientZip]   = useState('');
  const [zipResult, setZipResult]   = useState(null);
  const [zipApplied, setZipApplied] = useState(false);
  const [marketCity,  setMarketCity]  = useState('');
  const [marketState, setMarketState] = useState('');
  const [dealDescription, setDealDescription]           = useState('');
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState('');
  const [existingQuote, setExistingQuote] = useState(null);

  // HubSpot

  const [hubDealId, setHubDealId]   = useState('');
  const [hubDealName, setHubDealName] = useState('');
  const [hubDealUrl, setHubDealUrl] = useState('');

  const set = useCallback((k, val) => setV(p => ({ ...p, [k]: val })), []);

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

  // Load existing quote
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
      setQuoteStatus(data.status || 'draft');
      setDealDescription(data.notes || '');
      setHubDealId(data.hubspot_deal_id || '');
      setHubDealUrl(data.hubspot_deal_url || '');
      setHubDealName(data.inputs?.hubspotDealName || '');
      if (data.inputs?.voice) setV({ ...DEF, ...data.inputs.voice });
      if (data.rep_id) setRepId(data.rep_id);
      if (data.pricing_snapshot) { setPricingSnapshot(data.pricing_snapshot); setPriceLockDate(data.price_locked_at); }
      if (data.spt_proposal_id) setSptProposalId(data.spt_proposal_id);
    });
  }, [id, configLoading]);

  function handleZipChange(val) {
    setClientZip(val);
    setZipResult(val.length >= 3 ? lookupZip(val) : null);
  }

  // HubSpot
  async function saveQuote() {
    if (!recipientBiz.trim()) { setSaveMsg('Please enter a client name.'); return; }
    setSaving(true); setSaveMsg('');
    const allInputs = { proposalName, recipientContact, recipientEmail, recipientAddress, hubspotDealName: hubDealName, voice: v };
    const r = configLoading ? null : calcVoice(v, settings);
    const totals = r ? { finalMRR: r.finalMRR, nrc: r.nrc, gm: r.gm, estTax: r.estTax } : {};
    const payload = {
      client_name: recipientBiz, client_zip: clientZip,
      package_name: `Voice — ${v.quoteType}`,
      status: quoteStatus, notes: dealDescription, inputs: allInputs,
      line_items: r?.lines || [], totals,
      hubspot_deal_id: hubDealId || null, hubspot_deal_url: hubDealUrl || null,
      rep_id:     repId || profile?.id || null,
      ...(quoteStatus === 'approved' && !pricingSnapshot ? { pricing_snapshot: { lockedAt: new Date().toISOString() }, price_locked_at: new Date().toISOString(), price_locked_by: profile?.id } : {}),
      ...(pricingSnapshot ? { pricing_snapshot: pricingSnapshot, price_locked_at: priceLockDate } : {}),
      updated_by: profile?.id,
    };
    if (!existingQuote) payload.created_by = profile?.id;
    const { data, error } = existingQuote
      ? await supabase.from('quotes').update(payload).eq('id', existingQuote.id).select().single()
      : await supabase.from('quotes').insert(payload).select().single();
    if (error) { setSaveMsg('Error: ' + error.message); setSaving(false); return; }

    // Push deal description to HubSpot if linked
    if (hubDealId && dealDescription) {
      try { await updateDealDescription(hubDealId, dealDescription); }
      catch (err) { console.warn('HubSpot description sync failed:', err.message); }
    }

    await logActivity({ action: existingQuote ? 'UPDATE' : 'CREATE', entityType: 'quote', entityId: data.id, entityName: recipientBiz, changes: { type: 'voice', mrr: totals.finalMRR } });

    await saveQuoteVersion({
      quoteId: data.id,
      quoteData: { client_name: recipientBiz, client_zip: clientZip, package_name: `Voice — ${v.quoteType}`, status: quoteStatus },
      inputs: { proposalName, recipientContact, recipientEmail, recipientAddress, voice: v },
      totals,
      lineItems: r?.lines || [],
      profile,
    });

    setSaveMsg(`Saved as ${data.quote_number}${hubDealId && dealDescription ? ' · HubSpot updated' : ''}`);
    setSaving(false);
    if (!existingQuote) navigate(`/voice/${data.id}`, { replace: true });
  }

  const result = configLoading ? null : calcVoice(v, settings);

  // Crossover analysis for hosted seats
  const crossover = v.quoteType === 'hosted' && v.seats > 0 && result
    ? calcHybridMRR(v.seats, v.licenseType, v.isManagedIT, parseFloat(settings.voice_support_bundle || 295), parseFloat(settings.voice_hosting_cost || 24), parseFloat(settings.sip_channel_rate || 19.95), v.sipChannels || Math.ceil(v.seats * 0.3), settings)
    : null;

  const gc = result ? gmColor(result.gm) : '#374151';
  const gb = result ? gmBg(result.gm)    : '#f9fafb';

  const recommendedTier = v.quoteType === 'hosted' && v.seats > 0 ? getRecommendedTier(v.seats, v.licenseType) : null;

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* ── LEFT PANEL ── */}
      <div style={{ width:350, flexShrink:0, background:'white', borderRight:'1px solid #e5e7eb', overflowY:'auto', padding:'12px 14px' }}>

        {/* Quote badge */}
        {existingQuote && (
          <div style={{ marginBottom:8, padding:'5px 8px', background:'#f0f7ff', borderRadius:5, fontSize:11, color:'#1e40af', fontWeight:600 }}>
            {existingQuote.quote_number} — Voice
          </div>
        )}

        {/* HubSpot */}
        <HubSpotConnect
          dealId={hubDealId}
          dealUrl={hubDealUrl}
          dealName={hubDealName}
          description={dealDescription}
          onDescriptionChange={setDealDescription}
          quoteNumber={existingQuote?.quote_number}
          mrr={result?.finalMRR}
          contractValue={result ? result.finalMRR * v.contractTerm + result.nrc : 0}
          packageName={`Voice — ${v.quoteType}`}
          contractTerm={v.contractTerm}
          existingQuoteId={existingQuote?.id}
          clientName={recipientBiz}
          onConnect={full => {
            setHubDealId(full.dealId); setHubDealUrl(full.dealUrl); setHubDealName(full.deal.dealname);
            if (full.company) {
              if (full.company.name) setRecipientBiz(full.company.name);
              const addr = [full.company.address, full.company.city, full.company.state, full.company.zip].filter(Boolean).join(', ');
              if (addr) setRecipientAddress(addr);
              if (full.company.zip) {
                setClientZip(full.company.zip);
                const zr = lookupZip(full.company.zip);
                setZipResult(zr);
                if (zr) { const tier = marketTiers.find(t => t.tier_key === zr.tier); if (tier) { setSelectedMkt(tier); setZipApplied(true); } if (zr.city) setMarketCity(zr.city); if (zr.state) setMarketState(zr.state); }
              }
            } else { const x = full.deal.dealname?.split(/\s[-–—]\s/)?.[0]?.trim(); if (x) setRecipientBiz(x); }
            if (full.contact) { const n=[full.contact.firstname,full.contact.lastname].filter(Boolean).join(' '); if(n) setRecipientContact(n); if(full.contact.email) setRecipientEmail(full.contact.email); }
            if (!proposalName && full.deal.dealname) setProposalName(`FerrumIT Hosted Voice — ${full.company?.name||full.deal.dealname}`);
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
          <Fld lbl="Proposal Name"><TI value={proposalName} onChange={setProposalName} placeholder="FerrumIT Hosted Voice — Acme Corp"/></Fld>
          <Fld lbl="Client Business Name"><TI value={recipientBiz} onChange={setRecipientBiz} placeholder="Acme Corp"/></Fld>
          <Grid2>
            <Fld lbl="Contact Name"><TI value={recipientContact} onChange={setRecipientContact} placeholder="Jane Smith"/></Fld>
            <Fld lbl="Contact Email"><TI value={recipientEmail} onChange={setRecipientEmail} placeholder="jane@acme.com"/></Fld>
          </Grid2>
          <Fld lbl="Business Address"><TI value={recipientAddress} onChange={setRecipientAddress} placeholder="123 Main St, Chicago, IL 60601"/></Fld>
          <Fld lbl="Zip Code">
            <input value={clientZip} onChange={e=>handleZipChange(e.target.value)} placeholder="60601"
              style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', outline:'none' }}/>
            {zipResult && <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>{zipResult.name || `ZIP ${zipResult.zip}`}</div>}
          </Fld>
        </Sec>

        {/* Contract & Status — just under Proposal Details */}
        <Sec t="Contract & Status" c="#374151">
          <Grid2>
            <Fld lbl="Contract Term">
              <select value={v.contractTerm} onChange={e=>set('contractTerm',+e.target.value)}
                style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none' }}>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
              </select>
            </Fld>
            <Fld lbl="Quote Status">
              <select value={quoteStatus} onChange={e=>setQuoteStatus(e.target.value)}
                style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none' }}>
                {['draft','in_review','approved','sent','won','lost','expired'].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </Fld>
          </Grid2>
          <Fld lbl="Programming Fee" sub="seats × $25"><NI v={v.programmingFee} s={val=>set('programmingFee',val)}/></Fld>
        </Sec>

        {/* Quote Type */}
        <Sec t="Voice Quote Type" c="#7c3aed">
          <div style={{ display:'grid', gap:3 }}>
            {[['hosted','Hosted Voice — Per Seat','Per-user hosted PBX on our platform'],['hybrid','Hybrid Hosting — BYOPBX','Client leases 3CX + we host + SIP trunking'],['sip','SIP Trunking Only','Concurrent call paths — client has own PBX']].map(([key,lbl,desc])=>(
              <div key={key} onClick={()=>set('quoteType',key)} style={{ padding:'7px 9px', borderRadius:5, cursor:'pointer', border:`${v.quoteType===key?'2':'1'}px solid ${v.quoteType===key?'#7c3aed':'#e5e7eb'}`, background:v.quoteType===key?'#faf5ff':'white' }}>
                <div style={{ fontSize:10, fontWeight:700, color:v.quoteType===key?'#6d28d9':'#374151' }}>{lbl}</div>
                <div style={{ fontSize:9, color:'#9ca3af', marginTop:1 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Sec>

        {/* ── HOSTED SEATS ── */}
        {v.quoteType === 'hosted' && (
          <>
            <Sec t="License Type" c="#2563eb">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {[['pro','3CX Pro','Standard features'],['enterprise','3CX Enterprise','+ AI & transcription']].map(([key,lbl,desc])=>(
                  <div key={key} onClick={()=>set('licenseType',key)} style={{ padding:'6px 8px', borderRadius:4, cursor:'pointer', border:`${v.licenseType===key?'2':'1'}px solid ${v.licenseType===key?'#2563eb':'#e5e7eb'}`, background:v.licenseType===key?'#eff6ff':'white' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:v.licenseType===key?'#1e40af':'#374151' }}>{lbl}</div>
                    <div style={{ fontSize:8, color:'#9ca3af' }}>{desc}</div>
                  </div>
                ))}
              </div>
              {recommendedTier && (
                <div style={{ marginTop:6, padding:'5px 8px', background:'#f0f7ff', borderRadius:4, fontSize:9, color:'#1e40af' }}>
                  Recommended: <strong>{recommendedTier.label}</strong> ({recommendedTier.ext_min}–{recommendedTier.ext_max} ext) — ${(recommendedTier.annual_cost/12).toFixed(2)}/mo amortized
                </div>
              )}
            </Sec>

            <Sec t="Seat Configuration" c="#0891b2">
              <Grid2>
                <Fld lbl="Billable Seats" sub="humans only"><NI v={v.seats} s={val=>set('seats',val)}/></Fld>
                <Fld lbl="Sell Price / Seat ($)"><NI v={v.seatPrice} s={val=>set('seatPrice',val)}/></Fld>
              </Grid2>
            </Sec>

            <Sec t="Non-Billable Devices" c="#6b7280">
              <div style={{ fontSize:9, color:'#9ca3af', marginBottom:5 }}>Shown on quote at $0 — for transparency and provisioning</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                <Fld lbl="Common Area Phones"><NI v={v.commonAreaPhones} s={val=>set('commonAreaPhones',val)}/></Fld>
                <Fld lbl="Voicemail Only Ext."><NI v={v.voicemailOnly} s={val=>set('voicemailOnly',val)}/></Fld>
                <Fld lbl="Door Phones"><NI v={v.doorPhones} s={val=>set('doorPhones',val)}/></Fld>
                <Fld lbl="Paging Devices"><NI v={v.pagingDevices} s={val=>set('pagingDevices',val)}/></Fld>
                <Fld lbl="Special Ringers"><NI v={v.specialRingers} s={val=>set('specialRingers',val)}/></Fld>
              </div>
            </Sec>
          </>
        )}

        {/* ── HYBRID HOSTING ── */}
        {v.quoteType === 'hybrid' && (
          <Sec t="3CX License & Hosting" c="#2563eb">
            <Fld lbl="3CX License Tier">
              <select value={v.cxTierId} onChange={e=>set('cxTierId',e.target.value)}
                style={{ width:'100%', padding:'5px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none' }}>
                <optgroup label="3CX Pro"><option value="pro_8">Pro 8 paths (1–40 ext) — $395/yr</option><option value="pro_16">Pro 16 paths (41–80 ext) — $795/yr</option><option value="pro_24">Pro 24 paths (81–120 ext) — $1,095/yr</option></optgroup>
                <optgroup label="3CX Enterprise"><option value="ent_8">Enterprise 8 paths (1–40 ext) — $575/yr</option><option value="ent_16">Enterprise 16 paths (41–80 ext) — $1,095/yr</option><option value="ent_24">Enterprise 24 paths (81–120 ext) — $1,495/yr</option></optgroup>
              </select>
            </Fld>
            <Tog on={v.clientPaysMonthly} set={val=>set('clientPaysMonthly',val)} lbl="Amortize license monthly" sub="Auto-calculates annual ÷ 12"/>
            <Tog on={v.isManagedIT} set={val=>set('isManagedIT',val)} lbl="Managed IT client" sub="Support included — hosting only charged"/>
            <Tog on={v.largerInstance} set={val=>set('largerInstance',val)} lbl="Enhanced VM instance" sub="API/reporting integrations — higher compute"/>
          </Sec>
        )}

        {/* ── SIP TRUNKING (shown for hybrid and sip-only) ── */}
        {(v.quoteType === 'sip' || v.quoteType === 'hybrid') && (
          <Sec t="SIP Trunking" c="#0891b2">
            <Fld lbl="Concurrent Call Paths" sub="$19.95/path/mo"><NI v={v.sipChannels} s={val=>set('sipChannels',val)}/></Fld>
          </Sec>
        )}

        {/* Numbers & DIDs */}
        <Sec t="Numbers & DIDs" c="#0f766e">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
            <Fld lbl="Local DIDs" sub="$1.50/mo w/CNAM"><NI v={v.localDIDs} s={val=>set('localDIDs',val)}/></Fld>
            <Fld lbl="SMS-Enabled DIDs" sub="+$1.25/mo add-on"><NI v={v.smsDIDs} s={val=>set('smsDIDs',val)}/></Fld>
            <Fld lbl="Toll-Free Numbers" sub="$5.00/mo"><NI v={v.tollFreeNumbers} s={val=>set('tollFreeNumbers',val)}/></Fld>
            <Fld lbl="E911 DIDs" sub="$2.50/mo flat"><NI v={v.e911DIDs} s={val=>set('e911DIDs',val)}/></Fld>
          </div>
          <Tog on={v.tollFreePerMin} set={val=>set('tollFreePerMin',val)} lbl="Show toll-free per-minute rate" sub="$0.05/min default — metered"/>
          <Fld lbl="Numbers to Port (one-time)" sub="$25/number"><NI v={v.portingNumbers} s={val=>set('portingNumbers',val)}/></Fld>
        </Sec>

        {/* International Dialing */}
        <Sec t="International Dialing Policy" c="#dc2626">
          <div style={{ display:'grid', gap:3 }}>
            {[['none','No International Dialing','Blocked — domestic only'],['standard','Standard International','Safe countries only — client waiver required'],['open','Full Open Access','All non-high-risk countries — client waiver required']].map(([key,lbl,desc])=>(
              <div key={key} onClick={()=>set('internationalDialing',key)} style={{ padding:'5px 7px', borderRadius:4, cursor:'pointer', border:`${v.internationalDialing===key?'2':'1'}px solid ${v.internationalDialing===key?'#dc2626':'#e5e7eb'}`, background:v.internationalDialing===key?'#fef2f2':'white' }}>
                <div style={{ fontSize:9, fontWeight:700, color:v.internationalDialing===key?'#dc2626':'#374151' }}>{lbl}</div>
                <div style={{ fontSize:8, color:'#9ca3af' }}>{desc}</div>
              </div>
            ))}
          </div>
          {(v.internationalDialing==='standard'||v.internationalDialing==='open') && (
            <div style={{ marginTop:5, padding:'5px 8px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:4, fontSize:9, color:'#92400e' }}>
              ⚠ Client waiver required — responsible for all charges including malicious traffic
            </div>
          )}
        </Sec>

        {/* Fax */}
        <Sec t="Virtual Fax" c="#0891b2">
          <Fld lbl="Fax Package">
            <select value={v.faxType} onChange={e=>set('faxType',e.target.value)}
              style={{ width:'100%', padding:'5px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none' }}>
              <option value="none">No Fax</option>
              <option value="email_only">Email-Only Fax — $9.95/mo</option>
              <option value="solo">Virtual Fax Solo — $12/mo (1 user, 50 pages)</option>
              <option value="team">Virtual Fax Team — $29/mo (5 users, 500 pages)</option>
              <option value="business">Virtual Fax Business — $59/mo (15 users, 1,000 pages)</option>
              <option value="infinity">Virtual Fax Infinity — $119/mo (50 users, 2,500 pages)</option>
              <option value="ata">ATA Fax Device — $15/mo + $150 one-time (250 pages)</option>
            </select>
          </Fld>
          {v.faxType && v.faxType !== 'none' && v.faxType !== 'email_only' && (
            <Fld lbl="Number of Fax Lines"><NI v={v.faxQty} s={val=>set('faxQty',val)}/></Fld>
          )}
        </Sec>

        {/* Add-ons */}
        <Sec t="Add-ons" c="#0891b2">
          <Tog on={v.callRecording} set={val=>set('callRecording',val)} lbl="Call Recording" sub="Cloud storage — $15/mo"/>
          <Tog on={v.smsEnabled} set={val=>set('smsEnabled',val)} lbl="SMS/MMS" sub="10DLC reg + campaigns + metered segments"/>
          {v.smsEnabled && (
            <div style={{ marginLeft:8, marginTop:4 }}>
              <Tog on={v.smsNewRegistration} set={val=>set('smsNewRegistration',val)} lbl="New 10DLC brand registration" sub="$65 one-time"/>
              <Fld lbl="SMS Campaigns" sub="$15/mo each"><NI v={v.smsCampaigns} s={val=>set('smsCampaigns',val)}/></Fld>
            </div>
          )}
        </Sec>

        {/* Hardware */}
        <Sec t="Hardware" c="#374151">
          {/* Hardware type — mutually exclusive */}
          <Fld lbl="Hardware Option">
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {[['none','No Hardware — Apps only'],['lease','Evergreen Lease (monthly recurring)'],['purchase','Outright Purchase (one-time)'],['byoh','BYOH — Bring Your Own Handset']].map(([val,lbl]) => (
                <label key={val} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'4px 6px', borderRadius:4, border:`1px solid ${v.hardwareType===val?'#374151':'#e5e7eb'}`, background:v.hardwareType===val?'#f8fafc':'white' }}>
                  <input type="radio" name="hwType" value={val} checked={v.hardwareType===val} onChange={()=>set('hardwareType',val)} style={{ accentColor:'#374151' }}/>
                  <span style={{ fontSize:10, fontWeight:v.hardwareType===val?700:400, color:'#374151' }}>{lbl}</span>
                </label>
              ))}
            </div>
          </Fld>

          {/* Yealink mixed model builder */}
          {(v.hardwareType==='lease'||v.hardwareType==='purchase') && (
            <>
              <Fld lbl="Phone Models — add as many as needed">
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {(v.hardwareItems||[]).map((item,i) => (
                    <div key={i} style={{ display:'flex', gap:5, alignItems:'center' }}>
                      <select value={item.model} onChange={e=>{const items=[...(v.hardwareItems||[])];items[i]={...items[i],model:e.target.value};set('hardwareItems',items);}}
                        style={{ flex:1, padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
                        {YEALINK_MODELS.map(m=><option key={m.id} value={m.id}>{m.label} — {v.hardwareType==='lease'?`$${m.monthly}/mo`:`$${m.nrc}`} · {m.desc}</option>)}
                      </select>
                      <input type="number" min="1" value={item.qty||1} onChange={e=>{const items=[...(v.hardwareItems||[])];items[i]={...items[i],qty:+e.target.value};set('hardwareItems',items);}}
                        style={{ width:52, padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', textAlign:'center', outline:'none' }}/>
                      <button onClick={()=>{const items=(v.hardwareItems||[]).filter((_,j)=>j!==i);set('hardwareItems',items);}}
                        style={{ padding:'3px 6px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:3, color:'#dc2626', fontSize:12, cursor:'pointer' }}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>set('hardwareItems',[...(v.hardwareItems||[]),{model:'T33G',qty:1}])}
                    style={{ padding:'4px 8px', background:'white', border:'1px dashed #d1d5db', borderRadius:4, fontSize:10, color:'#6b7280', cursor:'pointer', textAlign:'left' }}>
                    + Add phone model
                  </button>
                </div>
              </Fld>
              {v.hardwareType==='purchase' && (
                <>
                  <Tog on={v.hardwareDiscount50} set={val=>set('hardwareDiscount50',val)} lbl="Apply 50% hardware discount" sub="24-month contract discount"/>
                  {v.contractTerm===36 && <div style={{ padding:'4px 7px', background:'#dcfce7', borderRadius:4, fontSize:9, color:'#166534', marginTop:3 }}>✓ Hardware included free with 36-month contract</div>}
                  <div style={{ marginTop:6, padding:'5px 8px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:4, fontSize:9, color:'#92400e' }}>
                    📦 Shipping — billed at end of implementation at then-current UPS rates. Not quoted upfront.
                  </div>
                </>
              )}
            </>
          )}

          {/* BYOH */}
          {v.hardwareType==='byoh' && (
            <Fld lbl="BYOH Devices — enter model and quantity">
              <div style={{ fontSize:9, color:'#6b7280', marginBottom:6, lineHeight:1.5 }}>
                Devices must be 3CX-supported. Each device will be wiped and registered at the applicable per-handset fee (${parseFloat(settings?.voice_byoh_fee||20).toFixed(0)}/device).
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {(v.byohItems||[]).map((item,i) => (
                  <div key={i} style={{ display:'flex', gap:5, alignItems:'center' }}>
                    <input value={item.model||''} onChange={e=>{const items=[...(v.byohItems||[])];items[i]={...items[i],model:e.target.value};set('byohItems',items);}}
                      placeholder="e.g. Yealink T42U, Polycom VVX300..." style={{ flex:1, padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, outline:'none' }}/>
                    <input type="number" min="1" value={item.qty||1} onChange={e=>{const items=[...(v.byohItems||[])];items[i]={...items[i],qty:+e.target.value};set('byohItems',items);}}
                      style={{ width:52, padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', textAlign:'center', outline:'none' }}/>
                    <button onClick={()=>{const items=(v.byohItems||[]).filter((_,j)=>j!==i);set('byohItems',items);}}
                      style={{ padding:'3px 6px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:3, color:'#dc2626', fontSize:12, cursor:'pointer' }}>×</button>
                  </div>
                ))}
                <button onClick={()=>set('byohItems',[...(v.byohItems||[]),{model:'',qty:1}])}
                  style={{ padding:'4px 8px', background:'white', border:'1px dashed #d1d5db', borderRadius:4, fontSize:10, color:'#6b7280', cursor:'pointer', textAlign:'left' }}>
                  + Add device
                </button>
              </div>
              {(v.byohItems||[]).reduce((s,i)=>s+parseInt(i.qty||0),0) > 0 && (
                <div style={{ marginTop:6, padding:'5px 8px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:4, fontSize:9, color:'#1e40af' }}>
                  Total BYOH fee: {(v.byohItems||[]).reduce((s,i)=>s+parseInt(i.qty||0),0)} devices × ${parseFloat(settings?.voice_byoh_fee||20).toFixed(0)} = ${((v.byohItems||[]).reduce((s,i)=>s+parseInt(i.qty||0),0) * parseFloat(settings?.voice_byoh_fee||20)).toFixed(0)} NRC
                </div>
              )}
            </Fld>
          )}
        </Sec>

        {/* Bundle discount */}
        <Sec t="Bundle Discount" c="#166534">
          <Tog on={v.isManagedIT} set={val=>set('isManagedIT',val)} lbl="Managed IT client" sub={`${Math.round(parseFloat(settings.voice_bundle_discount||0.10)*100)}% discount on voice MRR`}/>
        </Sec>



        {/* Save */}
        <div style={{ padding:8, background:'#f8fafc', borderRadius:5, border:'1px solid #e5e7eb', marginTop:4 }}>
          <button onClick={saveQuote} disabled={saving}
            style={{ width:'100%', padding:'7px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1 }}>
            {saving ? 'Saving...' : existingQuote ? 'Update Quote' : 'Save Quote'}
          </button>
          {existingQuote && (
            <div style={{ marginTop:5, display:'flex', gap:6, flexWrap:'wrap' }}>
              <SendForReviewButton
                quote={{ ...existingQuote, status: quoteStatus }}
                quoteType="voice"
                onStatusChange={s => setQuoteStatus(s)}
              />
              <button
                onClick={() => navigate('/bundle/new', { state: { fromQuote: {
                  type: 'voice',
                  clientName: recipientBiz, clientZip,
                  proposalName, recipientContact, recipientEmail, recipientAddress,
                  notes: dealDescription,
                  hubDealId, hubDealUrl, hubDealName,
                  voiceInputs: { ...v },
                }}})}
                style={{ padding:'6px 10px', background:'#faf5ff', border:'1px solid #ddd6fe', borderRadius:4, fontSize:11, color:'#6d28d9', fontWeight:600, cursor:'pointer' }}>
                📦 Bundle with IT
              </button>
            </div>
          )}
          {saveMsg && <div style={{ fontSize:11, color:'#166534', fontWeight:600, marginTop:4 }}>{saveMsg}</div>}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc', minWidth:0 }}>
        <ReviewBanner
          quote={{ ...existingQuote, status: quoteStatus, hubspot_deal_id: hubDealId }}
          quoteType="voice"
          onStatusChange={s => setQuoteStatus(s)}
        />
        {/* ── Price Lock Banner ── */}
        {pricingSnapshot && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 14px', background:'#1e3a5f', borderBottom:'1px solid #2d4f7a' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:14 }}>🔒</span>
              <div>
                <span style={{ fontSize:11, fontWeight:700, color:'#93c5fd' }}>Prices locked</span>
                <span style={{ fontSize:10, color:'#64748b', marginLeft:6 }}>as of {priceLockDate ? new Date(priceLockDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'approval'}</span>
              </div>
            </div>
            {(profile?.id === repId || profile?.role === 'admin') && (
              <button onClick={() => setShowUnlockModal(true)}
                style={{ fontSize:10, padding:'3px 10px', background:'rgba(255,255,255,0.1)', color:'#93c5fd', border:'1px solid #2d4f7a', borderRadius:3, cursor:'pointer', fontWeight:600 }}>
                Unlock Pricing
              </button>
            )}
          </div>
        )}
        {showUnlockModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
            <div style={{ background:'white', borderRadius:10, padding:28, width:440, boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:'0 0 10px' }}>⚠ Unlock Pricing</h3>
              <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 14px' }}>Pricing was locked when this quote was approved. Unlocking allows rates to update from current package pricing.</p>
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:5, padding:'8px 12px', fontSize:11, color:'#991b1b', marginBottom:18 }}>
                If this quote has been sent or exported to Smart Pricing Table, unlocking may cause price discrepancies. Consider a new revision instead.
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={() => setShowUnlockModal(false)} style={{ padding:'7px 16px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:5, fontSize:12, cursor:'pointer' }}>Cancel</button>
                <button onClick={async () => {
                  setPricingSnapshot(null); setPriceLockDate(null); setShowUnlockModal(false);
                  if (existingQuote?.id) await supabase.from('quotes').update({ pricing_snapshot: null, price_locked_at: null, price_locked_by: null }).eq('id', existingQuote.id);
                }} style={{ padding:'7px 18px', background:'#dc2626', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer' }}>Unlock & Recalculate</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        {!result
          ? <div style={{ textAlign:'center', color:'#9ca3af', marginTop:80, fontSize:12 }}>Enter quote details to generate voice pricing</div>
          : <div className="fade-in">

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <div style={{ padding:'2px 8px', background:'#7c3aed', color:'white', borderRadius:3, fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>Voice</div>
                    <h2 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:0 }}>{proposalName || recipientBiz || 'Voice Quote'}</h2>
                  </div>
                  <div style={{ fontSize:10, color:'#6b7280' }}>
                    {v.quoteType === 'hosted' ? `Hosted Voice · ${v.licenseType === 'enterprise' ? 'Enterprise' : 'Pro'}` : v.quoteType === 'hybrid' ? 'Hybrid Hosting (BYOPBX)' : 'SIP Trunking Only'} · {v.contractTerm}-month term
                    {v.isManagedIT && <span style={{ color:'#166534', marginLeft:4, fontWeight:600 }}>· Bundle discount applied</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Monthly Recurring</div>
                  <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(result.finalMRR)}</div>
                </div>
              </div>

              {/* KPI cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7, marginBottom:10 }}>
                {[['Monthly MRR',fmt$0(result.finalMRR),'#0f1e3c','#f0f4ff'],['One-Time Fees',fmt$0(result.nrc),'#0f766e','#f0fdf4'],['Implied GM',fmtPct(result.gm),gc,gb],['Est. w/Tax',fmt$0(result.finalMRR + result.estTax),'#7c3aed','#faf5ff']].map(([l,val,co,bg])=>(
                  <div key={l} style={{ background:bg, borderRadius:5, padding:'7px 6px', textAlign:'center' }}>
                    <div style={{ fontSize:7, fontWeight:600, color:'#6b7280', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:co }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* ── Crossover Analysis ── */}
              {crossover && v.quoteType === 'hosted' && (
                <div style={{ marginBottom:10, padding:'12px 14px', background: crossover.totalMRR < result.finalMRR ? '#fef3c7' : '#f0fdf4', border:`1px solid ${crossover.totalMRR < result.finalMRR ? '#fde68a' : '#86efac'}`, borderRadius:7 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontSize:11, fontWeight:700, color: crossover.totalMRR < result.finalMRR ? '#92400e' : '#166534' }}>
                      {crossover.totalMRR < result.finalMRR ? '⚡ Hybrid Hosting would save client money' : '✓ Per-seat pricing is more competitive'}
                    </div>
                    <div style={{ fontSize:10, color:'#6b7280' }}>Crossover analysis</div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div style={{ padding:'8px 10px', background:'white', borderRadius:5, border:'1px solid #e5e7eb' }}>
                      <div style={{ fontSize:9, color:'#6b7280', marginBottom:2 }}>This quote — Per Seat</div>
                      <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(result.finalMRR)}/mo</div>
                    </div>
                    <div style={{ padding:'8px 10px', background:'white', borderRadius:5, border:'1px solid #e5e7eb' }}>
                      <div style={{ fontSize:9, color:'#6b7280', marginBottom:2 }}>Hybrid Hosting option</div>
                      <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Mono, monospace', color: crossover.totalMRR < result.finalMRR ? '#92400e' : '#374151' }}>{fmt$0(crossover.totalMRR)}/mo</div>
                      <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>{crossover.tier.label} · ${crossover.licMonthly.toFixed(2)} lic + ${crossover.hostSell} hosting + SIP</div>
                    </div>
                  </div>
                  {crossover.totalMRR < result.finalMRR && (
                    <div style={{ marginTop:6, fontSize:10, color:'#92400e' }}>
                      Consider switching to Hybrid Hosting — saves client <strong>{fmt$0(result.finalMRR - crossover.totalMRR)}/mo</strong>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Line items */}
                <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Quote Line Items</div>

                  {/* Group by section */}
                  {[
                    ['seats',     'Billable Seats'],
                    ['devices',   'Non-Billable Devices (Included)'],
                    ['hybrid',    '3CX Licensing & Hosting'],
                    ['sip',       'SIP Trunking'],
                    ['numbers',   'Numbers & DIDs'],
                    ['fax',       'Virtual Fax'],
                    ['addons',    'Add-ons'],
                    ['sms',       'SMS/MMS'],
                    ['hardware',  'Hardware'],
                    ['onetime',   'One-Time Fees'],
                    ['discount',  'Discounts'],
                  ].map(([sec, secLabel]) => {
                    const secLines = result.lines.filter(l => l.section === sec);
                    if (!secLines.length) return null;
                    return (
                      <span key={sec}>
                        <SH l={secLabel}/>
                        {secLines.map((l, i) => (
                          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px', marginLeft:7 }}>
                            <div>
                              <span style={{ fontSize:8, color: l.mrr < 0 ? '#166534' : l.mrr === 0 && !l.nrc ? '#9ca3af' : '#6b7280' }}>{l.label}</span>
                              {l.note && <div style={{ fontSize:7, color:'#9ca3af', fontStyle:'italic' }}>{l.note}</div>}
                              {l.desc && <div style={{ fontSize:7, color:'#9ca3af' }}>{l.desc}</div>}
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0, marginLeft:6 }}>
                              {l.mrr !== 0 && <div style={{ fontSize:9, fontWeight:500, fontFamily:'DM Mono, monospace', color: l.mrr < 0 ? '#166534' : '#374151' }}>{l.mrr < 0 ? `(${fmt$(-l.mrr)})` : fmt$(l.mrr)}<span style={{ fontSize:7, color:'#9ca3af' }}>/mo</span></div>}
                              {l.nrc > 0 && <div style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#0f766e' }}>{fmt$(l.nrc)}<span style={{ fontSize:7, color:'#9ca3af' }}> NRC</span></div>}
                              {l.mrr === 0 && !l.nrc && !l.metered && <div style={{ fontSize:8, color:'#9ca3af' }}>{l.note || 'Included'}</div>}
                              {l.metered && <div style={{ fontSize:7, color:'#3b82f6', fontWeight:600 }}>Metered</div>}
                            </div>
                          </div>
                        ))}
                      </span>
                    );
                  })}

                  <div style={{ margin:'5px 0', borderTop:'2px solid #0f1e3c' }}/>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px' }}>
                    <span style={{ fontSize:9, fontWeight:700, color:'#374151' }}>Monthly Recurring</span>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$(result.mrr)}</span>
                  </div>
                  {result.bundleDiscount > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px' }}>
                      <span style={{ fontSize:9, color:'#166534' }}>Bundle Discount</span>
                      <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#166534' }}>({fmt$(result.bundleDiscount)})</span>
                    </div>
                  )}
                  {result.nrc > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px' }}>
                      <span style={{ fontSize:9, fontWeight:600, color:'#374151' }}>One-Time Fees</span>
                      <span style={{ fontSize:10, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f766e' }}>{fmt$(result.nrc)}</span>
                    </div>
                  )}
                  {/* Final MRR highlight */}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 7px', background:'#dcfce7', borderRadius:4, marginTop:4 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:'#166534' }}>✦ Final Monthly MRR</span>
                    <span style={{ fontSize:12, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#166534' }}>{fmt$(result.finalMRR)}</span>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

                  {/* Tax estimate */}
                  <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Estimated Taxes & Fees</div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px', marginBottom:4 }}>
                      <span style={{ fontSize:9, color:'#6b7280' }}>Voice MRR</span>
                      <span style={{ fontSize:9, fontFamily:'DM Mono, monospace' }}>{fmt$(result.finalMRR)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px', marginBottom:4 }}>
                      <span style={{ fontSize:9, color:'#6b7280' }}>Est. taxes ({Math.round(result.taxRate * 100)}%)</span>
                      <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#7c3aed' }}>~{fmt$(result.estTax)}</span>
                    </div>
                    <div style={{ margin:'5px 0', borderTop:'1px solid #e5e7eb' }}/>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 6px', background:'#faf5ff', borderRadius:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'#6d28d9' }}>Est. Total w/ Tax</span>
                      <span style={{ fontSize:12, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#6d28d9' }}>{fmt$(result.finalMRR + result.estTax)}</span>
                    </div>
                    <div style={{ fontSize:8, color:'#9ca3af', marginTop:5, lineHeight:1.5 }}>
                      * Tax estimate only. Actual taxes vary by jurisdiction (typically 20–30% for voice services). Final invoice will reflect actual regulatory fees, USF contributions, and local taxes.
                    </div>
                  </div>

                  {/* Cost model */}
                  <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Cost Model</div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 2px' }}>
                      <span style={{ fontSize:9, color:'#6b7280' }}>Estimated cost</span>
                      <span style={{ fontSize:9, fontFamily:'DM Mono, monospace' }}>{fmt$(result.totalCost)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 6px', background:gb, borderRadius:4, marginTop:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:gc }}>Implied Gross Margin</span>
                      <span style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:gc }}>{fmtPct(result.gm)}</span>
                    </div>
                    {result.gm < 0.35 && <div style={{ marginTop:4, fontSize:9, color:'#92400e', background:'#fef3c7', padding:'3px 5px', borderRadius:3 }}>⚠ Below 35% — review pricing.</div>}
                  </div>

                  {/* International dialing policy */}
                  {v.internationalDialing !== 'none' && (
                    <div style={{ background:'#fef2f2', borderRadius:6, border:'1px solid #fecaca', padding:11 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#dc2626', marginBottom:4 }}>
                        {v.internationalDialing === 'standard' ? '⚠ Standard International Dialing' : '⚠ Full Open International Access'}
                      </div>
                      <div style={{ fontSize:9, color:'#7f1d1d', lineHeight:1.5 }}>
                        Client waiver required. Client accepts full financial responsibility for all charges including malicious traffic originating from their system regardless of hosting location.
                      </div>
                    </div>
                  )}

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

                  {/* Deal summary — matches QuotePage position */}
                  <div style={{ background:'#0f1e3c', borderRadius:6, padding:11 }}>
                    <div style={{ fontSize:8, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'#475569', marginBottom:6 }}>Deal Summary</div>
                    {[
                      ['Quote #', existingQuote?.quote_number || 'Unsaved'],
                      ['Client', recipientBiz],
                      recipientContact && ['Contact', recipientContact],
                      ['Type', v.quoteType === 'hosted' ? 'Hosted Voice' : v.quoteType === 'hybrid' ? 'Hybrid Hosting' : 'SIP Trunking'],
                      v.quoteType === 'hosted' && ['Seats', v.seats],
                      v.sipChannels > 0 && ['SIP Channels', v.sipChannels],
                      ['Contract', `${v.contractTerm} months`],
                      ['Monthly MRR', fmt$0(result.finalMRR)],
                      result.nrc > 0 && ['One-Time Fees', fmt$0(result.nrc)],
                      ['Est. w/ Tax', fmt$0(result.finalMRR + result.estTax)],
                      hubDealId && ['HubSpot', hubDealName || `#${hubDealId}`],
                    ].filter(Boolean).map(([k, val]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #1e3a5f' }}>
                        <span style={{ fontSize:9, color:'#64748b' }}>{k}</span>
                        <span style={{ fontSize:9, fontWeight:600, color:'white', fontFamily: typeof val === 'number' || (typeof val === 'string' && val.startsWith('$')) ? 'DM Mono, monospace' : 'inherit' }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Voice Documents */}
                  <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:'10px 12px', marginBottom:10 }}>
                    <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#6b7280', marginBottom:8 }}>📄 Documents</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {v.internationalDialing !== 'none' ? (
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#fef2f2', borderRadius:4, border:'1px solid #fecaca' }}>
                          <div>
                            <div style={{ fontSize:11, fontWeight:600, color:'#991b1b' }}>⚠ International Dialing Waiver</div>
                            <div style={{ fontSize:9, color:'#9ca3af', marginTop:1 }}>Required — client must sign before international calling is enabled</div>
                          </div>
                          <button onClick={() => setShowIntlWaiver(true)} style={{ padding:'4px 10px', background:'#7c1d1d', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer', flexShrink:0 }}>Open Waiver</button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'#f8fafc', borderRadius:4, border:'1px dashed #d1d5db' }}>
                          <div>
                            <div style={{ fontSize:11, fontWeight:600, color:'#9ca3af' }}>International Dialing Waiver</div>
                            <div style={{ fontSize:9, color:'#d1d5db' }}>Enable international dialing above to unlock · or create manually</div>
                          </div>
                          <button onClick={() => setShowIntlWaiver(true)} style={{ padding:'4px 10px', background:'#f3f4f6', color:'#9ca3af', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer' }}>Create</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {showIntlWaiver && (
                    <IntlDialingWaiver
                      onClose={() => setShowIntlWaiver(false)}
                      quoteId={existingQuote?.id}
                      quoteNumber={existingQuote?.quote_number}
                      proposalName={proposalName || recipientBiz}
                      clientName={recipientBiz}
                      recipientContact={recipientContact}
                      recipientEmail={recipientEmail}
                      recipientAddress={recipientAddress}
                      settings={settings}
                      selectedTier={v.internationalDialing !== 'none' ? v.internationalDialing : 'standard'}
                    />
                  )}

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
        }
        </div>{/* end inner scroll */}
      </div>

    </div>
  );
}

function Sec({t,c,children}){return(<div style={{marginBottom:10}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:5,paddingBottom:3,borderBottom:'1px solid #f1f5f9'}}><div style={{width:2,height:11,background:c||'#2563eb',borderRadius:2}}/><span style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6b7280'}}>{t}</span></div>{children}</div>);}
function Grid2({children}){return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>{children}</div>;}
function Fld({lbl,sub,children}){return(<div style={{marginBottom:4}}><label style={{display:'block',fontSize:9,fontWeight:600,color:'#374151',marginBottom:1}}>{lbl}{sub&&<span style={{fontWeight:400,color:'#9ca3af',marginLeft:3,fontSize:9}}>{sub}</span>}</label>{children}</div>);}
function TI({value,onChange,placeholder}){return<input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder||''} style={{width:'100%',padding:'4px 7px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,outline:'none',color:'#374151'}}/>;}
function NI({v,s}){return<input type="number" value={v} min={0} onChange={e=>s(+e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,fontFamily:'DM Mono, monospace',color:'#1e3a5f',background:'#eff6ff',fontWeight:600,outline:'none'}}/>;}
function Tog({on,set,lbl,sub}){return(<div onClick={()=>set(!on)} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:4,cursor:'pointer',border:`1px solid ${on?'#93c5fd':'#e5e7eb'}`,background:on?'#eff6ff':'white',marginBottom:2}}><div style={{width:24,height:14,borderRadius:7,flexShrink:0,background:on?'#2563eb':'#d1d5db',position:'relative'}}><div style={{position:'absolute',top:2,left:on?12:2,width:10,height:10,borderRadius:'50%',background:'white',transition:'left .12s'}}/></div><div><span style={{fontSize:10,fontWeight:600,color:on?'#1e40af':'#374151'}}>{lbl}</span>{sub&&<span style={{fontSize:9,color:'#9ca3af',marginLeft:4}}>{sub}</span>}</div></div>);}
function SH({l}){return<div style={{fontSize:8,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'#9ca3af',padding:'4px 2px 1px',marginTop:3}}>{l}</div>;}
