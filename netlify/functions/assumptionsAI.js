// assumptionsAI.js — AI-powered assumptions document generator
// Takes customer discovery notes and generates structured, professional assumptions

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  const {
    story,
    clientName,
    currentProvider,
    switchReasons,
    userCount,
    workstationCount,
    serverNotes,
    networkNotes,
    laptopNotes,
    m365Notes,
    cloudNotes,
    selectedProducts,
    compliance,
    industryRisk,
    packageName,
    remoteCount,
    remoteType,
    taskWorkerCount,
    taskWorkerNotes,
  } = body;

  const complianceLabel = compliance === 'moderate' ? 'HIPAA/SOC 2'
    : compliance === 'high' ? 'PCI DSS/CMMC'
    : 'No specific compliance framework';

  const prompt = `You are a senior managed IT services consultant writing a professional assumptions document for a client proposal.

CONTEXT:
- Client: ${clientName || 'the client'}
- Package: ${packageName || 'Managed IT'}
- Users (Power Users): ${userCount || 0}
- Workstations: ${workstationCount || 0}
- Compliance: ${complianceLabel}
- Industry Risk: ${industryRisk || 'standard'}
- Current Provider: ${currentProvider || 'not specified'}
- Why switching: ${(switchReasons || []).join(', ') || 'not specified'}
- Remote workers: ${remoteCount > 0 ? `${remoteCount} (${remoteType})` : 'none specified'}
- Task workers: ${taskWorkerCount || 'none specified'}
- Selected products: ${(selectedProducts || []).join(', ') || 'standard package'}

CUSTOMER STORY (raw discovery notes from the sales rep):
${story || 'No story provided.'}

INFRASTRUCTURE NOTES:
Servers: ${serverNotes || 'not noted'}
Network: ${networkNotes || 'not noted'}
Laptops/Workstations: ${laptopNotes || 'not noted'}
Cloud/M365: ${m365Notes || 'not noted'}
Other cloud: ${cloudNotes || 'not noted'}
Task worker devices: ${taskWorkerNotes || 'not noted'}

INSTRUCTIONS:
Write a clean, professional assumptions section for a managed IT services proposal. Write as FerrumIT (the MSP), addressed to the client.

Format as JSON with these exact keys:
{
  "environmentSummary": "2-3 sentence paragraph summarizing who the client is and their IT environment",
  "userAssumptions": ["bullet 1", "bullet 2", ...],
  "infrastructureAssumptions": ["bullet 1", "bullet 2", ...],
  "cloudAssumptions": ["bullet 1", "bullet 2", ...],
  "switchingContext": "1-2 sentences on why they are engaging FerrumIT (professional, factual, no blame)",
  "keyRequirements": ["bullet 1", "bullet 2", ...],
  "complianceNotes": "one sentence or null if no compliance requirement"
}

Rules:
- Bullets are direct, specific, and technically clear — no fluff
- Write from FerrumIT's perspective ("The environment includes...", "Pricing assumes...")
- Translate vague rep notes into clean, contractual language
- If something is unclear from the notes, write a reasonable assumption with "assumed" in the bullet
- Keep each bullet to one clear statement — no compound bullets
- Do not invent specific details not mentioned in the notes
- Respond ONLY with the JSON object, no markdown, no explanation`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'AI request failed');

    const rawText = data.content?.[0]?.text || '';
    const clean   = rawText.replace(/```json|```/g, '').trim();
    const result  = JSON.parse(clean);

    return { statusCode: 200, body: JSON.stringify({ result }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
