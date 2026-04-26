import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const COMPLIANCE_LABELS = { hipaa: 'HIPAA', soc2: 'SOC 2', pci: 'PCI DSS', cmmc: 'CMMC' };

const STANDARD_EXCLUSIONS = [
  'Custom software development, advanced scripting, or specialized automation beyond standard platform configurations',
  'Complex third-party software integrations or application-to-application customizations',
  'One-time or large-scale initiatives such as infrastructure redesigns, major migrations, office expansions, or technology refresh projects',
  'Deep application-level support for specialized or line-of-business software not covered by standard vendor support',
  'Hardware procurement, physical installation, cabling, or on-site build-out services unless specifically included',
  'Support for legacy, end-of-life, or non-standard systems that fall outside recommended best practices',
  'Formal compliance audits, legal advisory services, or certification preparation',
  'Advanced incident response, digital forensics, or remediation services beyond standard monitoring and response capabilities',
  'User training, security awareness programs, or policy development beyond what is included in the selected service tier',
  'On-site, after-hours, or emergency services outside defined support hours and service level agreements',
];

const STANDARD_DELIVERABLES = `Ferrum Technology Services, LLC will provide standardized onboarding and ongoing management of workstations, laptops, servers, network infrastructure, Microsoft 365, and associated cloud and on-premises environments in alignment with Ferrum Technology Services, LLC's established operational, security, and compliance standards.

Deliverables include the deployment and configuration of core management, monitoring, and security platforms as applicable to the selected service tier. This may include remote monitoring and management (RMM), endpoint detection and incident response (EDR/EDIR), managed detection and response (MDR), security operations center (SOC) monitoring, DNS filtering, and Microsoft 365 security baseline hardening.

As part of onboarding, Ferrum Technology Services, LLC will establish and maintain updated technical documentation, including but not limited to network diagrams, firewall configurations, Azure/Microsoft 365 tenant settings, and credential management practices.`;

