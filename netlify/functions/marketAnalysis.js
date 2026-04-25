// Netlify function — Market Rate Analysis Engine
// Uses Claude API to analyze market rates for any zip code
// Requires ANTHROPIC_API_KEY in Netlify environment variables

const BASE_RATES = {
  remote_support:    165,
  onsite_block_2hr:  330,
  onsite_additional: 165,
  dev_crm:           220,
  design_ux:         140,
  pc_setup:          250,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, payload } = body;

  try {
    switch (action) {

      // ── Analyze a market via Claude AI ───────────────────────────────────
      case 'analyze': {
        const { zip, city, state, returnCityState } = payload;
        if (!zip && !city && !state) {
          return { statusCode: 400, body: JSON.stringify({ error: 'zip or city+state required' }) };
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in Netlify environment variables' }) };
        }

        const prompt = `You are a market research analyst for FerrumIT, a managed IT services provider (MSP/MSSP) based in Chicago.

Analyze the IT services labor market for:
${city ? `City: ${city}\nState: ${state}` : `ZIP Code: ${zip} (identify the city and state)`}

FerrumIT's Chicago/national base rates (CoL index 100 = national average):
- Remote support / help desk: $165/hr
- On-site dispatch 2hr block: $330
- On-site additional hourly: $165/hr
- Dev / CRM / DB / Web: $220/hr
- Graphic Design & UX: $140/hr
- PC Setup fee: $250/ea

IMPORTANT CONTEXT:
- Remote labor rates change modestly by market (FerrumIT staff is global; rates reflect local client expectations)
- On-site rates change more significantly (third-party dispatch costs vary heavily by market)
- Product MSRP never changes — only labor rates
- After-hours = 1.5× the market on-site additional rate (calculated separately, do not include)
- Tier guide: Secondary (<90 CoL), Adjusted (90-100), Standard (100-125), Premium (125+)
- pricing_multiplier: how to adjust FerrumIT's managed IT package rates vs Chicago standard (1.0 = no change)

Respond ONLY with a valid JSON object. No markdown, no explanation, no code fences:
{
  "col_index": <number, national avg=100>,
  "median_income": <annual household income as number>,
  "unemployment_rate": <as decimal, e.g. 0.045>,
  "market_tier": <"secondary"|"adjusted"|"standard"|"premium">,
  "pricing_multiplier": <number, e.g. 0.88 or 1.15>,
  "rates": {
    "remote_support": <number>,
    "onsite_block_2hr": <number>,
    "onsite_additional": <number>,
    "dev_crm": <number>,
    "design_ux": <number>,
    "pc_setup": <number>
  },
  "market_notes": "<2-3 sentences: market context, primary industries, key MSP selling points for this market>"${returnCityState ? `,
  "city": "<primary city name for this market>",
  "state": "<2-letter state code>"` : ''}
}`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':       'application/json',
            'x-api-key':          apiKey,
            'anthropic-version':  '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 800,
            messages:   [{ role: 'user', content: prompt }],
          })
        });

        if (!claudeRes.ok) {
          const err = await claudeRes.json();
          console.error('Claude API error:', err);
          return { statusCode: 500, body: JSON.stringify({ error: 'AI analysis failed', detail: err }) };
        }

        const claudeData = await claudeRes.json();
        const rawText = claudeData.content?.[0]?.text || '';

        let analysis;
        try {
          // Strip any accidental markdown fences
          const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
          analysis = JSON.parse(cleaned);
        } catch (e) {
          console.error('Failed to parse Claude response:', rawText);
          return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response', raw: rawText }) };
        }

        // Validate required fields
        const required = ['col_index', 'market_tier', 'pricing_multiplier', 'rates'];
        for (const field of required) {
          if (analysis[field] === undefined) {
            return { statusCode: 500, body: JSON.stringify({ error: `AI response missing field: ${field}` }) };
          }
        }

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis, source: 'ai_generated' })
        };
      }

      // ── Get rating for a rate vs market ──────────────────────────────────
      case 'rate_check': {
        const { ferrumRate, marketRate } = payload;
        const diff = (ferrumRate - marketRate) / marketRate;
        let rating, color;
        if (diff > 0.25)       { rating = 'HIGH';          color = '#dc2626'; }
        else if (diff > 0.10)  { rating = 'SLIGHTLY HIGH'; color = '#d97706'; }
        else if (diff < -0.05) { rating = 'LOW';           color = '#2563eb'; }
        else                   { rating = 'FAIR';          color = '#166534'; }
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, color, diff: Math.round(diff * 100) })
        };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }
  } catch (err) {
    console.error('marketAnalysis error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
