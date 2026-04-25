import React, { useState, useEffect, useCallback } from 'react';
import { supabase, logActivity } from '../lib/supabase';
import { BASE_RATES, RATE_LABELS, RATE_UNITS, getRating, isStale, getOrAnalyzeMarket, tierLabel, tierColor } from '../lib/marketRates';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';

const TABS = ['Products', 'Packages', 'Market Tiers', 'Pricing Settings', 'Users', 'Integrations', 'Market Rates'];

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
        {tab === 'Pricing Settings' && <SettingsAdmin />}
        {tab === 'Users'            && <UsersAdmin />}
        {tab === 'Integrations'     && <IntegrationsAdmin />}
        {tab === 'Market Rates'      && <MarketRatesAdmin />}
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
    setEditing({ name:'', category:'', sub_category:'', description:'', sell_price:'', cost_price:'', qty_driver:'user', exclusive_group:'', sort_order:0, active:true, notes:'' });
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
      updated_by:      profile?.id
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
  const rows = products.map(p => ({ ...p, '$sell': `$${p.sell_price}`, '$cost': `$${p.cost_price}`, 'gm': margin(p) }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Products & Services</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Manage all add-on products, sell prices, and costs</p>
        </div>
        <button onClick={startNew} style={{ padding: '6px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>+ Add Product</button>
      </div>
      <AdminTable cols={['name','category','qty_driver','$sell','$cost','gm']} rows={rows} onEdit={r => { setSaveError(''); setEditing(r); }} onToggle={toggle} loading={loading} />
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
  const [packages, setPackages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const { profile } = useAuth();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('packages').select('*').order('sort_order');
    setPackages(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    const payload = { ...editing,
      ws_rate: parseFloat(editing.ws_rate), user_rate: parseFloat(editing.user_rate),
      server_rate: parseFloat(editing.server_rate), location_rate: parseFloat(editing.location_rate),
      tenant_rate: parseFloat(editing.tenant_rate) || 0, vendor_rate: parseFloat(editing.vendor_rate),
      included_vendors: parseInt(editing.included_vendors) || 2,
      hrs_user: parseFloat(editing.hrs_user), hrs_ws: parseFloat(editing.hrs_ws),
      hrs_server: parseFloat(editing.hrs_server), hrs_location: parseFloat(editing.hrs_location),
      flex_minutes_per_ws: parseInt(editing.flex_minutes_per_ws) ?? 0,
      flex_label: editing.flex_label || 'Flex Time (Onsite / Tier 2 Support)',
      updated_by: profile?.id
    };
    const old = packages.find(p => p.id === editing.id);
    const isNew = !editing.id;
    const { error } = isNew
      ? await supabase.from('packages').insert(payload)
      : await supabase.from('packages').update(payload).eq('id', editing.id);
    if (!error) {
      await logActivity({ action: isNew ? 'CREATE' : 'UPDATE', entityType: 'package', entityId: editing.id, entityName: editing.name,
        changes: isNew ? payload : diffObjects(old, editing) });
      setEditing(null); load();
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

  const rows = packages.map(p => ({ ...p, '$ws': `$${p.ws_rate}/WS`, '$user': `$${p.user_rate}/user`, '$server': `$${p.server_rate}/server`, '$location': `$${p.location_rate}/loc` }));

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
        <Modal title={editing.id ? `Edit Package: ${editing.name}` : 'New Package'} onClose={() => setEditing(null)} onSave={save} saving={saving}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
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
                <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', color: '#1e40af', fontWeight: 600 }}>{s.value}</td>
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
    const { error } = await supabase.from('profiles').update({ full_name: editing.full_name, role: editing.role }).eq('id', editing.id);
    if (!error) {
      await logActivity({ action: 'UPDATE', entityType: 'user', entityId: editing.id, entityName: editing.email, changes: diffObjects(old, editing) });
      setEditing(null); load();
    }
    setSaving(false);
  }

  const rows = users.map(u => ({ ...u, last_login: u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never' }));

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c' }}>Users</h2>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Manage roles. New users sign up via Supabase Auth invite.</p>
      </div>
      <AdminTable cols={['email','full_name','role','last_login']} rows={rows} onEdit={setEditing} loading={loading} />
      {editing && (
        <Modal title={`Edit User: ${editing.email}`} onClose={() => setEditing(null)} onSave={save} saving={saving}>
          <Field label="Full Name"><Input value={editing.full_name || ''} onChange={v => setEditing(e => ({...e, full_name: v}))} /></Field>
          <Field label="Role">
            <Select value={editing.role} onChange={v => setEditing(e => ({...e, role: v}))} opts={[['user','User'],['admin','Admin']]} />
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
  const [token,    setToken]    = useState('');
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState('');
  const { profile } = useAuth();

  useEffect(() => {
    supabase.from('pricing_settings').select('value').eq('key','hubspot_token').single()
      .then(({ data }) => { if (data?.value) setToken(data.value); setLoading(false); });
  }, []);

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

// ─── Market Rates Admin ───────────────────────────────────────────────────────
function MarketRatesAdmin() {
  const [markets,      setMarkets]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterTier,   setFilterTier]   = useState('all');
  const [expanded,     setExpanded]     = useState(null);
  const [analyzing,    setAnalyzing]    = useState(null);
  const [newMarket,    setNewMarket]    = useState({ zip: '', city: '', state: '' });
  const [showNew,      setShowNew]      = useState(false);
  const [newLoading,   setNewLoading]   = useState(false);
  const [newMsg,       setNewMsg]       = useState('');
  const [editRates,    setEditRates]    = useState(null);
  const [saving,       setSaving]       = useState(false);

  const fmt$ = n => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';

  useEffect(() => { loadMarkets(); }, []);

  async function loadMarkets() {
    setLoading(true);
    const { data } = await supabase
      .from('market_rate_analyses')
      .select('*')
      .order('state', { ascending: true })
      .order('city', { ascending: true });
    setMarkets(data || []);
    setLoading(false);
  }

  async function refreshMarket(market) {
    setAnalyzing(market.id);
    try {
      await getOrAnalyzeMarket(market.zip || null, true, market.city, market.state);
      await loadMarkets();
    } catch (e) {
      alert('Refresh failed: ' + e.message);
    }
    setAnalyzing(null);
  }

  async function analyzeNew() {
    if (!newMarket.zip && (!newMarket.city || !newMarket.state)) {
      setNewMsg('Enter a zip code, or city + state.');
      return;
    }
    setNewLoading(true); setNewMsg('');
    try {
      await getOrAnalyzeMarket(newMarket.zip || null, true, newMarket.city || null, newMarket.state || null);
      setNewMsg('✓ Analysis complete');
      setNewMarket({ zip: '', city: '', state: '' });
      await loadMarkets();
      setTimeout(() => { setShowNew(false); setNewMsg(''); }, 1500);
    } catch (e) {
      setNewMsg('✗ ' + e.message);
    }
    setNewLoading(false);
  }

  async function saveRateOverrides(market) {
    if (!editRates) return;
    setSaving(true);
    try {
      await supabase.from('market_rate_analyses')
        .update({ rates: editRates, updated_at: new Date().toISOString() })
        .eq('id', market.id);
      await loadMarkets();
      setExpanded(null);
      setEditRates(null);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  const filtered = markets.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.city?.toLowerCase().includes(q) || m.state?.toLowerCase().includes(q) || m.zip?.includes(q);
    const matchTier = filterTier === 'all' || m.market_tier === filterTier;
    return matchSearch && matchTier;
  });

  const staleCount = markets.filter(m => isStale(m.analyzed_at)).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f1e3c', margin: 0 }}>Market Rate Intelligence</h2>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {markets.length} markets · {staleCount > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{staleCount} stale (6+ months)</span>}
            {staleCount === 0 && markets.length > 0 && <span style={{ color: '#166534' }}>All analyses current</span>}
          </div>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          style={{ padding: '7px 14px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + Analyze New Market
        </button>
      </div>

      {/* New market panel */}
      {showNew && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1e3c', marginBottom: 10 }}>Analyze New Market</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>ZIP Code</label>
              <input value={newMarket.zip} onChange={e => setNewMarket(m => ({ ...m, zip: e.target.value }))}
                placeholder="e.g. 90210"
                style={{ width: 100, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', paddingBottom: 8 }}>or</div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>City</label>
              <input value={newMarket.city} onChange={e => setNewMarket(m => ({ ...m, city: e.target.value }))}
                placeholder="e.g. Austin"
                style={{ width: 140, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 3 }}>State</label>
              <input value={newMarket.state} onChange={e => setNewMarket(m => ({ ...m, state: e.target.value.toUpperCase().slice(0,2) }))}
                placeholder="TX"
                style={{ width: 48, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none', textTransform: 'uppercase' }} />
            </div>
            <button onClick={analyzeNew} disabled={newLoading}
              style={{ padding: '7px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: newLoading ? 0.6 : 1 }}>
              {newLoading ? 'Analyzing...' : 'Run Analysis'}
            </button>
            <button onClick={() => { setShowNew(false); setNewMsg(''); }}
              style={{ padding: '7px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
          {newMsg && (
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: newMsg.startsWith('✓') ? '#166534' : '#dc2626' }}>{newMsg}</div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search city, state, or zip..."
          style={{ flex: 1, maxWidth: 280, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, outline: 'none' }} />
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, background: 'white', outline: 'none' }}>
          <option value="all">All Tiers</option>
          <option value="secondary">Secondary</option>
          <option value="adjusted">Adjusted</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
        <div style={{ fontSize: 11, color: '#9ca3af', alignSelf: 'center' }}>{filtered.length} markets</div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 12 }}>Loading markets...</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Market', 'Tier', 'CoL Index', 'Remote', 'On-Site Block', 'Dev/CRM', 'Last Analyzed', 'Source', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const stale = isStale(m.analyzed_at);
                const isExpanded = expanded === m.id;
                const rates = m.rates || {};
                return (
                  <>
                    <tr key={m.id}
                      style={{ borderBottom: '1px solid #f1f5f9', background: isExpanded ? '#f8fafc' : 'white', cursor: 'pointer' }}
                      onClick={() => { setExpanded(isExpanded ? null : m.id); setEditRates(isExpanded ? null : { ...rates }); }}>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1e3c' }}>{m.city}, {m.state}</div>
                        {m.zip && <div style={{ fontSize: 10, color: '#9ca3af' }}>{m.zip}</div>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tierColor(m.market_tier), background: tierColor(m.market_tier) + '18', padding: '2px 7px', borderRadius: 3 }}>
                          {tierLabel(m.market_tier)}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{m.col_index}</td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$(rates.remote_support)}/hr</td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$(rates.onsite_block_2hr)}</td>
                      <td style={{ padding: '9px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{fmt$(rates.dev_crm)}/hr</td>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ fontSize: 10, color: stale ? '#d97706' : '#6b7280', fontWeight: stale ? 600 : 400 }}>
                          {new Date(m.analyzed_at).toLocaleDateString()}
                          {stale && ' ⚠'}
                        </div>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.analysis_source}</span>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <button
                          onClick={e => { e.stopPropagation(); refreshMarket(m); }}
                          disabled={analyzing === m.id}
                          style={{ fontSize: 10, padding: '3px 8px', background: 'white', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', color: '#374151', fontWeight: 600, opacity: analyzing === m.id ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                          {analyzing === m.id ? '...' : '↻ Refresh'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && editRates && (
                      <tr key={m.id + '_detail'}>
                        <td colSpan={9} style={{ padding: '0 0 12px 0', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                          <div style={{ padding: '12px 14px' }}>

                            {/* Rate edit grid */}
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.06em', marginBottom: 10 }}>
                              Rates — edit to override, then save
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                              {Object.entries(RATE_LABELS).map(([key, label]) => {
                                const marketRate = editRates[key];
                                const rating = getRating(BASE_RATES[key], marketRate);
                                return (
                                  <div key={key} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px' }}>
                                    <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>{label}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ fontSize: 10, color: '#6b7280' }}>$</span>
                                      <input
                                        type="number"
                                        value={editRates[key] || ''}
                                        onChange={e => setEditRates(r => ({ ...r, [key]: parseFloat(e.target.value) || 0 }))}
                                        style={{ width: 70, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#0f1e3c', outline: 'none' }}
                                      />
                                      <span style={{ fontSize: 9, color: '#9ca3af' }}>{RATE_UNITS[key]}</span>
                                    </div>
                                    {rating && (
                                      <div style={{ fontSize: 8, fontWeight: 700, color: rating.color, marginTop: 3 }}>
                                        {rating.label} vs published
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Pricing multiplier & market notes */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                              <div style={{ background: '#eff6ff', borderRadius: 6, padding: '8px 12px', flex: '0 0 auto' }}>
                                <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 2 }}>Pricing Multiplier</div>
                                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#1e40af' }}>{m.pricing_multiplier}x</div>
                                <div style={{ fontSize: 9, color: '#3b82f6' }}>Managed IT package adjustment</div>
                              </div>
                              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', flex: 1 }}>
                                <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Intelligence</div>
                                <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>{m.market_notes || '—'}</div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => saveRateOverrides(m)} disabled={saving}
                                style={{ padding: '6px 16px', background: '#0f1e3c', color: 'white', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                                {saving ? 'Saving...' : 'Save Rate Changes'}
                              </button>
                              <button onClick={() => refreshMarket(m)} disabled={analyzing === m.id}
                                style={{ padding: '6px 14px', background: 'white', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                                {analyzing === m.id ? 'Re-analyzing...' : '↻ Re-run AI Analysis'}
                              </button>
                              <button onClick={() => { setExpanded(null); setEditRates(null); }}
                                style={{ padding: '6px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
                                Close
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                  No markets found. Use "Analyze New Market" to add one.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