export default function AssumptionsModal({
  onClose, quoteId, quoteNumber, clientName, recipientContact,
  inputs, pkg, products, settings, complianceKey, onSave,
}) {
  const selectedProductObjects = (inputs?.selectedProducts || [])
    .map(id => products?.find(p => p.id === id)).filter(Boolean);

  // ── Discovery state ─────────────────────────────────────────────────────────
  const [story,            setStory]            = useState('');
  const [currentProvider,  setCurrentProvider]  = useState('');
  const [userList,         setUserList]         = useState('');
  const [fieldTechCount,   setFieldTechCount]   = useState('');
  const [fieldTechNotes,   setFieldTechNotes]   = useState('');
  const [remoteCount,      setRemoteCount]      = useState(0);
  const [remoteType,       setRemoteType]       = useState('hybrid');

  // Infrastructure
  const [serverNotes,      setServerNotes]      = useState('');
  const [networkNotes,     setNetworkNotes]     = useState('');
  const [telephonyNotes,   setTelephonyNotes]   = useState('');

  // Cloud & M365
  const [m365Managed,      setM365Managed]      = useState(false);
  const [m365Tier,         setM365Tier]         = useState('');
  const [m365Notes,        setM365Notes]        = useState('Email, Collaboration, Office applications, Identity services integrated with Active Directory');
  const [cloudNotes,       setCloudNotes]       = useState('');

  // Modernization opportunities
  const [modernizationNotes, setModernizationNotes] = useState('');

  // Deliverables & exclusions
  const [deliverables,     setDeliverables]     = useState(STANDARD_DELIVERABLES);
  const [customExclusions, setCustomExclusions] = useState([]);
  const [newExclusion,     setNewExclusion]     = useState('');
  const [customNotes,      setCustomNotes]      = useState('');

  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Load saved assumptions
  useEffect(() => {
    if (!quoteId) return;
    supabase.from('quotes').select('inputs').eq('id', quoteId).single()
      .then(({ data }) => {
        const a = data?.inputs?.assumptions;
        if (!a) return;
        setStory(a.story || '');
        setCurrentProvider(a.currentProvider || '');
        setUserList(a.userList || '');
        setFieldTechCount(a.fieldTechCount || '');
        setFieldTechNotes(a.fieldTechNotes || '');
        setRemoteCount(a.remoteCount || 0);
        setRemoteType(a.remoteType || 'hybrid');
        setServerNotes(a.serverNotes || '');
        setNetworkNotes(a.networkNotes || '');
        setTelephonyNotes(a.telephonyNotes || '');
        setM365Managed(a.m365Managed || false);
        setM365Tier(a.m365Tier || '');
        setM365Notes(a.m365Notes || 'Email, Collaboration, Office applications, Identity services integrated with Active Directory');
        setCloudNotes(a.cloudNotes || '');
        setModernizationNotes(a.modernizationNotes || '');
        setDeliverables(a.deliverables || STANDARD_DELIVERABLES);
        setCustomExclusions(a.customExclusions || []);
        setCustomNotes(a.customNotes || '');
      });
  }, [quoteId]);

  async function save() {
    if (!quoteId) { setSaveMsg('Save the quote first.'); return; }
    setSaving(true); setSaveMsg('');
    const assumptions = {
      story, currentProvider, userList,
      fieldTechCount, fieldTechNotes,
      remoteCount, remoteType,
      serverNotes, networkNotes, telephonyNotes,
      m365Managed, m365Tier, m365Notes, cloudNotes,
      modernizationNotes, deliverables,
      customExclusions, customNotes,
      savedAt: new Date().toISOString(),
    };
    const currentInputs = (await supabase.from('quotes').select('inputs').eq('id', quoteId).single())?.data?.inputs || {};
    const { error } = await supabase.from('quotes')
      .update({ inputs: { ...currentInputs, assumptions } })
      .eq('id', quoteId);
    if (error) { setSaveMsg('✗ ' + error.message); }
    else { setSaveMsg('✓ Saved'); onSave?.(assumptions); setTimeout(() => setSaveMsg(''), 2500); }
    setSaving(false);
  }

  function addExclusion() {
    if (!newExclusion.trim()) return;
    setCustomExclusions(prev => [...prev, { id: `c_${Date.now()}`, text: newExclusion.trim() }]);
    setNewExclusion('');
  }

  const autoInclusions = buildAutoInclusions({ inputs, pkg, selectedProductObjects });
  const complianceDeclinations = buildComplianceDeclinations({ inputs, products, complianceKey });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'stretch', justifyContent:'flex-end', zIndex:600 }}>
      <div style={{ flex:1 }} onClick={onClose} />
      <div style={{ width:700, background:'white', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ background:'#0f1e3c', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>Assumptions & Exclusions</div>
            <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>{clientName || 'Client'} · {quoteNumber || 'Unsaved quote'}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {saveMsg && <span style={{ fontSize:11, fontWeight:600, color: saveMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>{saveMsg}</span>}
            <button onClick={save} disabled={saving}
              style={{ padding:'6px 16px', background:'#f97316', color:'white', border:'none', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>

          {/* ── ENVIRONMENT & USER ASSUMPTIONS ── */}
          <Sec title="Environment & User Assumptions" sub="Used for pricing — provided during discovery" color="#0f1e3c">
            <Field label="Customer Story / Discovery Notes">
              <textarea value={story} onChange={e => setStory(e.target.value)} rows={4}
                placeholder="Overview of the client — business, size, industry, pain points, what's driving this decision..." style={TA} />
            </Field>
            <Grid2>
              <Field label="Current Provider / IT Setup">
                <input value={currentProvider} onChange={e => setCurrentProvider(e.target.value)}
                  placeholder="e.g., CDW, local MSP, internal IT..." style={IN} />
              </Field>
              <Field label="Remote / Hybrid Workers">
                <div style={{ display:'flex', gap:6 }}>
                  <input type="number" min="0" value={remoteCount} onChange={e => setRemoteCount(+e.target.value)}
                    style={{ ...IN, width:60, fontFamily:'DM Mono, monospace', fontWeight:600 }} />
                  <select value={remoteType} onChange={e => setRemoteType(e.target.value)} style={{ ...IN, flex:1 }}>
                    <option value="hybrid">Hybrid</option>
                    <option value="fully_remote">Fully Remote</option>
                    <option value="occasional">Occasional</option>
                  </select>
                </div>
              </Field>
            </Grid2>

            <Field label={`Supported Users / Power Users (${inputs?.users || 0} included in pricing)`}>
              <div style={{ fontSize:9, color:'#6b7280', marginBottom:4 }}>
                List names or roles of employees included in the managed services pricing. One per line.
                If additional employees are added who require computers, email, or application support, they will be added at the standard per-user rate.
              </div>
              <textarea value={userList} onChange={e => setUserList(e.target.value)} rows={6}
                placeholder={`e.g.\nJohn Smith\nJane Doe\nFinance Team (5 users)\n...`} style={TA} />
            </Field>

            <div style={{ background:'#fafafa', border:'1px solid #f1f5f9', borderRadius:5, padding:'10px 12px', marginTop:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6 }}>Mobile / Field Technicians (excluded from Power User count)</div>
              <Grid2>
                <Field label="Number of field/mobile workers">
                  <input value={fieldTechCount} onChange={e => setFieldTechCount(e.target.value)}
                    placeholder="e.g., 8–10" style={IN} />
                </Field>
                <div />
              </Grid2>
              <Field label="Notes on field tech usage (why excluded from pricing)">
                <textarea value={fieldTechNotes} onChange={e => setFieldTechNotes(e.target.value)} rows={3}
                  placeholder="e.g., These technicians primarily use tablets to log work activity. They do not use desktop computers, printers, or company email accounts. Because of this limited technology usage, they were not included in the Power User count..." style={TA} />
              </Field>
            </div>
          </Sec>

          {/* ── CORE INFRASTRUCTURE ── */}
          <Sec title="Core Infrastructure in Scope" sub="Discovered during the sales call" color="#7c3aed">
            <Field label="Servers">
              <textarea value={serverNotes} onChange={e => setServerNotes(e.target.value)} rows={3}
                placeholder="e.g., Windows Server 2016 (on-premises rack server) — currently used for Active Directory and file storage. Microsoft support ends October 2027." style={TA} />
            </Field>
            <Field label="Network & Security (firewalls, switches, routers, failover)">
              <textarea value={networkNotes} onChange={e => setNetworkNotes(e.target.value)} rows={3}
                placeholder="e.g., Cisco Firepower 1000 Series, Cradlepoint device (cellular failover), network switches supporting internal LAN, Arris gateway..." style={TA} />
            </Field>
            <Field label="Telephony & Communication">
              <textarea value={telephonyNotes} onChange={e => setTelephonyNotes(e.target.value)} rows={2}
                placeholder="e.g., Digium G100 telephony gateway, Sangoma Fax Station..." style={TA} />
            </Field>
          </Sec>

          {/* ── CLOUD SERVICES ── */}
          <Sec title="Cloud Services" color="#0891b2">
            <Grid2>
              <Field label="Microsoft 365">
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11 }}>
                    <input type="checkbox" checked={m365Managed} onChange={e => setM365Managed(e.target.checked)} />
                    We are managing M365 licensing
                  </label>
                  {m365Managed && <input value={m365Tier} onChange={e => setM365Tier(e.target.value)} placeholder="License tier (e.g., Business Premium)" style={{ ...IN, fontSize:10 }} />}
                </div>
              </Field>
              <Field label="M365 Usage (what they use it for)">
                <textarea value={m365Notes} onChange={e => setM365Notes(e.target.value)} rows={3}
                  placeholder="Email, Collaboration, Office applications..." style={TA} />
              </Field>
            </Grid2>
            <Field label="Other Cloud / SaaS Applications">
              <textarea value={cloudNotes} onChange={e => setCloudNotes(e.target.value)} rows={2}
                placeholder="e.g., Most line-of-business applications appear to be cloud-hosted, reducing reliance on on-premises infrastructure..." style={TA} />
            </Field>
          </Sec>

          {/* ── MODERNIZATION OPPORTUNITIES ── */}
          <Sec title="Infrastructure Modernization Opportunities" sub="Identified but NOT included in base pricing" color="#d97706">
            <div style={{ fontSize:9, color:'#92400e', marginBottom:6 }}>
              These are improvements identified during discovery that are outside the base managed services scope. They would be handled as separate projects if pursued.
            </div>
            <textarea value={modernizationNotes} onChange={e => setModernizationNotes(e.target.value)} rows={4}
              placeholder="e.g., Retirement or migration of Windows Server 2016 environment&#10;Identity migration to cloud-based authentication&#10;Network architecture modernization&#10;Telephony platform upgrades or SIP migration" style={TA} />
          </Sec>

          {/* ── DELIVERABLES ── */}
          <Sec title="Deliverables" color="#166534">
            <div style={{ fontSize:9, color:'#6b7280', marginBottom:5 }}>Pre-populated with standard deliverables language. Edit as needed for this client.</div>
            <textarea value={deliverables} onChange={e => setDeliverables(e.target.value)} rows={8} style={TA} />
          </Sec>

          {/* ── INCLUSIONS (auto-generated) ── */}
          <Sec title="Quoted Services — What IS Included" color="#166534">
            <div style={{ fontSize:9, color:'#6b7280', marginBottom:8, fontStyle:'italic' }}>Auto-generated from your quote selections.</div>
            {autoInclusions.map((item, i) => (
              <div key={i} style={{ display:'flex', gap:6, padding:'4px 8px', borderRadius:3, marginBottom:2, background:'#f0fdf4', border:'1px solid #bbf7d0' }}>
                <span style={{ color:'#16a34a', fontSize:10, flexShrink:0 }}>✓</span>
                <span style={{ fontSize:11, color:'#166534' }}>{item}</span>
              </div>
            ))}
            {m365Managed && (
              <div style={{ display:'flex', gap:6, padding:'4px 8px', borderRadius:3, marginBottom:2, background:'#f0fdf4', border:'1px solid #bbf7d0' }}>
                <span style={{ color:'#16a34a', fontSize:10, flexShrink:0 }}>✓</span>
                <span style={{ fontSize:11, color:'#166534' }}>Microsoft 365 {m365Tier ? `(${m365Tier}) ` : ''}licensing management</span>
              </div>
            )}
          </Sec>

          {/* ── EXCLUSIONS ── */}
          <Sec title="Exclusions — What Is NOT Included" color="#dc2626">
            <div style={{ fontSize:9, color:'#6b7280', marginBottom:8, fontStyle:'italic' }}>Standard exclusions always included. Add any client-specific exclusions below.</div>
            {STANDARD_EXCLUSIONS.map((text, i) => (
              <div key={i} style={{ display:'flex', gap:6, padding:'4px 8px', borderRadius:3, marginBottom:2, background:'#fef2f2', border:'1px solid #fecaca' }}>
                <span style={{ color:'#dc2626', fontSize:10, flexShrink:0 }}>•</span>
                <span style={{ fontSize:11, color:'#991b1b' }}>{text}</span>
              </div>
            ))}
            {customExclusions.map(item => (
              <div key={item.id} style={{ display:'flex', gap:6, padding:'4px 8px', borderRadius:3, marginBottom:2, background:'#fef3c7', border:'1px solid #fde68a', alignItems:'center' }}>
                <span style={{ color:'#d97706', fontSize:10, flexShrink:0 }}>•</span>
                <span style={{ fontSize:11, color:'#92400e', flex:1 }}>{item.text}</span>
                <button onClick={() => setCustomExclusions(p => p.filter(e => e.id !== item.id))}
                  style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:12, padding:0 }}>×</button>
              </div>
            ))}
            <div style={{ display:'flex', gap:6, marginTop:8 }}>
              <input value={newExclusion} onChange={e => setNewExclusion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExclusion()}
                placeholder="Add a client-specific exclusion..." style={{ ...IN, flex:1 }} />
              <button onClick={addExclusion} disabled={!newExclusion.trim()}
                style={{ padding:'5px 12px', background:'#0f1e3c', color:'white', border:'none', borderRadius:4, fontSize:11, cursor:'pointer', opacity: newExclusion.trim() ? 1 : 0.4 }}>Add</button>
            </div>
          </Sec>

          {/* ── COMPLIANCE DECLINATIONS ── */}
          {complianceDeclinations.length > 0 && (
            <Sec title="Compliance Recommendations — Client Declinations" color="#d97706">
              <div style={{ fontSize:10, color:'#92400e', marginBottom:8, lineHeight:1.5 }}>
                The following services were recommended based on the client's compliance requirements but were declined. This is documented to protect FerrumIT and provide a clear record of informed decision-making.
              </div>
              {complianceDeclinations.map((item, i) => (
                <div key={i} style={{ padding:'8px 12px', borderRadius:5, marginBottom:6, background:'#fffbeb', border:'1px solid #fde68a' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#92400e' }}>⚠ {item.product}</div>
                  {item.reason && <div style={{ fontSize:10, color:'#78350f', marginTop:3, lineHeight:1.5 }}>{item.reason}</div>}
                  <div style={{ fontSize:9, color:'#a16207', marginTop:4, fontStyle:'italic' }}>
                    Client has been advised and is declining this service. This declination is documented in the signed agreement.
                  </div>
                </div>
              ))}
            </Sec>
          )}

          {/* ── ADDITIONAL NOTES ── */}
          <Sec title="Additional Notes" color="#374151">
            <textarea value={customNotes} onChange={e => setCustomNotes(e.target.value)} rows={3}
              placeholder="Any additional context or special arrangements for this client..." style={TA} />
          </Sec>

        </div>
      </div>
    </div>
  );
}

function buildAutoInclusions({ inputs, pkg, selectedProductObjects }) {
  if (!inputs || !pkg) return [];
  const lines = [];
  lines.push(`Managed IT services under the ${pkg.name} package covering ${inputs.users || 0} user${inputs.users !== 1 ? 's' : ''} and ${inputs.workstations || 0} workstation${inputs.workstations !== 1 ? 's' : ''}`);
  if (inputs.servers > 0) lines.push(`Server management for ${inputs.servers} server${inputs.servers !== 1 ? 's' : ''}`);
  if (inputs.locations > 1) lines.push(`Coverage across ${inputs.locations} locations`);
  for (const p of selectedProductObjects) lines.push(p.name);
  const coverageMap = { business_hours: 'Business hours (Mon–Fri 8am–5pm)', '24x5': '24×5', '24x7': '24×7' };
  if (coverageMap[inputs.requestedCoverage]) lines.push(`${coverageMap[inputs.requestedCoverage]} help desk coverage`);
  return lines;
}

function buildComplianceDeclinations({ inputs, products, complianceKey }) {
  if (!complianceKey?.length || !products) return [];
  const selectedIds = inputs?.selectedProducts || [];
  return products
    .filter(p => p.compliance_tags?.some(t => complianceKey.includes(t)) && !selectedIds.includes(p.id) && p.active)
    .map(p => ({
      product: p.name,
      reason: p.recommendation_reason || `Recommended for ${p.compliance_tags?.filter(t => complianceKey.includes(t)).map(t => COMPLIANCE_LABELS[t]).join('/')} compliance`,
    }));
}

// Helpers
const TA = { width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', outline:'none', lineHeight:1.6 };
const IN = { width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, outline:'none' };
function Sec({ title, sub, color, children }) {
  return (
    <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9' }}>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:700, color, display:'inline' }}>{title}</div>
        {sub && <div style={{ fontSize:10, color:'#9ca3af', marginTop:1, fontStyle:'italic' }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <label style={{ display:'block', fontSize:9, fontWeight:700, color:'#374151', marginBottom:3, textTransform:'uppercase', letterSpacing:'.04em' }}>{label}</label>
      {children}
    </div>
  );
}
function Grid2({ children }) { return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>{children}</div>; }
