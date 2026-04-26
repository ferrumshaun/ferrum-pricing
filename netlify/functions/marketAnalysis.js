// Netlify function — Market Rate Analysis Engine
// Uses Claude API to analyze market rates for any zip code
// Requires ANTHROPIC_API_KEY in Netlify environment variables

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
        const { zip, city, state } = payload;
        if (!zip && !city && !state) {
          return { statusCode: 400, body: JSON.stringify({ error: 'zip or city+state required' }) };
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in Netlify environment variables' }) };
        }

        // If we only have a zip, resolve city/state via USPS ZIP lookup API first
        // to prevent AI hallucinating the wrong city
        let resolvedCity = city;
        let resolvedState = state;
        if (zip && (!city || !state)) {
          try {
            const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
            if (zipRes.ok) {
              const zipData = await zipRes.json();
              if (zipData.places?.length > 0) {
                resolvedCity  = zipData.places[0]['place name'];
                resolvedState = zipData.places[0]['state abbreviation'];
              }
            }
          } catch (e) { /* fall through to AI resolution */ }
        }

        const locationLine = resolvedCity && resolvedState
          ? 'City: ' + resolvedCity + '\nState: ' + resolvedState + (zip ? '\nZIP: ' + zip : '')
          : 'ZIP Code: ' + zip + ' (identify the primary city and state for this zip)';

        const prompt = 'You are a market research analyst for FerrumIT, a managed IT services provider (MSP/MSSP) based in Chicago.\n\n'
          + 'Analyze the IT services labor market for:\n'
          + locationLine + '\n\n'
          + 'FerrumIT base rates (Chicago/national standard, CoL index 100):\n'
          + '- Remote support / help desk: $165/hr\n'
          + '- On-site dispatch 2hr block: $330\n'
          + '- On-site additional hourly: $165/hr\n'
          + '- Dev / CRM / DB / Web: $220/hr\n'
          + '- Graphic Design & UX: $140/hr\n'
          + '- PC Setup fee: $250/ea\n\n'
          + 'IMPORTANT:\n'
          + '- Remote labor rates shift modestly (staff is global; reflects local client expectations)\n'
          + '- On-site rates shift more significantly (third-party dispatch costs vary by market)\n'
          + '- Product MSRP never changes\n'
          + '- Tier guide: Secondary (<90 CoL), Adjusted (90-100), Standard (100-125), Premium (125+)\n'
          + '- pricing_multiplier: how to adjust managed IT package rates vs Chicago standard (1.0 = no change)\n\n'
          + 'Respond ONLY with a valid JSON object. No markdown, no explanation, no code fences:\n'
          + '{\n'
          + '  "city": "<primary city name>",\n'
          + '  "state": "<2-letter state code>",\n'
          + '  "col_index": <number, national avg=100>,\n'
          + '  "median_income": <annual household income as number>,\n'
          + '  "unemployment_rate": <as decimal, e.g. 0.045>,\n'
          + '  "market_tier": <"secondary"|"adjusted"|"standard"|"premium">,\n'
          + '  "pricing_multiplier": <number, e.g. 0.88 or 1.15>,\n'
          + '  "rates": {\n'
          + '    "remote_support": <number>,\n'
          + '    "onsite_block_2hr": <number>,\n'
          + '    "onsite_additional": <number>,\n'
          + '    "dev_crm": <number>,\n'
          + '    "design_ux": <number>,\n'
          + '    "pc_setup": <number>\n'
          + '  },\n'
          + '  "market_notes": "<2-3 sentences: market context, primary industries, key MSP selling angles>"\n'
          + '}';

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 800,
            messages:   [{ role: 'user', content: prompt }],
          })
        });

        if (!claudeRes.ok) {
          const err = await claudeRes.json();
          console.error('Claude API error:', JSON.stringify(err));
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'AI analysis failed', detail: err, status: claudeRes.status })
          };
        }

        const claudeData = await claudeRes.json();
        const rawText = claudeData.content?.[0]?.text || '';

        let analysis;
        try {
          const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
          analysis = JSON.parse(cleaned);
        } catch (e) {
          console.error('Failed to parse Claude response:', rawText);
          return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response', raw: rawText }) };
        }

        const required = ['col_index', 'market_tier', 'pricing_multiplier', 'rates', 'city', 'state'];
        for (const field of required) {
          if (analysis[field] === undefined) {
            return { statusCode: 500, body: JSON.stringify({ error: 'AI response missing field: ' + field, raw: rawText }) };
          }
        }

        // Override city/state with authoritative USPS lookup to prevent hallucinations
        if (resolvedCity && resolvedState) {
          analysis.city  = resolvedCity;
          analysis.state = resolvedState;
        }

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis, source: 'ai_generated' })
        };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
    }
  } catch (err) {
    console.error('marketAnalysis error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
