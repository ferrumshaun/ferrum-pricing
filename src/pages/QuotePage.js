import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, logActivity } from '../lib/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { calcQuote, lookupZip, fmt$, fmt$0, fmtPct, gmColor, gmBg } from '../lib/pricing';

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

  const [inputs,      setInputs]      = useState(DEF_INPUTS);
  const [clientName,  setClientName]  = useState('');
  const [clientZip,   setClientZip]   = useState('');
  const [zipResult,   setZipResult]   = useState(null);
  const [zipApplied,  setZipApplied]  = useState(false);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [selectedMkt, setSelectedMkt] = useState(null);
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [notes,       setNotes]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState('');
  const [hubspotOpen, setHubspotOpen] = useState(false);
  const [hubspotId,   setHubspotId]   = useState('');
  const [existingQuote, setExistingQuote] = useState(null);

  // Load existing quote if editing
  useEffect(() => {
    if (!id || configLoading) return;
    supabase.from('quotes').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setExistingQuote(data);
      setClientName(data.client_name || '');
      setClientZip(data.client_zip || '');
      setQuoteStatus(data.status || 'draft');
      setNotes(data.notes || '');
      setHubspotId(data.hubspot_deal_id || '');
      if (data.inputs) setInputs({ ...DEF_INPUTS, ...data.inputs });
      if (data.package_name && packages.length) setSelectedPkg(packages.find(p => p.name === data.package_name));
      if (data.market_tier  && marketTiers.length) setSelectedMkt(marketTiers.find(t => t.tier_key === data.market_tier));
    });
  }, [id, configLoading, packages, marketTiers]);

  // Default package/market
  useEffect(() => {
    if (!selectedPkg && packages.length) setSelectedPkg(packages[1] || packages[0]);
    if (!selectedMkt && marketTiers.length) setSelectedMkt(marketTiers.find(t => t.tier_key === 'mid_market') || marketTiers[0]);
  }, [packages, marketTiers]);

  const set = useCallback((k, v) => setInputs(prev => ({ ...prev, [k]: v })), []);

  // Zip lookup
  function checkZip(val) {
    setClientZip(val); setZipApplied(false);
    const r = val.length >= 3 ? lookupZip(val) : null;
    setZipResult(r);
  }
  function applyZip() {
    if (!zipResult) return;
    const tier = marketTiers.find(t => t.tier_key === zipResult.tier);
    if (tier) setSelectedMkt(tier);
    setZipApplied(true);
  }

  // Product selection with exclusive group handling
  function toggleProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setInputs(prev => {
      let selected = [...(prev.selectedProducts || [])];
      if (selected.includes(productId)) {
        selected = selected.filter(id => id !== productId);
      } else {
        // Remove any other product in same exclusive group
        if (product.exclusive_group) {
          const groupIds = exclusiveGroups[product.exclusive_group] || [];
          selected = selected.filter(id => !groupIds.includes(id));
        }
        selected.push(productId);
      }
      return { ...prev, selectedProducts: selected };
    });
  }

  function isSelected(productId) { return (inputs.selectedProducts || []).includes(productId); }

  // Calc
  const result = configLoading || !selectedPkg || !selectedMkt ? null
    : calcQuote({ inputs, pkg: selectedPkg, marketTier: selectedMkt, products, settings });

  // Package recommendation
  const recommended = result?.recommended;

  // Save quote
  async function saveQuote() {
    if (!clientName.trim()) { setSaveMsg('Please enter a client name.'); return; }
    setSaving(true); setSaveMsg('');
    const totals = result ? {
      finalMRR: result.finalMRR, onboarding: result.onboarding,
      impliedGM: result.impliedGM, totalCost: result.totalCost,
      contractValue: result.finalMRR * inputs.contractTerm + result.onboarding
    } : {};
    const payload = {
      client_name: clientName, client_zip: clientZip,
      market_tier: selectedMkt?.tier_key, package_name: selectedPkg?.name,
      status: quoteStatus, notes, inputs,
      line_items: result?.lineItems || [], totals,
      hubspot_deal_id: hubspotId || null,
      updated_by: profile?.id,
    };
    if (!existingQuote) payload.created_by = profile?.id;

    const { data, error } = existingQuote
      ? await supabase.from('quotes').update(payload).eq('id', existingQuote.id).select().single()
      : await supabase.from('quotes').insert(payload).select().single();

    if (error) { setSaveMsg('Error saving: ' + error.message); setSaving(false); return; }

    await logActivity({ action: existingQuote ? 'UPDATE' : 'CREATE', entityType: 'quote', entityId: data.id, entityName: clientName,
      changes: { status: quoteStatus, mrr: totals.finalMRR, package: selectedPkg?.name } });

    setSaveMsg(`Saved as ${data.quote_number}`);
    setSaving(false);
    if (!existingQuote) navigate(`/quotes/${data.id}`, { replace: true });
  }

  // Export JSON for Smart Pricing Table
  function exportSPT() {
    if (!result) return;
    const json = {
      quote_number: existingQuote?.quote_number || 'DRAFT',
      client: clientName,
      date: new Date().toISOString().split('T')[0],
      package: selectedPkg?.name,
      market: selectedMkt?.name,
      contract_term_months: inputs.contractTerm,
      line_items: [
        { description: `Managed IT — ${selectedPkg?.name}`, quantity: 1, unit_price: result.itSubtotal, total: result.itSubtotal, recurring: true },
        ...result.lineItems.map(li => ({ description: li.product_name, quantity: li.qty, unit_price: li.sell_price, total: li.revenue, recurring: true })),
      ],
      monthly_mrr: result.finalMRR,
      onboarding_fee: result.onboarding,
      contract_value: result.finalMRR * inputs.contractTerm + result.onboarding,
      discount_rate: result.discRate,
      notes,
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${existingQuote?.quote_number || 'quote'}_spt.json`; a.click();
    URL.revokeObjectURL(url);
    logActivity({ action: 'EXPORT_SPT', entityType: 'quote', entityId: existingQuote?.id, entityName: clientName });
  }

  if (configLoading) return <div style={{ padding: 24, color: '#6b7280', fontSize: 12 }}>Loading pricing data...</div>;

  const mktColor = { major_metro: '#1e40af', mid_market: '#065f46', small_market: '#6d28d9' };
  const mktBg    = { major_metro: '#dbeafe', mid_market: '#d1fae5', small_market: '#ede9fe' };
  const gc = result ? gmColor(result.impliedGM) : '#374151';
  const gb = result ? gmBg(result.impliedGM) : '#f9fafb';

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── LEFT PANEL ── */}
      <div style={{ width: 340, flexShrink: 0, background: 'white', borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: '12px 14px' }}>

        {/* Quote header */}
        {existingQuote && (
          <div style={{ marginBottom: 8, padding: '6px 8px', background: '#f0f7ff', borderRadius: 5, fontSize: 11, color: '#1e40af', fontWeight: 600 }}>
            {existingQuote.quote_number}
          </div>
        )}

        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name..."
          style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 13, fontWeight: 600, outline: 'none', color: '#0f1e3c', marginBottom: 10 }} />

        {/* Zip lookup */}
        <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#1e40af', marginBottom: 6 }}>📍 Client Location</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={clientZip} onChange={e => checkZip(e.target.value)} placeholder="Enter zip code" maxLength={10}
              style={{ flex: 1, padding: '6px 8px', border: '1px solid #93c5fd', borderRadius: 5, fontSize: 12, outline: 'none', fontFamily: 'DM Mono, monospace', fontWeight: 600 }} />
            {zipResult && !zipApplied && (
              <button onClick={applyZip} style={{ padding: '6px 10px', background: mktColor[zipResult.tier] || '#374151', color: 'white', border: 'none', borderRadius: 5, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>Apply →</button>
            )}
          </div>
          {zipResult && (
            <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 4, background: mktBg[zipResult.tier] || '#f3f4f6', fontSize: 10 }}>
              <span style={{ fontWeight: 700, color: mktColor[zipResult.tier] }}>{zipResult.name || `ZIP ${zipResult.zip}`} → {marketTiers.find(t => t.tier_key === zipResult.tier)?.name}</span>
              {zipApplied && <span style={{ marginLeft: 6, color: '#166534', fontWeight: 700 }}>✓ Applied</span>}
            </div>
          )}
        </div>

        {/* Market tier */}
        <Sec t="Market Tier" c="#0f1e3c">
          {marketTiers.map(t => (
            <div key={t.id} onClick={() => setSelectedMkt(t)} style={{ padding: '5px 8px', borderRadius: 4, cursor: 'pointer', marginBottom: 2, border: `${selectedMkt?.id === t.id ? '2' : '1'}px solid ${selectedMkt?.id === t.id ? (mktColor[t.tier_key]||'#374151') : '#e5e7eb'}`, background: selectedMkt?.id === t.id ? (mktBg[t.tier_key]||'#f3f4f6') : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: mktColor[t.tier_key] }}>{t.name}</span>
              <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'DM Mono, monospace' }}>{t.labor_multiplier < 1 ? `-${Math.round((1-t.labor_multiplier)*100)}% labor` : 'baseline'}</span>
            </div>
          ))}
        </Sec>

        {/* Package */}
        <Sec t="Managed IT Package" c="#2563eb">
          {packages.map(p => (
            <div key={p.id} onClick={() => setSelectedPkg(p)} style={{ padding: '6px 8px', borderRadius: 4, cursor: 'pointer', marginBottom: 2, border: `${selectedPkg?.id === p.id ? '2' : '1'}px solid ${selectedPkg?.id === p.id ? '#2563eb' : '#e5e7eb'}`, background: selectedPkg?.id === p.id ? '#eff6ff' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: selectedPkg?.id === p.id ? '#1e40af' : '#374151' }}>{p.name}</span>
                <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: '#6b7280', background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>${p.ws_rate}/WS · ${p.user_rate}/user</span>
              </div>
              <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 1 }}>{p.ideal_desc}</div>
            </div>
          ))}
          {recommended && recommended !== selectedPkg?.name && (
            <div style={{ padding: '4px 7px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 3, fontSize: 9, color: '#92400e', marginTop: 4 }}>
              ⚡ Recommended: <strong>{recommended}</strong>
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

        {/* Add-on Products — rendered from DB */}
        {Object.entries(productsByCategory).map(([cat, catProducts]) => (
          <Sec key={cat} t={cat} c={catColor(cat)}>
            {catProducts.map(p => {
              const gm = p.sell_price > 0 ? (1 - p.cost_price / p.sell_price) : 0;
              const isExclusive = !!p.exclusive_group;
              const selected = isSelected(p.id);
              return (
                <div key={p.id} onClick={() => toggleProduct(p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 4, cursor: 'pointer', marginBottom: 2, border: `1px solid ${selected ? '#93c5fd' : '#e5e7eb'}`, background: selected ? '#eff6ff' : 'white' }}>
                  {isExclusive
                    ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${selected ? '#2563eb' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#2563eb' }}/>}
                      </div>
                    : <div style={{ width: 22, height: 13, borderRadius: 7, background: selected ? '#2563eb' : '#d1d5db', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: selected ? 11 : 2, width: 9, height: 9, borderRadius: '50%', background: 'white', transition: 'left .1s' }}/>
                      </div>
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: selected ? '#1e40af' : '#374151' }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 8, color: '#9ca3af' }}>{p.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#374151' }}>${p.sell_price}/{p.qty_driver}</div>
                    <div style={{ fontSize: 8, color: '#9ca3af' }}>{(gm*100).toFixed(0)}% GM</div>
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
          <div style={{ marginTop: 4 }}>
            <Tog on={inputs.execReporting} set={v=>set('execReporting',v)} lbl="Executive Reporting Required" sub="Triggers Enterprise recommendation"/>
          </div>
        </Sec>

        {/* Notes */}
        <Sec t="Notes" c="#6b7280">
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Internal notes..."
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, resize: 'vertical', outline: 'none' }}/>
        </Sec>

        {/* Save / Export */}
        <div style={{ padding: 10, background: '#f8fafc', borderRadius: 5, border: '1px solid #e5e7eb', marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: saveMsg ? 8 : 0 }}>
            <button onClick={saveQuote} disabled={saving} style={{ flex: 1, padding: '6px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : existingQuote ? 'Update Quote' : 'Save Quote'}
            </button>
            <button onClick={() => setHubspotOpen(h=>!h)} style={{ padding: '6px 8px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, fontSize: 10, color: '#c2410c', fontWeight: 600 }}>
              HubSpot
            </button>
            {result && (
              <button onClick={exportSPT} style={{ padding: '6px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, fontSize: 10, color: '#166534', fontWeight: 600 }}>
                Export JSON
              </button>
            )}
          </div>
          {saveMsg && <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>{saveMsg}</div>}

          {/* HubSpot panel */}
          {hubspotOpen && (
            <div style={{ marginTop: 8, padding: 10, background: 'white', border: '1px solid #fed7aa', borderRadius: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', marginBottom: 6 }}>HubSpot Deal</div>
              <input value={hubspotId} onChange={e=>setHubspotId(e.target.value)} placeholder="Existing Deal ID (optional)"
                style={{ width: '100%', padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, outline: 'none', marginBottom: 6 }}/>
              <div style={{ fontSize: 9, color: '#9ca3af' }}>Leave blank to create new deal on save. Or paste an existing deal ID to link.</div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Quote Output ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: '#f8fafc', minWidth: 0 }}>
        {!result ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 80, fontSize: 12 }}>Enter client details to generate quote</div>
        ) : (
          <div className="fade-in">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f1e3c' }}>{clientName || 'Quote Preview'}</h2>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                  {selectedPkg?.name} · {selectedMkt?.name} · {inputs.contractTerm}-month term
                  {result.mktMult < 1 && <span style={{ color: '#2563eb', marginLeft: 4 }}>({Math.round((1-result.mktMult)*100)}% market adj.)</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>Final Monthly MRR</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#0f1e3c' }}>{fmt$0(result.finalMRR)}</div>
              </div>
            </div>

            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 10 }}>
              {[['Monthly MRR',fmt$0(result.finalMRR),'#0f1e3c','#f0f4ff'],['Onboarding',fmt$0(result.onboarding),'#0f766e','#f0fdf4'],['Implied GM',fmtPct(result.impliedGM),gc,gb],['Contract TCV',fmt$0(result.finalMRR*inputs.contractTerm+result.onboarding),'#6d28d9','#faf5ff']].map(([l,v,co,bg])=>(
                <div key={l} style={{ background: bg, borderRadius: 5, padding: '7px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, fontWeight: 600, color: '#6b7280', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: co }}>{v}</div>
                </div>
              ))}
            </div>

            {result.finalMRR <= result.floor + 0.01 && result.riskAdjMRR < result.floor && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '6px 9px', marginBottom: 8, fontSize: 9, color: '#92400e' }}>
                ⚠ Price set by minimum commitment floor ({fmt$(result.floor)}). Rate-based price: {fmt$(result.riskAdjMRR)}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Line items */}
              <div style={{ background: 'white', borderRadius: 6, border: '1px solid #e5e7eb', padding: 11 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Monthly Recurring Revenue</div>

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

                {result.lineItems.length > 0 && (() => {
                  const byCategory = result.lineItems.reduce((a,li)=>{ (a[li.category]=a[li.category]||[]).push(li); return a; }, {});
                  return Object.entries(byCategory).map(([cat, items]) => (
                    <span key={cat}>
                      <SH l={cat}/>
                      {items.map(li => <LI key={li.product_id} lbl={`${li.product_name} (${li.qty} × $${li.sell_price})`} v={li.revenue} ind/>)}
                    </span>
                  ));
                })()}

                {result.addonRevenue > 0 && <LI lbl="Add-ons Subtotal" v={result.addonRevenue} bold/>}

                <div style={{ margin: '5px 0', borderTop: '2px solid #0f1e3c' }}/>
                <LI lbl="Operational Subtotal" v={result.opSubtotal} bold/>
                {result.compMult !== 1 && <LI lbl={`Risk multiplier: ${result.compMult.toFixed(2)}×`} v={result.riskAdjMRR} muted/>}
                {result.discount < 0 && <LI lbl={`${Math.round(result.discRate*100)}% contract discount`} v={result.discount} ind/>}
                <LI lbl="✦ Final Monthly MRR" v={result.finalMRR} hi/>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Onboarding */}
                <div style={{ background: 'white', borderRadius: 6, border: '1px solid #e5e7eb', padding: 11 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 6 }}>One-Time Onboarding</div>
                  <LI lbl={`Users (${inputs.users} × $35)`} v={inputs.users*35} ind/>
                  <LI lbl={`Workstations (${inputs.workstations} × $20)`} v={inputs.workstations*20} ind/>
                  <LI lbl={`Servers (${inputs.servers} × $250)`} v={inputs.servers*250} ind/>
                  <LI lbl={`Locations (${inputs.locations} × $450)`} v={inputs.locations*450} ind/>
                  {result.onboardingIsMinimum && <div style={{ fontSize: 8, color: '#9ca3af', padding: '1px 2px' }}>$500 minimum applied</div>}
                  <div style={{ margin: '4px 0', borderTop: '2px solid #0f766e' }}/>
                  <LI lbl="Total Onboarding Fee" v={result.onboarding} hi/>
                </div>

                {/* Cost model */}
                <div style={{ background: 'white', borderRadius: 6, border: '1px solid #e5e7eb', padding: 11 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Cost Model</div>
                  <LI lbl="Tooling / stack" v={result.toolingCost} ind/>
                  <LI lbl={`Labor (${result.svcHrs.toFixed(1)} hrs${result.mktMult<1?' × '+fmtPct(result.mktMult):''})`} v={result.svcCost} ind/>
                  <LI lbl="Add-on delivery cost" v={result.addonCost} ind/>
                  <LI lbl="Estimated Total Cost" v={result.totalCost} bold/>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 6px', background: gb, borderRadius: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: gc }}>Implied Gross Margin</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: gc }}>{fmtPct(result.impliedGM)}</span>
                  </div>
                  {result.impliedGM < 0.40 && <div style={{ marginTop: 4, fontSize: 9, color: '#92400e', background: '#fef3c7', padding: '3px 5px', borderRadius: 3 }}>⚠ Below 40% — review scope or package.</div>}
                </div>

                {/* Deal summary */}
                <div style={{ background: '#0f1e3c', borderRadius: 6, padding: 11 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>Deal Summary</div>
                  {[
                    ['Quote #', existingQuote?.quote_number || 'Unsaved'],
                    ['Package', selectedPkg?.name],
                    ['Market', selectedMkt?.name],
                    ['Contract', `${inputs.contractTerm} months`],
                    ['Users / Mailboxes', `${inputs.users} + ${inputs.sharedMailboxes} shared`],
                    ['Workstations', inputs.workstations],
                    ['Monthly MRR', fmt$0(result.finalMRR)],
                    ['Onboarding', fmt$0(result.onboarding)],
                    ['Total Contract Value', fmt$0(result.finalMRR * inputs.contractTerm + result.onboarding)],
                  ].filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>(
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1e3a5f' }}>
                      <span style={{ fontSize: 9, color: '#64748b' }}>{k}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'white', fontFamily: typeof v === 'number' || (typeof v === 'string' && v.startsWith('$')) ? 'DM Mono, monospace' : 'inherit' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Local UI helpers ─────────────────────────────────────────────────────────
function Sec({ t, c, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, paddingBottom: 3, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 2, height: 11, background: c || '#2563eb', borderRadius: 2 }}/>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>{t}</span>
      </div>
      {children}
    </div>
  );
}
function Grid2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>{children}</div>; }
function Fld({ lbl, sub, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 1 }}>
        {lbl}{sub && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 3, fontSize: 9 }}>{sub}</span>}
      </label>
      {children}
    </div>
  );
}
function NI({ v, s }) { return <input type="number" value={v} min={0} onChange={e=>s(+e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#1e3a5f', background: '#eff6ff', fontWeight: 600, outline: 'none' }}/>; }
function SI({ v, s, opts }) { return <select value={v} onChange={e=>s(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, background: 'white', outline: 'none', color: '#374151' }}>{opts.map(([a,b])=><option key={a} value={a}>{b}</option>)}</select>; }
function Tog({ on, set, lbl, sub }) {
  return (
    <div onClick={() => set(!on)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${on?'#93c5fd':'#e5e7eb'}`, background: on?'#eff6ff':'white', marginBottom: 2 }}>
      <div style={{ width: 24, height: 14, borderRadius: 7, flexShrink: 0, background: on?'#2563eb':'#d1d5db', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: on?12:2, width: 10, height: 10, borderRadius: '50%', background: 'white', transition: 'left .12s' }}/>
      </div>
      <div>
        <span style={{ fontSize: 10, fontWeight: 600, color: on?'#1e40af':'#374151' }}>{lbl}</span>
        {sub && <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}
