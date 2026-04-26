import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import {
  calcLocationMRR, getMultiSiteDiscount, createLocation,
  fmt$, fmt$0, fmtPct, gmColor, gmBg
} from '../lib/pricing';
import { saveQuoteVersion } from '../lib/quoteVersions';
import { searchDeals, getDealFull, updateDealDescription } from '../lib/hubspot';
import { getOrAnalyzeMarket } from '../lib/marketRates';
import QuoteNotes from '../components/QuoteNotes';
import QuoteHistory from '../components/QuoteHistory';
import { SendForReviewButton, ReviewBanner } from '../components/SendForReview';
import FlexTimeMeter from '../components/FlexTimeMeter';
import { DocumentsPanel } from '../components/RateSheetModal';
import OnboardingIncentive from '../components/OnboardingIncentive';
import HubSpotConnect from '../components/HubSpotConnect';
import SPTConnect    from '../components/SPTConnect';

const LOCATION_TYPES = { standard: 'Standard', restricted: 'Restricted' };
const TYPE_COLOR     = { standard: '#2563eb', restricted: '#d97706' };
const TYPE_BG        = { standard: '#eff6ff', restricted: '#fffbeb' };
const TYPE_DESC      = {
  standard:   'Full managed location — users, devices, servers, $location_fee/mo site fee, network layer',
  restricted: 'Co-work / shared space / 3rd-party IT — users and devices only, no network layer, no site fee',
};

