import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const COMPAT_CONFIG = {
  compatible:    { label: '✓ Preferred',        bg: '#f0fdf4', border: '#86efac', color: '#166534', badge: '#dcfce7', badgeText: '#166534' },
  limited:       { label: '⚠ Supported / Limited', bg: '#fffbeb', border: '#fcd34d', color: '#92400e', badge: '#fef3c7', badgeText: '#92400e' },
  manual_only:   { label: '⚡ Legacy — Manual Config', bg: '#fff7ed', border: '#fed7aa', color: '#9a3412', badge: '#ffedd5', badgeText: '#9a3412' },
  not_compatible:{ label: '✗ Not Compatible',   bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', badge: '#fee2e2', badgeText: '#991b1b' },
};

const CAT_LABEL = { preferred: 'Preferred', supported: 'Supported', legacy: 'Legacy', doorphone: 'Doorphone', gateway: 'Gateway', headset: 'Headset' };

export default function ByohPicker({ devices = [], onChange, disabled }) {
  const [search,       setSearch]       = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [allHardware,  setAllHardware]  = useState([]);
  const dropRef = useRef(null);

  // Load all active hardware on mount
  useEffect(() => {
    supabase.from('voice_hardware').select('*').eq('active', true).order('manufacturer').order('model')
      .then(({ data }) => setAllHardware(data || []));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDropdown(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Search
  useEffect(() => {
    if (!search.trim() || search.length < 2) { setResults([]); setShowDropdown(false); return; }
    setSearching(true);
    const q = search.toLowerCase();
    const matched = allHardware.filter(h =>
      h.manufacturer.toLowerCase().includes(q) ||
      h.model.toLowerCase().includes(q) ||
      `${h.manufacturer} ${h.model}`.toLowerCase().includes(q)
    ).slice(0, 12);
    setResults(matched);
    setShowDropdown(true);
    setSearching(false);
  }, [search, allHardware]);

  function addDevice(hw) {
    if (devices.some(d => d.hardwareId === hw.id)) return; // already added
    const newDevice = {
      hardwareId:    hw.id,
      manufacturer:  hw.manufacturer,
      model:         hw.model,
      compatibility: hw.compatibility,
      category:      hw.category,
      autoProvision: hw.auto_provision,
      firmwareNotes: hw.firmware_notes,
      notes:         hw.notes,
      qty:           1,
    };
    onChange([...devices, newDevice]);
    setSearch('');
    setShowDropdown(false);
  }

  function addUnknown() {
    if (!search.trim()) return;
    const newDevice = {
      hardwareId:    null,
      manufacturer:  'Unknown',
      model:         search.trim(),
      compatibility: 'not_compatible',
      category:      null,
      autoProvision: false,
      firmwareNotes: null,
      notes:         'Not found in 3CX compatibility database — verify before recommending BYOH',
      qty:           1,
    };
    onChange([...devices, newDevice]);
    setSearch('');
    setShowDropdown(false);
  }

  function updateQty(idx, qty) {
    const updated = devices.map((d, i) => i === idx ? { ...d, qty } : d);
    onChange(updated);
  }

  function remove(idx) {
    onChange(devices.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {/* Search input */}
      <div ref={dropRef} style={{ position: 'relative', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => search.length >= 2 && setShowDropdown(true)}
            placeholder="Search by manufacturer or model (e.g. Yealink T57W)..."
            disabled={disabled}
            style={{ flex: 1, padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, outline: 'none' }}
          />
        </div>

        {/* Dropdown results */}
        {showDropdown && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 5, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 280, overflowY: 'auto' }}>
            {searching && (
              <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af' }}>Searching...</div>
            )}
            {!searching && results.length === 0 && search.length >= 2 && (
              <div>
                <div style={{ padding: '8px 12px', fontSize: 11, color: '#dc2626', borderBottom: '1px solid #f1f5f9' }}>
                  ✗ Not found in 3CX compatibility database
                </div>
                <button onClick={addUnknown}
                  style={{ width: '100%', padding: '7px 12px', textAlign: 'left', background: '#fef2f2', border: 'none', cursor: 'pointer', fontSize: 11, color: '#991b1b' }}>
                  Add "{search}" as unverified device ⚠ — compatibility unknown
                </button>
              </div>
            )}
            {results.map(hw => {
              const cfg = COMPAT_CONFIG[hw.compatibility] || COMPAT_CONFIG.compatible;
              const alreadyAdded = devices.some(d => d.hardwareId === hw.id);
              return (
                <button key={hw.id} onClick={() => !alreadyAdded && addDevice(hw)} disabled={alreadyAdded}
                  style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: alreadyAdded ? '#f9fafb' : 'white', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: alreadyAdded ? 'default' : 'pointer', opacity: alreadyAdded ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f1e3c' }}>{hw.manufacturer} {hw.model}</span>
                      {alreadyAdded && <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 6 }}>already added</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: cfg.badge, color: cfg.badgeText }}>{cfg.label}</span>
                      {!hw.auto_provision && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#f3f4f6', color: '#6b7280' }}>Manual config</span>}
                    </div>
                  </div>
                  {hw.notes && <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{hw.notes}</div>}
                  {hw.firmware_notes && <div style={{ fontSize: 9, color: '#d97706', marginTop: 1 }}>⚠ {hw.firmware_notes}</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Device list */}
      {devices.length === 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', padding: '4px 0' }}>
          No BYOH devices added. Search above to add phones.
        </div>
      )}

      {devices.map((d, i) => {
        const cfg = COMPAT_CONFIG[d.compatibility] || COMPAT_CONFIG.compatible;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', marginBottom: 4, borderRadius: 4, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0f1e3c' }}>{d.manufacturer} {d.model}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                {d.category && <span style={{ fontSize: 9, color: '#9ca3af' }}>· {CAT_LABEL[d.category] || d.category}</span>}
                {!d.autoProvision && <span style={{ fontSize: 9, color: '#d97706' }}>· Manual config required</span>}
              </div>
              {d.notes && <div style={{ fontSize: 9, color: cfg.color, marginTop: 2 }}>{d.notes}</div>}
              {d.firmwareNotes && <div style={{ fontSize: 9, color: '#d97706', marginTop: 1 }}>⚠ {d.firmwareNotes}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <label style={{ fontSize: 9, color: '#6b7280' }}>Qty</label>
              <input type="number" min="1" value={d.qty} onChange={e => updateQty(i, parseInt(e.target.value) || 1)}
                style={{ width: 42, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 11, textAlign: 'center', outline: 'none' }} />
              <button onClick={() => remove(i)} disabled={disabled}
                style={{ padding: '3px 6px', background: 'white', border: '1px solid #fca5a5', borderRadius: 3, color: '#dc2626', cursor: 'pointer', fontSize: 11 }}>×</button>
            </div>
          </div>
        );
      })}

      {devices.some(d => d.compatibility === 'manual_only') && (
        <div style={{ marginTop: 6, padding: '6px 9px', background: '#fff7ed', borderRadius: 4, border: '1px solid #fed7aa', fontSize: 9, color: '#9a3412', lineHeight: 1.6 }}>
          ⚡ One or more devices require manual SIP configuration. These cannot be auto-provisioned from 3CX — plan for additional implementation time.
        </div>
      )}
      {devices.some(d => d.compatibility === 'not_compatible') && (
        <div style={{ marginTop: 6, padding: '6px 9px', background: '#fef2f2', borderRadius: 4, border: '1px solid #fca5a5', fontSize: 9, color: '#991b1b', lineHeight: 1.6 }}>
          ✗ One or more devices are not in the 3CX compatibility database. Verify with 3CX before committing to BYOH for these models.
        </div>
      )}
    </div>
  );
}