function LI({ lbl, v, ind, bold, hi, muted }) {
  if (v === 0 && !bold && !hi) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: hi?'5px 7px':'1px 2px', marginLeft: ind?7:0, borderRadius: hi?4:0, background: hi?'#dcfce7':'transparent', borderTop: bold&&!hi?'1px solid #f3f4f6':'none', marginTop: bold&&!hi?2:0 }}>
      <span style={{ fontSize: hi?9:8, fontWeight: bold||hi?700:400, color: hi?'#166534':muted?'#9ca3af':bold?'#374151':'#6b7280' }}>{lbl}</span>
      <span style={{ fontSize: hi?11:9, fontWeight: bold||hi?700:500, fontFamily: 'DM Mono, monospace', color: hi?'#166534':v<0?'#dc2626':bold?'#111827':'#374151' }}>
        {v < 0 ? `(${fmt$(-v)})` : fmt$(v)}
      </span>
    </div>
  );
}
function SH({ l }) { return <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9ca3af', padding: '4px 2px 1px', marginTop: 2 }}>{l}</div>; }

function catColor(cat) {
  const map = { 'Cloud & Email Security':'#0891b2', 'Endpoint Security':'#7c3aed', 'Backup & Recovery':'#92400e', 'Security Awareness':'#065f46', 'SIEM & SOC':'#0891b2', 'Network & Connectivity':'#0f766e', 'Strategic Advisory':'#7c3aed' };
  return map[cat] || '#374151';
}