export default function MultiSiteQuotePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const { packages, products, marketTiers, settings, productsByCategory, exclusiveGroups, loading: configLoading } = useConfig();
  const { profile } = useAuth();

  // ── Shared proposal fields ────────────────────────────────────────────────
  const [proposalName,     setProposalName]     = useState('');
  const [recipientBiz,     setRecipientBiz]     = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [recipientEmail,   setRecipientEmail]   = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [dealDescription,  setDealDescription]  = useState('');
  const [quoteStatus,      setQuoteStatus]      = useState('draft');
  const [saving,           setSaving]           = useState(false);
  const [saveMsg,          setSaveMsg]          = useState('');
  const [existingQuote,    setExistingQuote]    = useState(null);

  // ── Package / term / compliance ───────────────────────────────────────────
  const [selectedPkg,  setSelectedPkg]  = useState(null);
  const [contractTerm, setContractTerm] = useState(24);
  const [compliance,   setCompliance]   = useState('none');
  const [industryRisk, setIndustryRisk] = useState('low');
  const [selectedProducts, setSelectedProducts] = useState([]);

  // ── Locations ─────────────────────────────────────────────────────────────
  const [locations,         setLocations]         = useState([createLocation({ name: 'Location 1' })]);
  const [locationAnalyses,  setLocationAnalyses]  = useState({});
  const [showLocModal,      setShowLocModal]       = useState(false);
  const [editingLoc,        setEditingLoc]         = useState(null);
  const [locLoading,        setLocLoading]         = useState({});

  // ── HubSpot ───────────────────────────────────────────────────────────────
  const [hubDealId,   setHubDealId]   = useState('');
  const [hubDealUrl,  setHubDealUrl]  = useState('');
  const [hubDealName, setHubDealName] = useState('');

  // ── Rep ───────────────────────────────────────────────────────────────────
  const [obIncentive,      setObIncentive]      = useState(null);
  const [pricingSnapshot, setPricingSnapshot] = useState(null);
  const [priceLockDate,   setPriceLockDate]   = useState(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [repId,       setRepId]       = useState(null);
  const [repProfile,  setRepProfile]  = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [expandedLoc, setExpandedLoc] = useState(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [sptProposalId,    setSptProposalId]    = useState(null);

  // ── Load team members ─────────────────────────────────────────────────────
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

  // ── Load existing quote ───────────────────────────────────────────────────
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
      setDealDescription(data.notes || '');
      setQuoteStatus(data.status || 'draft');
      setHubDealId(data.hubspot_deal_id || '');
      setHubDealUrl(data.hubspot_deal_url || '');
      setHubDealName(data.inputs?.hubspotDealName || '');
      setContractTerm(data.inputs?.contractTerm || 24);
      setCompliance(data.inputs?.compliance || 'none');
      setIndustryRisk(data.inputs?.industryRisk || 'low');
      setSelectedProducts(data.inputs?.selectedProducts || []);
      if (data.rep_id) setRepId(data.rep_id);
      if (data.pricing_snapshot) { setPricingSnapshot(data.pricing_snapshot); setPriceLockDate(data.price_locked_at); }
      if (data.spt_proposal_id) setSptProposalId(data.spt_proposal_id);
      if (data.inputs?.locations?.length) setLocations(data.inputs.locations);
      if (data.package_name && packages.length) setSelectedPkg(packages.find(p => p.name === data.package_name));
    });
  }, [id, configLoading, packages]);

  // ── Package default ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPkg && packages.length) setSelectedPkg(packages[1] || packages[0]);
  }, [packages]);

  // ── Fetch market analysis per location when zip changes ───────────────────
  const fetchAnalysis = useCallback(async (locId, zip) => {
    if (!zip || zip.length < 5) return;
    setLocLoading(prev => ({ ...prev, [locId]: true }));
    try {
      const { analysis } = await getOrAnalyzeMarket(zip, false);
      if (analysis) setLocationAnalyses(prev => ({ ...prev, [locId]: analysis }));
    } catch (e) { console.warn('Market analysis failed:', e.message); }
    setLocLoading(prev => ({ ...prev, [locId]: false }));
  }, []);

  // Re-fetch when locations change
  useEffect(() => {
    locations.forEach(l => {
      if (l.zip && l.zip.length >= 5 && !locationAnalyses[l.id]) {
        fetchAnalysis(l.id, l.zip);
      }
    });
  }, [locations.map(l => l.id + l.zip).join(',')]);

  // ── Pricing calcs ─────────────────────────────────────────────────────────
  const locationResults = useMemo(() => {
    if (!selectedPkg || configLoading) return [];
    return locations.map(loc => {
      const analysis = locationAnalyses[loc.id];
      const mktMult  = analysis?.pricing_multiplier ?? 1;
      const result   = calcLocationMRR({ location: loc, pkg: selectedPkg, marketMultiplier: mktMult, settings });
      return { loc, result, analysis };
    });
  }, [locations, locationAnalyses, selectedPkg, settings, configLoading]);

  const totalLocationMRR = locationResults.reduce((s, r) => s + (r.result?.mrr || 0), 0);

  // Add-on products (applied once, same logic as IT quote)
  const { addonRevenue, protectedAddonRevenue, addonCost, addonLineItems } = useMemo(() => {
    let discountable = 0, protected_ = 0, cost = 0;
    const lines = [];
    for (const p of products.filter(pr => selectedProducts.includes(pr.id))) {
      const qty     = (p.qty_driver === 'user')
        ? locations.reduce((s, l) => s + (parseInt(l.users) || 0), 0)
        : (p.qty_driver === 'workstation')
          ? locations.reduce((s, l) => s + (parseInt(l.workstations) || 0), 0)
          : 1;
      const rev  = qty * p.sell_price;
      const cst  = qty * p.cost_price;
      if (p.no_discount) protected_ += rev; else discountable += rev;
      cost += cst;
      lines.push({ ...p, qty, revenue: rev, cost: cst });
    }
    return { addonRevenue: discountable + protected_, protectedAddonRevenue: protected_, addonCost: cost, addonLineItems: lines };
  }, [selectedProducts, products, locations]);

  const multiDiscRate   = getMultiSiteDiscount(locations.length, settings);
  const multiDiscAmount = totalLocationMRR * multiDiscRate;
  const discountedLocMRR = totalLocationMRR - multiDiscAmount;

  // Contract term discount on top of multi-site discount
  const discKey      = `contract_disc_${contractTerm}`;
  const termDiscRate = parseFloat(settings[discKey]) || 0;
  const termDisc     = discountedLocMRR * termDiscRate;
  const finalLaborMRR = discountedLocMRR - termDisc;

  const finalMRR = finalLaborMRR + addonRevenue;

  // Commission
  const commissionRate   = repProfile?.commission_rate ?? (parseFloat(settings.commission_rate) || 0);
  const commissionBase   = finalLaborMRR;
  const commission       = commissionBase * commissionRate;
  const netAfterCommission = finalMRR - commission;

  // Onboarding
  const obMin    = parseFloat(settings.onboarding_min) || 500;
  const totalUsers = locations.reduce((s, l) => s + (parseInt(l.users) || 0), 0);
  const totalWS    = locations.reduce((s, l) => s + (parseInt(l.workstations) || 0), 0);
  const totalSrv   = locations.reduce((s, l) => s + (parseInt(l.servers) || 0), 0);
  const obCalc     = totalUsers * (parseFloat(settings.onboarding_per_user) || 35)
                   + totalWS    * (parseFloat(settings.onboarding_per_ws)   || 20)
                   + totalSrv   * (parseFloat(settings.onboarding_per_server)|| 250)
                   + locations.length * (parseFloat(settings.onboarding_per_location) || 450);
  const onboarding = Math.max(obCalc, obMin);
  const contractValue = finalMRR * contractTerm + onboarding;

  const gc = gmColor(finalMRR > 0 ? 1 - addonCost / finalMRR : 0);
  const gb = gmBg(finalMRR > 0 ? 1 - addonCost / finalMRR : 0);

  // ── Location modal helpers ────────────────────────────────────────────────
  function openAddLoc() {
    setEditingLoc(createLocation({ name: `Location ${locations.length + 1}` }));
    setShowLocModal(true);
  }
  function openEditLoc(loc) { setEditingLoc({ ...loc }); setShowLocModal(true); }
  function removeLoc(locId) { setLocations(prev => prev.filter(l => l.id !== locId)); }

  function saveLocModal() {
    if (!editingLoc.name.trim()) return;
    const isNew = !locations.find(l => l.id === editingLoc.id);
    if (isNew) {
      setLocations(prev => [...prev, editingLoc]);
    } else {
      setLocations(prev => prev.map(l => l.id === editingLoc.id ? editingLoc : l));
      // Invalidate cached analysis if zip changed
      const orig = locations.find(l => l.id === editingLoc.id);
      if (orig?.zip !== editingLoc.zip) {
        setLocationAnalyses(prev => { const n = { ...prev }; delete n[editingLoc.id]; return n; });
      }
    }
    // Trigger analysis fetch
    if (editingLoc.zip?.length >= 5) fetchAnalysis(editingLoc.id, editingLoc.zip);
    setShowLocModal(false);
    setEditingLoc(null);
  }

  // ── Product toggle ────────────────────────────────────────────────────────
  function toggleProduct(pid) {
    const p = products.find(pr => pr.id === pid);
    if (!p) return;
    setSelectedProducts(prev => {
      let sel = [...prev];
      if (sel.includes(pid)) return sel.filter(x => x !== pid);
      if (p.exclusive_group) {
        const grp = exclusiveGroups[p.exclusive_group] || [];
        sel = sel.filter(x => !grp.includes(x));
      }
      return [...sel, pid];
    });
  }

  // ── HubSpot ───────────────────────────────────────────────────────────────


  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveQuote() {
    if (!recipientBiz.trim()) { setSaveMsg('Enter a client name first.'); return; }
    if (locations.length === 0) { setSaveMsg('Add at least one location.'); return; }
    setSaving(true); setSaveMsg('');

    const allInputs = {
      proposalName, recipientContact, recipientEmail, recipientAddress,
      hubspotDealName: hubDealName, contractTerm, compliance, industryRisk,
      selectedProducts, locations,
      repId: repId || null, repName: repProfile?.full_name || repProfile?.email || null,
    };
    const totals = { finalMRR, onboarding, contractValue, locationCount: locations.length, multiDiscRate };
    const payload = {
      client_name: recipientBiz, status: quoteStatus, notes: dealDescription,
      package_name: `Multi-Site — ${selectedPkg?.name || 'IT'}`,
      inputs: allInputs, totals,
      line_items: addonLineItems,
      hubspot_deal_id: hubDealId || null, hubspot_deal_url: hubDealUrl || null,
      rep_id: repId || profile?.id || null,
      ...(quoteStatus === 'approved' && !pricingSnapshot ? { pricing_snapshot: { lockedAt: new Date().toISOString() }, price_locked_at: new Date().toISOString(), price_locked_by: profile?.id } : {}),
      ...(pricingSnapshot ? { pricing_snapshot: pricingSnapshot, price_locked_at: priceLockDate } : {}),
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

    await logActivity({ action: existingQuote ? 'UPDATE' : 'CREATE', entityType: 'quote',
      entityId: data.id, entityName: recipientBiz,
      changes: { type: 'multi-site', locations: locations.length, mrr: finalMRR } });

    await saveQuoteVersion({ quoteId: data.id, quoteData: { client_name: recipientBiz, status: quoteStatus },
      inputs: allInputs, totals, lineItems: addonLineItems, profile });

    setSaveMsg(`Saved as ${data.quote_number}`);
    setSaving(false);
    setExistingQuote(data);
    if (!id || id === 'new') navigate(`/multisite/${data.id}`, { replace: true });
  }

  // ── Convert to single location ────────────────────────────────────────────
  function convertToSingle() {
    const first = locations[0];
    navigate('/quotes/new', { state: { fromBundle: {
      type: 'it',
      clientName: recipientBiz, clientZip: first?.zip || '',
      marketTier: locationAnalyses[first?.id]?.market_tier,
      packageName: selectedPkg?.name,
      proposalName, recipientContact, recipientEmail, recipientAddress,
      notes: dealDescription, hubDealId, hubDealUrl, hubDealName,
      inputs: {
        users: first?.users || 0, workstations: first?.workstations || 0,
        servers: first?.servers || 0, endpoints: first?.endpoints || 0,
        mobileDevices: first?.mobileDevices || 0,
        contractTerm, compliance, industryRisk, selectedProducts,
        locations: 1,
      },
      sourceQuoteId: existingQuote?.id, sourceQuoteNum: existingQuote?.quote_number,
    }}});
  }

  // ── SPT export ────────────────────────────────────────────────────────────
  function exportSPT() {
    if (!existingQuote) return;
    const json = {
      quote_number: existingQuote.quote_number,
      quote_type: 'multi-site-managed-it',
      proposal_name: proposalName,
      recipient: { business_name: recipientBiz, contact_name: recipientContact, email: recipientEmail, address: recipientAddress },
      date: new Date().toISOString().split('T')[0],
      package: selectedPkg?.name,
      contract_term_months: contractTerm,
      locations: locations.map((l, i) => ({
        number: i + 1,
        name: l.name,
        address: [l.address, l.city, l.state, l.zip].filter(Boolean).join(', '),
        type: l.type,
        users: l.users, workstations: l.workstations, servers: l.servers,
        market: locationAnalyses[l.id] ? `${locationAnalyses[l.id].city}, ${locationAnalyses[l.id].state}` : l.zip,
        market_tier: locationAnalyses[l.id]?.market_tier || 'standard',
        mrr: locationResults.find(r => r.loc.id === l.id)?.result?.mrr || 0,
        onsite_rate: locationAnalyses[l.id]?.rates?.remote_support || 165,
        dispatch_block: locationAnalyses[l.id]?.rates?.onsite_block_2hr || 330,
      })),
      location_subtotal_mrr: totalLocationMRR,
      multi_location_discount_rate: multiDiscRate,
      multi_location_discount_amount: multiDiscAmount,
      contract_term_discount_rate: termDiscRate,
      add_ons: addonLineItems,
      monthly_mrr: finalMRR,
      onboarding_fee: onboarding,
      contract_value: contractValue,
      hubspot_deal_id: hubDealId,
      // ASSUMPTIONS — legally binding location list
      covered_locations_assumption: `This agreement covers the following ${locations.length} location${locations.length > 1 ? 's' : ''} only. Any additional locations not listed below are NOT covered under this agreement and will require a separate addendum:\n\n` +
        locations.map((l, i) => `${i+1}. ${l.name} — ${[l.address, l.city, l.state, l.zip].filter(Boolean).join(', ')} (${LOCATION_TYPES[l.type]})`).join('\n'),
    };
    const a = document.createElement('a');
    a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(json, null, 2));
    a.download = `${existingQuote.quote_number}_spt.json`;
    a.click();
  }

  const complianceKey = compliance === 'moderate' ? ['hipaa','soc2'] : compliance === 'high' ? ['pci','cmmc'] : [];

  if (configLoading) return <div style={{ padding:24, color:'#6b7280', fontSize:12 }}>Loading...</div>;

  const ccSurcharge = parseFloat(settings?.payment_cc_surcharge) || 0.02;
  const checkFee    = parseFloat(settings?.payment_check_fee)    || 10;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Convert to single modal ── */}
      {showConvertModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
          <div style={{ background:'white', borderRadius:10, padding:28, width:440, boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:'0 0 8px' }}>Convert to Single Location</h3>
            <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 16px' }}>
              This will open a new standard IT quote using <strong>{locations[0]?.name || 'Location 1'}</strong> only.
              All other locations will be discarded. The multi-site quote stays in your history.
            </p>
            <div style={{ background:'#fef3c7', borderRadius:5, padding:'8px 10px', fontSize:11, color:'#92400e', marginBottom:16 }}>
              ⚠ The multi-location discount will not apply to a single-location quote.
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowConvertModal(false)}
                style={{ padding:'7px 14px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:5, fontSize:12, color:'#374151', cursor:'pointer' }}>Cancel</button>
              <button onClick={() => { setShowConvertModal(false); convertToSingle(); }}
                style={{ padding:'7px 18px', background:'#0f1e3c', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                Convert →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Location modal ── */}
      {showLocModal && editingLoc && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400, overflowY:'auto', padding:'20px 0' }}>
          <div style={{ background:'white', borderRadius:10, padding:24, width:500, boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:'#0f1e3c', margin:0 }}>
                {locations.find(l => l.id === editingLoc.id) ? 'Edit Location' : 'Add Location'}
              </h3>
              <button onClick={() => setShowLocModal(false)} style={{ background:'none', border:'none', fontSize:20, color:'#6b7280', cursor:'pointer' }}>×</button>
            </div>

            {/* Location type */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Location Type</label>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(LOCATION_TYPES).map(([key, label]) => (
                  <button key={key} onClick={() => setEditingLoc(e => ({ ...e, type: key }))}
                    style={{ flex:1, padding:'8px 10px', border:`2px solid ${editingLoc.type === key ? TYPE_COLOR[key] : '#e5e7eb'}`,
                      borderRadius:6, background: editingLoc.type === key ? TYPE_BG[key] : 'white', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ fontSize:11, fontWeight:700, color: editingLoc.type === key ? TYPE_COLOR[key] : '#374151' }}>{label}</div>
                    <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>
                      {key === 'standard' ? 'Full managed — all services' : 'No network layer'}
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize:9, color:'#9ca3af', marginTop:6 }}>{TYPE_DESC[editingLoc.type]?.replace('$location_fee', fmt$(selectedPkg?.location_rate || 150))}</div>
            </div>

            {/* Name & address */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#374151', marginBottom:3 }}>Location Name *</label>
                <input value={editingLoc.name} onChange={e => setEditingLoc(l => ({ ...l, name: e.target.value }))}
                  placeholder="e.g. Corporate HQ, Chicago Branch, WeWork Austin"
                  style={{ width:'100%', padding:'6px 8px', border:`1px solid ${!editingLoc.name.trim() ? '#fca5a5' : '#d1d5db'}`, borderRadius:5, fontSize:12, outline:'none' }} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#374151', marginBottom:3 }}>Street Address</label>
                <input value={editingLoc.address} onChange={e => setEditingLoc(l => ({ ...l, address: e.target.value }))}
                  placeholder="123 Main St"
                  style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#374151', marginBottom:3 }}>City</label>
                <input value={editingLoc.city} onChange={e => setEditingLoc(l => ({ ...l, city: e.target.value }))}
                  style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#374151', marginBottom:3 }}>State</label>
                <input value={editingLoc.state} onChange={e => setEditingLoc(l => ({ ...l, state: e.target.value.toUpperCase().slice(0,2) }))}
                  placeholder="IL" style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none', textTransform:'uppercase' }} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#374151', marginBottom:3 }}>ZIP Code (drives market rate analysis)</label>
                <input value={editingLoc.zip} onChange={e => setEditingLoc(l => ({ ...l, zip: e.target.value.replace(/\D/g,'').slice(0,5) }))}
                  placeholder="60601"
                  style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none', fontFamily:'DM Mono, monospace', fontWeight:600 }} />
                {locLoading[editingLoc.id] && <div style={{ fontSize:9, color:'#2563eb', marginTop:3 }}>Analyzing market...</div>}
                {locationAnalyses[editingLoc.id] && !locLoading[editingLoc.id] && (
                  <div style={{ fontSize:9, color:'#166534', marginTop:3 }}>
                    ✓ {locationAnalyses[editingLoc.id].city}, {locationAnalyses[editingLoc.id].state} — {locationAnalyses[editingLoc.id].market_tier} market · {locationAnalyses[editingLoc.id].pricing_multiplier}× multiplier
                  </div>
                )}
              </div>
            </div>

            {/* Devices */}
            <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>People & Devices</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
              {[['users','Users','Always full security stack'],['workstations','Workstations',''],['servers','Servers',''],
                ['endpoints','Endpoints',''],['mobileDevices','Mobile Devices','']].map(([key, label, hint]) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#374151', marginBottom:3 }}>
                    {label}{hint && <span style={{ fontWeight:400, color:'#9ca3af', fontSize:9 }}> — {hint}</span>}
                  </label>
                  <input type="number" min="0" value={editingLoc[key] || 0}
                    onChange={e => setEditingLoc(l => ({ ...l, [key]: parseInt(e.target.value)||0 }))}
                    style={{ width:'100%', padding:'5px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, fontFamily:'DM Mono, monospace', color:'#1e3a5f', background:'#eff6ff', fontWeight:600, outline:'none' }} />
                </div>
              ))}
            </div>

            {/* Preview MRR */}
            {selectedPkg && (editingLoc.users > 0 || editingLoc.workstations > 0) && (() => {
              const analysis = locationAnalyses[editingLoc.id];
              const mktMult = analysis?.pricing_multiplier ?? 1;
              const res = calcLocationMRR({ location: editingLoc, pkg: selectedPkg, marketMultiplier: mktMult, settings });
              return res ? (
                <div style={{ background:'#f0f4ff', borderRadius:6, padding:'8px 12px', marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'#374151' }}>Estimated MRR for this location</span>
                  <span style={{ fontSize:14, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(res.mrr)}/mo</span>
                </div>
              ) : null;
            })()}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowLocModal(false)}
                style={{ padding:'7px 14px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:5, fontSize:12, color:'#374151', cursor:'pointer' }}>Cancel</button>
              <button onClick={saveLocModal} disabled={!editingLoc.name.trim()}
                style={{ padding:'7px 18px', background:'#0f1e3c', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity: !editingLoc.name.trim() ? 0.5 : 1 }}>
                Save Location
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

        {/* ── LEFT: Inputs ── */}
        <div style={{ width:345, flexShrink:0, borderRight:'1px solid #e5e7eb', display:'flex', flexDirection:'column', overflow:'hidden', background:'#fafafa' }}>
          <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>

            {/* HubSpot */}
            <HubSpotConnect
              dealId={hubDealId}
              dealUrl={hubDealUrl}
              dealName={hubDealName}
              description={dealDescription}
              onDescriptionChange={setDealDescription}
              quoteNumber={existingQuote?.quote_number}
              mrr={finalMRR}
              contractValue={contractValue}
              packageName={selectedPkg?.name}
              contractTerm={contractTerm}
              existingQuoteId={existingQuote?.id}
              clientName={recipientBiz}
              onConnect={full => {
                setHubDealId(full.dealId);
                setHubDealUrl(full.dealUrl);
                setHubDealName(full.deal.dealname);
                if (full.company) {
                  if (full.company.name) setRecipientBiz(full.company.name);
                  const addr = [full.company.address, full.company.city, full.company.state, full.company.zip].filter(Boolean).join(', ');
                  if (addr) setRecipientAddress(addr);
                } else {
                  const extracted = full.deal.dealname?.split(/\s[-–—]\s/)?.[0]?.trim();
                  if (extracted) setRecipientBiz(extracted);
                }
                if (full.contact) {
                  const name = [full.contact.firstname, full.contact.lastname].filter(Boolean).join(' ');
                  if (name) setRecipientContact(name);
                  if (full.contact.email) setRecipientEmail(full.contact.email);
                }
                if (!proposalName && full.deal.dealname) setProposalName(`FerrumIT Multi-Site IT — ${full.company?.name || full.deal.dealname}`);
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

            {/* Proposal */}
            <Sec t="Proposal Details" c="#0f1e3c">
              <Fld lbl="Assigned Rep">
                <select value={repId || ''} onChange={e => setRepId(e.target.value)}
                  style={{ width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
                  <option value="">— select rep —</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email?.split('@')[0]}{m.commission_rate != null ? ` (${(m.commission_rate*100).toFixed(1)}%)` : ''}</option>
                  ))}
                </select>
              </Fld>
              <Fld lbl="Proposal Name"><TI value={proposalName} onChange={setProposalName} placeholder="FerrumIT Multi-Site IT — Acme Corp" /></Fld>
              <Grid2>
                <Fld lbl="Business Name *"><TI value={recipientBiz} onChange={setRecipientBiz} /></Fld>
                <Fld lbl="Contact Name"><TI value={recipientContact} onChange={setRecipientContact} /></Fld>
              </Grid2>
              <Fld lbl="Contact Email"><TI value={recipientEmail} onChange={setRecipientEmail} /></Fld>
            </Sec>

            {/* Package & Term */}
            <Sec t="Package & Contract" c="#2563eb">
              <div style={{ fontSize:9, color:'#6b7280', marginBottom:6 }}>Same package applies to all locations</div>
              {packages.map(p => (
                <div key={p.id} onClick={() => setSelectedPkg(p)}
                  style={{ padding:'5px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedPkg?.id===p.id?'2':'1'}px solid ${selectedPkg?.id===p.id?'#2563eb':'#e5e7eb'}`, background:selectedPkg?.id===p.id?'#eff6ff':'white' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:selectedPkg?.id===p.id?'#1e40af':'#374151' }}>{p.name}</span>
                    <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#6b7280', background:'#f3f4f6', padding:'1px 4px', borderRadius:3 }}>
                      ${p.ws_rate}/WS · ${p.user_rate}/US · {fmt$(p.location_rate)}/LOC
                    </span>
                  </div>
                </div>
              ))}
              <Fld lbl="Contract Term" s={{ marginTop:8 }}>
                <SI v={contractTerm} s={v => setContractTerm(+v)} opts={[['12','12 mo (5%)'],['24','24 mo (10%)'],['36','36 mo (20%)']]} />
              </Fld>
            </Sec>

            {/* Risk & Compliance */}
            <Sec t="Risk & Compliance" c="#dc2626">
              <Grid2>
                <Fld lbl="Industry Risk"><SI v={industryRisk} s={v => setIndustryRisk(v)} opts={[['low','Low'],['medium','Medium'],['high','High']]} /></Fld>
                <Fld lbl="Compliance"><SI v={compliance} s={v => setCompliance(v)} opts={[['none','None'],['moderate','HIPAA/SOC2'],['high','PCI/CMMC']]} /></Fld>
              </Grid2>
            </Sec>

            {/* Add-on Products */}
            <Sec t="Add-on Products" c="#7c3aed">
              <div style={{ fontSize:9, color:'#6b7280', marginBottom:6 }}>Applied once across all locations — qty scales to total users/workstations</div>
              {Object.entries(productsByCategory).map(([cat, catProds]) => (
                <div key={cat} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:8, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'#9ca3af', marginBottom:4 }}>{cat}</div>
                  {catProds.map(p => {
                    const sel = selectedProducts.includes(p.id);
                    return (
                      <div key={p.id} onClick={() => toggleProduct(p.id)}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 6px', borderRadius:4, cursor:'pointer', marginBottom:2,
                          border:`1px solid ${sel?'#93c5fd':'#e5e7eb'}`, background:sel?'#eff6ff':'white' }}>
                        <div style={{ width:20, height:12, borderRadius:6, background:sel?'#2563eb':'#d1d5db', position:'relative', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:2, left:sel?9:2, width:8, height:8, borderRadius:'50%', background:'white', transition:'left .1s' }} />
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:9, fontWeight:600, color:sel?'#1e40af':'#374151' }}>{p.name}</div>
                        </div>
                        <div style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#6b7280' }}>${p.sell_price}/{p.qty_driver}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </Sec>

            {/* Locations */}
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:8, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#374151' }}>
                    Locations <span style={{ color: locations.length >= 2 ? '#166534' : '#9ca3af' }}>({locations.length})</span>
                  </div>
                  {locations.length >= 2 && (
                    <div style={{ fontSize:8, color:'#166534', marginTop:1 }}>
                      {(multiDiscRate*100).toFixed(0)}% multi-location discount applied
                    </div>
                  )}
                </div>
                <button onClick={openAddLoc}
                  style={{ padding:'4px 10px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer' }}>
                  + Add Location
                </button>
              </div>

              {locations.map((l, i) => {
                const analysis = locationAnalyses[l.id];
                const res = locationResults.find(r => r.loc.id === l.id)?.result;
                return (
                  <div key={l.id} style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:'8px 10px', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background: TYPE_COLOR[l.type], flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</div>
                        <div style={{ fontSize:9, color:'#6b7280' }}>
                          {[l.city, l.state].filter(Boolean).join(', ') || l.zip || 'No address'}
                          {' · '}{l.users} users · {l.workstations} WS
                          {analysis && <span style={{ color: TYPE_COLOR[analysis.market_tier === 'premium' ? 'standard' : 'restricted'], marginLeft:4 }}>· {analysis.market_tier}</span>}
                          {locLoading[l.id] && <span style={{ color:'#2563eb' }}> · analyzing...</span>}
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        {res && <div style={{ fontSize:11, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(res.mrr)}/mo</div>}
                        <span style={{ fontSize:8, fontWeight:700, color: TYPE_COLOR[l.type], background: TYPE_BG[l.type], padding:'1px 5px', borderRadius:2 }}>
                          {LOCATION_TYPES[l.type]}
                        </span>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:4, marginTop:6 }}>
                      <button onClick={() => openEditLoc(l)}
                        style={{ flex:1, padding:'3px 0', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:3, fontSize:9, color:'#374151', cursor:'pointer' }}>Edit</button>
                      {locations.length > 1 && (
                        <button onClick={() => removeLoc(l.id)}
                          style={{ padding:'3px 8px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:3, fontSize:9, color:'#dc2626', cursor:'pointer' }}>✕</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {locations.length >= 2 && (
                <button onClick={() => setShowConvertModal(true)}
                  style={{ width:'100%', padding:'5px', background:'white', border:'1px dashed #d1d5db', borderRadius:5, fontSize:9, color:'#6b7280', cursor:'pointer', marginTop:4 }}>
                  Convert to single-location IT quote
                </button>
              )}
            </div>

          </div>

          {/* Save */}
          <div style={{ borderTop:'1px solid #e5e7eb', padding:'10px 14px', background:'white', flexShrink:0 }}>
            <button onClick={saveQuote} disabled={saving || !recipientBiz.trim()}
              style={{ width:'100%', padding:'9px', background:'#0f1e3c', color:'white', border:'none', borderRadius:6, fontSize:13, fontWeight:700, cursor:'pointer', opacity: (saving || !recipientBiz.trim()) ? 0.6 : 1 }}>
              {saving ? 'Saving...' : existingQuote ? 'Update Quote' : 'Save Multi-Site Quote'}
            </button>
            {existingQuote && (
              <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap' }}>
                <SendForReviewButton quote={{ ...existingQuote, status: quoteStatus }} quoteType="multisite" onStatusChange={s => setQuoteStatus(s)} />
                <button onClick={exportSPT} style={{ padding:'4px 8px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:4, fontSize:10, color:'#166534', fontWeight:600, cursor:'pointer' }}>
                  ↓ Export SPT
                </button>
              </div>
            )}
            {saveMsg && <div style={{ fontSize:11, color: saveMsg.startsWith('Error') ? '#dc2626' : '#166534', fontWeight:600, marginTop:4 }}>{saveMsg}</div>}
          </div>
        </div>

        {/* ── RIGHT: Preview ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc', minWidth:0 }}>
          <ReviewBanner quote={{ ...existingQuote, status: quoteStatus, hubspot_deal_id: hubDealId }} quoteType="multisite" onStatusChange={s => setQuoteStatus(s)} />

          {/* Price Lock Banner */}
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

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <h2 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:0 }}>{proposalName || recipientBiz || 'Multi-Site Quote Preview'}</h2>
                  <span style={{ fontSize:9, fontWeight:700, background:'#ede9fe', color:'#6d28d9', padding:'2px 7px', borderRadius:3 }}>MULTI-SITE</span>
                </div>
                <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>
                  {locations.length} location{locations.length !== 1 ? 's' : ''} · {selectedPkg?.name} · {contractTerm}-month term
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Total Monthly MRR</div>
                <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(finalMRR)}</div>
              </div>
            </div>

            {/* KPI strip */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7, marginBottom:10 }}>
              {[
                ['Locations', locations.length, '#6d28d9', '#faf5ff'],
                ['Location MRR', fmt$0(totalLocationMRR), '#0f1e3c', '#f0f4ff'],
                ['Multi-Site Disc', multiDiscRate > 0 ? `-${(multiDiscRate*100).toFixed(0)}%` : '—', '#166534', '#f0fdf4'],
                ['Total MRR', fmt$0(finalMRR), '#0f766e', '#f0fdfa'],
              ].map(([l, v, co, bg]) => (
                <div key={l} style={{ background:bg, borderRadius:5, padding:'7px 6px', textAlign:'center' }}>
                  <div style={{ fontSize:7, fontWeight:600, color:'#6b7280', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:2 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:co }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Per-location breakdown */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#6b7280', marginBottom:6 }}>Location Breakdown</div>
              {locationResults.map(({ loc: l, result: res, analysis }) => {
                const isExpanded = expandedLoc === l.id;
                return (
                  <div key={l.id} style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, marginBottom:6, overflow:'hidden' }}>
                    <div onClick={() => setExpandedLoc(isExpanded ? null : l.id)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', cursor:'pointer', background: isExpanded ? '#f8fafc' : 'white' }}>
                      <div style={{ width:3, height:30, borderRadius:2, background: TYPE_COLOR[l.type], flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#0f1e3c' }}>{l.name}</span>
                          <span style={{ fontSize:8, fontWeight:700, color: TYPE_COLOR[l.type], background: TYPE_BG[l.type], padding:'1px 5px', borderRadius:2 }}>
                            {LOCATION_TYPES[l.type]}
                          </span>
                          {analysis && <span style={{ fontSize:8, color:'#6b7280' }}>{analysis.city}, {analysis.state}</span>}
                          {locLoading[l.id] && <span style={{ fontSize:8, color:'#2563eb' }}>analyzing...</span>}
                        </div>
                        <div style={{ fontSize:9, color:'#9ca3af', marginTop:1 }}>
                          {l.users} users · {l.workstations} WS{l.servers > 0 ? ` · ${l.servers} servers` : ''}
                          {analysis && ` · ${analysis.pricing_multiplier}× market`}
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(res?.mrr || 0)}/mo</div>
                        <div style={{ fontSize:8, color:'#9ca3af' }}>{isExpanded ? '▲' : '▼'}</div>
                      </div>
                    </div>

                    {isExpanded && res && (
                      <div style={{ padding:'0 12px 12px', borderTop:'1px solid #f1f5f9' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginTop:8 }}>
                          {[
                            [`US (${l.users} × ${fmt$(selectedPkg?.user_rate)})`, res.breakdown.users],
                            [`WS (${l.workstations} × ${fmt$(selectedPkg?.ws_rate)})`, res.breakdown.workstations],
                            l.servers > 0 && [`Servers (${l.servers} × ${fmt$(selectedPkg?.server_rate)})`, res.breakdown.servers],
                            !res.isRestricted && res.breakdown.locationFee > 0 && [`Site Management Fee`, res.breakdown.locationFee],
                            res.breakdown.endpointUplift > 0 && ['Endpoint density uplift', res.breakdown.endpointUplift],
                          ].filter(Boolean).map(([label, val]) => (
                            <React.Fragment key={label}>
                              <div style={{ fontSize:9, color:'#6b7280' }}>{label}</div>
                              <div style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#374151', textAlign:'right' }}>{fmt$0(val)}/mo</div>
                            </React.Fragment>
                          ))}
                          {analysis?.pricing_multiplier && analysis.pricing_multiplier !== 1 && (
                            <>
                              <div style={{ fontSize:9, color:'#2563eb', gridColumn:'1/-1', paddingTop:4, borderTop:'1px solid #f1f5f9', marginTop:4 }}>
                                Market adjustment: {analysis.pricing_multiplier}× ({analysis.market_tier} — {analysis.city}, {analysis.state})
                              </div>
                            </>
                          )}
                          {res.isRestricted && (
                            <div style={{ fontSize:9, color:'#d97706', gridColumn:'1/-1' }}>⚠ Restricted — no network layer, no site fee</div>
                          )}
                        </div>

                        {/* On-site rates for this location */}
                        {analysis?.rates && (
                          <div style={{ background:'#f8fafc', borderRadius:4, padding:'6px 8px', marginTop:8 }}>
                            <div style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9ca3af', marginBottom:4 }}>On-Site & OOS Rates — {l.name}</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
                              {[
                                ['Remote Support', analysis.rates.remote_support, '/hr'],
                                ['On-Site Dispatch', analysis.rates.onsite_block_2hr, ' block'],
                                ['On-Site Additional', analysis.rates.onsite_additional, '/hr'],
                              ].map(([label, rate, unit]) => (
                                <div key={label} style={{ textAlign:'center' }}>
                                  <div style={{ fontSize:8, color:'#9ca3af' }}>{label}</div>
                                  <div style={{ fontSize:11, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$(rate)}{unit}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pricing summary */}
            <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:6, padding:12, marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#6b7280', marginBottom:8 }}>Pricing Summary</div>

              <LI lbl={`Location subtotal (${locations.length} locations)`} v={totalLocationMRR} bold />
              {multiDiscRate > 0 && <LI lbl={`Multi-location discount (${(multiDiscRate*100).toFixed(0)}% — ${locations.length} locations)`} v={-multiDiscAmount} ind />}
              {termDiscRate > 0 && <LI lbl={`Contract term discount (${(termDiscRate*100).toFixed(0)}% — ${contractTerm} mo)`} v={-termDisc} ind />}
              {addonRevenue > 0 && (
                <>
                  <div style={{ margin:'5px 0', borderTop:'1px dashed #e5e7eb' }} />
                  <LI lbl="Add-on products" v={addonRevenue} bold />
                  {addonLineItems.map(li => (
                    <LI key={li.id} lbl={`${li.name} (${li.qty} × ${fmt$(li.sell_price)})`} v={li.revenue} ind muted />
                  ))}
                </>
              )}
              <div style={{ margin:'6px 0', borderTop:'2px solid #0f1e3c' }} />
              <LI lbl="✦ Total Monthly MRR" v={finalMRR} hi />

              {commissionRate > 0 && (
                <>
                  <div style={{ margin:'5px 0', borderTop:'1px dashed #e5e7eb' }} />
                  <LI lbl={`Commission — ${repProfile?.full_name || 'Rep'} (${fmtPct(commissionRate)} on ${fmt$0(commissionBase)})`} v={-commission} ind />
                  <LI lbl="Net after commission" v={netAfterCommission} bold />
                </>
              )}
            </div>

            {/* Onboarding + TCV */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:8, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>Onboarding Fee</div>
                <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f766e' }}>{fmt$0(onboarding)}</div>
                <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>one-time</div>
              </div>
              <div style={{ background:'#faf5ff', border:'1px solid #ddd6fe', borderRadius:6, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:8, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>Contract TCV</div>
                <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#6d28d9' }}>{fmt$0(contractValue)}</div>
                <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>{contractTerm} months</div>
              </div>
            </div>

            {/* Covered locations — contractual assumption */}
            <div style={{ background:'#0f1e3c', borderRadius:6, padding:12, marginBottom:10 }}>
              <div style={{ fontSize:8, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'#dc2626', marginBottom:6 }}>
                ⚖ Covered Locations — Contractual Scope
              </div>
              <div style={{ fontSize:9, color:'#94a3b8', marginBottom:8, lineHeight:1.5 }}>
                This agreement covers the following {locations.length} location{locations.length !== 1 ? 's' : ''} only.
                Any additional locations not listed are NOT covered and require a separate addendum.
              </div>
              {locations.map((l, i) => (
                <div key={l.id} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:5, padding:'6px 8px', background:'rgba(255,255,255,0.05)', borderRadius:4, border:'1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize:9, color:'#475569', fontFamily:'DM Mono, monospace', flexShrink:0, marginTop:1 }}>{String(i+1).padStart(2,'0')}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#e2e8f0' }}>{l.name}</div>
                    <div style={{ fontSize:9, color:'#64748b' }}>
                      {[l.address, l.city, l.state, l.zip].filter(Boolean).join(', ') || 'Address not specified'}
                    </div>
                  </div>
                  <span style={{ fontSize:8, fontWeight:700, color: TYPE_COLOR[l.type], background: l.type === 'standard' ? '#1e3a5f' : '#451a03', padding:'2px 6px', borderRadius:2, flexShrink:0 }}>
                    {LOCATION_TYPES[l.type]}
                  </span>
                </div>
              ))}
            </div>

            {/* Payment notice */}
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'8px 11px', marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6b7280', marginBottom:4 }}>💳 Payment Methods</div>
              <div style={{ display:'flex', gap:16 }}>
                <div style={{ fontSize:10 }}><span style={{ color:'#374151' }}>ACH/EFT</span> <span style={{ fontWeight:700, color:'#166534' }}>Free</span></div>
                <div style={{ fontSize:10 }}><span style={{ color:'#374151' }}>Check</span> <span style={{ fontWeight:700, color:'#92400e' }}>+${checkFee} admin</span></div>
                <div style={{ fontSize:10 }}><span style={{ color:'#374151' }}>Credit Card</span> <span style={{ fontWeight:700, color:'#dc2626' }}>+{(ccSurcharge*100).toFixed(0)}% surcharge</span></div>
              </div>
            </div>

                        {/* Flex Time Meter */}
            <FlexTimeMeter
              pkg={selectedPkg}
              workstations={locations.reduce((s,l) => s + (parseInt(l.workstations)||0), 0)}
              users={locations.reduce((s,l) => s + (parseInt(l.users)||0), 0)}
              addonHours={null}
            />

{/* Onboarding Incentive */}
            {onboarding > 0 && (
              <OnboardingIncentive
                fee={onboarding}
                marketTier={locationResults.length > 0 && locationAnalyses[locations[0]?.id]
                  ? locationAnalyses[locations[0].id].market_tier
                  : 'standard'}
                contractTerm={contractTerm}
                onChange={inc => setObIncentive(inc)}
              />
            )}

            {/* Documents */}
            <DocumentsPanel
              analysis={locationResults[0]?.analysis || null}
              settings={settings}
              clientName={recipientBiz}
              recipientContact={recipientContact}
              quoteId={existingQuote?.id}
              quoteNumber={existingQuote?.quote_number}
              sptProposalId={sptProposalId}
              onSPTLinked={(pid) => setSptProposalId(pid)}
              inputs={{ users: locations.reduce((s,l) => s+(parseInt(l.users)||0),0), workstations: locations.reduce((s,l) => s+(parseInt(l.workstations)||0),0), locations: locations.length, contractTerm, compliance, selectedProducts: [] }}
              pkg={selectedPkg}
              products={products}
              complianceKey={complianceKey}
              result={{ finalMRR, onboarding }}
              obIncentive={obIncentive}
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


    </>
  );
}

// ─── UI helpers — match QuotePage exactly ────────────────────────────────────
function Sec({t,c,children,s}){return(<div style={{marginBottom:10,...s}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:5,paddingBottom:3,borderBottom:'1px solid #f1f5f9'}}><div style={{width:2,height:11,background:c||'#2563eb',borderRadius:2}}/><span style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6b7280'}}>{t}</span></div>{children}</div>);}
function Grid2({children}){return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>{children}</div>;}
function Fld({lbl,sub,children,s}){return(<div style={{marginBottom:4,...s}}><label style={{display:'block',fontSize:9,fontWeight:600,color:'#374151',marginBottom:1}}>{lbl}{sub&&<span style={{fontWeight:400,color:'#9ca3af',marginLeft:3,fontSize:9}}>{sub}</span>}</label>{children}</div>);}
function TI({value,onChange,placeholder}){return <input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder||''} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,outline:'none'}}/>;}
function SI({v,s,opts}){return <select value={v} onChange={e=>s(e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,background:'white',outline:'none',color:'#374151'}}>{opts.map(([a,b])=><option key={a} value={a}>{b}</option>)}</select>;}
function LI({lbl,v,ind,bold,hi,muted}){if(v===0&&!bold&&!hi)return null;return(<div style={{display:'flex',justifyContent:'space-between',padding:hi?'5px 7px':'1px 2px',marginLeft:ind?7:0,borderRadius:hi?4:0,background:hi?'#dcfce7':'transparent',borderTop:bold&&!hi?'1px solid #f3f4f6':'none',marginTop:bold&&!hi?2:0}}><span style={{fontSize:hi?9:8,fontWeight:bold||hi?700:400,color:hi?'#166534':muted?'#9ca3af':bold?'#374151':'#6b7280'}}>{lbl}</span><span style={{fontSize:hi?11:9,fontWeight:bold||hi?700:500,fontFamily:'DM Mono, monospace',color:hi?'#166534':v<0?'#dc2626':bold?'#111827':'#374151'}}>{v<0?`(${fmt$(-v)})`:fmt$(v)}</span></div>);}
