import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ── Standard Voice Exclusions ──────────────────────────────────────────────
const VOICE_STANDARD_EXCLUSIONS = [
  'End-user training beyond initial onboarding orientation.',
  'Physical wiring, cabling, or network infrastructure installation.',
  'Internet service or broadband connectivity (client is responsible for adequate bandwidth).',
  'Third-party integrations (CRM, call recording platforms, contact center software) unless explicitly scoped.',
  'Number porting for numbers not listed in this proposal.',
  'Configuration changes beyond initial deployment scope — additional changes are billable at the applicable hourly rate.',
  'On-site support unless explicitly included in the selected plan.',
  'International calling charges (requires a separately signed International Dialing Authorization).',
  'Hardware procurement, shipping, or physical installation unless explicitly included.',
  'Fax services beyond the agreed analog line or fax-to-email configuration.',
];

const COMPLIANCE_NOTES = {
  none: null,
  moderate: 'Client has indicated HIPAA/SOC 2 compliance requirements. Ferrum recommends reviewing call recording retention policies and BAA requirements for any recorded lines prior to deployment.',
  high: 'Client has indicated PCI DSS or CMMC compliance requirements. All recorded lines should be reviewed with the compliance team prior to deployment. Call recording and storage must meet applicable standards.',
};

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#374151', marginBottom: 3 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function TA({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, resize: 'vertical', outline: 'none' }} />
  );
}

function IN({ value, onChange, placeholder }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, outline: 'none' }} />
  );
}

