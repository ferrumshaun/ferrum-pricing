import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { calcQuote, lookupZip, fmt$, fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';
import { calcFlexBlock } from '../lib/flexTime';
import { writeQuoteUrlToDeal, searchDeals, getDealFull, createDeal, updateDeal, updateDealDescription } from '../lib/hubspot';
import QuoteNotes    from '../components/QuoteNotes';
import QuoteHistory  from '../components/QuoteHistory';
import { saveQuoteVersion } from '../lib/quoteVersions';
import { SendForReviewButton, ReviewBanner } from '../components/SendForReview';
import HubSpotConnect from '../components/HubSpotConnect';
import SPTConnect    from '../components/SPTConnect';
import MarketRateCard from '../components/MarketRateCard';
import { DocumentsPanel } from '../components/RateSheetModal';
import FlexTimeSelector from '../components/FlexTimeSelector';
import FlexTimeMeter    from '../components/FlexTimeMeter';
import OnboardingIncentive, { formatIncentiveForExport } from '../components/OnboardingIncentive';

const DEF_INPUTS = {
  users:0, sharedMailboxes:0, workstations:0, endpoints:0,
  mobileDevices:0,
  servers:0, locations:0, cloudTenants:0, vendors:0,
  requestedCoverage:'business_hours', compliance:'none',
  industryRisk:'low', complexity:'low', contractTerm:24,
  execReporting:false, selectedProducts:[],
};

export default function QuotePage() {
  const { id } = useParams();
  const { packages, products, marketTiers, settings, productsByCategory, exclusiveGroups, loading: configLoading } = useConfig();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Handle conversion from Bundle (unbundle → IT) ────────────────────────
  useEffect(() => {
    const from = location.state?.fromBundle;
    if (!from || from.type !== 'it' || configLoading || !packages.length || !marketTiers.length) return;
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
    if (from.marketTier) { const t = marketTiers.find(t => t.tier_key === from.marketTier); if (t) setSelectedMkt(t); }
    if (from.packageName) { const p = packages.find(p => p.name === from.packageName); if (p) setSelectedPkg(p); }
    if (from.inputs) setInputs(prev => ({ ...prev, ...from.inputs }));
  }, [location.state, configLoading, packages, marketTiers]);

  // ── Quote metadata ────────────────────────────────────────────────────────
  const [proposalName,    setProposalName]    = useState('');
  const [recipientBiz,    setRecipientBiz]    = useState('');
  const [recipientContact,setRecipientContact]= useState('');
  const [recipientEmail,  setRecipientEmail]  = useState('');
  const [recipientAddress,setRecipientAddress]= useState('');
  const [clientZip,       setClientZip]       = useState('');
  const [zipResult,       setZipResult]       = useState(null);
  const [zipApplied,      setZipApplied]      = useState(false);
  const [marketCity,      setMarketCity]      = useState('');
  const [marketState,     setMarketState]     = useState('');
  const [repId,              setRepId]              = useState(null);
  const [pricingSnapshot,    setPricingSnapshot]    = useState(null);
  const [sptProposalId,      setSptProposalId]      = useState(null);
  const [flexHours,          setFlexHours]          = useState(null);  // frozen rates when locked
  const [priceLockDate,      setPriceLockDate]      = useState(null);
  const [showUnlockModal,    setShowUnlockModal]    = useState(false);
  const [repProfile,         setRepProfile]         = useState(null);
  const [teamMembers,        setTeamMembers]        = useState([]);
  const [acceptedMktTier,    setAcceptedMktTier]    = useState(null);
  const [acceptedRates,      setAcceptedRates]      = useState(null);  // remote_support, onsite_*, dev_crm, etc — the locked-in market rates
  const [aiMultiplier,       setAiMultiplier]       = useState(null); // from accepted market analysis
  const [aiMultiplierTier,   setAiMultiplierTier]   = useState(null); // label e.g. "Standard"
  const [showMktRecommend,   setShowMktRecommend]   = useState(false);
  const [pendingMultiplier,  setPendingMultiplier]  = useState(null); // waiting for user to accept
  const [obIncentive,        setObIncentive]        = useState(null);

  // ── Quote config ──────────────────────────────────────────────────────────
  const [inputs,      setInputs]      = useState(DEF_INPUTS);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [selectedMkt, setSelectedMkt] = useState(null);
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [dealDescription, setDealDescription] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState('');
  const [existingQuote, setExistingQuote] = useState(null);

  // ── HubSpot ───────────────────────────────────────────────────────────────
  const [hubModal,    setHubModal]    = useState(false);
  const [hubSearch,   setHubSearch]   = useState('');
  const [hubResults,  setHubResults]  = useState([]);
  const [hubLoading,  setHubLoading]  = useState(false);
  const [hubMsg,      setHubMsg]      = useState('');
  const [hubDealId,   setHubDealId]   = useState('');
  const [hubDealName, setHubDealName] = useState('');
  const [hubDealUrl,  setHubDealUrl]  = useState('');
  const [hubSyncing,  setHubSyncing]  = useState(false);

  // ── Load team members for rep selector ──────────────────────────────────────
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
      if (data.inputs?.marketCity)       setMarketCity(data.inputs.marketCity);
      if (data.inputs?.marketState)      setMarketState(data.inputs.marketState);
      if (data.inputs?.aiMultiplier != null) { setAiMultiplier(data.inputs.aiMultiplier); setAiMultiplierTier(data.inputs.aiMultiplierTier || null); }
      if (data.onboarding_incentive?.mode) setObIncentive(data.onboarding_incentive);
      if (data.rep_id) setRepId(data.rep_id);
      if (data.pricing_snapshot) {
        setPricingSnapshot(data.pricing_snapshot);
        setPriceLockDate(data.price_locked_at);
        // Restore accepted rates from snapshot so the flex block picks them up
        // immediately on reopen, before MarketRateCard re-fires onRatesAccepted.
        if (data.pricing_snapshot.acceptedRates) setAcceptedRates(data.pricing_snapshot.acceptedRates);
      }
      if (data.spt_proposal_id) setSptProposalId(data.spt_proposal_id);
      if (data.inputs?.flexHours) setFlexHours(data.inputs.flexHours);
      setQuoteStatus(data.status || 'draft');
      setDealDescription(data.notes || '');
      setHubDealId(data.hubspot_deal_id || '');
      setHubDealUrl(data.hubspot_deal_url || '');
      setHubDealName(data.inputs?.hubspotDealName || '');
      if (data.inputs) setInputs({ ...DEF_INPUTS, ...data.inputs });
      if (data.package_name && packages.length) setSelectedPkg(packages.find(p => p.name === data.package_name));
      if (data.market_tier  && marketTiers.length) setSelectedMkt(marketTiers.find(t => t.tier_key === data.market_tier));
    });
  }, [id, configLoading, packages, marketTiers]);

  // Defaults
  useEffect(() => {
    if (!selectedPkg && packages.length) setSelectedPkg(packages[1] || packages[0]);
    if (!selectedMkt && marketTiers.length) setSelectedMkt(marketTiers.find(t => t.tier_key === 'mid_market') || marketTiers[0]);
  }, [packages, marketTiers]);

  const set = useCallback((k, v) => setInputs(prev => ({ ...prev, [k]: v })), []);

  // Zip lookup & auto-apply
  function handleZipChange(val) {
    setClientZip(val); setZipApplied(false);
    const r = val.length >= 3 ? lookupZip(val) : null;
    setZipResult(r);
  }

  function applyZip(result) {
    const r = result || zipResult;
    if (!r) return;
    const tier = marketTiers.find(t => t.tier_key === r.tier);
    if (tier) { setSelectedMkt(tier); setZipApplied(true); }
    // Capture city/state for market rate analysis
    if (r.city) setMarketCity(r.city);
    if (r.state) setMarketState(r.state);
  }

  // Product toggle with exclusive group handling
  function toggleProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setInputs(prev => {
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
  function isSelected(pid) { return (inputs.selectedProducts || []).includes(pid); }

  // ── HubSpot: search open deals ────────────────────────────────────────────
  async function searchHubspot() {
    setHubLoading(true); setHubMsg(''); setHubResults([]);
    try {
      const results = await searchDeals(hubSearch);
      setHubResults(results);
      if (results.length === 0) setHubMsg('No open deals found. Try a different search term.');
    } catch (err) { setHubMsg('✗ ' + err.message); }
    setHubLoading(false);
  }

  // ── HubSpot: select deal → pull all data ──────────────────────────────────
  async function connectDeal(deal) {
    setHubLoading(true); setHubMsg('Pulling deal details...');
    try {
      const full = await getDealFull(deal.id);

      // Link the deal
      setHubDealId(full.dealId);
      setHubDealUrl(full.dealUrl);
      setHubDealName(full.deal.dealname);

      // Populate client fields from company
      if (full.company) {
        if (full.company.name)    setRecipientBiz(full.company.name);
        // Build address string
        const addrParts = [
          full.company.address,
          full.company.address2,
          full.company.city,
          full.company.state,
          full.company.zip,
          full.company.country !== 'United States' ? full.company.country : null
        ].filter(Boolean);
        const addrStr = addrParts.join(', ');
        if (addrStr) setRecipientAddress(addrStr);

        // Auto-apply zip code
        const zip = full.company.zip;
        if (zip) {
          setClientZip(zip);
          const zr = lookupZip(zip);
          setZipResult(zr);
          if (zr) applyZip(zr);
        }
      } else {
        // No company associated with this deal in HubSpot
        // Extract business name from deal name (e.g. "Acme Corp - Email Security" → "Acme Corp")
        const extracted = full.deal.dealname?.split(/\s[-–—]\s/)?.[0]?.trim();
        if (extracted) setRecipientBiz(extracted);
        setHubMsg('⚠ No company linked to this deal in HubSpot — business name extracted from deal name. Add address manually or link a company in HubSpot.');
      }

      // Populate contact
      if (full.contact) {
        const name = [full.contact.firstname, full.contact.lastname].filter(Boolean).join(' ');
        if (name)              setRecipientContact(name);
        if (full.contact.email) setRecipientEmail(full.contact.email);
      }

      // Auto-set proposal name if empty
      if (!proposalName && full.deal.dealname) {
        setProposalName(`FerrumIT Managed IT Services — ${full.company?.name || full.deal.dealname}`);
      }

      setHubMsg(`✓ Connected: ${full.deal.dealname}`);
      setHubResults([]);

      await logActivity({ action: 'HUBSPOT_CONNECT', entityType: 'quote', entityId: existingQuote?.id, entityName: recipientBiz, changes: { deal_id: full.dealId, deal_name: full.deal.dealname } });
    } catch (err) { setHubMsg('✗ ' + err.message); }
    setHubLoading(false);
  }

  // ── HubSpot: sync quote data back to deal ─────────────────────────────────
  async function syncToDeal() {
    if (!result || !hubDealId) return;
    setHubSyncing(true);
    try {
      await updateDeal(hubDealId, {
        mrr: result.finalMRR,
        contractValue: result.finalMRR * inputs.contractTerm + result.onboarding,
        packageName: selectedPkg?.name,
        quoteNumber: existingQuote?.quote_number || 'DRAFT',
        contractTerm: inputs.contractTerm
      });
      setHubMsg('✓ Deal updated in HubSpot');
      await logActivity({ action: 'HUBSPOT_SYNC', entityType: 'quote', entityId: existingQuote?.id, entityName: recipientBiz });
    } catch (err) { setHubMsg('✗ ' + err.message); }
    setHubSyncing(false);
  }

  // ── Save quote ────────────────────────────────────────────────────────────
  async function saveQuote() {
    if (!recipientBiz.trim()) { setSaveMsg('Please enter a recipient business name.'); return; }
    setSaving(true); setSaveMsg('');
    const allInputs = { ...inputs, proposalName, recipientContact, recipientEmail, recipientAddress, hubspotDealName: hubDealName, marketCity, marketState, aiMultiplier: aiMultiplier ?? null, aiMultiplierTier: aiMultiplierTier ?? null, repId: repId || null, repName: repProfile?.full_name || repProfile?.email || null, flexHours: flexHours || null };
    const totals = result ? {
      finalMRR: result.finalMRR, onboarding: result.onboarding,
      impliedGM: result.impliedGM, totalCost: result.totalCost,
      contractValue: result.finalMRR * inputs.contractTerm + result.onboarding
    } : {};
    const payload = {
      client_name: recipientBiz, client_zip: clientZip,
      market_tier: selectedMkt?.tier_key, package_name: selectedPkg?.name,
      status: quoteStatus, notes: dealDescription,
      // Auto-lock pricing when moving to approved
      ...(quoteStatus === 'approved' && !pricingSnapshot && calcPkg ? {
        pricing_snapshot: buildSnapshot(),
        price_locked_at:  new Date().toISOString(),
        price_locked_by:  profile?.id,
      } : {}),
      ...(pricingSnapshot ? {
        pricing_snapshot: pricingSnapshot,
        price_locked_at:  priceLockDate,
      } : {}), inputs: allInputs,
      line_items: result?.lineItems || [], totals,
      hubspot_deal_id: hubDealId || null,
      hubspot_deal_url: hubDealUrl || null,
      rep_id:    repId || profile?.id || null,
      updated_by: profile?.id,
    };
    if (!existingQuote) payload.created_by = profile?.id;

    const { data, error } = existingQuote
      ? await supabase.from('quotes').update(payload).eq('id', existingQuote.id).select().single()
      : await supabase.from('quotes').insert(payload).select().single();

    if (error) { setSaveMsg('Error: ' + error.message); setSaving(false); return; }

    // Push deal description to HubSpot if linked
    if (hubDealId && dealDescription) {
      try {
        await updateDealDescription(hubDealId, dealDescription);
      } catch (err) {
        console.warn('HubSpot description sync failed:', err.message);
      }
    }

    await logActivity({ action: existingQuote ? 'UPDATE' : 'CREATE', entityType: 'quote', entityId: data.id, entityName: recipientBiz,
      changes: { status: quoteStatus, mrr: totals.finalMRR, package: selectedPkg?.name } });
    // Write quote URL back to HubSpot deal if a field is configured
    if (hubDealId && data?.id) {
      try {
        const { data: fieldData } = await supabase.from('pricing_settings').select('value').eq('key','hubspot_quote_url_field').single();
        const fieldKey = fieldData?.value;
        if (fieldKey) {
          const quoteUrl = `${window.location.origin}/quotes/${data.id}`;
          await writeQuoteUrlToDeal(hubDealId, quoteUrl, fieldKey);
        }
      } catch (e) { console.warn('HubSpot quote URL write failed:', e.message); }
    }

    // Save version snapshot
    await saveQuoteVersion({
      quoteId: data.id,
      quoteData: { client_name: recipientBiz, client_zip: clientZip, market_tier: selectedMkt?.tier_key, package_name: selectedPkg?.name, status: quoteStatus },
      inputs: { ...inputs, proposalName, recipientContact, recipientEmail, recipientAddress },
      totals,
      lineItems: result?.lineItems || [],
      profile,
    });

    setSaveMsg(`Saved as ${data.quote_number}${hubDealId && dealDescription ? ' · HubSpot updated' : ''}`);
    setSaving(false);
    if (!existingQuote) navigate(`/quotes/${data.id}`, { replace: true });
  }

  // ── Export SPT JSON ───────────────────────────────────────────────────────
  function exportSPT() {
    if (!result) return;
    const json = {
      quote_number:    existingQuote?.quote_number || 'DRAFT',
      proposal_name:   proposalName,
      recipient: {
        business_name: recipientBiz,
        contact_name:  recipientContact,
        email:         recipientEmail,
        address:       recipientAddress,
        zip:           clientZip,
      },
      date:            new Date().toISOString().split('T')[0],
      package:         selectedPkg?.name,
      market:          selectedMkt?.name,
      contract_term_months: inputs.contractTerm,
      line_items: [
        { description: `Managed IT — ${selectedPkg?.name}`, quantity: 1, unit_price: result.itSubtotal, total: result.itSubtotal, recurring: true },
        ...result.lineItems.map(li => ({ description: li.product_name, quantity: li.qty, unit_price: li.sell_price, total: li.revenue, recurring: true })),
      ],
      monthly_mrr:      result.finalMRR,
      onboarding_fee:        result.onboarding,
      onboarding_incentive:  obIncentive?.mode ? {
        mode:         obIncentive.mode,
        effectiveFee: obIncentive.effectiveFee,
        monthlyAdd:   obIncentive.monthlyAdd   || 0,
        splitMonths:  obIncentive.splitMonths  || 0,
        discountPct:  obIncentive.discountPct  || 0,
        discountAmount: obIncentive.discountAmount || 0,
        fullFee:      result.onboarding,
        export:       formatIncentiveForExport(obIncentive, result.onboarding),
      } : null,
      contract_value:   result.finalMRR * inputs.contractTerm + (obIncentive?.effectiveFee ?? result.onboarding),
      discount_rate:    result.discRate,
      hubspot_deal_id:  hubDealId,
      dealDescription,
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${existingQuote?.quote_number || 'quote'}_spt.json`; a.click();
    URL.revokeObjectURL(url);
  }

  // Build snapshot of current pricing rates (for locking)
  const buildSnapshot = () => ({
    lockedAt:  new Date().toISOString(),
    package:   selectedPkg  ? { ...selectedPkg }  : null,
    products:  products.filter(p => (inputs.selectedProducts||[]).includes(p.id)).map(p => ({ ...p })),
    settings:  { ...settings },
    // The market rates the rep negotiated/accepted at lock time. Without this
    // the flex block falls back to the package's default $165 after reopen,
    // and the rate card has no rates to display when the underlying market
    // analysis row gets evicted.
    acceptedRates: acceptedRates || null,
  });

  // Use snapshot rates if locked, live rates otherwise
  const calcPkg      = pricingSnapshot?.package   || selectedPkg;
  const calcProducts = pricingSnapshot?.products  ? [...products.map(p => {
    const snap = pricingSnapshot.products.find(s => s.id === p.id);
    return snap ? { ...p, sell_price: snap.sell_price, cost_price: snap.cost_price, no_discount: snap.no_discount, no_commission: snap.no_commission } : p;
  })] : products;
  const calcSettings = pricingSnapshot?.settings  || settings;

  const result = configLoading || !calcPkg || !selectedMkt ? null
    : calcQuote({ inputs, pkg: calcPkg, marketTier: selectedMkt, products: calcProducts, settings: calcSettings,
        aiMultiplierOverride: aiMultiplier,
        repCommissionRate: repProfile?.commission_rate ?? null,
      });

  // Flex block add-on cost (added to MRR and TCV)
  // Flex block honors the locked-in labor rate from MarketRateCard accept.
  // Chain: accepted (live) → snapshotted accepted (after lock) → package default → market_tier (legacy) → 165 floor
  const flexBlockRate = acceptedRates?.remote_support
    ?? pricingSnapshot?.acceptedRates?.remote_support
    ?? calcPkg?.rates?.remote_support
    ?? selectedMkt?.rates?.remote_support
    ?? 165;
  const flexBlock = (result && flexHours)
    ? calcFlexBlock(flexHours, flexBlockRate, calcSettings)
    : null;
  const flexBlockMRR    = flexBlock?.blockPrice   || 0;
  const effectiveFinalMRR  = result ? result.finalMRR + flexBlockMRR : 0;

  if (configLoading) return <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>Loading pricing data...</div>;

  // Multi-term preview — calc all 3 terms silently (safe: configLoading already guarded above)
  const multiTermResults = (result && selectedPkg && selectedMkt) ? [12, 24, 36].map(term => ({
    term,
    result: calcQuote({ inputs: { ...inputs, contractTerm: term }, pkg: selectedPkg, marketTier: selectedMkt,
      products, settings, aiMultiplierOverride: aiMultiplier, repCommissionRate: repProfile?.commission_rate ?? null })
  })) : null;

  // Compliance recommendations
  const complianceKey = inputs.compliance === 'moderate' ? ['hipaa','soc2'] : inputs.compliance === 'high' ? ['pci','cmmc'] : [];
  const recommendedProducts = complianceKey.length > 0
    ? products.filter(p => p.compliance_tags?.some(t => complianceKey.includes(t)) && p.active)
    : [];
  const unselectedRecommended = recommendedProducts.filter(p => !(inputs.selectedProducts || []).includes(p.id));

  // Payment surcharge settings
  const ccSurcharge = parseFloat(settings?.payment_cc_surcharge) || 0.02;
  const achFee      = parseFloat(settings?.payment_ach_fee)      || 0;
  const checkFee    = parseFloat(settings?.payment_check_fee)    || 10;

  const mktColor = { major_metro:'#1e40af', mid_market:'#065f46', small_market:'#6d28d9' };
  const mktBg    = { major_metro:'#dbeafe', mid_market:'#d1fae5', small_market:'#ede9fe' };
  const gc = result ? gmColor(result.impliedGM) : '#374151';
  const gb = result ? gmBg(result.impliedGM)    : '#f9fafb';

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ width:345, flexShrink:0, background:'white', borderRight:'1px solid #e5e7eb', overflowY:'auto', padding:'12px 14px' }}>

        {/* Quote number badge */}
        {existingQuote && (
          <div style={{ marginBottom:8, padding:'5px 8px', background:'#f0f7ff', borderRadius:5, fontSize:11, color:'#1e40af', fontWeight:600, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>{existingQuote.quote_number}</span>
            <span style={{ fontSize:10, padding:'1px 6px', borderRadius:3, background: quoteStatus==='won'?'#dcfce7':quoteStatus==='sent'?'#dbeafe':quoteStatus==='lost'?'#fee2e2':'#f3f4f6', color: quoteStatus==='won'?'#166534':quoteStatus==='sent'?'#1e40af':quoteStatus==='lost'?'#991b1b':'#6b7280', fontWeight:600 }}>{quoteStatus}</span>
          </div>
        )}

        {/* ── HubSpot connection ── */}
        <HubSpotConnect
          dealId={hubDealId}
          dealUrl={hubDealUrl}
          dealName={hubDealName}
          description={dealDescription}
          onDescriptionChange={setDealDescription}
          quoteNumber={existingQuote?.quote_number}
          mrr={effectiveFinalMRR || result?.finalMRR}
          contractValue={result ? effectiveFinalMRR * inputs.contractTerm + result.onboarding : 0}
          packageName={selectedPkg?.name}
          contractTerm={inputs.contractTerm}
          existingQuoteId={existingQuote?.id}
          clientName={recipientBiz}
          onConnect={full => {
            setHubDealId(full.dealId);
            setHubDealUrl(full.dealUrl);
            setHubDealName(full.deal.dealname);
            if (full.company) {
              if (full.company.name) setRecipientBiz(full.company.name);
              const addr = [full.company.address, full.company.address2, full.company.city, full.company.state, full.company.zip].filter(Boolean).join(', ');
              if (addr) setRecipientAddress(addr);
              if (full.company.zip) { setClientZip(full.company.zip); const zr = lookupZip(full.company.zip); setZipResult(zr); if (zr) applyZip(zr); }
            } else {
              const extracted = full.deal.dealname?.split(/\s[-–—]\s/)?.[0]?.trim();
              if (extracted) setRecipientBiz(extracted);
            }
            if (full.contact) {
              const name = [full.contact.firstname, full.contact.lastname].filter(Boolean).join(' ');
              if (name) setRecipientContact(name);
              if (full.contact.email) setRecipientEmail(full.contact.email);
            }
            if (!proposalName && full.deal.dealname) setProposalName(`FerrumIT Managed IT Services — ${full.company?.name || full.deal.dealname}`);
          }}
          onDisconnect={() => { setHubDealId(''); setHubDealUrl(''); setHubDealName(''); }}
          onSync={syncToDeal}
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

        {/* ── Client / Proposal fields ── */}
        <Sec t="Proposal Details" c="#0f1e3c">
          {/* Rep selector */}
          <Fld lbl="Assigned Sales Rep">
            <select value={repId || ''} onChange={e => setRepId(e.target.value)}
              style={{ width:'100%', padding:'4px 7px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, background:'white', outline:'none' }}>
              <option value="">— select rep —</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email?.split('@')[0]}
                </option>
              ))}
            </select>
          </Fld>
          <Fld lbl="Proposal Name">
            <TI value={proposalName} onChange={setProposalName} placeholder="e.g. FerrumIT Managed IT — Acme Corp" />
          </Fld>
          <Fld lbl="Recipient Business Name">
            <TI value={recipientBiz} onChange={setRecipientBiz} placeholder="Acme Corp" />
          </Fld>
          <Grid2>
            <Fld lbl="Contact Name">
              <TI value={recipientContact} onChange={setRecipientContact} placeholder="Jane Smith" />
            </Fld>
            <Fld lbl="Contact Email">
              <TI value={recipientEmail} onChange={setRecipientEmail} placeholder="jane@acme.com" />
            </Fld>
          </Grid2>
          <Fld lbl="Business Address">
            <TI value={recipientAddress} onChange={setRecipientAddress} placeholder="123 Main St, Chicago, IL 60601" />
          </Fld>
        </Sec>

        {/* ── Zip / Location ── */}
        <div style={{ background:'#f0f7ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'8px 10px', marginBottom:10 }}>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#1e40af', marginBottom:5 }}>📍 Client Location</div>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            <input value={clientZip} onChange={e => handleZipChange(e.target.value)} placeholder="Zip code — auto-filled from address"
              style={{ flex:1, padding:'5px 8px', border:'1px solid #93c5fd', borderRadius:4, fontSize:12, outline:'none', fontFamily:'DM Mono, monospace', fontWeight:600 }} />
            {zipResult && !zipApplied && (
              <button onClick={() => applyZip()} style={{ padding:'5px 8px', background:mktColor[zipResult.tier]||'#374151', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:700, whiteSpace:'nowrap', cursor:'pointer' }}>Apply →</button>
            )}
          </div>
          {zipResult && (
            <div style={{ marginTop:5, padding:'4px 7px', borderRadius:4, background:mktBg[zipResult.tier]||'#f3f4f6', fontSize:10 }}>
              <span style={{ fontWeight:700, color:mktColor[zipResult.tier] }}>{zipResult.name||`ZIP ${zipResult.zip}`} → {marketTiers.find(t=>t.tier_key===zipResult.tier)?.name}</span>
              {zipApplied && <span style={{ marginLeft:6, color:'#166534', fontWeight:700 }}>✓ Applied</span>}
            </div>
          )}
        </div>

        {/* Market tier */}
        <Sec t="Market Tier" c="#0f1e3c">

          {/* AI recommendation banner */}
          {showMktRecommend && pendingMultiplier && (
            <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:5, padding:'8px 10px', marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#1e40af', marginBottom:3 }}>
                📊 AI Market Recommendation
              </div>
              <div style={{ fontSize:10, color:'#1e40af', marginBottom:6 }}>
                <strong>{pendingMultiplier.city}, {pendingMultiplier.state}</strong> — {pendingMultiplier.tier?.charAt(0).toUpperCase() + pendingMultiplier.tier?.slice(1)} market
                · <strong>{pendingMultiplier.multiplier === 1 ? 'No adjustment' : pendingMultiplier.multiplier > 1 ? `+${Math.round((pendingMultiplier.multiplier - 1) * 100)}% pricing` : `-${Math.round((1 - pendingMultiplier.multiplier) * 100)}% pricing`}</strong>
                {' '}<span style={{ fontSize:9, color:'#6b7280' }}>(multiplier: {pendingMultiplier.multiplier}×)</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => {
                  setAiMultiplier(pendingMultiplier.multiplier);
                  setAiMultiplierTier(pendingMultiplier.tier);
                  setShowMktRecommend(false);
                }} style={{ padding:'4px 12px', background:'#1e40af', color:'white', border:'none', borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                  Apply AI Rate
                </button>
                <button onClick={() => setShowMktRecommend(false)}
                  style={{ padding:'4px 8px', background:'white', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, color:'#6b7280', cursor:'pointer' }}>
                  Keep Manual
                </button>
              </div>
            </div>
          )}

          {/* AI multiplier active indicator */}
          {aiMultiplier != null && !showMktRecommend && (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:4, padding:'5px 8px', marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:'#166534', fontWeight:600 }}>
                ✓ AI rate active: {aiMultiplierTier?.charAt(0).toUpperCase() + aiMultiplierTier?.slice(1)} · {aiMultiplier === 1 ? 'baseline' : aiMultiplier > 1 ? `+${Math.round((aiMultiplier-1)*100)}%` : `-${Math.round((1-aiMultiplier)*100)}%`}
              </span>
              <button onClick={() => { setAiMultiplier(null); setAiMultiplierTier(null); }}
                style={{ fontSize:9, background:'none', border:'none', color:'#9ca3af', cursor:'pointer' }}>
                ✕ remove
              </button>
            </div>
          )}

          {marketTiers.map(t => (
            <div key={t.id} onClick={() => { setSelectedMkt(t); setAiMultiplier(null); setAiMultiplierTier(null); }} style={{ padding:'5px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedMkt?.id===t.id?'2':'1'}px solid ${selectedMkt?.id===t.id?(mktColor[t.tier_key]||'#374151'):'#e5e7eb'}`, background:selectedMkt?.id===t.id?(mktBg[t.tier_key]||'#f3f4f6'):'white', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: aiMultiplier != null ? 0.55 : 1 }}>
              <span style={{ fontSize:10, fontWeight:700, color:mktColor[t.tier_key] }}>{t.name}</span>
              <span style={{ fontSize:9, color:'#6b7280', fontFamily:'DM Mono, monospace' }}>{t.labor_multiplier<1?`-${Math.round((1-t.labor_multiplier)*100)}% pricing`:'baseline'}</span>
            </div>
          ))}
          {aiMultiplier != null && (
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:3, fontStyle:'italic' }}>
              Manual tier dimmed — AI rate is active. Click a tier to switch back to manual.
            </div>
          )}
        </Sec>

        {/* Package */}
        <Sec t="Managed IT Package" c="#2563eb">
          {packages.map(p => (
            <div key={p.id} onClick={() => setSelectedPkg(p)} style={{ padding:'6px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedPkg?.id===p.id?'2':'1'}px solid ${selectedPkg?.id===p.id?'#2563eb':'#e5e7eb'}`, background:selectedPkg?.id===p.id?'#eff6ff':'white' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:10, fontWeight:700, color:selectedPkg?.id===p.id?'#1e40af':'#374151' }}>{p.name}</span>
                <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#6b7280', background:'#f3f4f6', padding:'1px 4px', borderRadius:3 }}>${p.ws_rate}/WS · ${p.user_rate}/US</span>
              </div>
              <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>{p.ideal_desc}</div>
            </div>
          ))}
          {result?.recommended && result.recommended!==selectedPkg?.name && (
            <div style={{ padding:'4px 7px', background:'#fefce8', border:'1px solid #fde68a', borderRadius:3, fontSize:9, color:'#92400e', marginTop:4 }}>
              ⚡ Recommended: <strong>{result.recommended}</strong>
            </div>
          )}
          <Fld lbl="Contract Term" s={{ marginTop:8 }}><SI v={inputs.contractTerm} s={v=>set('contractTerm',+v)} opts={[['12','12 mo (5%)'],['24','24 mo (10%)'],['36','36 mo (20%)']]}/></Fld>
          <Fld lbl="Quote Status" s={{ marginTop:4 }}><SI v={quoteStatus} s={setQuoteStatus} opts={[['draft','Draft'],['in_review','In Review'],['approved','Approved'],['sent','Sent'],['won','Won'],['lost','Lost'],['expired','Expired']]}/></Fld>
        </Sec>

        {/* People & Devices */}
        <Sec t="People & Devices" c="#7c3aed">
          <Grid2>
            <Fld lbl="Users" sub="humans"><NI v={inputs.users} s={v=>set('users',v)}/></Fld>
            <Fld lbl="Shared Mailboxes" sub="billing@ etc"><NI v={inputs.sharedMailboxes} s={v=>set('sharedMailboxes',v)}/></Fld>
            <Fld lbl="Workstations" sub="managed"><NI v={inputs.workstations} s={v=>set('workstations',v)}/></Fld>
            <Fld lbl="Total Devices" sub="density/SIEM"><NI v={inputs.endpoints} s={v=>set('endpoints',v)}/></Fld>
            <Fld lbl="Mobile Devices" sub="phones + tablets"><NI v={inputs.mobileDevices||0} s={v=>set('mobileDevices',v)}/></Fld>
          </Grid2>
        </Sec>

        {/* Infrastructure */}
        <Sec t="Infrastructure" c="#0891b2">
          <Grid2>
            <Fld lbl="Servers"><NI v={inputs.servers} s={v=>set('servers',v)}/></Fld>
            <Fld lbl="Locations" sub="all billed"><NI v={inputs.locations} s={v=>set('locations',v)}/></Fld>
            <Fld lbl="Cloud Tenants" sub="M365/GW/Azure"><NI v={inputs.cloudTenants} s={v=>set('cloudTenants',v)}/></Fld>
            <Fld lbl="Vendors/Carriers"><NI v={inputs.vendors} s={v=>set('vendors',v)}/></Fld>
          </Grid2>
        </Sec>

        {/* Risk */}
        <Sec t="Risk & Compliance" c="#dc2626">
          <Grid2>
            <Fld lbl="Industry Risk"><SI v={inputs.industryRisk} s={v=>set('industryRisk',v)} opts={[['low','Low'],['medium','Medium'],['high','High']]}/></Fld>
            <Fld lbl="Compliance"><SI v={inputs.compliance} s={v=>set('compliance',v)} opts={[['none','None'],['moderate','HIPAA/SOC2'],['high','PCI/CMMC']]}/></Fld>
            <Fld lbl="Complexity"><SI v={inputs.complexity} s={v=>set('complexity',v)} opts={[['low','Low'],['medium','Medium'],['high','High']]}/></Fld>
            <Fld lbl="Coverage"><SI v={inputs.requestedCoverage} s={v=>set('requestedCoverage',v)} opts={[['business_hours','8×5'],['24x5','24×5'],['24x7','24×7']]}/></Fld>
          </Grid2>
        </Sec>

        {/* Add-on Products from DB */}
        {Object.entries(productsByCategory).map(([cat, catProducts]) => (
          <Sec key={cat} t={cat} c={catColor(cat)}>
            {cat === 'Strategic Advisory' && (
              <Tog on={inputs.execReporting} set={v=>set('execReporting',v)} lbl="Executive Reporting Required" sub="Triggers Enterprise recommendation"/>
            )}
            {catProducts.map(p => {
              const gm = p.sell_price > 0 ? (1-p.cost_price/p.sell_price) : 0;
              const isExclusive = !!p.exclusive_group;
              const sel = isSelected(p.id);
              const isRecommended = recommendedProducts.some(r => r.id === p.id);
              const compColor = isRecommended && !sel ? '#92400e' : null;
              return (
                <div key={p.id} onClick={() => toggleProduct(p.id)}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 7px', borderRadius:4, cursor:'pointer', marginBottom:2,
                    border:`1px solid ${sel?'#93c5fd': isRecommended ? '#fde68a' :'#e5e7eb'}`,
                    background:sel?'#eff6ff': isRecommended ? '#fffbeb' :'white' }}>
                  {isExclusive
                    ? <div style={{ width:13, height:13, borderRadius:'50%', border:`2px solid ${sel?'#2563eb':'#d1d5db'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {sel && <div style={{ width:5, height:5, borderRadius:'50%', background:'#2563eb' }}/>}
                      </div>
                    : <div style={{ width:22, height:13, borderRadius:7, background:sel?'#2563eb':'#d1d5db', position:'relative', flexShrink:0 }}>
                        <div style={{ position:'absolute', top:2, left:sel?11:2, width:9, height:9, borderRadius:'50%', background:'white', transition:'left .1s' }}/>
                      </div>
                  }
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
                      <div style={{ fontSize:10, fontWeight:600, color:sel?'#1e40af':'#374151' }}>{p.name}</div>
                      {isRecommended && !sel && (
                        <span style={{ fontSize:7, fontWeight:700, padding:'1px 4px', borderRadius:2, background:'#fde68a', color:'#92400e' }}>
                          ⚠ {inputs.compliance === 'moderate' ? 'HIPAA/SOC2' : 'PCI/CMMC'}
                        </span>
                      )}
                      {isRecommended && sel && (
                        <span style={{ fontSize:7, fontWeight:700, padding:'1px 4px', borderRadius:2, background:'#dcfce7', color:'#166534' }}>
                          ✓ Compliance
                        </span>
                      )}
                    </div>
                    {p.description && <div style={{ fontSize:8, color:'#9ca3af' }}>{p.description}</div>}
                    {isRecommended && !sel && p.recommendation_reason && (
                      <div style={{ fontSize:8, color:'#92400e', fontStyle:'italic', marginTop:1 }}>{p.recommendation_reason.substring(0,80)}{p.recommendation_reason.length>80?'…':''}</div>
                    )}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
                    {sel && p.qty_driver === 'manual' && (() => {
                      const qty = parseInt(inputs.manualQuantities?.[p.id] || 0);
                      return (
                        <div onClick={e=>e.stopPropagation()} style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1 }}>
                          <input type="number" min="0" value={qty || ''} placeholder="qty"
                            onChange={e=>{
                              const next = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                              setInputs(prev => ({ ...prev, manualQuantities: { ...(prev.manualQuantities || {}), [p.id]: next } }));
                            }}
                            style={{ width:54, padding:'2px 5px', border:`1px solid ${qty > 0 ? '#93c5fd' : '#fbbf24'}`, borderRadius:3, fontSize:10, fontFamily:'DM Mono, monospace', textAlign:'center', outline:'none', background: qty > 0 ? 'white' : '#fffbeb' }}/>
                          {qty === 0 && <span style={{ fontSize:8, color:'#92400e', fontWeight:600 }}>set qty</span>}
                        </div>
                      );
                    })()}
                    <div>
                      <div style={{ fontSize:10, fontFamily:'DM Mono, monospace', fontWeight:600, color:'#374151' }}>${p.sell_price}/{p.qty_driver === 'manual' ? 'license' : p.qty_driver}</div>
                      <div style={{ fontSize:8, color:'#9ca3af' }}>{(gm*100).toFixed(0)}% GM</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Sec>
        ))}



        {/* Save / Export */}
        <div style={{ padding:10, background:'#f8fafc', borderRadius:5, border:'1px solid #e5e7eb', marginTop:4 }}>
          <div style={{ display:'flex', gap:5 }}>
            <button onClick={saveQuote} disabled={saving}
              style={{ flex:1, padding:'6px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? 'Saving...' : existingQuote ? 'Update Quote' : 'Save Quote'}
            </button>
            {result && (
              <button onClick={exportSPT}
                style={{ padding:'6px 8px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:4, fontSize:10, color:'#166534', fontWeight:600, cursor:'pointer' }}>
                Export JSON
              </button>
            )}
          </div>
          {existingQuote && (
            <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap' }}>
              <SendForReviewButton
                quote={{ ...existingQuote, status: quoteStatus, inputs: { ...inputs, proposalName, recipientContact, recipientEmail } }}
                quoteType="quotes"
                onStatusChange={s => setQuoteStatus(s)}
              />
              <button
                onClick={() => navigate('/bundle/new', { state: { fromQuote: {
                  type: 'it',
                  clientName: recipientBiz, clientZip,
                  marketTier: selectedMkt?.tier_key,
                  packageName: selectedPkg?.name,
                  proposalName, recipientContact, recipientEmail, recipientAddress, flexHours: flexHours || null,
                  notes: dealDescription,
                  hubDealId, hubDealUrl, hubDealName,
                  inputs: { ...inputs },
                }}})}
                style={{ padding:'6px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:4, fontSize:11, color:'#166534', fontWeight:600, cursor:'pointer' }}>
                📦 Bundle with Voice
              </button>
            </div>
          )}
          {saveMsg && <div style={{ fontSize:11, color:'#166534', fontWeight:600, marginTop:5 }}>{saveMsg}</div>}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc', minWidth:0 }}>
        <ReviewBanner
          quote={{ ...existingQuote, status: quoteStatus, hubspot_deal_id: hubDealId }}
          quoteType="quotes"
          onStatusChange={s => setQuoteStatus(s)}
        />

        {/* ── Price Lock Banner ── */}
        {pricingSnapshot && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 14px', background:'#1e3a5f', borderBottom:'1px solid #2d4f7a' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:14 }}>🔒</span>
              <div>
                <span style={{ fontSize:11, fontWeight:700, color:'#93c5fd' }}>Prices locked</span>
                <span style={{ fontSize:10, color:'#64748b', marginLeft:6 }}>
                  as of {priceLockDate ? new Date(priceLockDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : 'approval'} — rates frozen at {pricingSnapshot.package?.name}
                </span>
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

        {/* ── Unlock Confirmation Modal ── */}
        {showUnlockModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
            <div style={{ background:'white', borderRadius:10, padding:28, width:440, boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c', margin:'0 0 10px' }}>⚠ Unlock Pricing</h3>
              <p style={{ fontSize:12, color:'#374151', lineHeight:1.6, margin:'0 0 14px' }}>
                This quote's pricing was locked when it was approved. Unlocking will allow rates to update based on current package pricing.
              </p>
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:5, padding:'8px 12px', fontSize:11, color:'#991b1b', marginBottom:18 }}>
                If you have already sent this quote to the client or exported it to Smart Pricing Table, unlocking may cause price discrepancies. Consider creating a new quote revision instead.
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={() => setShowUnlockModal(false)}
                  style={{ padding:'7px 16px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:5, fontSize:12, cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={async () => {
                  setPricingSnapshot(null); setPriceLockDate(null); setShowUnlockModal(false);
                  if (existingQuote?.id) {
                    await supabase.from('quotes').update({ pricing_snapshot: null, price_locked_at: null, price_locked_by: null }).eq('id', existingQuote.id);
                    await saveQuoteVersion({ quoteId: existingQuote.id, quoteData: { client_name: recipientBiz, status: quoteStatus }, inputs: { ...inputs, proposalName }, totals: { finalMRR: result?.finalMRR }, lineItems: [], profile, note: 'Pricing unlocked — rates now reflect current package pricing' });
                  }
                }} style={{ padding:'7px 18px', background:'#dc2626', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  Unlock & Recalculate
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        {!result
          ? <div style={{ textAlign:'center', color:'#9ca3af', marginTop:80, fontSize:12 }}>Enter client details to generate a quote</div>
          : <div className="fade-in">
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <h2 style={{ fontSize:15, fontWeight:700, color:'#0f1e3c' }}>{proposalName || recipientBiz || 'Quote Preview'}</h2>
                  <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>
                    {recipientBiz && <span>{recipientBiz} · </span>}
                    {selectedPkg?.name} · {selectedMkt?.name} · {inputs.contractTerm}-month term
                    {result.mktMult<1 && <span style={{ color:'#2563eb', marginLeft:4 }}>({Math.round((1-result.mktMult)*100)}% market pricing adjustment)</span>}
                  </div>
                  {recipientContact && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>Contact: {recipientContact}{recipientEmail?` · ${recipientEmail}`:''}</div>}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Final Monthly MRR</div>
                  <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(result.finalMRR)}</div>
                </div>
              </div>

              {/* ── Multi-term pricing preview — full width above KPI cards ── */}
              {multiTermResults && (
                <div style={{ background:'#f0f4ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#1e40af', marginBottom:8 }}>
                    📋 Term Comparison — click to switch
                  </div>
                  {flexBlockMRR > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, padding:'4px 8px', background:'#fff7ed', borderRadius:4, border:'1px solid #fed7aa' }}>
                      <span style={{ fontSize:9, color:'#c2410c', fontWeight:600 }}>⏱ Includes {flexBlock?.hours}hr Flex Time block (+{fmt$0(flexBlockMRR)}/mo)</span>
                      <span style={{ fontSize:8, color:'#9ca3af' }}>— added to all term totals below</span>
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                    {multiTermResults.map(({ term, result: r }) => {
                      const isCurrent = term === inputs.contractTerm;
                      const termMRR = r.finalMRR + flexBlockMRR;
                      const savings = multiTermResults[0].result
                        ? (r.finalMRR + flexBlockMRR) - (multiTermResults[0].result.finalMRR + flexBlockMRR)
                        : 0;
                      return (
                        <div key={term} onClick={() => set('contractTerm', term)} style={{ cursor:'pointer', borderRadius:5, padding:'8px 10px',
                          border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? '#2563eb' : '#dbeafe'}`,
                          background: isCurrent ? '#2563eb' : 'white', transition:'all 0.1s' }}>
                          <div style={{ fontSize:9, fontWeight:700, color: isCurrent ? '#bfdbfe' : '#6b7280' }}>{term}-MONTH</div>
                          <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Mono, monospace', color: isCurrent ? 'white' : '#0f1e3c', lineHeight:1.2 }}>
                            {fmt$0(termMRR)}
                          </div>
                          <div style={{ fontSize:9, color: isCurrent ? '#bfdbfe' : '#6b7280' }}>/mo</div>
                          {flexBlockMRR > 0 && (
                            <div style={{ fontSize:7, color: isCurrent ? 'rgba(255,255,255,0.6)' : '#f97316', marginTop:1 }}>
                              incl. {flexBlock?.hours}hr flex block
                            </div>
                          )}
                          {term !== 12 && savings !== 0 && (
                            <div style={{ fontSize:8, fontWeight:700, color: isCurrent ? '#bfdbfe' : savings < 0 ? '#166534' : '#dc2626', marginTop:2 }}>
                              {savings < 0 ? `${fmt$0(Math.abs(savings))}/mo savings` : `+${fmt$0(savings)}/mo`}
                            </div>
                          )}
                          {term === 12 && <div style={{ fontSize:8, color: isCurrent ? '#bfdbfe' : '#9ca3af', marginTop:2 }}>base rate</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:8, color:'#93c5fd', marginTop:6 }}>
                    TCV: {multiTermResults.map(({term: t, result: r}) => `${t}mo = ${fmt$0((r.finalMRR + flexBlockMRR)*t + r.onboarding)}`).join(' · ')}
                  </div>
                </div>
              )}

              {/* ── Compliance recommendations — full width above KPI cards ── */}
              {unselectedRecommended.length > 0 && (
                <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:6, padding:'9px 12px', marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'#92400e', marginBottom:6 }}>
                    ⚠ Compliance Recommendations — {inputs.compliance === 'moderate' ? 'HIPAA/SOC 2' : 'PCI/CMMC'}
                  </div>
                  {unselectedRecommended.map(p => (
                    <div key={p.id} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:5, padding:'6px 8px', background:'white', borderRadius:4, border:'1px solid #fde68a' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#0f1e3c' }}>{p.name}</div>
                        {p.recommendation_reason && <div style={{ fontSize:9, color:'#78350f', marginTop:1 }}>{p.recommendation_reason}</div>}
                      </div>
                      <button onClick={() => setInputs(prev => ({ ...prev, selectedProducts: [...(prev.selectedProducts||[]), p.id] }))}
                        style={{ padding:'3px 8px', background:'#d97706', color:'white', border:'none', borderRadius:3, fontSize:9, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* KPI cards — 4 inline */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7, marginBottom:10 }}>
                {[['Monthly MRR',fmt$0(effectiveFinalMRR),'#0f1e3c','#f0f4ff'],['Onboarding',fmt$0(obIncentive?.effectiveFee ?? result.onboarding),'#0f766e','#f0fdf4'],['Implied GM',flexBlock ? fmtPct(1 - (result.totalCost + (flexBlock.hours * parseFloat(settings?.burdened_hourly_rate||125))) / effectiveFinalMRR) : fmtPct(result.impliedGM), flexBlock ? gmColor(1-(result.totalCost+(flexBlock.hours*parseFloat(settings?.burdened_hourly_rate||125)))/effectiveFinalMRR) : gc, flexBlock ? gmBg(1-(result.totalCost+(flexBlock.hours*parseFloat(settings?.burdened_hourly_rate||125)))/effectiveFinalMRR) : gb],['Contract TCV',fmt$0(effectiveFinalMRR*inputs.contractTerm+(obIncentive?.effectiveFee??result.onboarding)),'#6d28d9','#faf5ff']].map(([l,v,co,bg])=>(
                  <div key={l} style={{ background:bg, borderRadius:5, padding:'7px 6px', textAlign:'center' }}>
                    <div style={{ fontSize:7, fontWeight:600, color:'#6b7280', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:co }}>{v}</div>
                  </div>
                ))}
              </div>

              {result.finalMRR<=result.floor+.01&&result.riskAdjMRR<result.floor&&(
                <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:4, padding:'6px 9px', marginBottom:8, fontSize:9, color:'#92400e' }}>
                  ⚠ Price set by minimum commitment floor ({fmt$(result.floor)}). Rate-based: {fmt$(result.riskAdjMRR)}
                </div>
              )}

              {/* ── Flex Time Card ── */}
              <FlexTimeMeter
                pkg={selectedPkg}
                workstations={inputs.workstations}
                users={inputs.users}
                addonHours={flexHours}
              />

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Line items */}
                <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Monthly Recurring Revenue</div>
                  <SH l="Managed IT Services"/>
                  <LI lbl={`WS (${inputs.workstations} × $${selectedPkg?.ws_rate})`} v={result.wB} ind/>
                  <LI lbl={`US (${inputs.users} × $${selectedPkg?.user_rate})`} v={result.uB} ind/>
                  <LI lbl="Servers" v={result.sB} ind/>
                  <LI lbl="Locations" v={result.lB} ind/>
                  <LI lbl="Cloud tenants" v={result.tB} ind/>
                  <LI lbl="Additional vendors" v={result.vB} ind/>
                  <LI lbl="Coverage uplift" v={result.covU} ind/>
                  <LI lbl="Endpoint density uplift" v={result.eB} ind/>
                  <LI lbl="Managed IT Subtotal" v={result.itSubtotal} bold/>
                  {result.lineItems.length>0&&(()=>{
                    const byC=result.lineItems.reduce((a,li)=>{(a[li.category]=a[li.category]||[]).push(li);return a},{});
                    return Object.entries(byC).map(([cat,items])=>(
                      <span key={cat}>
                        <SH l={cat}/>
                        {items.map(li=>{
                          const costDiffers = li.cost_qty_driver && li.cost_qty_driver !== li.qty_driver;
                          return (
                            <span key={li.product_id}>
                              <LI lbl={`${li.product_name} (${li.qty} × $${li.sell_price})`} v={li.revenue} ind/>
                              {costDiffers && <div style={{fontSize:8,color:'#9ca3af',marginLeft:16,marginBottom:2}}>cost basis: {li.cost_qty} {li.cost_qty_driver}s × ${li.cost_price}</div>}
                            </span>
                          );
                        })}
                      </span>
                    ));
                  })()}
                  {result.addonRevenue>0&&<LI lbl="Add-ons Subtotal" v={result.addonRevenue} bold/>}
                  <div style={{ margin:'5px 0', borderTop:'2px solid #0f1e3c' }}/>
                  <LI lbl="Operational Subtotal" v={result.opSubtotal} bold/>
                  {result.compMult!==1&&<LI lbl={`Risk multiplier: ${result.compMult.toFixed(2)}×`} v={result.riskAdjMRR} muted/>}
                  {result.discount<0&&<LI lbl={`${Math.round(result.discRate*100)}% contract discount`} v={result.discount} ind/>}
                  {flexBlock && <LI lbl={`Flex Time — ${flexBlock.hours}hr block (${flexBlock.discountPct}% off T&M)`} v={flexBlock.blockPrice} ind/>}
                  <LI lbl={flexBlockMRR > 0 ? `✦ Final MRR (incl. ${flexBlock.hours}hr flex block)` : '✦ Final Monthly MRR'} v={effectiveFinalMRR} hi/>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {/* Onboarding */}
                  <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>One-Time Onboarding</div>
                    <LI lbl={`Users (${inputs.users} × $35)`} v={inputs.users*35} ind/>
                    <LI lbl={`Workstations (${inputs.workstations} × $20)`} v={inputs.workstations*20} ind/>
                    <LI lbl={`Servers (${inputs.servers} × $250)`} v={inputs.servers*250} ind/>
                    <LI lbl={`Locations (${inputs.locations} × $450)`} v={inputs.locations*450} ind/>
                    {result.onboardingIsMinimum&&<div style={{ fontSize:8, color:'#9ca3af', padding:'1px 2px' }}>$500 minimum applied</div>}
                    <div style={{ margin:'4px 0', borderTop:'2px solid #0f766e' }}/>
                    <LI lbl="Total Onboarding Fee" v={result.onboarding} hi/>
                  </div>
                  <OnboardingIncentive
                    fee={result.onboarding}
                    marketTier={acceptedMktTier || (zipResult?.tier === 'major_metro' ? 'premium' : zipResult?.tier === 'mid_market' ? 'standard' : 'secondary')}
                    contractTerm={inputs.contractTerm}
                    onChange={inc => {
                      setObIncentive(inc);
                      if (existingQuote?.id && inc?.mode) {
                        const label = inc.mode === 'split'
                          ? `Onboarding: split over ${inc.splitMonths} months (+${fmt$0(inc.monthlyAdd)}/mo)`
                          : inc.mode === 'discount'
                            ? `Onboarding: ${inc.discountPct}% discount applied — effective fee ${fmt$0(inc.effectiveFee)}`
                            : 'Onboarding: no incentive selected';
                        saveQuoteVersion({ quoteId: existingQuote.id, quoteData: { client_name: recipientBiz, status: quoteStatus }, inputs: { ...inputs, proposalName }, totals: { finalMRR: result.finalMRR, onboarding: inc.effectiveFee ?? result.onboarding }, lineItems: [], profile, note: label });
                      }
                    }}
                  />

                  {/* Cost model */}
                  {(() => {
                    // Flex block delivery cost: burdened rate × block hours
                    const burdenedRate   = parseFloat(settings?.burdened_hourly_rate || 125);
                    const flexLaborCost  = flexBlock ? flexBlock.hours * burdenedRate : 0;
                    const flexCommission = flexBlock && repProfile?.commission_rate
                      ? flexBlock.blockPrice * repProfile.commission_rate : 0;
                    const totalCostWithFlex  = result.totalCost + flexLaborCost;
                    const effectiveGM = effectiveFinalMRR > 0 ? 1 - totalCostWithFlex / effectiveFinalMRR : 0;
                    const effectiveCommission = result.commission + flexCommission;
                    const netAfterCommissionFlex = effectiveFinalMRR - effectiveCommission;
                    const gmAfterCommission = effectiveFinalMRR > 0 ? (netAfterCommissionFlex - totalCostWithFlex) / effectiveFinalMRR : 0;
                    const gcFlex = gmColor(effectiveGM);
                    const gbFlex = gmBg(effectiveGM);

                    return (
                      <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Cost Model</div>
                        <LI lbl="Tooling / stack" v={result.toolingCost} ind/>
                        <LI lbl={`Labor (${result.svcHrs.toFixed(1)} hrs × $${settings?.burdened_hourly_rate || 125}/hr)`} v={result.svcCost} ind/>
                        <LI lbl="Add-on delivery cost" v={result.addonCost} ind/>
                        {flexBlock && (
                          <LI lbl={`Flex Time labor (${flexBlock.hours} hrs × $${settings?.burdened_hourly_rate || 125}/hr)`} v={flexLaborCost} ind/>
                        )}
                        <LI lbl="Estimated Total Cost" v={totalCostWithFlex} bold/>
                        <div style={{ borderTop:'1px dashed #e5e7eb', margin:'5px 0' }}/>
                        {result.protectedAddonRevenue > 0 && (
                          <LI lbl="Protected product revenue (MSRP)" v={result.protectedAddonRevenue} ind muted/>
                        )}
                        {effectiveCommission > 0 && (
                          <LI lbl={`Commission — ${repProfile?.full_name || repProfile?.email?.split('@')[0] || 'Rep'} (${fmtPct(result.commissionRate)} on ${fmt$0(result.commissionBase + (flexBlock?.blockPrice||0))} commissionable MRR)`} v={-effectiveCommission} ind/>
                        )}
                        {effectiveCommission > 0 && (
                          <LI lbl="Net MRR after commission" v={netAfterCommissionFlex} bold/>
                        )}
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 6px', background:gbFlex, borderRadius:4, marginTop:4 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:gcFlex }}>Implied Gross Margin</span>
                          <span style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:gcFlex }}>{fmtPct(effectiveGM)}</span>
                        </div>
                        {effectiveCommission > 0 && (
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 6px', background:'#f8fafc', borderRadius:4, marginTop:3 }}>
                            <span style={{ fontSize:9, color:'#6b7280' }}>GM after commission</span>
                            <span style={{ fontSize:11, fontWeight:700, fontFamily:'DM Mono, monospace', color: gmAfterCommission > 0 ? '#166534' : '#dc2626' }}>
                              {fmtPct(gmAfterCommission)}
                            </span>
                          </div>
                        )}
                        {effectiveGM < 0.40 && <div style={{ marginTop:4, fontSize:9, color:'#92400e', background:'#fef3c7', padding:'3px 5px', borderRadius:3 }}>⚠ Below 40% — review scope or package.</div>}
                        {flexBlock && (
                          <div style={{ marginTop:4, fontSize:9, color:'#6b7280', fontStyle:'italic' }}>
                            * Includes {flexBlock.hours}hr flex block at {fmt$0(flexBlock.blockPrice)}/mo revenue and {fmt$0(flexLaborCost)}/mo burdened cost
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Payment surcharge notice */}
                  <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'8px 11px' }}>
                    <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6b7280', marginBottom:5 }}>💳 Payment Methods</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10 }}>
                        <span style={{ color:'#374151' }}>ACH / EFT</span>
                        <span style={{ fontWeight:700, color:'#166534' }}>{achFee === 0 ? 'Free' : `+$${achFee}`}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10 }}>
                        <span style={{ color:'#374151' }}>Check</span>
                        <span style={{ fontWeight:700, color:checkFee > 0 ? '#92400e' : '#166534' }}>{checkFee > 0 ? `+$${checkFee} admin fee` : 'Free'}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10 }}>
                        <span style={{ color:'#374151' }}>Credit Card</span>
                        <span style={{ fontWeight:700, color:'#dc2626' }}>+{(ccSurcharge*100).toFixed(0)}% surcharge</span>
                      </div>
                    </div>
                    {ccSurcharge > 0 && (
                      <div style={{ fontSize:8, color:'#9ca3af', marginTop:5, borderTop:'1px solid #f1f5f9', paddingTop:4 }}>
                        CC surcharge on this quote: ~{fmt$0(result.finalMRR * ccSurcharge)}/mo · ACH/EFT recommended
                      </div>
                    )}
                  </div>

                  {/* Deal summary */}
                  <div style={{ background:'#0f1e3c', borderRadius:6, padding:11 }}>
                    <div style={{ fontSize:8, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'#475569', marginBottom:6 }}>Deal Summary</div>
                    {[
                      ['Quote #', existingQuote?.quote_number||'Unsaved'],
                      proposalName&&['Proposal', proposalName],
                      ['Business Name', recipientBiz],
                      recipientContact&&['Contact', recipientContact],
                      ['Package', selectedPkg?.name],
                      ['Market', selectedMkt?.name],
                      ['Contract', `${inputs.contractTerm} months`],
                      inputs.mobileDevices > 0 && ['Mobile Devices', inputs.mobileDevices],
                      ['Monthly MRR', fmt$0(result.finalMRR)],
                      ['Onboarding', fmt$0(result.onboarding)],
                      ['Total Contract Value', fmt$0(result.finalMRR*inputs.contractTerm+(obIncentive?.effectiveFee ?? result.onboarding))],
                      hubDealId&&['HubSpot Deal', hubDealName||`#${hubDealId}`],
                    ].filter(Boolean).map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #1e3a5f' }}>
                        <span style={{ fontSize:9, color:'#64748b' }}>{k}</span>
                        <span style={{ fontSize:9, fontWeight:600, color:'white', fontFamily:typeof v==='number'||(typeof v==='string'&&v.startsWith('$'))?'DM Mono, monospace':'inherit', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Market Rate Analysis */}
                  <MarketRateCard
                    quoteId={existingQuote?.id}
                    clientZip={clientZip}
                    fallbackMarket={selectedMkt}
                    onRatesAccepted={(rates, suggestedTier, analysis) => {
                      // Capture the accepted rates so flex block + FlexTimeSelector use them
                      // (and so the snapshot can persist them on lock).
                      if (rates) setAcceptedRates(rates);
                      if (analysis?.pricing_multiplier != null) {
                        setPendingMultiplier({
                          multiplier: analysis.pricing_multiplier,
                          tier: analysis.market_tier,
                          city: analysis.city,
                          state: analysis.state,
                        });
                        setShowMktRecommend(true);
                      }
                      if (suggestedTier) setAcceptedMktTier(suggestedTier);
                    }}
                  />

                  {/* Flex Time Add-On */}
                  {selectedPkg && selectedPkg.flex_time_model !== 'all_inclusive' && (
                    <FlexTimeSelector
                      remoteRate={flexBlockRate}
                      settings={settings}
                      selectedHours={flexHours}
                      onChange={hrs => setFlexHours(hrs)}
                      onApply={async (hrs) => {
                        setFlexHours(hrs);
                        // Autosave when Apply is clicked
                        if (existingQuote?.id) {
                          const updatedInputs = { ...inputs, proposalName, flexHours: hrs || null };
                          await supabase.from('quotes').update({ inputs: updatedInputs }).eq('id', existingQuote.id);
                          await saveQuoteVersion({ quoteId: existingQuote.id, quoteData: { client_name: recipientBiz, status: quoteStatus }, inputs: updatedInputs, totals: { finalMRR: effectiveFinalMRR }, lineItems: [], profile, note: hrs ? `Flex Time block applied: ${hrs} hours` : 'Flex Time block removed' });
                          setSaveMsg('✓ Flex Time saved');
                          setTimeout(() => setSaveMsg(''), 2500);
                        }
                      }}
                      mode="managed"
                      packageModel={selectedPkg?.flex_time_model || 'none'}
                      includedMinsPerWS={selectedPkg?.flex_included_mins_per_ws || 0}
                      workstations={inputs.workstations || 0}
                      repCommissionRate={repProfile?.commission_rate ?? null}
                    />
                  )}

                  {/* Documents panel */}
                  <DocumentsPanel
                    analysis={selectedMkt ? { city: marketCity, state: marketState, market_tier: selectedMkt.tier_key, pricing_multiplier: aiMultiplier || selectedMkt?.pricing_multiplier || 1, rates: selectedMkt?.rates || {} } : null}
                    settings={settings}
                    clientName={recipientBiz}
                    recipientContact={recipientContact}
                    quoteId={existingQuote?.id}
                    quoteNumber={existingQuote?.quote_number}
                    sptProposalId={sptProposalId}
                    onSPTLinked={(pid) => setSptProposalId(pid)}
                    inputs={inputs}
                    pkg={selectedPkg}
                    products={products}
                    complianceKey={complianceKey}
                    result={result}
                    obIncentive={obIncentive}
                    quoteType="managed-it"
                    clientEmail={recipientEmail}
                    prepayAmount={result?.onboarding || 0}
                    hubspotDealId={hubDealId}
                  />

                  {/* Quote Notes Log */}
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
        }
        </div>{/* end inner scroll */}
      </div>

      {/* ── HUBSPOT MODAL ── */}
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function Sec({t,c,children}){return(<div style={{marginBottom:10}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:5,paddingBottom:3,borderBottom:'1px solid #f1f5f9'}}><div style={{width:2,height:11,background:c||'#2563eb',borderRadius:2}}/><span style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6b7280'}}>{t}</span></div>{children}</div>);}
function Grid2({children}){return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>{children}</div>;}
function Fld({lbl,sub,children}){return(<div style={{marginBottom:4}}><label style={{display:'block',fontSize:9,fontWeight:600,color:'#374151',marginBottom:1}}>{lbl}{sub&&<span style={{fontWeight:400,color:'#9ca3af',marginLeft:3,fontSize:9}}>{sub}</span>}</label>{children}</div>);}
function TI({value,onChange,placeholder}){return <input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder||''} style={{width:'100%',padding:'4px 7px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,outline:'none',color:'#374151'}}/>;}
function NI({v,s}){return <input type="number" value={v} min={0} onChange={e=>s(+e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,fontFamily:'DM Mono, monospace',color:'#1e3a5f',background:'#eff6ff',fontWeight:600,outline:'none'}}/>;}
function SI({v,s,opts}){return <select value={v} onChange={e=>s(e.target.value)} style={{width:'100%',padding:'4px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:11,background:'white',outline:'none',color:'#374151'}}>{opts.map(([a,b])=><option key={a} value={a}>{b}</option>)}</select>;}
function Tog({on,set,lbl,sub}){return(<div onClick={()=>set(!on)} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:4,cursor:'pointer',border:`1px solid ${on?'#93c5fd':'#e5e7eb'}`,background:on?'#eff6ff':'white',marginBottom:2}}><div style={{width:24,height:14,borderRadius:7,flexShrink:0,background:on?'#2563eb':'#d1d5db',position:'relative'}}><div style={{position:'absolute',top:2,left:on?12:2,width:10,height:10,borderRadius:'50%',background:'white',transition:'left .12s'}}/></div><div><span style={{fontSize:10,fontWeight:600,color:on?'#1e40af':'#374151'}}>{lbl}</span>{sub&&<span style={{fontSize:9,color:'#9ca3af',marginLeft:4}}>{sub}</span>}</div></div>);}
function LI({lbl,v,ind,bold,hi,muted}){if(v===0&&!bold&&!hi)return null;return(<div style={{display:'flex',justifyContent:'space-between',padding:hi?'5px 7px':'1px 2px',marginLeft:ind?7:0,borderRadius:hi?4:0,background:hi?'#dcfce7':'transparent',borderTop:bold&&!hi?'1px solid #f3f4f6':'none',marginTop:bold&&!hi?2:0}}><span style={{fontSize:hi?9:8,fontWeight:bold||hi?700:400,color:hi?'#166534':muted?'#9ca3af':bold?'#374151':'#6b7280'}}>{lbl}</span><span style={{fontSize:hi?11:9,fontWeight:bold||hi?700:500,fontFamily:'DM Mono, monospace',color:hi?'#166534':v<0?'#dc2626':bold?'#111827':'#374151'}}>{v<0?`(${fmt$(-v)})`:fmt$(v)}</span></div>);}
function SH({l}){return <div style={{fontSize:8,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'#9ca3af',padding:'4px 2px 1px',marginTop:2}}>{l}</div>;}
function catColor(cat){const m={'Cloud & Email Security':'#0891b2','Endpoint Security':'#7c3aed','Backup & Recovery':'#92400e','Security Awareness':'#065f46','SIEM & SOC':'#0891b2','Network & Connectivity':'#0f766e','Strategic Advisory':'#7c3aed'};return m[cat]||'#374151';}
