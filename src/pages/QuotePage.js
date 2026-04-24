import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { calcQuote, lookupZip, fmt$, fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';
import { searchDeals, getDealFull, createDeal, updateDeal } from '../lib/hubspot';

const DEF_INPUTS = {
  users:0, sharedMailboxes:0, workstations:0, endpoints:0,
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

  // ── Quote metadata ────────────────────────────────────────────────────────
  const [proposalName,    setProposalName]    = useState('');
  const [recipientBiz,    setRecipientBiz]    = useState('');
  const [recipientContact,setRecipientContact]= useState('');
  const [recipientEmail,  setRecipientEmail]  = useState('');
  const [recipientAddress,setRecipientAddress]= useState('');
  const [clientZip,       setClientZip]       = useState('');
  const [zipResult,       setZipResult]       = useState(null);
  const [zipApplied,      setZipApplied]      = useState(false);

  // ── Quote config ──────────────────────────────────────────────────────────
  const [inputs,      setInputs]      = useState(DEF_INPUTS);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [selectedMkt, setSelectedMkt] = useState(null);
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [notes,       setNotes]       = useState('');
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

  // Load existing quote
  useEffect(() => {
    if (!id || configLoading) return;
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
      setNotes(data.notes || '');
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
    const allInputs = { ...inputs, proposalName, recipientContact, recipientEmail, recipientAddress, hubspotDealName: hubDealName };
    const totals = result ? {
      finalMRR: result.finalMRR, onboarding: result.onboarding,
      impliedGM: result.impliedGM, totalCost: result.totalCost,
      contractValue: result.finalMRR * inputs.contractTerm + result.onboarding
    } : {};
    const payload = {
      client_name: recipientBiz, client_zip: clientZip,
      market_tier: selectedMkt?.tier_key, package_name: selectedPkg?.name,
      status: quoteStatus, notes, inputs: allInputs,
      line_items: result?.lineItems || [], totals,
      hubspot_deal_id: hubDealId || null,
      hubspot_deal_url: hubDealUrl || null,
      updated_by: profile?.id,
    };
    if (!existingQuote) payload.created_by = profile?.id;

    const { data, error } = existingQuote
      ? await supabase.from('quotes').update(payload).eq('id', existingQuote.id).select().single()
      : await supabase.from('quotes').insert(payload).select().single();

    if (error) { setSaveMsg('Error: ' + error.message); setSaving(false); return; }

    await logActivity({ action: existingQuote ? 'UPDATE' : 'CREATE', entityType: 'quote', entityId: data.id, entityName: recipientBiz,
      changes: { status: quoteStatus, mrr: totals.finalMRR, package: selectedPkg?.name } });

    setSaveMsg(`Saved as ${data.quote_number}`);
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
      onboarding_fee:   result.onboarding,
      contract_value:   result.finalMRR * inputs.contractTerm + result.onboarding,
      discount_rate:    result.discRate,
      hubspot_deal_id:  hubDealId,
      notes,
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${existingQuote?.quote_number || 'quote'}_spt.json`; a.click();
    URL.revokeObjectURL(url);
  }

  const result = configLoading || !selectedPkg || !selectedMkt ? null
    : calcQuote({ inputs, pkg: selectedPkg, marketTier: selectedMkt, products, settings });

  if (configLoading) return <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>Loading pricing data...</div>;

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

        {/* ── HubSpot connection bar ── */}
        <div style={{ marginBottom:10, padding:'8px 10px', background: hubDealId?'#fff7ed':'#f8fafc', border:`1px solid ${hubDealId?'#fed7aa':'#e5e7eb'}`, borderRadius:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:18, height:18, background:'#ff7a59', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color:'white', fontSize:10, fontWeight:700 }}>H</span>
              </div>
              {hubDealId
                ? <span style={{ fontSize:11, fontWeight:600, color:'#c2410c' }}>{hubDealName || `Deal #${hubDealId}`}</span>
                : <span style={{ fontSize:11, color:'#6b7280' }}>Not connected to HubSpot</span>}
            </div>
            <div style={{ display:'flex', gap:4 }}>
              {hubDealId && (
                <>
                  <a href={hubDealUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'#c2410c', fontWeight:600 }}>View →</a>
                  <button onClick={syncToDeal} disabled={hubSyncing} style={{ fontSize:10, padding:'2px 7px', background:'#dcfce7', color:'#166534', border:'none', borderRadius:3, cursor:'pointer', fontWeight:600 }}>
                    {hubSyncing ? '...' : 'Sync'}
                  </button>
                  <button onClick={() => { setHubDealId(''); setHubDealUrl(''); setHubDealName(''); setHubMsg(''); }} style={{ fontSize:10, color:'#dc2626', background:'none', border:'none', cursor:'pointer' }}>✕</button>
                </>
              )}
              <button onClick={() => { setHubModal(true); setHubMsg(''); setHubResults([]); setHubSearch(recipientBiz||''); }}
                style={{ fontSize:10, padding:'3px 8px', background:'#0f1e3c', color:'white', border:'none', borderRadius:3, cursor:'pointer', fontWeight:600 }}>
                {hubDealId ? 'Change' : 'Connect Deal'}
              </button>
            </div>
          </div>
          {hubMsg && <div style={{ marginTop:4, fontSize:10, color: hubMsg.startsWith('✓')?'#166534':'#dc2626', fontWeight:500 }}>{hubMsg}</div>}
        </div>

        {/* ── Client / Proposal fields ── */}
        <Sec t="Proposal Details" c="#0f1e3c">
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
          {marketTiers.map(t => (
            <div key={t.id} onClick={() => setSelectedMkt(t)} style={{ padding:'5px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedMkt?.id===t.id?'2':'1'}px solid ${selectedMkt?.id===t.id?(mktColor[t.tier_key]||'#374151'):'#e5e7eb'}`, background:selectedMkt?.id===t.id?(mktBg[t.tier_key]||'#f3f4f6'):'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, fontWeight:700, color:mktColor[t.tier_key] }}>{t.name}</span>
              <span style={{ fontSize:9, color:'#6b7280', fontFamily:'DM Mono, monospace' }}>{t.labor_multiplier<1?`-${Math.round((1-t.labor_multiplier)*100)}% labor`:'baseline'}</span>
            </div>
          ))}
        </Sec>

        {/* Package */}
        <Sec t="Managed IT Package" c="#2563eb">
          {packages.map(p => (
            <div key={p.id} onClick={() => setSelectedPkg(p)} style={{ padding:'6px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`${selectedPkg?.id===p.id?'2':'1'}px solid ${selectedPkg?.id===p.id?'#2563eb':'#e5e7eb'}`, background:selectedPkg?.id===p.id?'#eff6ff':'white' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:10, fontWeight:700, color:selectedPkg?.id===p.id?'#1e40af':'#374151' }}>{p.name}</span>
                <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', color:'#6b7280', background:'#f3f4f6', padding:'1px 4px', borderRadius:3 }}>${p.ws_rate}/WS · ${p.user_rate}/user</span>
              </div>
              <div style={{ fontSize:8, color:'#9ca3af', marginTop:1 }}>{p.ideal_desc}</div>
            </div>
          ))}
          {result?.recommended && result.recommended!==selectedPkg?.name && (
            <div style={{ padding:'4px 7px', background:'#fefce8', border:'1px solid #fde68a', borderRadius:3, fontSize:9, color:'#92400e', marginTop:4 }}>
              ⚡ Recommended: <strong>{result.recommended}</strong>
            </div>
          )}
        </Sec>

        {/* People & Devices */}
        <Sec t="People & Devices" c="#7c3aed">
          <Grid2>
            <Fld lbl="Users" sub="humans"><NI v={inputs.users} s={v=>set('users',v)}/></Fld>
            <Fld lbl="Shared Mailboxes" sub="billing@ etc"><NI v={inputs.sharedMailboxes} s={v=>set('sharedMailboxes',v)}/></Fld>
            <Fld lbl="Workstations" sub="managed"><NI v={inputs.workstations} s={v=>set('workstations',v)}/></Fld>
            <Fld lbl="Total Devices" sub="density/SIEM"><NI v={inputs.endpoints} s={v=>set('endpoints',v)}/></Fld>
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
            {catProducts.map(p => {
              const gm = p.sell_price > 0 ? (1-p.cost_price/p.sell_price) : 0;
              const isExclusive = !!p.exclusive_group;
              const sel = isSelected(p.id);
              return (
                <div key={p.id} onClick={() => toggleProduct(p.id)}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 7px', borderRadius:4, cursor:'pointer', marginBottom:2, border:`1px solid ${sel?'#93c5fd':'#e5e7eb'}`, background:sel?'#eff6ff':'white' }}>
                  {isExclusive
                    ? <div style={{ width:13, height:13, borderRadius:'50%', border:`2px solid ${sel?'#2563eb':'#d1d5db'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {sel && <div style={{ width:5, height:5, borderRadius:'50%', background:'#2563eb' }}/>}
                      </div>
                    : <div style={{ width:22, height:13, borderRadius:7, background:sel?'#2563eb':'#d1d5db', position:'relative', flexShrink:0 }}>
                        <div style={{ position:'absolute', top:2, left:sel?11:2, width:9, height:9, borderRadius:'50%', background:'white', transition:'left .1s' }}/>
                      </div>
                  }
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:sel?'#1e40af':'#374151' }}>{p.name}</div>
                    {p.description && <div style={{ fontSize:8, color:'#9ca3af' }}>{p.description}</div>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:10, fontFamily:'DM Mono, monospace', fontWeight:600, color:'#374151' }}>${p.sell_price}/{p.qty_driver}</div>
                    <div style={{ fontSize:8, color:'#9ca3af' }}>{(gm*100).toFixed(0)}% GM</div>
                  </div>
                </div>
              );
            })}
          </Sec>
        ))}

        {/* Deal Terms */}
        <Sec t="Deal Terms" c="#374151">
          <Grid2>
            <Fld lbl="Contract Term"><SI v={inputs.contractTerm} s={v=>set('contractTerm',+v)} opts={[['12','12 mo (5%)'],['24','24 mo (10%)'],['36','36 mo (20%)']]}/></Fld>
            <Fld lbl="Status"><SI v={quoteStatus} s={setQuoteStatus} opts={[['draft','Draft'],['sent','Sent'],['won','Won'],['lost','Lost'],['expired','Expired']]}/></Fld>
          </Grid2>
          <div style={{ marginTop:4 }}>
            <Tog on={inputs.execReporting} set={v=>set('execReporting',v)} lbl="Executive Reporting Required" sub="Triggers Enterprise recommendation"/>
          </div>
        </Sec>

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
          {saveMsg && <div style={{ fontSize:11, color:'#166534', fontWeight:600, marginTop:5 }}>{saveMsg}</div>}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', background:'#f8fafc', minWidth:0 }}>
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
                    {result.mktMult<1 && <span style={{ color:'#2563eb', marginLeft:4 }}>({Math.round((1-result.mktMult)*100)}% market adj.)</span>}
                  </div>
                  {recipientContact && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>Contact: {recipientContact}{recipientEmail?` · ${recipientEmail}`:''}</div>}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:8, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Final Monthly MRR</div>
                  <div style={{ fontSize:22, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#0f1e3c' }}>{fmt$0(result.finalMRR)}</div>
                </div>
              </div>

              {/* KPI cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7, marginBottom:10 }}>
                {[['Monthly MRR',fmt$0(result.finalMRR),'#0f1e3c','#f0f4ff'],['Onboarding',fmt$0(result.onboarding),'#0f766e','#f0fdf4'],['Implied GM',fmtPct(result.impliedGM),gc,gb],['Contract TCV',fmt$0(result.finalMRR*inputs.contractTerm+result.onboarding),'#6d28d9','#faf5ff']].map(([l,v,co,bg])=>(
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
              {(() => {
                const fmins = selectedPkg?.flex_minutes_per_ws ?? 0;
                const flabel = selectedPkg?.flex_label || 'Flex Time (Onsite / Tier 2 Support)';
                const ws = inputs.workstations;

                if (fmins === -1) {
                  // Unlimited
                  return (
                    <div style={{ marginBottom:10, padding:'10px 14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'#166534' }}>∞ Unlimited {flabel}</div>
                        <div style={{ fontSize:10, color:'#4ade80', marginTop:1 }}>Included with this package — no cap on onsite or escalated support time</div>
                      </div>
                      <div style={{ background:'#166534', color:'white', fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:5, flexShrink:0 }}>Unlimited</div>
                    </div>
                  );
                }

                if (fmins === 0 || !fmins) {
                  // Not included
                  return (
                    <div style={{ marginBottom:10, padding:'10px 14px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'#6b7280' }}>{flabel}</div>
                        <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>Not included with this package — available by request</div>
                      </div>
                      <div style={{ background:'#f3f4f6', color:'#6b7280', fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:5, flexShrink:0, border:'1px solid #e5e7eb' }}>By Request</div>
                    </div>
                  );
                }

                // Calculated flex hours
                const totalMins = ws * fmins;
                const totalHrs  = totalMins / 60;
                const pctFull   = Math.min(totalHrs / (ws * 2) * 100, 100); // progress bar relative to 2hrs/WS max

                return (
                  <div style={{ marginBottom:10, padding:'12px 14px', background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:7 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'#1e40af' }}>{flabel}</div>
                        <div style={{ fontSize:10, color:'#3b82f6', marginTop:1 }}>
                          {ws} workstation{ws!==1?'s':''} × {fmins} min = <strong>{totalHrs % 1 === 0 ? totalHrs : totalHrs.toFixed(1)} hrs/month</strong> · non-rollover
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                        <div style={{ fontSize:20, fontWeight:700, fontFamily:'DM Mono, monospace', color:'#1e40af', lineHeight:1 }}>
                          {totalHrs % 1 === 0 ? totalHrs : totalHrs.toFixed(1)}
                        </div>
                        <div style={{ fontSize:9, color:'#3b82f6', fontWeight:600 }}>hrs / month</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height:6, background:'#bfdbfe', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pctFull}%`, background:'#2563eb', borderRadius:3, transition:'width 0.3s' }}/>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                      <span style={{ fontSize:9, color:'#93c5fd' }}>{fmins} min per workstation</span>
                      <span style={{ fontSize:9, color:'#93c5fd' }}>resets monthly</span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Line items */}
                <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Monthly Recurring Revenue</div>
                  <SH l="Managed IT Services"/>
                  <LI lbl={`Workstations (${inputs.workstations} × $${selectedPkg?.ws_rate})`} v={result.wB} ind/>
                  <LI lbl={`User helpdesk (${inputs.users} × $${selectedPkg?.user_rate})`} v={result.uB} ind/>
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
                        {items.map(li=><LI key={li.product_id} lbl={`${li.product_name} (${li.qty} × $${li.sell_price})`} v={li.revenue} ind/>)}
                      </span>
                    ));
                  })()}
                  {result.addonRevenue>0&&<LI lbl="Add-ons Subtotal" v={result.addonRevenue} bold/>}
                  <div style={{ margin:'5px 0', borderTop:'2px solid #0f1e3c' }}/>
                  <LI lbl="Operational Subtotal" v={result.opSubtotal} bold/>
                  {result.compMult!==1&&<LI lbl={`Risk multiplier: ${result.compMult.toFixed(2)}×`} v={result.riskAdjMRR} muted/>}
                  {result.discount<0&&<LI lbl={`${Math.round(result.discRate*100)}% contract discount`} v={result.discount} ind/>}
                  <LI lbl="✦ Final Monthly MRR" v={result.finalMRR} hi/>
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

                  {/* Cost model */}
                  <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:11 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>Cost Model</div>
                    <LI lbl="Tooling / stack" v={result.toolingCost} ind/>
                    <LI lbl={`Labor (${result.svcHrs.toFixed(1)} hrs${result.mktMult<1?' × '+fmtPct(result.mktMult):''})`} v={result.svcCost} ind/>
                    <LI lbl="Add-on delivery cost" v={result.addonCost} ind/>
                    <LI lbl="Estimated Total Cost" v={result.totalCost} bold/>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 6px', background:gb, borderRadius:4, marginTop:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:gc }}>Implied Gross Margin</span>
                      <span style={{ fontSize:13, fontWeight:700, fontFamily:'DM Mono, monospace', color:gc }}>{fmtPct(result.impliedGM)}</span>
                    </div>
                    {result.impliedGM<0.40&&<div style={{ marginTop:4, fontSize:9, color:'#92400e', background:'#fef3c7', padding:'3px 5px', borderRadius:3 }}>⚠ Below 40% — review scope or package.</div>}
                  </div>

                  {/* Deal summary */}
                  <div style={{ background:'#0f1e3c', borderRadius:6, padding:11 }}>
                    <div style={{ fontSize:8, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'#475569', marginBottom:6 }}>Deal Summary</div>
                    {[
                      ['Quote #', existingQuote?.quote_number||'Unsaved'],
                      proposalName&&['Proposal', proposalName],
                      ['Client', recipientBiz],
                      recipientContact&&['Contact', recipientContact],
                      ['Package', selectedPkg?.name],
                      ['Market', selectedMkt?.name],
                      ['Contract', `${inputs.contractTerm} months`],
                      ['Monthly MRR', fmt$0(result.finalMRR)],
                      ['Onboarding', fmt$0(result.onboarding)],
                      ['Total Contract Value', fmt$0(result.finalMRR*inputs.contractTerm+result.onboarding)],
                      hubDealId&&['HubSpot Deal', hubDealName||`#${hubDealId}`],
                    ].filter(Boolean).map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #1e3a5f' }}>
                        <span style={{ fontSize:9, color:'#64748b' }}>{k}</span>
                        <span style={{ fontSize:9, fontWeight:600, color:'white', fontFamily:typeof v==='number'||(typeof v==='string'&&v.startsWith('$'))?'DM Mono, monospace':'inherit', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  <div style={{ background:'white', borderRadius:6, border:'1px solid #e5e7eb', padding:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                      <div style={{ width:2, height:11, background:'#6b7280', borderRadius:2 }}/>
                      <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#6b7280' }}>Internal Notes</span>
                    </div>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add notes about this quote — scope discussions, client preferences, follow-up items, pricing rationale..."
                      style={{ width:'100%', minHeight:120, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:5, fontSize:12, resize:'vertical', outline:'none', lineHeight:1.6, color:'#374151', fontFamily:'DM Sans, system-ui, sans-serif' }}
                    />
                    <div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>
                      Notes are saved with the quote and visible to all team members.
                    </div>
                  </div>

                </div>
              </div>
            </div>
        }
      </div>

      {/* ── HUBSPOT MODAL ── */}
      {hubModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
          <div style={{ background:'white', borderRadius:10, padding:24, width:520, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:28, height:28, background:'#ff7a59', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ color:'white', fontSize:14, fontWeight:700 }}>H</span>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0f1e3c' }}>Connect HubSpot Deal</div>
                  <div style={{ fontSize:11, color:'#6b7280' }}>Search open deals — client details will auto-populate</div>
                </div>
              </div>
              <button onClick={() => setHubModal(false)} style={{ background:'none', border:'none', fontSize:20, color:'#6b7280', cursor:'pointer', lineHeight:1 }}>×</button>
            </div>

            {/* Search */}
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              <input value={hubSearch} onChange={e=>setHubSearch(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&searchHubspot()}
                placeholder="Search by client or deal name..."
                autoFocus
                style={{ flex:1, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:5, fontSize:13, outline:'none' }}/>
              <button onClick={searchHubspot} disabled={hubLoading}
                style={{ padding:'8px 14px', background:'#ff7a59', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity:hubLoading?0.7:1 }}>
                {hubLoading ? '...' : 'Search'}
              </button>
            </div>

            {/* Message */}
            {hubMsg && (
              <div style={{ padding:'6px 10px', borderRadius:5, fontSize:12, marginBottom:8, fontWeight:500,
                background:hubMsg.startsWith('✓')?'#dcfce7':'#fef2f2',
                color:hubMsg.startsWith('✓')?'#166534':'#dc2626',
                border:`1px solid ${hubMsg.startsWith('✓')?'#bbf7d0':'#fecaca'}` }}>
                {hubMsg}
              </div>
            )}

            {/* Results */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {hubResults.length===0 && !hubMsg && (
                <div style={{ textAlign:'center', padding:24, color:'#9ca3af', fontSize:12 }}>
                  Search for a deal above — showing open deals only.<br/>
                  <span style={{ fontSize:11 }}>Client name, address, and contact will auto-populate.</span>
                </div>
              )}
              {hubResults.map(d => (
                <div key={d.id} onClick={() => { connectDeal(d); setHubModal(false); }}
                  style={{ padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:6, marginBottom:6, cursor:'pointer', transition:'background 0.1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f0f7ff'}
                  onMouseLeave={e=>e.currentTarget.style.background='white'}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0f1e3c' }}>{d.properties.dealname}</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                        Stage: {d.properties.dealstage_label || d.properties.dealstage}
                        {d.properties.amount && ` · $${parseFloat(d.properties.amount).toLocaleString()}`}
                        {d.properties.closedate && ` · Close: ${new Date(d.properties.closedate).toLocaleDateString()}`}
                      </div>
                    </div>
                    <span style={{ fontSize:11, color:'#2563eb', fontWeight:600, flexShrink:0, marginLeft:8 }}>Select →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
