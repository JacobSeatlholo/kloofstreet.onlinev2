/**
 * AI Concierge — Z.ai GLM-powered, locked to Kloof Street businesses only.
 * Env var required: ZAI_API_KEY
 * Get a key: https://z.ai → Open Platform → API Keys
 * Set in Vercel dashboard → Settings → Environment Variables → Redeploy.
 * Diagnostic: GET /api/ai-chat?debug=1  (tiny live completion to validate the key)
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ZAI_KEY = process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY || '';
  const BASES = ['https://api.z.ai/api/paas/v4', 'https://api.z.ai/api/coding/paas/v4'];

  // ── DIAGNOSTIC: GET /api/ai-chat?debug=1 ──
  if (req.method === 'GET' && req.query?.debug === '1') {
    if (!ZAI_KEY) {
      return res.status(200).json({ status: 'error', message: 'ZAI_API_KEY not set in Vercel env vars — add it, then Redeploy', keyPresent: false });
    }
    for (const base of BASES) {
      try {
        const r = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ZAI_KEY },
          body: JSON.stringify({ model: 'glm-4.5-flash', messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 16, thinking: { type: 'disabled' } }),
          signal: AbortSignal.timeout(8000)
        });
        if (r.ok) {
          const d = await r.json();
          const txt = d?.choices?.[0]?.message?.content || '';
          return res.status(200).json({ status: 'ok', message: 'Z.ai key is valid and working', keyPresent: true, endpoint: base, model: d?.model || 'glm-4.5-flash', sample: String(txt).substring(0, 40) });
        }
        const errText = await r.text();
        if (r.status === 401 || r.status === 403) {
          return res.status(200).json({ status: 'error', message: 'Key rejected by Z.ai (' + r.status + ') — make sure you copied the full ZAI_API_KEY and it is active', keyPresent: true, apiResponse: errText.substring(0, 300) });
        }
        if (base === BASES[BASES.length - 1]) {
          return res.status(200).json({ status: 'error', message: 'Z.ai endpoint error (' + r.status + ')', keyPresent: true, apiResponse: errText.substring(0, 300) });
        }
      } catch (err) {
        if (base === BASES[BASES.length - 1]) {
          return res.status(200).json({ status: 'error', message: err.message, keyPresent: true });
        }
      }
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ZAI_KEY) {
    return res.status(500).json({ error: 'ZAI_API_KEY not set. Add it in Vercel → Settings → Environment Variables, then Redeploy.' });
  }

  const { message, history = [], isStreetPassHolder = false } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'Message required (max 2000 chars)' });
  }

  // ── BUSINESS KNOWLEDGE BASE (only listed businesses) ──
  const businesses = [
    { name: 'Ubuntu Wellness', slug: '/ubuntu-wellness', address: '110 Kloof Street', phone: '082 929 2544', whatsapp: 'https://wa.me/27829292544', category: 'Wellness & Spa', services: 'Float therapy (60-90 min), spa treatments, homeopathy consults, infrared sauna, qigong with Dr Thomas', hours: 'Mon-Sat, by appointment', streetPassBenefit: '10% off all treatments + priority booking', notes: 'Flagship wellness destination. Float sessions are their signature.' },
    { name: 'On Safari - Wildlife Fine Art Photography', slug: '/on-safari', address: '99B Kloof Street', phone: '021 422 1248', whatsapp: 'https://wa.me/27744815163', category: 'Art & Photography', services: 'Wildlife photographic fine art prints, framing, gallery viewing', hours: 'Mon-Thu 8am-5pm, Fri 8am-4pm, Sat 9am-12pm', streetPassBenefit: 'Free framing with each picture purchased + discount on shipping at PostNet', notes: 'Run by Nigel. Free to browse gallery. Prints available.' },
    { name: 'PostNet Gardens', slug: '/postnet-gardens', address: '55 Kloof Street', phone: '021 422 1248', category: 'Printing & Courier', services: 'Printing, domestic and international courier, digital services, stationery', hours: 'Mon-Fri 9am-5pm, Sat 9am-1pm', streetPassBenefit: 'Discount on shipping for Street Pass holders', notes: 'Go-to for printing, courier and shipping on Kloof Street.' },
    { name: 'Dr Wendy Dicks', slug: '/dr-wendy-dicks', address: '99B Kloof Street', phone: '021 111 0572', category: 'GP & Weight Loss', services: 'General practice, weight loss, GLP-1 treatments, allergy testing, chronic conditions', hours: 'By appointment', streetPassBenefit: 'Priority booking for Street Pass holders', notes: 'MBChB (UP), DCH (SA). Weight loss and GLP-1 specialist.' },
    { name: 'Dr Thomas Jahn', slug: '/dr-thomas-jahn', address: '99 Kloof Street', phone: '066 490 4382', category: 'Chinese Medicine & Acupuncture', services: 'Acupuncture, cupping, moxibustion, Tuina massage, Qigong, herbal medicine', hours: 'Thursdays 9am-5pm', streetPassBenefit: 'Priority booking for Street Pass holders', notes: 'Chinese medicine. Thursdays at 99 Kloof Street.' },
    { name: 'Trudy Christians', slug: '/trudy-christians', address: '99B Kloof Street (Cape Town Medi-Spa)', phone: '078 832 4501', whatsapp: 'https://wa.me/27788324501', category: 'Aesthetics & Laser', services: 'Laser hair removal, skin rejuvenation, tattoo removal, Hollywood carbon laser, microdermabrasion, micro needling, body sculpting, red light therapy, hair loss solutions', hours: 'By appointment', streetPassBenefit: 'Priority booking + additional 5% off all September promo treatments', currentPromos: 'September Specials (Sept 2026 only): Nasal Spider Veins Removal R300, Red Light Therapy 20min R200, Sun Spot Hands Removal R300, 10% off Laser Hair Removal & RF Skin Tightening', notes: '30 years aesthetic experience. September promos active now.' },
    { name: 'Just Hearing', slug: '/just-hearing', address: '99B Kloof Street', category: 'Audiology', services: 'Hearing assessments (adults & children), hearing aids, tinnitus management', hours: 'By appointment', streetPassBenefit: 'Priority booking for Street Pass holders', notes: 'Patient-centred audiology practice.' },
    { name: 'Dr Dale Geoffreys', slug: '/dr-dale-geoffreys', address: '99B Kloof Street (Cape Town Medi-Spa)', phone: '021 203 5227', category: 'Plastic & Reconstructive Surgery', services: 'Botox, fillers, blepharoplasty, breast procedures, deep plane face and neck lift, abdominoplasty, liposuction', hours: 'By appointment', streetPassBenefit: 'Priority consultation for Collector tier Street Pass holders', notes: 'Fellowship-trained (CMSA 2013). Consults at Medi-Spa 99B Kloof St.' },
    { name: 'Hayley Schuter Physiotherapy', slug: '/hayley-schuter-physio', address: '99B Kloof Street', phone: '073 203 3726', category: 'Physiotherapy', services: 'Dry needling, sports massage, strapping, home visits', hours: 'By appointment', streetPassBenefit: 'Priority booking for Street Pass holders', notes: 'Sports injuries and rehabilitation specialist.' },
    { name: 'Body Vision Studio', slug: '/body-vision-studio', address: 'Lifestyle Centre, Level 2, 50 Kloof Street', phone: '082 457 2118', whatsapp: 'https://wa.me/27824572118', category: 'Movement & Pilates', services: 'Private GYROTONIC sessions, semi-private, GYROKINESIS, Classical Pilates mat, seniors programme, injury rehab, online sessions', hours: 'By appointment', streetPassBenefit: '10% off all bookings — private sessions, semi-private and Pilates mat classes', notes: 'Kim Tucker — certified GYROTONIC & Pilates instructor, 15+ years.' },
    { name: 'Arnold\'s Restaurant', slug: '/arnolds-restaurant', address: '80 Kloof Street', whatsapp: 'https://wa.me/27744815163', category: 'Dining', services: 'Heritage dining since 1999 — all-day brunch, lunch and dinner. Dinner special: 250g grilled rump R285. Daily special: smoked salmon croissant R145. Legendary brunch and cocktails.', hours: 'Daily — see arnolds.co.za', notes: 'Iconic Kloof Street institution. Menu and online booking at arnolds.co.za/menu.' },
    { name: 'Wilscha Skincare', slug: '/wilscha', address: '99 Kloof Street', phone: '082 572 2011', category: 'Skincare & Medi Spa', services: 'Expertly crafted skincare backed by 35 years of experience — i:am range (cleansers R340+, toners R480, creams R680, serums R325-R630) and the advanced 11:11 range. Personalised treatment plans.', hours: 'By appointment — book online at wilschaskincare.com', notes: 'Cape Town Medi Spa. Client-approved page at kloofstreet.online/wilscha with full product list and prices.' },
    { name: 'LumeLife — Doctor-Led Telehealth', slug: '/lumalife', address: '99 Kloof Street', category: 'Telehealth', services: 'Virtual GP consultations, same-day prescriptions, free pharmacy delivery — doctor-led care from the Medi-Spa.', hours: 'Online, book at kloofstreet.online/lumalife', notes: 'Care that fits your life — telehealth anchored at the Medi-Spa on Kloof Street.' },
    { name: 'Picturesque Framing Studio', slug: '/picturesque-framing', address: '99B Kloof Street', phone: '066 253 4151', category: 'Art & Framing', services: 'Custom picture framing since 2001 — rugby jerseys, certificates, original artwork, archival framing, block mounting, box framing.', hours: 'In-store with On Safari, 99B Kloof Street', notes: 'Framing studio with a 4.9 rating. Prices R150-R5000.' },
    { name: 'Revive Studio', slug: '/revive-studio', address: '99 Kloof Street', phone: '084 525 7906', category: 'Massage & Beauty', services: 'Facials, massages, manicures, pedicures, lash and brow tinting, waxing', hours: 'By appointment', streetPassBenefit: 'Priority booking for Street Pass holders', notes: 'Holistic massage and beauty clinic by Nadine.' },
    { name: 'Urban Connect', slug: '/urban-connect', address: 'Private demo preview — kloofstreet.online/urban-connect', whatsapp: 'https://wa.me/27746730006', category: 'Cellular & Electronics', services: 'Cellular accessories and pre-owned devices — NeePho/NeelPro tripods (R450-R750), colourful covers (R80-R199), power banks & solar lighting (R450-R1,300), iPhone chargers & cables (R80-R289), wireless chargers (R229-R250), keyboard & mouse (R799), Nesty speaker (R450-R599), pre-owned iPhones (R13,000-R25,000), pre-owned Mac & accessories, pre-owned Oppo, Samsung A06/A17. WhatsApp 074 673 0006 to order.', hours: 'WhatsApp ordering — while stock lasts', notes: 'Also known as Bargain Brands on Facebook (facebook.com/Bargainbrands.bb). Private demo page — not yet in the public directory.' }
  ];

  const streetPassInfo = {
    tiers: [
      { name: 'Explorer', price: 'R199/month', benefits: 'Discounts at all verified partners, WhatsApp flash deals, Member Night invitations, AI concierge access' },
      { name: 'Insider', price: 'R499/month', benefits: 'All Explorer benefits + bookable Kloof Street Experiences' },
      { name: 'Collector', price: 'R999/month', benefits: 'Two included experiences per month, bespoke concierge, Dr Dale priority consultation, cruise shore excursion priority' }
    ],
    experiences: [
      { name: 'The Wellness Morning', price: 'R1,800/person', detail: 'Float & Massage combo + brunch voucher at Arnold\'s' },
      { name: 'The Art & Aperitivo', price: 'R1,250/person', detail: 'Free framing with each picture from On Safari Photography + discount on shipping at PostNet' },
      { name: 'The Kloof Beauty Day', price: 'R2,250/person', detail: 'Revive Studio → Trudy Christians voucher → premium beauty experience' },
      { name: 'The Collector\'s Tour', price: 'R2,100/person', detail: 'On Safari print → lunch at Arnold\'s → 30-min massage at Ubuntu Wellness' }
    ],
    whatsapp: '+27 74 481 5163'
  };

  // ── BUILD SYSTEM PROMPT ──
  const spStatus = isStreetPassHolder
    ? 'The user IS a Street Pass holder. Always mention their exclusive benefits when relevant.'
    : 'The user is NOT a Street Pass holder. Mention Street Pass benefits as an upsell when relevant.';

  const businessList = businesses.map(b => {
    let info = `- **${b.name}** (${b.category}) — ${b.address}\n  Services: ${b.services}\n  Hours: ${b.hours}`;
    if (b.streetPassBenefit) info += `\n  Street Pass: ${b.streetPassBenefit}`;
    if (b.phone) info += `\n  Phone: ${b.phone}`;
    if (b.currentPromos) info += `\n  CURRENT PROMOS: ${b.currentPromos}`;
    if (b.notes) info += `\n  Notes: ${b.notes}`;
    return info;
  }).join('\n\n');

  const expList = streetPassInfo.experiences.map(e => `- **${e.name}** (${e.price}): ${e.detail}`).join('\n');

  const systemPrompt = `You are the Kloof Street AI Concierge for kloofstreet.online — the verified guide to Kloof Street, Cape Town (voted #22 World's Coolest Street by Time Out 2025).

${spStatus}

## CRITICAL RULES:
1. You ONLY recommend businesses listed below. NEVER invent or suggest businesses, restaurants, cafes, bars, or services not in this list.
2. If asked about something not available (e.g. restaurants, coffee shops, bars), say: "That's not currently listed on Kloof Street — our directory focuses on wellness, beauty, art, medical and movement businesses. Here's what I can help with..." and suggest relevant listed alternatives.
3. Always be specific — mention real business names, addresses, phone numbers, and Street Pass benefits.
4. When recommending a business, include their page link: https://www.kloofstreet.online${'{slug}'}
5. For booking, suggest WhatsApp or phone call with the real number.
6. Keep responses concise but helpful — under 180 words where possible.
7. Use South African Rand (R) for all prices.
8. Format in PLAIN TEXT only — no markdown symbols (never use asterisks, hashes, backticks or underscores for emphasis). Use simple dashes for bullets and blank lines for structure. Emojis are welcome, sparingly.

## LISTED BUSINESSES (ONLY THESE):
${businessList}

## STREET PASS MEMBERSHIP:
- Explorer: ${streetPassInfo.tiers[0].price} — ${streetPassInfo.tiers[0].benefits}
- Insider: ${streetPassInfo.tiers[1].price} — ${streetPassInfo.tiers[1].benefits}
- Collector: ${streetPassInfo.tiers[2].price} — ${streetPassInfo.tiers[2].benefits}

Bookable Experiences:
${expList}

Join Street Pass: https://kloofstreet.online/streetpass/join
WhatsApp to join: ${streetPassInfo.whatsapp}

## ABOUT KLOOF STREET:
Kloof Street runs through Gardens/Tamboerskloof in Cape Town's City Bowl. It was voted #22 Coolest Street in the World by Time Out 2025. The directory at kloofstreet.online lists verified businesses — currently focused on wellness, medical, beauty, art, movement and dining. Other restaurants and bars exist on the street but are not yet in our directory.`;

  // ── BUILD OPENAI-COMPATIBLE MESSAGES ──
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const msg of (Array.isArray(history) ? history : [])) {
    if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) continue;
    const role = (msg.role === 'assistant' || msg.role === 'model') ? 'assistant' : (msg.role === 'user' ? 'user' : null);
    if (role) messages.push({ role, content: msg.content.substring(0, 1500) });
  }
  messages.push({ role: 'user', content: message });

  // ── CALL Z.AI (GLM) ──
  // OpenAI-compatible chat completions. Primary: standard API base; fallback: coding-plan base.
  const MODELS = ['glm-4.6', 'glm-4.5-flash'];

  const errors = [];
  const DEADLINE = Date.now() + 25000;  // global budget — never hang the function
  const FETCH_TIMEOUT = 10000;          // per-attempt abort (ms)

  try {
    outer:
    for (const base of BASES) {
      for (const model of MODELS) {
        if (Date.now() > DEADLINE) break outer;

        const body = {
          model,
          messages,
          temperature: 0.7,
          max_tokens: 900,
          thinking: { type: 'disabled' }
        };

        try {
          let response = await fetch(base + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ZAI_KEY },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(FETCH_TIMEOUT)
          });

          // 400 → maybe the thinking param or payload detail is unsupported: retry once without it
          if (response.status === 400) {
            const b2 = JSON.parse(JSON.stringify(body));
            delete b2.thinking;
            response = await fetch(base + '/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ZAI_KEY },
              body: JSON.stringify(b2),
              signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });
          }

          if (response.ok) {
            const data = await response.json();
            const aiText = data?.choices?.[0]?.message?.content;
            if (aiText && aiText.trim()) {
              return res.status(200).json({ reply: aiText.trim() });
            }
            errors.push({ model: base + ' / ' + model, error: 'empty response' });
            continue;
          }

          const errText = await response.text();
          const errObj = { model: base + ' / ' + model, status: response.status };
          try { errObj.message = JSON.parse(errText)?.error?.message || errText.substring(0, 150); }
          catch (e) { errObj.message = errText.substring(0, 150); }
          errors.push(errObj);

          // Key rejected → no point trying other models
          if (response.status === 401 || response.status === 403) {
            return res.status(502).json({
              error: 'API key issue',
              detail: 'Your ZAI_API_KEY was rejected by Z.ai. Verify the key at z.ai (Open Platform → API Keys), update it in Vercel env vars and Redeploy.',
              errors
            });
          }

        } catch (fetchErr) {
          errors.push({ model: base + ' / ' + model, error: fetchErr.message });
        }
      }
    }

    // All models failed
    return res.status(502).json({
      error: 'All Z.ai models failed',
      detail: 'Could not reach any GLM model. Check ZAI_API_KEY in Vercel env vars and that your z.ai account is active.',
      errors
    });

  } catch (err) {
    console.error('AI chat error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
};
