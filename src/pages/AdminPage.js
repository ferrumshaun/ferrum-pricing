import React, { useState, useEffect, useCallback } from 'react';
import { supabase, logActivity } from '../lib/supabase';
import { BASE_RATES, RATE_LABELS, RATE_UNITS, getRating, isStale, getOrAnalyzeMarket, tierLabel, tierColor } from '../lib/marketRates';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';

const TABS = ['Products', 'Packages', 'Market Tiers', 'Pricing Settings', 'Voice Hardware', 'Users', 'Integrations'];

const QTY_DRIVERS = ['user','mailbox','workstation','location','server','flat','mixed','mobile_device'];
const CATEGORIES = [
  'Cloud & Email Security','Endpoint Security','Backup & Recovery',
  'Security Awareness','SIEM & SOC','Network & Connectivity','Strategic Advisory'
];

export default function AdminPage() {
  const [tab, setTab] = useState('Products');
  const [reloading, setReloading] = useState(false);
  const { reload } = useConfig();

  async function handleReload() {
    setReloading(true);
    await reload();
    setTimeout(() => setReloading(false), 800);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '0 16px', display: 'flex', gap: 2, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 14px', background: 'none', border: 'none', fontSize: 12, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? '#0f1e3c' : '#6b7280', borderBottom: `2px solid ${tab === t ? '#2563eb' : 'transparent'}`,
            cursor: 'pointer', transition: 'all 0.12s'
          }}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={handleReload} disabled={reloading} style={{ margin: '6px 0', padding: '4px 10px', background: reloading ? '#dcfce7' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, color: reloading ? '#166534' : '#6b7280', cursor: 'pointer' }}>
          {reloading ? '✓ Reloaded' : '↺ Reload config'}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'Products'         && <ProductsAdmin />}
        {tab === 'Packages'         && <PackagesAdmin />}
        {tab === 'Market Tiers'     && <MarketTiersAdmin />}
        {tab === 'Voice Hardware'    && <VoiceHardwareAdmin />}
        {tab === 'Pricing Settings' && <SettingsAdmin />}
        {tab === 'Users'            && <UsersAdmin />}
        {tab === 'Integrations'     && <IntegrationsAdmin />}
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────
function AdminTable({ cols, rows, onEdit, onToggle, loading }) {
  if (loading) return <div style={{ padding: 20, color: '#6b7280', fontSize: 12 }}>Loading...</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#f9fafb' }}>
          {cols.map(c => <th key={c} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{c}</th>)}
          <th style={{ padding: '8px 10px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id || i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
            {cols.map(c => <td key={c} style={{ padding: '8px 10px', color: '#374151', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[c]}</td>)}
            <td style={{ padding: '8px 10px', display: 'flex', gap: 4 }}>
              <button onClick={() => onEdit(row)} style={btnStyle('#eff6ff','#1e40af')}>Edit</button>
              {onToggle && (
                <button onClick={() => onToggle(row)} style={btnStyle(row.active ? '#fef2f2' : '#f0fdf4', row.active ? '#dc2626' : '#166534')}>
                  {row.active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Modal({ title, onClose, onSave, saving, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: 8, padding: 24, width: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f1e3c' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#6b7280' }}>×</button>
        </div>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={btnStyle('#f3f4f6','#374151')}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ padding: '6px 16px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', ...props }) {
  return <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} {...props}
    style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, outline: 'none' }} />;
}

function Select({ value, onChange, opts }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, background: 'white', outline: 'none' }}>
      <option value="">— select —</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

const btnStyle = (bg, color) => ({
  padding: '3px 8px', background: bg, color, border: `1px solid ${color}30`,
  borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer'
});

// ─── PRODUCTS ADMIN ───────────────────────────────────────────────────────────
function ProductsAdmin() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [saveError,setSaveError]= useState('');
  const { profile } = useAuth();
  const { reload } = useConfig();

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('category').order('sort_order');
    if (error) console.error('Load products error:', error);
    setProducts(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setSaveError('');
    setEditing({ name:'', category:'', sub_category:'', description:'', sell_price:'', cost_price:'', qty_driver:'user', exclusive_group:'', sort_order:0, active:true, notes:'', no_discount:false, no_commission:false, compliance_tags:[], recommendation_reason:'' });
  }

  async function save() {
    setSaving(true); setSaveError('');
    const isNew = !editing.id;
    const payload = {
      name:            editing.name,
      category:        editing.category,
      sub_category:    editing.sub_category || null,
      description:     editing.description || null,
      sell_price:      parseFloat(editing.sell_price),
      cost_price:      parseFloat(editing.cost_price),
      qty_driver:      editing.qty_driver,
      exclusive_group: editing.exclusive_group || null,
      sort_order:      parseInt(editing.sort_order) || 0,
      active:          editing.active !== false,
      notes:           editing.notes || null,
      cost_qty_driver: editing.cost_qty_driver || null,
      no_discount:          editing.no_discount  || false,
      no_commission:        editing.no_commission || false,
      compliance_tags:      editing.compliance_tags || [],
      recommendation_reason: editing.recommendation_reason || null,
      updated_by:           profile?.id
    };

    // Validate
    if (!payload.name) { setSaveError('Name is required.'); setSaving(false); return; }
    if (!payload.category) { setSaveError('Category is required.'); setSaving(false); return; }
    if (isNaN(payload.sell_price)) { setSaveError('Sell price must be a number.'); setSaving(false); return; }
    if (isNaN(payload.cost_price)) { setSaveError('Cost price must be a number.'); setSaving(false); return; }

    const old = products.find(p => p.id === editing.id);
    let error;
    if (isNew) {
      const res = await supabase.from('products').insert(payload);
      error = res.error;
    } else {
      const res = await supabase.from('products').update(payload).eq('id', editing.id);
      error = res.error;
    }

    if (error) {
      console.error('Save product error:', error);
      setSaveError(error.message || 'Save failed — check console for details.');
      setSaving(false);
      return;
    }

    await logActivity({
      action: isNew ? 'CREATE' : 'UPDATE',
      entityType: 'product',
      entityId: editing.id,
      entityName: editing.name,
      changes: isNew ? payload : diffObjects(old, payload)
    });
    setEditing(null);
    await load();
    reload(); // also refresh the global config context
    setSaving(false);
  }

  async function toggle(row) {
    const { error } = await supabase.from('products').update({ active: !row.active, updated_by: profile?.id }).eq('id', row.id);
    if (!error) {
      await logActivity({ action: row.active ? 'DEACTIVATE' : 'ACTIVATE', entityType: 'product', entityId: row.id, entityName: row.name });
      load();
    }
  }

  const margin = p => p.sell_price > 0 ? ((1 - p.cost_price / p.sell_price) * 100).toFixed(0) + '%' : '—';
  const rows = products.map(p => ({ ...p,
    '$sell': `$${p.sell_price}`, '$cost': `$${p.cost_price}`, 'gm': margin(p),
    'flags': [p.no_discount ? '🔒 No Discount' : '', p.no_commission ? '💼 No Comm' : ''].filter(Boolean).join(' · ') || '—'
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Products & Services</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Manage all add-on products, sell prices, and costs</p>
        </div>
        <button onClick={startNew} style={{ padding: '6px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>+ Add Product</button>
      </div>
      <AdminTable cols={['name','category','qty_driver','$sell','$cost','gm','flags']} rows={rows} onEdit={r => { setSaveError(''); setEditing(r); }} onToggle={toggle} loading={loading} />
      {editing && (
        <Modal title={editing.id ? 'Edit Product' : 'New Product'} onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Product Name"><Input value={editing.name} onChange={v => setEditing(e => ({...e, name: v}))} /></Field>
            </div>
            <Field label="Category">
              <Select value={editing.category} onChange={v => setEditing(e => ({...e, category: v}))} opts={CATEGORIES.map(c => [c, c])} />
            </Field>
            <Field label="Sub-category (optional)"><Input value={editing.sub_category || ''} onChange={v => setEditing(e => ({...e, sub_category: v}))} placeholder="e.g. INKY, vCIO" /></Field>
            <Field label="Sell Price ($)"><Input type="number" value={editing.sell_price} onChange={v => setEditing(e => ({...e, sell_price: v}))} /></Field>
            <Field label="Cost Price ($)"><Input type="number" value={editing.cost_price} onChange={v => setEditing(e => ({...e, cost_price: v}))} /></Field>
            <Field label="Qty Driver (Sell)">
              <Select value={editing.qty_driver} onChange={v => setEditing(e => ({...e, qty_driver: v}))} opts={QTY_DRIVERS.map(d => [d, d])} />
            </Field>
            <Field label="Qty Driver (Cost)" >
              <div>
                <Select value={editing.cost_qty_driver || ''} onChange={v => setEditing(e => ({...e, cost_qty_driver: v || null}))} opts={[['', '— same as sell —'], ...QTY_DRIVERS.map(d => [d, d])]} />
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Override cost basis only — e.g. sell per mailbox but cost per user</div>
              </div>
            </Field>
            <Field label="Exclusive Group (optional)">
              <Input value={editing.exclusive_group || ''} onChange={v => setEditing(e => ({...e, exclusive_group: v}))} placeholder="e.g. inky, endpoint_sec" />
            </Field>
            <div style={{ gridColumn:'1/-1', borderTop:'1px solid #f1f5f9', paddingTop:10, marginTop:2 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Pricing Protection Flags</div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                  <input type="checkbox" checked={editing.no_discount || false}
                    onChange={e2 => setEditing(e => ({...e, no_discount: e2.target.checked}))}
                    style={{ width:14, height:14 }} />
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c' }}>No Discount</div>
                    <div style={{ fontSize:9, color:'#6b7280' }}>MSRP product — never discounted. Contract term discounts do not apply.</div>
                  </div>
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                  <input type="checkbox" checked={editing.no_commission || false}
                    onChange={e2 => setEditing(e => ({...e, no_commission: e2.target.checked}))}
                    style={{ width:14, height:14 }} />
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#0f1e3c' }}>No Commission</div>
                    <div style={{ fontSize:9, color:'#6b7280' }}>Vendor pass-through — excluded from commissionable revenue base.</div>
                  </div>
                </label>
              </div>
            </div>
            <div style={{ gridColumn:'1/-1', marginTop:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Compliance Recommendations</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                {[['hipaa','HIPAA','#0891b2'],['soc2','SOC 2','#7c3aed'],['pci','PCI DSS','#dc2626'],['cmmc','CMMC','#d97706']].map(([key, label, color]) => {
                  const tags = editing.compliance_tags || [];
                  const active = tags.includes(key);
                  return (
                    <button key={key} onClick={() => setEditing(e => ({...e, compliance_tags: active ? tags.filter(t=>t!==key) : [...tags, key]}))}
                      style={{ padding:'3px 10px', border:`2px solid ${active ? color : '#e5e7eb'}`, borderRadius:4, background: active ? color+'18' : 'white', color: active ? color : '#6b7280', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                      {active ? '✓ ' : ''}{label}
                    </button>
                  );
                })}
              </div>
              <Field label="Recommendation reason (shown to rep when compliance matches)">
                <Input value={editing.recommendation_reason || ''} onChange={v => setEditing(e => ({...e, recommendation_reason: v}))} placeholder="e.g. Required for HIPAA — PHI email encryption..." />
              </Field>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Description"><Input value={editing.description || ''} onChange={v => setEditing(e => ({...e, description: v}))} /></Field>
            </div>
            <Field label="Sort Order"><Input type="number" value={editing.sort_order} onChange={v => setEditing(e => ({...e, sort_order: v}))} /></Field>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Notes (internal)"><textarea value={editing.notes || ''} onChange={e2 => setEditing(e => ({...e, notes: e2.target.value}))} rows={2}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, resize: 'vertical', outline: 'none' }} /></Field>
            </div>
          </div>
          {editing.sell_price > 0 && editing.cost_price > 0 && (
            <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 5, fontSize: 12, color: '#166534', marginTop: 4 }}>
              Gross margin: <strong>{((1 - editing.cost_price / editing.sell_price) * 100).toFixed(1)}%</strong>
            </div>
          )}
          {saveError && (
            <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#dc2626', marginTop: 8 }}>
              ✗ {saveError}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── PACKAGES ADMIN ───────────────────────────────────────────────────────────
function PackagesAdmin() {
  const [packages,  setPackages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');
  const { profile } = useAuth();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('packages').select('*').order('sort_order');
    setPackages(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setSaveError('');
    try {
      // Strip computed display-only fields before saving
      const { '$ws': _ws, '$user': _user, '$server': _srv, '$location': _loc, ...editingClean } = editing;
      const payload = { ...editingClean,
        ws_rate:        parseFloat(editing.ws_rate)        || 0,
        user_rate:      parseFloat(editing.user_rate)      || 0,
        server_rate:    parseFloat(editing.server_rate)    || 0,
        location_rate:  parseFloat(editing.location_rate)  || 0,
        tenant_rate:    parseFloat(editing.tenant_rate)    || 0,
        vendor_rate:    parseFloat(editing.vendor_rate)    || 0,
        included_vendors: parseInt(editing.included_vendors) || 2,
        hrs_user:       parseFloat(editing.hrs_user)       || 0,
        hrs_ws:         parseFloat(editing.hrs_ws)         || 0,
        hrs_server:     parseFloat(editing.hrs_server)     || 0,
        hrs_location:   parseFloat(editing.hrs_location)   || 0,
        flex_minutes_per_ws: parseInt(editing.flex_minutes_per_ws) || 0,
        flex_label:       editing.flex_label || 'Flex Time (Onsite / Tier 2 Support)',
        flex_time_model:  editing.flex_time_model || 'none',
        updated_by:     profile?.id
      };
      // Remove id from insert payload
      if (!editing.id) delete payload.id;
      const old = packages.find(p => p.id === editing.id);
      const isNew = !editing.id;
      const { error } = isNew
        ? await supabase.from('packages').insert(payload)
        : await supabase.from('packages').update(payload).eq('id', editing.id);
      if (error) throw new Error(error.message);
      await logActivity({ action: isNew ? 'CREATE' : 'UPDATE', entityType: 'package',
        entityId: editing.id, entityName: editing.name,
        changes: isNew ? payload : diffObjects(old, payload) });
      setEditing(null); load();
    } catch (e) {
      console.error('Package save error:', e);
      setSaveError(e.message || 'Save failed — check console for details.');
    }
    setSaving(false);
  }

  async function toggle(row) {
    const { error } = await supabase.from('packages').update({ active: !row.active, updated_by: profile?.id }).eq('id', row.id);
    if (!error) {
      await logActivity({ action: row.active ? 'DEACTIVATE' : 'ACTIVATE', entityType: 'package', entityId: row.id, entityName: row.name });
      load();
    }
  }

  const rows = packages.map(p => ({ ...p, '$ws': `$${p.ws_rate}/WS`, '$user': `$${p.user_rate}/US`, '$server': `$${p.server_rate}/server`, '$location': `$${p.location_rate}/LOC` }));

  function startNew() {
    setEditing({
      name: '', coverage: 'business_hours', active: true, sort_order: packages.length + 1,
      ws_rate: '', user_rate: '', server_rate: '', location_rate: '', tenant_rate: 0,
      included_vendors: 2, vendor_rate: 25,
      hrs_user: 0.10, hrs_ws: 0.25, hrs_server: 0.60, hrs_location: 0.75,
      flex_minutes_per_ws: 0, flex_label: 'Flex Time (Onsite / Tier 2 Support)',
      ideal_desc: ''
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Managed IT Packages</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Base rates, support hours, and package configuration</p>
        </div>
        <button onClick={startNew} style={{ padding: '6px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add Package</button>
      </div>
      <AdminTable cols={['name','$ws','$user','$server','$location','coverage']} rows={rows} onEdit={setEditing} onToggle={toggle} loading={loading} />
      {editing && (
        <Modal title={editing.id ? `Edit Package: ${editing.name}` : 'New Package'} onClose={() => { setEditing(null); setSaveError(''); }} onSave={save} saving={saving}>
          {saveError && <div style={{ padding:'7px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:4, fontSize:11, color:'#dc2626', fontWeight:600, marginBottom:10 }}>✗ {saveError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div style={{ gridColumn: '1/-1' }}><Field label="Package Name"><Input value={editing.name} onChange={v => setEditing(e => ({...e, name: v}))} /></Field></div>
            <Field label="Workstation Rate ($)"><Input type="number" value={editing.ws_rate} onChange={v => setEditing(e => ({...e, ws_rate: v}))} /></Field>
            <Field label="User Rate ($)"><Input type="number" value={editing.user_rate} onChange={v => setEditing(e => ({...e, user_rate: v}))} /></Field>
            <Field label="Server Rate ($)"><Input type="number" value={editing.server_rate} onChange={v => setEditing(e => ({...e, server_rate: v}))} /></Field>
            <Field label="Location Rate ($)"><Input type="number" value={editing.location_rate} onChange={v => setEditing(e => ({...e, location_rate: v}))} /></Field>
            <Field label="Cloud Tenant Rate ($)"><Input type="number" value={editing.tenant_rate} onChange={v => setEditing(e => ({...e, tenant_rate: v}))} /></Field>
            <Field label="Included Vendors"><Input type="number" value={editing.included_vendors} onChange={v => setEditing(e => ({...e, included_vendors: v}))} /></Field>
            <Field label="Extra Vendor Rate ($)"><Input type="number" value={editing.vendor_rate} onChange={v => setEditing(e => ({...e, vendor_rate: v}))} /></Field>
            <Field label="Coverage">
              <Select value={editing.coverage} onChange={v => setEditing(e => ({...e, coverage: v}))} opts={[['business_hours','Business Hours (8×5)'],['24x5','24×5'],['24x7','24×7']]} />
            </Field>
            <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '8px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Support Hours Per Unit</div>
            <Field label="Hours / User"><Input type="number" value={editing.hrs_user} onChange={v => setEditing(e => ({...e, hrs_user: v}))} /></Field>
            <Field label="Hours / Workstation"><Input type="number" value={editing.hrs_ws} onChange={v => setEditing(e => ({...e, hrs_ws: v}))} /></Field>
            <Field label="Hours / Server"><Input type="number" value={editing.hrs_server} onChange={v => setEditing(e => ({...e, hrs_server: v}))} /></Field>
            <Field label="Hours / Location"><Input type="number" value={editing.hrs_location} onChange={v => setEditing(e => ({...e, hrs_location: v}))} /></Field>
            <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '8px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flex / Onsite Time Included</div>
            <Field label="Flex Minutes Per Workstation / Month">
              <div>
                <Input type="number" value={editing.flex_minutes_per_ws ?? 0} onChange={v => setEditing(e => ({...e, flex_minutes_per_ws: parseInt(v)||0}))} />
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>0 = not included · positive = minutes per WS/month · -1 = unlimited</div>
              </div>
            </Field>
            <Field label="Flex Time Label">
              <Input value={editing.flex_label || ''} onChange={v => setEditing(e => ({...e, flex_label: v}))} placeholder="Flex Time (Onsite / Tier 2 Support)" />
            </Field>
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Flex Time Model">
                <select value={editing.flex_time_model||'none'} onChange={e => setEditing(p => ({...p, flex_time_model: e.target.value}))}
                  style={{ width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white' }}>
                  <option value="none">None — Not available on this package</option>
                  <option value="included">Included — X min/WS per month (use field above)</option>
                  <option value="required">Required — Client must purchase a block</option>
                  <option value="all_inclusive">All-Inclusive — Unlimited Tier 1/2 remote support</option>
                </select>
                <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>Controls Flex Time block selector on quotes</div>
              </Field>
            </div>
            <div style={{ gridColumn: '1/-1' }}><Field label="Ideal For (description)"><Input value={editing.ideal_desc || ''} onChange={v => setEditing(e => ({...e, ideal_desc: v}))} /></Field></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MARKET TIERS ADMIN ───────────────────────────────────────────────────────
function MarketTiersAdmin() {
  const [tiers,   setTiers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const { profile } = useAuth();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('market_tiers').select('*').order('sort_order');
    setTiers(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    const payload = { ...editing, labor_multiplier: parseFloat(editing.labor_multiplier), updated_by: profile?.id };
    const isNew = !editing.id;
    const old = tiers.find(t => t.id === editing.id);
    const { error } = isNew
      ? await supabase.from('market_tiers').insert(payload)
      : await supabase.from('market_tiers').update(payload).eq('id', editing.id);
    if (!error) {
      await logActivity({ action: isNew ? 'CREATE' : 'UPDATE', entityType: 'market_tier', entityId: editing.id, entityName: editing.name, changes: isNew ? payload : diffObjects(old, editing) });
      setEditing(null); load();
    }
    setSaving(false);
  }

  const rows = tiers.map(t => ({ ...t, 'mult': `${(t.labor_multiplier * 100).toFixed(0)}%` }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Market Tiers</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Labor cost multipliers by geographic market</p>
        </div>
        <button onClick={() => setEditing({ name:'', tier_key:'', labor_multiplier:'1.00', description:'', examples:'', sort_order:0, active:true })}
          style={{ padding: '6px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>+ Add Tier</button>
      </div>
      <AdminTable cols={['name','tier_key','mult','description']} rows={rows} onEdit={setEditing} onToggle={null} loading={loading} />
      {editing && (
        <Modal title={editing.id ? 'Edit Market Tier' : 'New Market Tier'} onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <Field label="Display Name"><Input value={editing.name} onChange={v => setEditing(e => ({...e, name: v}))} /></Field>
          <Field label="Tier Key (lowercase, underscores)"><Input value={editing.tier_key} onChange={v => setEditing(e => ({...e, tier_key: v}))} placeholder="e.g. major_metro" /></Field>
          <Field label="Pricing Multiplier (1.00 = baseline · 0.90 = 10% price reduction · 0.80 = 20% price reduction)"><Input type="number" value={editing.labor_multiplier} onChange={v => setEditing(e => ({...e, labor_multiplier: v}))} step="0.01" /></Field>
          <Field label="Description"><Input value={editing.description || ''} onChange={v => setEditing(e => ({...e, description: v}))} /></Field>
          <Field label="Example Cities"><Input value={editing.examples || ''} onChange={v => setEditing(e => ({...e, examples: v}))} placeholder="Chicago · NYC · Dallas" /></Field>
        </Modal>
      )}
    </div>
  );
}

// ─── PRICING SETTINGS ADMIN ───────────────────────────────────────────────────
function SettingsAdmin() {
  const [settings, setSettings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const { profile } = useAuth();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('pricing_settings').select('*');
    setSettings(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    const old = settings.find(s => s.id === editing.id);
    const { error } = await supabase.from('pricing_settings').update({ value: editing.value, updated_by: profile?.id }).eq('id', editing.id);
    if (!error) {
      await logActivity({ action: 'UPDATE', entityType: 'setting', entityId: editing.id, entityName: editing.key, changes: { old: old?.value, new: editing.value } });
      setEditing(null); load();
    }
    setSaving(false);
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Pricing Settings</h2>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Global rates: onboarding costs, stack costs, burdened rate, contract discounts</p>
      </div>
      {loading ? <div style={{ padding: 20, color: '#6b7280', fontSize: 12 }}>Loading...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout:'fixed' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Setting','Value','Description'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}
              <th style={{ padding: '8px 10px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', fontSize: 11 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#374151' }}>{s.label || s.key}</td>
                <td style={{ padding: '8px 10px', maxWidth: 280, overflow: 'hidden' }}>
                  {s.key === 'company_logo_url' ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {s.value?.startsWith('data:image') ? (
                        <img src={s.value} alt="logo" style={{ height:24, maxWidth:80, objectFit:'contain', background:'#0f1e3c', borderRadius:3, padding:'2px 4px' }} />
                      ) : (
                        <span style={{ fontFamily:'DM Mono, monospace', color:'#1e40af', fontWeight:600, fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200, display:'block' }}>
                          {s.value?.length > 40 ? s.value.slice(0,40) + '…' : s.value}
                        </span>
                      )}
                      <span style={{ fontSize:9, color:'#9ca3af' }}>{s.value?.startsWith('data:image') ? '(uploaded image)' : ''}</span>
                    </div>
                  ) : (
                    <span style={{ fontFamily:'DM Mono, monospace', color:'#1e40af', fontWeight:600, fontSize:11,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block', maxWidth:260 }}>
                      {s.value?.length > 60 ? s.value.slice(0,60) + '…' : s.value}
                    </span>
                  )}
                </td>
                <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: 11 }}>{s.description}</td>
                <td style={{ padding: '8px 10px' }}><button onClick={() => setEditing({...s})} style={btnStyle('#eff6ff','#1e40af')}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal title={`Edit: ${editing.label || editing.key}`} onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>{editing.description}</p>
          <Field label="Value"><Input value={editing.value} onChange={v => setEditing(e => ({...e, value: v}))} /></Field>
        </Modal>
      )}
    </div>
  );
}

// ─── USERS ADMIN ─────────────────────────────────────────────────────────────
function UsersAdmin() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const { profile: myProfile } = useAuth();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsers(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    const old = users.find(u => u.id === editing.id);
    const { error } = await supabase.from('profiles').update({ full_name: editing.full_name, role: editing.role, commission_rate: editing.commission_rate != null && editing.commission_rate !== '' ? parseFloat(editing.commission_rate) : null }).eq('id', editing.id);
    if (!error) {
      await logActivity({ action: 'UPDATE', entityType: 'user', entityId: editing.id, entityName: editing.email, changes: diffObjects(old, editing) });
      setEditing(null); load();
    }
    setSaving(false);
  }

  const rows = users.map(u => ({ ...u, last_login: u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never', commission: u.commission_rate != null ? `${(u.commission_rate * 100).toFixed(1)}%` : 'Global default' }));

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Users</h2>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Manage roles. New users sign up via Supabase Auth invite.</p>
      </div>
      <AdminTable cols={['email','full_name','role','commission','last_login']} rows={rows} onEdit={setEditing} loading={loading} />
      {editing && (
        <Modal title={`Edit User: ${editing.email}`} onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <Field label="Full Name"><Input value={editing.full_name || ''} onChange={v => setEditing(e => ({...e, full_name: v}))} /></Field>
          <Field label="Role">
            <Select value={editing.role} onChange={v => setEditing(e => ({...e, role: v}))} opts={[['user','User'],['admin','Admin']]} />
          </Field>
          <Field label="Commission Rate (leave blank to use global default)">
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Input type="number" value={editing.commission_rate != null ? (editing.commission_rate * 100).toFixed(1) : ''} step="0.1" min="0" max="100"
                placeholder="e.g. 10 for 10% — blank = global default"
                onChange={v => setEditing(e => ({...e, commission_rate: v === '' ? null : parseFloat(v) / 100}))} />
              <span style={{ fontSize:11, color:'#6b7280' }}>%</span>
            </div>
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>Global default: from Admin → Pricing Settings → commission_rate</div>
          </Field>
          {editing.id === myProfile?.id && (
            <div style={{ padding: '7px 10px', background: '#fef3c7', borderRadius: 5, fontSize: 11, color: '#92400e', marginTop: 4 }}>You are editing your own account.</div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── DIFF HELPER ──────────────────────────────────────────────────────────────
function diffObjects(oldObj, newObj) {
  if (!oldObj) return newObj;
  const changes = {};
  for (const key of new Set([...Object.keys(oldObj), ...Object.keys(newObj)])) {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]))
      changes[key] = { from: oldObj[key], to: newObj[key] };
  }
  return changes;
}

// ─── INTEGRATIONS ADMIN ───────────────────────────────────────────────────────
export function IntegrationsAdmin() {
  const [token,         setToken]         = useState('');
  const [saved,         setSaved]         = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testMsg,       setTestMsg]       = useState('');
  const [quoteUrlField, setQuoteUrlField] = useState('');
  const [urlFieldSaved, setUrlFieldSaved] = useState(false);
  const [hsProps,       setHsProps]       = useState([]);
  const [loadingProps,  setLoadingProps]  = useState(false);
  const [propsError,    setPropsError]    = useState('');
  const [logoUrl,    setLogoUrl]    = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoMsg,    setLogoMsg]    = useState('');
  const [logoFile,   setLogoFile]   = useState(null);
  const [logoPreview,setLogoPreview]= useState(null);
  const { profile } = useAuth();

  useEffect(() => {
    supabase.from('pricing_settings').select('value').eq('key','hubspot_token').single()
      .then(({ data }) => { if (data?.value) setToken(data.value); setLoading(false); });
    supabase.from('pricing_settings').select('value').eq('key','hubspot_quote_url_field').single()
      .then(({ data }) => { if (data?.value) setQuoteUrlField(data.value); });
    supabase.from('pricing_settings').select('value').eq('key','company_logo_url').single()
      .then(({ data }) => { if (data?.value) setLogoUrl(data.value); });
  }, []);

  async function saveLogo() {
    if (!logoUrl.trim() && !logoPreview) { setLogoMsg('Enter a URL or select a file.'); return; }
    setLogoSaving(true); setLogoMsg('');
    try {
      // Use base64 data URL if a file was selected, otherwise use the URL directly
      const finalUrl = logoPreview || logoUrl.trim();
      await supabase.from('pricing_settings').upsert(
        { key: 'company_logo_url', value: finalUrl, description: 'Company logo — shown on login page and navigation bar' },
        { onConflict: 'key' }
      );
      setLogoUrl(finalUrl);
      setLogoMsg('✓ Logo saved — refresh the page to see it applied');
    } catch (err) {
      setLogoMsg('✗ ' + err.message);
    }
    setLogoSaving(false);
  }

  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => {
      setLogoPreview(ev.target.result); // base64 data URL stored directly in DB
      setLogoUrl('');
    };
    reader.readAsDataURL(file);
  }

  async function saveToken() {
    setSaving(true); setSaved(false);
    // Upsert the token into pricing_settings
    const { error } = await supabase.from('pricing_settings').upsert({
      key: 'hubspot_token', value: token, label: 'HubSpot Private App Token',
      description: 'Private app token for HubSpot CRM integration', updated_by: profile?.id
    }, { onConflict: 'key' });
    if (!error) {
      await supabase.from('activity_log').insert({
        user_id: profile?.id, user_email: profile?.email,
        action: 'UPDATE', entity_type: 'setting', entity_name: 'hubspot_token',
        changes: { note: 'Token updated (value hidden)' }
      });
      setSaved(true);
    }
    setSaving(false);
  }

  async function saveQuoteUrlField() {
    await supabase.from('pricing_settings').upsert({
      key: 'hubspot_quote_url_field', value: quoteUrlField,
      description: 'HubSpot deal property name to write the Ferrum IQ quote URL into',
    }, { onConflict: 'key' });
    setUrlFieldSaved(true);
    setTimeout(() => setUrlFieldSaved(false), 2500);
  }

  async function loadHsProperties() {
    if (!token) { setPropsError('Save your HubSpot token first'); return; }
    setLoadingProps(true); setPropsError(''); setHsProps([]);
    try {
      const res = await fetch('/.netlify/functions/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_deal_properties', token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load properties');
      setHsProps(data.properties || []);
      if ((data.properties || []).length === 0) setPropsError('No string/text properties found on deals');
    } catch(e) { setPropsError('✗ ' + e.message); }
    setLoadingProps(false);
  }

  async function testConnection() {
    setTesting(true); setTestMsg('');
    try {
      const res = await fetch('/.netlify/functions/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', token })
      });
      const data = await res.json();
      if (res.ok) setTestMsg('✓ Connected successfully — HubSpot API is responding');
      else setTestMsg('✗ ' + (data.message || data.error || 'Connection failed — check your token'));
    } catch {
      setTestMsg('✗ Network error — could not reach the proxy function');
    }
    setTesting(false);
  }

  if (loading) return <div style={{ padding: 20, color: '#6b7280', fontSize: 12 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Integrations</h2>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Connect FerrumIT Pricing to your external tools</p>
      </div>

      {/* Company Logo */}
      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:8, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0f1e3c', marginBottom:4 }}>Company Logo</div>
        <p style={{ fontSize:11, color:'#6b7280', marginBottom:14 }}>Shown on the login page and navigation bar. Upload a file or paste a public URL.</p>

        {/* Preview */}
        {(logoPreview || logoUrl) && (
          <div style={{ background:'#0f1e3c', borderRadius:8, padding:'12px 20px', display:'inline-block', marginBottom:14 }}>
            <img src={logoPreview || logoUrl} alt="Logo preview"
              style={{ height:40, maxWidth:200, objectFit:'contain', display:'block' }} />
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* File upload */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>Upload image file (PNG, SVG, JPG)</label>
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoFile}
              style={{ fontSize:11, color:'#374151' }} />
          </div>

          {/* URL input */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>Or paste a public image URL</label>
            <input value={logoUrl} onChange={e => { setLogoUrl(e.target.value); setLogoFile(null); setLogoPreview(null); }}
              placeholder="https://your-cdn.com/logo.png"
              style={{ width:'100%', padding:'7px 9px', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, outline:'none' }} />
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={saveLogo} disabled={logoSaving}
              style={{ padding:'7px 18px', background:'#0f1e3c', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:600, cursor:'pointer', opacity: logoSaving ? 0.6 : 1 }}>
              {logoSaving ? 'Saving...' : 'Save Logo'}
            </button>
            {logoMsg && <span style={{ fontSize:11, fontWeight:600, color: logoMsg.startsWith('✓') ? '#166534' : '#dc2626' }}>{logoMsg}</span>}
          </div>

          <div style={{ fontSize:9, color:'#9ca3af' }}>
            File uploads are stored as encoded data — no external storage required.
            For best results use a PNG or SVG with a transparent or dark background.
          </div>
        </div>
      </div>

      {/* Smart Pricing Table */}
      <SPTIntegration />
      <SignWellIntegration />

      {/* HubSpot */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, background: '#ff7a59', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>H</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1e3c' }}>HubSpot CRM</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Create and link deals from quotes</div>
          </div>
          {token && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 3 }}>Configured</span>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Private App Token
          </label>
          <input
            type="password"
            value={token}
            onChange={e => { setToken(e.target.value); setSaved(false); setTestMsg(''); }}
            placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, fontFamily: 'DM Mono, monospace', outline: 'none' }}
          />
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
            HubSpot → Settings → Integrations → Private Apps → your app → Token
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveToken} disabled={saving || !token}
            style={{ padding: '6px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!token || saving) ? 0.6 : 1 }}>
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Token'}
          </button>
          <button onClick={testConnection} disabled={testing || !token}
            style={{ padding: '6px 14px', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!token || testing) ? 0.6 : 1 }}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {testMsg && (
          <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500,
            background: testMsg.startsWith('✓') ? '#dcfce7' : '#fef2f2',
            color: testMsg.startsWith('✓') ? '#166534' : '#dc2626',
            border: `1px solid ${testMsg.startsWith('✓') ? '#bbf7d0' : '#fecaca'}` }}>
            {testMsg}
          </div>
        )}

        {/* ── Quote URL field mapping ── */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1e3c', marginBottom: 4 }}>Quote URL Field Mapping</div>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
            Select which HubSpot deal property should receive the Ferrum IQ quote URL when a quote is saved.
            This lets anyone in HubSpot click directly into the quote. Only string/text properties are shown.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <button onClick={loadHsProperties} disabled={loadingProps || !token}
              style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: (!token || loadingProps) ? 0.6 : 1 }}>
              {loadingProps ? 'Loading…' : hsProps.length ? '↻ Reload Fields' : 'Load Fields'}
            </button>
            {hsProps.length > 0 && (
              <span style={{ fontSize: 10, color: '#9ca3af' }}>{hsProps.length} properties loaded</span>
            )}
          </div>
          <select value={quoteUrlField} onChange={e => { setQuoteUrlField(e.target.value); setUrlFieldSaved(false); }}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, background: 'white', outline: 'none', color: quoteUrlField ? '#0f1e3c' : '#9ca3af', marginBottom: 8 }}>
            <option value="">— select a HubSpot deal property —</option>
            {hsProps.map(p => (
              <option key={p.name} value={p.name}>
                {p.label} — {p.name}
              </option>
            ))}
            {quoteUrlField && !hsProps.find(p => p.name === quoteUrlField) && (
              <option value={quoteUrlField}>{quoteUrlField} (saved)</option>
            )}
          </select>
          <button onClick={saveQuoteUrlField} disabled={!quoteUrlField}
            style={{ padding: '6px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: !quoteUrlField ? 0.6 : 1 }}>
            {urlFieldSaved ? '✓ Saved' : 'Save Field Selection'}
          </button>

          {propsError && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 6 }}>{propsError}</div>}

          {quoteUrlField && (
            <div style={{ fontSize: 10, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '5px 9px' }}>
              ✓ Active: quote URL will be written to <strong>{quoteUrlField}</strong> on every save
            </div>
          )}
          {!quoteUrlField && (
            <div style={{ fontSize: 10, color: '#9ca3af' }}>
              Click "Load Fields" to fetch your HubSpot deal properties, then pick the URL field.
            </div>
          )}
        </div>
      </div>

      {/* Smart Pricing Table */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, background: '#2563eb', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>S</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1e3c' }}>Smart Pricing Table</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>JSON export available on every saved quote</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '2px 7px', borderRadius: 3 }}>Export Only</span>
        </div>
        <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
          Open any saved quote and click <strong>Export JSON</strong> to download a file ready to import into Smart Pricing Table.
          Send us a sample SPT JSON file and we'll map the fields to match their exact import format.
        </p>
      </div>
    </div>
  );
}


// ─── SignWell Integration ────────────────────────────────────────────────────
function SignWellIntegration() {
  const [key,        setKey]        = useState('');
  const [templateId,    setTemplateId]    = useState('');
  const [saved,      setSaved]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testMsg,    setTestMsg]    = useState('');
  const [loading,    setLoading]    = useState(true);
  const { profile } = useAuth();

  useEffect(() => {
    Promise.all([
      supabase.from('pricing_settings').select('value').eq('key', 'signwell_api_key').single(),
      supabase.from('pricing_settings').select('value').eq('key', 'signwell_intl_waiver_template_id').single(),
    ]).then(([keyRes, tplRes]) => {
      if (keyRes.data?.value) setKey(keyRes.data.value);
      if (tplRes.data?.value) setTemplateId(tplRes.data.value);
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true); setSaved(false); setTestMsg('');
    await supabase.from('pricing_settings').upsert({ key: 'signwell_api_key', value: key, description: 'SignWell e-signature API key' }, { onConflict: 'key' });
    await supabase.from('pricing_settings').upsert({ key: 'signwell_intl_waiver_template_id', value: templateId, description: 'SignWell template ID for International Dialing Waiver signature page' }, { onConflict: 'key' });
    await logActivity({ action: 'UPDATE', entityType: 'setting', entityId: null, entityName: 'signwell_api_key', changes: { updated: true } });
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  async function saveQuoteUrlField() {
    await supabase.from('pricing_settings').upsert({
      key: 'hubspot_quote_url_field', value: quoteUrlField,
      description: 'HubSpot deal property name to write the Ferrum IQ quote URL into',
    }, { onConflict: 'key' });
    setUrlFieldSaved(true);
    setTimeout(() => setUrlFieldSaved(false), 2500);
  }

  async function loadHsProperties() {
    if (!token) { setPropsError('Save your HubSpot token first'); return; }
    setLoadingProps(true); setPropsError(''); setHsProps([]);
    try {
      const res = await fetch('/.netlify/functions/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_deal_properties', token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load properties');
      setHsProps(data.properties || []);
      if ((data.properties || []).length === 0) setPropsError('No string/text properties found on deals');
    } catch(e) { setPropsError('✗ ' + e.message); }
    setLoadingProps(false);
  }

  async function testConnection() {
    if (!key) { setTestMsg('✗ Enter an API key first'); return; }
    setTesting(true); setTestMsg('');
    try {
      const res = await fetch('/.netlify/functions/signwellProxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listDocuments', payload: { per_page: 1 } }),
      });
      const data = await res.json();
      if (res.ok) setTestMsg('✓ Connected successfully — SignWell API is responding');
      else setTestMsg('✗ ' + (data.error || data.errors?.base?.[0] || `Error ${res.status}`));
    } catch(e) { setTestMsg('✗ ' + e.message); }
    setTesting(false);
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 24, height: 24, background: '#166534', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>SW</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1e3c' }}>SignWell E-Signatures</div>
      </div>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
        Legally binding e-signatures for International Dialing Waivers and other one-off documents.
        First 25 documents/month free, then $0.75/doc — no monthly minimum.
        Get your API key from{' '}
        <a href="https://app.signwell.com/account/api" target="_blank" rel="noopener noreferrer" style={{ color: '#166534' }}>
          SignWell → Account → API
        </a>.
      </p>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
        Also register the webhook URL in{' '}
        <a href="https://app.signwell.com/account/api" target="_blank" rel="noopener noreferrer" style={{ color: '#166534' }}>
          SignWell → API → Webhooks
        </a>:{' '}
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>
          https://lustrous-treacle-e0ca6a.netlify.app/.netlify/functions/signwellWebhook
        </span>
      </p>
      {loading ? <div style={{ fontSize: 11, color: '#9ca3af' }}>Loading...</div> : (
        <>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>API Key</label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="your SignWell API key..."
            style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none', fontFamily: 'DM Mono, monospace', marginBottom: 14 }}
          />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            International Dialing Waiver — Template ID
          </label>
          <input
            type="text"
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
            placeholder="e.g. 53906b87-b393-44c1-9ebb-d267c756cb66"
            style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none', fontFamily: 'DM Mono, monospace', marginBottom: 4 }}
          />
          <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 14 }}>
            Found in SignWell → Templates → your template URL. Update here when you replace the template.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '7px 18px', background: '#166534', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
            <button onClick={testConnection} disabled={testing || !key}
              style={{ padding: '7px 14px', background: 'white', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, color: '#374151', cursor: 'pointer', opacity: testing ? 0.6 : 1 }}>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {saved && <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>✓ Saved</span>}
            {testMsg && <span style={{ fontSize: 11, fontWeight: 600, color: testMsg.startsWith('✓') ? '#166534' : '#dc2626' }}>{testMsg}</span>}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
            The key is stored in Pricing Settings and used server-side only. You can also set SIGNWELL_API_KEY in Netlify environment variables (env var takes precedence).
          </div>
        </>
      )}
    </div>
  );
}


// ─── Voice Hardware Catalog ───────────────────────────────────────────────────
function VoiceHardwareAdmin() {
  const [devices,  setDevices]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all'); // all | preferred | supported | legacy | inactive
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);

  const BLANK = { manufacturer:'', model:'', category:'preferred', compatibility:'compatible', auto_provision:true, firmware_notes:'', notes:'', active:true };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('voice_hardware').select('*').order('manufacturer').order('model');
    setDevices(data || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const payload = { ...editing, updated_at: new Date().toISOString() };
    if (editing.id) {
      await supabase.from('voice_hardware').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('voice_hardware').insert(payload);
    }
    await load();
    setEditing(null);
    setSaving(false);
  }

  async function toggleActive(device) {
    await supabase.from('voice_hardware').update({ active: !device.active, updated_at: new Date().toISOString() }).eq('id', device.id);
    setDevices(prev => prev.map(d => d.id === device.id ? { ...d, active: !d.active } : d));
  }

  async function deleteDevice(id) {
    if (!window.confirm('Delete this device permanently?')) return;
    await supabase.from('voice_hardware').delete().eq('id', id);
    setDevices(prev => prev.filter(d => d.id !== id));
  }

  const COMPAT_COLORS = { compatible:'#166534', limited:'#92400e', manual_only:'#9a3412', not_compatible:'#991b1b' };
  const COMPAT_LABELS = { compatible:'Preferred', limited:'Limited', manual_only:'Legacy', not_compatible:'Not Compatible' };

  const filtered = devices.filter(d => {
    if (filter === 'inactive' && d.active) return false;
    if (filter !== 'all' && filter !== 'inactive' && d.category !== filter) return false;
    if (filter !== 'inactive' && !d.active) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.manufacturer.toLowerCase().includes(q) || d.model.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { all: devices.filter(d=>d.active).length, preferred: devices.filter(d=>d.active&&d.category==='preferred').length, supported: devices.filter(d=>d.active&&d.category==='supported').length, legacy: devices.filter(d=>d.active&&d.category==='legacy').length, inactive: devices.filter(d=>!d.active).length };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <h2 style={{ fontSize:14, fontWeight:700, color:'#0f1e3c', margin:0 }}>Voice Hardware Catalog</h2>
          <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>3CX-compatible phone and device compatibility database. Drives BYOH validation on Voice quotes.</div>
        </div>
        <button onClick={() => setEditing({...BLANK})}
          style={{ padding:'7px 14px', background:'#7c3aed', color:'white', border:'none', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer' }}>
          + Add Device
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search manufacturer or model..."
          style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none', width:220 }}/>
        {[['all','All Active'], ['preferred','Preferred'], ['supported','Supported'], ['legacy','Legacy'], ['inactive','Inactive']].map(([k,l]) => (
          <button key={k} onClick={()=>setFilter(k)}
            style={{ padding:'4px 10px', borderRadius:4, border:`1px solid ${filter===k?'#7c3aed':'#e5e7eb'}`, background:filter===k?'#f5f3ff':'white', color:filter===k?'#6d28d9':'#374151', fontSize:10, fontWeight:filter===k?700:400, cursor:'pointer' }}>
            {l} {counts[k] != null ? `(${counts[k]})` : ''}
          </button>
        ))}
      </div>

      {loading ? <div style={{ fontSize:11, color:'#9ca3af' }}>Loading...</div> : (
        <div style={{ border:'1px solid #e5e7eb', borderRadius:6, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Manufacturer','Model','Category','Compatibility','Auto-Provision','Notes','Status',''].map(h => (
                  <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#6b7280', letterSpacing:'.05em', borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0 ? 'white' : '#fafafa', opacity: d.active ? 1 : 0.5 }}>
                  <td style={{ padding:'6px 10px', fontWeight:600, color:'#0f1e3c' }}>{d.manufacturer}</td>
                  <td style={{ padding:'6px 10px' }}>{d.model}</td>
                  <td style={{ padding:'6px 10px', textTransform:'capitalize' }}>{d.category}</td>
                  <td style={{ padding:'6px 10px' }}>
                    <span style={{ fontSize:9, fontWeight:700, color: COMPAT_COLORS[d.compatibility]||'#374151' }}>
                      {COMPAT_LABELS[d.compatibility]||d.compatibility}
                    </span>
                  </td>
                  <td style={{ padding:'6px 10px', textAlign:'center' }}>{d.auto_provision ? '✓' : '—'}</td>
                  <td style={{ padding:'6px 10px', color:'#6b7280', fontSize:10, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {d.firmware_notes && <span style={{ color:'#d97706', marginRight:4 }}>⚠ {d.firmware_notes}</span>}
                    {d.notes}
                  </td>
                  <td style={{ padding:'6px 10px' }}>
                    <button onClick={()=>toggleActive(d)}
                      style={{ fontSize:9, padding:'2px 7px', borderRadius:3, border:'1px solid #e5e7eb', background: d.active?'#f0fdf4':'#f9fafb', color:d.active?'#166534':'#6b7280', cursor:'pointer' }}>
                      {d.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td style={{ padding:'6px 10px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={()=>setEditing({...d})} style={{ padding:'2px 7px', fontSize:9, background:'white', border:'1px solid #d1d5db', borderRadius:3, cursor:'pointer' }}>Edit</button>
                      <button onClick={()=>deleteDevice(d.id)} style={{ padding:'2px 7px', fontSize:9, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:3, cursor:'pointer', color:'#dc2626' }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:11 }}>No devices match current filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
          <div style={{ background:'white', borderRadius:8, padding:24, width:520, boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f1e3c', margin:'0 0 16px' }}>{editing.id ? 'Edit Device' : 'Add Device'}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {[['Manufacturer', 'manufacturer'], ['Model', 'model']].map(([lbl, key]) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>{lbl} *</label>
                  <input value={editing[key]||''} onChange={e=>setEditing(p=>({...p,[key]:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
                </div>
              ))}
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>Category</label>
                <select value={editing.category} onChange={e=>setEditing(p=>({...p,category:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none' }}>
                  {['preferred','supported','doorphone','gateway','headset','legacy'].map(c=>(
                    <option key={c} value={c} style={{textTransform:'capitalize'}}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>Compatibility</label>
                <select value={editing.compatibility} onChange={e=>setEditing(p=>({...p,compatibility:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, background:'white', outline:'none' }}>
                  <option value="compatible">Preferred — full support</option>
                  <option value="limited">Supported — limited / 3rd party</option>
                  <option value="manual_only">Legacy — manual config only</option>
                  <option value="not_compatible">Not Compatible</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>Firmware / EOL Notes</label>
              <input value={editing.firmware_notes||''} onChange={e=>setEditing(p=>({...p,firmware_notes:e.target.value}))} placeholder="e.g. EOL — no new firmware, 3rd-party supported only..."
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' }}/>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#374151', marginBottom:3 }}>Notes</label>
              <textarea value={editing.notes||''} onChange={e=>setEditing(p=>({...p,notes:e.target.value}))} rows={2} placeholder="Router phone, DECT, hotel series, etc."
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', outline:'none' }}/>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                <input type="checkbox" checked={editing.auto_provision} onChange={e=>setEditing(p=>({...p,auto_provision:e.target.checked}))} style={{ accentColor:'#7c3aed' }}/>
                <span style={{ fontSize:11 }}>Auto-provisioned by 3CX</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                <input type="checkbox" checked={editing.active} onChange={e=>setEditing(p=>({...p,active:e.target.checked}))} style={{ accentColor:'#7c3aed' }}/>
                <span style={{ fontSize:11 }}>Active (visible to reps)</span>
              </label>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={()=>setEditing(null)} style={{ padding:'7px 16px', background:'white', border:'1px solid #d1d5db', borderRadius:5, fontSize:12, cursor:'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving||!editing.manufacturer||!editing.model}
                style={{ padding:'7px 18px', background:'#7c3aed', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
                {saving?'Saving...':'Save Device'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SPT Integration ─────────────────────────────────────────────────────────
function SPTIntegration() {
  const [key,     setKey]     = useState('');
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();

  useEffect(() => {
    supabase.from('pricing_settings').select('value').eq('key', 'spt_api_key').single()
      .then(({ data }) => { if (data?.value) setKey(data.value); setLoading(false); });
  }, []);

  async function save() {
    setSaving(true); setSaved(false);
    await supabase.from('pricing_settings').upsert({ key: 'spt_api_key', value: key, description: 'Smart Pricing Table API key' }, { onConflict: 'key' });
    await logActivity({ action: 'UPDATE', entityType: 'setting', entityId: null, entityName: 'spt_api_key', changes: { updated: true } });
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1e3c', marginBottom: 4 }}>Smart Pricing Table</div>
      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
        Connect to Smart Pricing Table to export rate sheets and proposals directly from Ferrum IQ.
        Get your API key from <a href="https://web.smartpricingtable.com/settings/profile" target="_blank" rel="noopener noreferrer" style={{ color: '#f97316' }}>SPT Profile Settings</a>.
      </p>
      {loading ? <div style={{ fontSize: 11, color: '#9ca3af' }}>Loading...</div> : (
        <>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>API Key</label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="spt_live_..."
            style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '7px 18px', background: '#f97316', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
            {saved && <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>✓ Saved</span>}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
            The key is stored securely and only used server-side. You can also set SPT_API_KEY in your Netlify environment variables.
          </div>
        </>
      )}
    </div>
  );
}