export default function VoiceAssumptionsModal({ onClose, quoteId, quoteNumber, clientName, recipientContact, inputs, voicePlan, settings, onSaved }) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // Customer story / context
  const [story,          setStory]          = useState('');
  const [currentProvider,setCurrentProvider]= useState('');
  const [switchReasons,  setSwitchReasons]  = useState('');

  // Voice environment
  const [seats,          setSeats]          = useState(inputs?.seats || '');
  const [dids,           setDids]           = useState('');
  const [didPorting,     setDidPorting]      = useState('none'); // none | partial | full
  const [portingNumbers, setPortingNumbers]  = useState('');
  const [autoAttendant,  setAutoAttendant]   = useState(false);
  const [voicemail,      setVoicemail]       = useState(true);
  const [callRecording,  setCallRecording]   = useState(false);
  const [faxLines,       setFaxLines]        = useState('');
  const [locations,      setLocations]       = useState('1');
  const [internetNotes,  setInternetNotes]   = useState('');
  const [hardwareNotes,  setHardwareNotes]   = useState('');

  // Infrastructure
  const [currentSystem,  setCurrentSystem]  = useState('');
  const [pbxType,        setPbxType]        = useState(''); // cloud | onprem | hybrid | none
  const [networkNotes,   setNetworkNotes]    = useState('');

  // Compliance
  const [compliance,     setCompliance]      = useState('none');

  // Custom
  const [customAssumptions, setCustomAssumptions] = useState([]);
  const [customExclusions,  setCustomExclusions]  = useState([]);

  // Load saved assumptions
  useEffect(() => {
    if (!quoteId) return;
    supabase.from('quotes').select('inputs').eq('id', quoteId).single()
      .then(({ data }) => {
        const a = data?.inputs?.voiceAssumptions;
        if (!a) return;
        setStory(a.story || '');
        setCurrentProvider(a.currentProvider || '');
        setSwitchReasons(a.switchReasons || '');
        setSeats(a.seats || inputs?.seats || '');
        setDids(a.dids || '');
        setDidPorting(a.didPorting || 'none');
        setPortingNumbers(a.portingNumbers || '');
        setAutoAttendant(a.autoAttendant || false);
        setVoicemail(a.voicemail ?? true);
        setCallRecording(a.callRecording || false);
        setFaxLines(a.faxLines || '');
        setLocations(a.locations || '1');
        setInternetNotes(a.internetNotes || '');
        setHardwareNotes(a.hardwareNotes || '');
        setCurrentSystem(a.currentSystem || '');
        setPbxType(a.pbxType || '');
        setNetworkNotes(a.networkNotes || '');
        setCompliance(a.compliance || 'none');
        setCustomAssumptions(a.customAssumptions || []);
        setCustomExclusions(a.customExclusions || []);
      });
  }, [quoteId]);

  async function save() {
    if (!quoteId) return;
    setSaving(true);
    const voiceAssumptions = {
      story, currentProvider, switchReasons,
      seats, dids, didPorting, portingNumbers,
      autoAttendant, voicemail, callRecording,
      faxLines, locations, internetNotes, hardwareNotes,
      currentSystem, pbxType, networkNotes,
      compliance, customAssumptions, customExclusions,
    };
    const { data } = await supabase.from('quotes').select('inputs').eq('id', quoteId).single();
    await supabase.from('quotes').update({ inputs: { ...data?.inputs, voiceAssumptions } }).eq('id', quoteId);
    setSaving(false);
    onSaved?.(voiceAssumptions);
    onClose();
  }

  const SEC = ({ title, color = '#374151', children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, paddingBottom: 3, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 2, height: 11, background: color, borderRadius: 2 }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>{title}</span>
      </div>
      {children}
    </div>
  );

  const Check = ({ label, checked, onChange }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: '#7c3aed' }} />
      <span style={{ fontSize: 11, color: '#374151' }}>{label}</span>
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', zIndex: 600 }}>
      <div style={{ flex: 1 }} onClick={onClose} />
      <div style={{ width: 700, background: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ background: '#7c3aed', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Hosted Voice — Assumptions & Exclusions</div>
            <div style={{ fontSize: 10, color: '#ddd6fe', marginTop: 1 }}>
              {clientName || 'Client'}{quoteNumber ? ` · ${quoteNumber}` : ''} · {voicePlan || 'Hosted Voice'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ddd6fe', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* ── CUSTOMER CONTEXT ── */}
          <SEC title="Customer Context" color="#7c3aed">
            <Field label="Customer Story / Discovery Notes" hint="Who they are, what they do, what's driving this — the AI will translate this into clean assumptions">
              <TA value={story} onChange={setStory} rows={4}
                placeholder="e.g. 25-seat professional services firm, currently on an aging Cisco on-prem PBX, multiple office locations, frustrated with missed calls and voicemail reliability..." />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Current Provider / Phone System">
                <IN value={currentProvider} onChange={setCurrentProvider} placeholder="e.g. Cisco CUCM, RingCentral, legacy PBX..." />
              </Field>
              <Field label="Why Switching">
                <IN value={switchReasons} onChange={setSwitchReasons} placeholder="e.g. End of support, reliability issues, cost..." />
              </Field>
            </div>
          </SEC>

          {/* ── VOICE ENVIRONMENT ── */}
          <SEC title="Voice Environment" color="#2563eb">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Field label="Total Seats / Extensions">
                <IN value={seats} onChange={setSeats} placeholder="e.g. 25" />
              </Field>
              <Field label="DID Numbers Required">
                <IN value={dids} onChange={setDids} placeholder="e.g. 10 DIDs" />
              </Field>
              <Field label="Locations / Sites">
                <IN value={locations} onChange={setLocations} placeholder="e.g. 2" />
              </Field>
            </div>

            <Field label="Number Porting">
              <div style={{ display: 'flex', gap: 8 }}>
                {[['none', 'No porting'], ['partial', 'Partial porting'], ['full', 'Full port']].map(([v, l]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '4px 10px', borderRadius: 4, border: `1px solid ${didPorting === v ? '#2563eb' : '#e5e7eb'}`, background: didPorting === v ? '#eff6ff' : 'white' }}>
                    <input type="radio" checked={didPorting === v} onChange={() => setDidPorting(v)} style={{ accentColor: '#2563eb' }} />
                    <span style={{ fontSize: 11 }}>{l}</span>
                  </label>
                ))}
              </div>
            </Field>

            {(didPorting === 'partial' || didPorting === 'full') && (
              <Field label="Numbers to be Ported" hint="List all DIDs to be ported — must be confirmed with client prior to deployment">
                <TA value={portingNumbers} onChange={setPortingNumbers} rows={2} placeholder="e.g. 312-555-0100, 312-555-0101..." />
              </Field>
            )}

            <Field label="Included Features">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <Check label="Auto-Attendant / IVR" checked={autoAttendant} onChange={setAutoAttendant} />
                <Check label="Voicemail" checked={voicemail} onChange={setVoicemail} />
                <Check label="Call Recording" checked={callRecording} onChange={setCallRecording} />
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Fax Lines" hint="Leave blank if none">
                <IN value={faxLines} onChange={setFaxLines} placeholder="e.g. 2 analog fax lines, fax-to-email..." />
              </Field>
              <Field label="Internet / Connectivity Notes">
                <IN value={internetNotes} onChange={setInternetNotes} placeholder="e.g. 500Mbps fiber, client-managed..." />
              </Field>
            </div>

            <Field label="Hardware Notes">
              <TA value={hardwareNotes} onChange={setHardwareNotes} rows={2}
                placeholder="e.g. 20 Yealink T33G desk phones to be purchased, 5 BYOH devices, remainder using 3CX softphone app only..." />
            </Field>
          </SEC>

          {/* ── CURRENT INFRASTRUCTURE ── */}
          <SEC title="Current Infrastructure" color="#0f766e">
            <Field label="Current Phone System / PBX">
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                {[['cloud', 'Cloud / Hosted'], ['onprem', 'On-Premises PBX'], ['hybrid', 'Hybrid'], ['none', 'None / New']].map(([v, l]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '4px 10px', borderRadius: 4, border: `1px solid ${pbxType === v ? '#0f766e' : '#e5e7eb'}`, background: pbxType === v ? '#f0fdf4' : 'white' }}>
                    <input type="radio" checked={pbxType === v} onChange={() => setPbxType(v)} style={{ accentColor: '#0f766e' }} />
                    <span style={{ fontSize: 11 }}>{l}</span>
                  </label>
                ))}
              </div>
              <IN value={currentSystem} onChange={setCurrentSystem} placeholder="e.g. Cisco CUCM 12.5, RingCentral, Avaya IP Office..." />
            </Field>
            <Field label="Network / Firewall Notes" hint="QoS configuration, SBC requirements, firewall rules needed">
              <TA value={networkNotes} onChange={setNetworkNotes} rows={2}
                placeholder="e.g. SonicWall firewall — will need SIP ALG disabled. VLAN segmentation for voice traffic required. QoS to be configured by client IT." />
            </Field>
          </SEC>

          {/* ── COMPLIANCE ── */}
          <SEC title="Compliance" color="#dc2626">
            <Field label="Compliance Requirements">
              <select value={compliance} onChange={e => setCompliance(e.target.value)}
                style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, background: 'white', outline: 'none' }}>
                <option value="none">None</option>
                <option value="moderate">HIPAA / SOC 2</option>
                <option value="high">PCI DSS / CMMC</option>
              </select>
            </Field>
            {compliance !== 'none' && (
              <div style={{ padding: '7px 10px', background: '#fef2f2', borderRadius: 4, border: '1px solid #fecaca', fontSize: 10, color: '#991b1b', lineHeight: 1.6 }}>
                ⚠ {COMPLIANCE_NOTES[compliance]}
              </div>
            )}
          </SEC>

          {/* ── STANDARD EXCLUSIONS ── */}
          <SEC title="Standard Exclusions" color="#6b7280">
            <div style={{ background: '#f8fafc', borderRadius: 5, padding: '10px 12px' }}>
              {VOICE_STANDARD_EXCLUSIONS.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: '#dc2626', fontSize: 10, flexShrink: 0, marginTop: 1 }}>•</span>
                  <span style={{ fontSize: 10, color: '#374151', lineHeight: 1.6 }}>{e}</span>
                </div>
              ))}
            </div>
          </SEC>

          {/* ── CUSTOM ASSUMPTIONS ── */}
          <SEC title="Additional Assumptions">
            {customAssumptions.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                <input value={item} onChange={e => { const a = [...customAssumptions]; a[i] = e.target.value; setCustomAssumptions(a); }}
                  style={{ flex: 1, padding: '4px 7px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, outline: 'none' }} />
                <button onClick={() => setCustomAssumptions(customAssumptions.filter((_, j) => j !== i))}
                  style={{ padding: '3px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 3, color: '#dc2626', cursor: 'pointer', fontSize: 11 }}>×</button>
              </div>
            ))}
            <button onClick={() => setCustomAssumptions([...customAssumptions, ''])}
              style={{ padding: '4px 10px', background: 'white', border: '1px dashed #d1d5db', borderRadius: 4, fontSize: 10, color: '#6b7280', cursor: 'pointer' }}>
              + Add assumption
            </button>
          </SEC>

          <SEC title="Additional Exclusions">
            {customExclusions.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                <input value={item} onChange={e => { const a = [...customExclusions]; a[i] = e.target.value; setCustomExclusions(a); }}
                  style={{ flex: 1, padding: '4px 7px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, outline: 'none' }} />
                <button onClick={() => setCustomExclusions(customExclusions.filter((_, j) => j !== i))}
                  style={{ padding: '3px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 3, color: '#dc2626', cursor: 'pointer', fontSize: 11 }}>×</button>
              </div>
            ))}
            <button onClick={() => setCustomExclusions([...customExclusions, ''])}
              style={{ padding: '4px 10px', background: 'white', border: '1px dashed #d1d5db', borderRadius: 4, fontSize: 10, color: '#6b7280', cursor: 'pointer' }}>
              + Add exclusion
            </button>
          </SEC>

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{ padding: '7px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Assumptions'}
          </button>
        </div>
      </div>
    </div>
  );
}
